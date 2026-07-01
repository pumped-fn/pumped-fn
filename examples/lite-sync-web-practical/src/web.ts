import type { Sync } from "@pumped-fn/lite-extension-sync"

type MaybePromise<T> = T | Promise<T>

export namespace Web {
  export interface Gateway {
    read(token: string, key: string): MaybePromise<Sync.Message | undefined>
    write(token: string, message: Sync.Message): MaybePromise<Sync.WriteResult>
    subscribe(token: string, key: string, listener: (message: Sync.Message) => void): MaybePromise<() => void>
    close(): MaybePromise<void>
  }

  export interface Server extends Gateway {
    handle(request: Request): Promise<Response>
  }

  export interface ServerOptions {
    readonly namespace: string
    readonly transport: Sync.Transport
    readonly authorize: (token: string) => boolean
  }

  export interface ClientOptions {
    readonly url: string
    readonly fetch: typeof fetch
    readonly onError?: (error: unknown) => void
  }

  export interface EnvOptions {
    readonly gateway: Gateway
    readonly token: string
    readonly peer: string
    readonly namespace: string
    readonly failure?: Sync.Failure
    readonly onError?: (error: unknown, phase: Sync.ErrorPhase, message: Sync.Message | undefined) => void
    readonly onConflict?: (conflict: Sync.Conflict<unknown>, message: Sync.Message) => void
  }

  export interface PeerStore {
    read(): string | undefined
    write(peer: string): void
  }
}

function server(options: Web.ServerOptions): Web.Server {
  let closed = false

  const assertOpen = () => {
    if (closed) throw new Error("sync gateway closed")
  }
  const assertToken = (token: string) => {
    if (!options.authorize(token)) throw new Error("sync token rejected")
  }
  const assertKey = (key: string) => {
    if (!key.startsWith(`${options.namespace}:`)) throw new Error(`sync key outside namespace ${options.namespace}`)
  }

  const gateway: Web.Server = {
    async read(token, key) {
      assertOpen()
      assertToken(token)
      assertKey(key)
      return options.transport.read(key)
    },
    async write(token, message) {
      assertOpen()
      assertToken(token)
      assertKey(message.key)
      return options.transport.write(message)
    },
    async subscribe(token, key, listener) {
      assertOpen()
      assertToken(token)
      assertKey(key)
      return options.transport.subscribe(key, listener)
    },
    async close() {
      closed = true
      await options.transport.close?.()
    },
    async handle(request) {
      try {
        const url = new URL(request.url)
        const token = bearer(request)
        if (url.pathname.endsWith("/read")) {
          return json({ message: await gateway.read(token, required(url, "key")) })
        }
        if (url.pathname.endsWith("/write")) {
          return json(encodeWrite(await gateway.write(token, assertMessage(await request.json()))))
        }
        if (url.pathname.endsWith("/watch")) {
          return watch(gateway, token, required(url, "key"))
        }
        return new Response("not found", { status: 404 })
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : String(error) }, 400)
      }
    },
  }

  return gateway
}

function client(options: Web.ClientOptions): Web.Gateway {
  return {
    async read(token, key) {
      const response = await request(options, token, `/read?key=${encodeURIComponent(key)}`)
      const payload = await response.json() as unknown
      const message = optionalMessage(assertObject(payload)["message"])
      return message
    },
    async write(token, message) {
      const response = await request(options, token, "/write", {
        method: "PUT",
        body: JSON.stringify(message),
      })
      return decodeWrite(await response.json() as unknown)
    },
    async subscribe(token, key, listener) {
      let stopped = false
      const abort = new AbortController()
      const response = await request(options, token, `/watch?key=${encodeURIComponent(key)}`, { signal: abort.signal })
      void pump(response, listener).catch((error) => {
        if (!stopped) options.onError?.(error)
      })
      return () => {
        stopped = true
        abort.abort()
      }
    },
    close() {},
  }
}

function env(options: Web.EnvOptions): Sync.Runtime {
  return {
    peer: options.peer,
    namespace: options.namespace,
    failure: options.failure,
    onError: options.onError,
    onConflict: options.onConflict,
    transport: {
      read: (key) => options.gateway.read(options.token, key),
      write: (message) => options.gateway.write(options.token, message),
      subscribe: (key, listener) => options.gateway.subscribe(options.token, key, listener),
    },
  }
}

function peer(store: Web.PeerStore, create: () => string): string {
  const stored = store.read()
  if (stored) return stored
  const next = create()
  store.write(next)
  return next
}

export const web = {
  client,
  env,
  peer,
  server,
}

function bearer(request: Request): string {
  const header = request.headers.get("authorization")
  if (!header?.startsWith("Bearer ")) throw new Error("sync token missing")
  return header.slice("Bearer ".length)
}

function required(url: URL, key: string): string {
  const value = url.searchParams.get(key)
  if (!value) throw new Error(`sync parameter ${key} missing`)
  return value
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  })
}

function watch(gateway: Web.Gateway, token: string, key: string): Response {
  const encoder = new TextEncoder()
  let off: (() => void) | undefined
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      off = await gateway.subscribe(token, key, (message) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(message)}\n`))
      })
    },
    cancel() {
      off?.()
    },
  })
  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson",
      "cache-control": "no-cache",
    },
  })
}

async function request(options: Web.ClientOptions, token: string, path: string, init: RequestInit = {}): Promise<Response> {
  const response = await options.fetch(`${options.url}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      authorization: `Bearer ${token}`,
    },
  })
  if (!response.ok) throw new Error(await response.text())
  return response
}

async function pump(response: Response, listener: (message: Sync.Message) => void): Promise<void> {
  if (!response.body) throw new Error("sync watch response missing body")
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  for (;;) {
    const chunk = await reader.read()
    if (chunk.done) return
    buffer += decoder.decode(chunk.value, { stream: true })
    let newline = buffer.indexOf("\n")
    while (newline !== -1) {
      const line = buffer.slice(0, newline)
      buffer = buffer.slice(newline + 1)
      if (line) listener(assertMessage(JSON.parse(line) as unknown))
      newline = buffer.indexOf("\n")
    }
  }
}

function encodeWrite(result: Sync.WriteResult): unknown {
  if (!result) return { kind: "void" }
  if ("conflict" in result) return { kind: "conflict", conflict: result.conflict }
  return { kind: "ack", version: result.version }
}

function decodeWrite(input: unknown): Sync.WriteResult {
  const record = assertObject(input)
  if (record["kind"] === "void") return
  if (record["kind"] === "ack" && typeof record["version"] === "number") return { version: record["version"] }
  if (record["kind"] === "conflict") return { conflict: assertMessage(record["conflict"]) }
  throw new Error("sync write result invalid")
}

function optionalMessage(input: unknown): Sync.Message | undefined {
  return input === undefined ? undefined : assertMessage(input)
}

function assertMessage(input: unknown): Sync.Message {
  const record = assertObject(input)
  if (typeof record["key"] !== "string") throw new Error("sync message key invalid")
  if (typeof record["peer"] !== "string") throw new Error("sync message peer invalid")
  if (typeof record["version"] !== "number") throw new Error("sync message version invalid")
  return {
    key: record["key"],
    peer: record["peer"],
    version: record["version"],
    value: assertValue(record["value"]),
  }
}

function assertObject(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("sync payload invalid")
  return input as Record<string, unknown>
}

function assertValue(input: unknown): Sync.Value {
  if (input === null || typeof input === "string" || typeof input === "boolean") return input
  if (typeof input === "number") {
    if (!Number.isFinite(input)) throw new Error("sync number is not finite")
    return input
  }
  if (Array.isArray(input)) return input.map(assertValue)
  if (typeof input === "object") {
    const out: Record<string, Sync.Value> = {}
    for (const [key, value] of Object.entries(input)) out[key] = assertValue(value)
    return out
  }
  throw new Error("sync value is not JSON")
}
