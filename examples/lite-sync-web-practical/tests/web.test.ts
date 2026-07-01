import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import type { IncomingHttpHeaders, ServerResponse } from "node:http"
import { createScope } from "@pumped-fn/lite"
import { sync, type Sync } from "@pumped-fn/lite-extension-sync"
import { describe, expect, test } from "vitest"
import { draft } from "../src/model"
import { createBrowserScope } from "../src/runtime"
import { web, type Web } from "../src/web"

const namespace = "workspace:demo"
const key = `${namespace}:draft`
const token = "secret"

describe("sync web practical environment", () => {
  test("replicates browser and backend scopes through the gateway", async () => {
    const wire = sync.memory()
    const gateway = web.server({
      namespace,
      transport: wire,
      authorize: (value) => value === token,
    })
    const browser = createBrowserScope({
      gateway,
      token,
      peer: "browser",
      namespace,
    })
    const backend = createScope({
      extensions: [sync.extension()],
      tags: [
        sync.runtime({
          peer: "backend",
          namespace,
          transport: wire,
        }),
      ],
    })

    const browserDraft = await browser.controller(draft, { resolve: true })
    const backendDraft = await backend.controller(draft, { resolve: true })

    browserDraft.set({
      id: "draft",
      title: "Browser edit",
      body: "edited through web env",
      savedBy: "browser",
      version: 1,
    })
    await until(() => backendDraft.get().savedBy === "browser")

    backendDraft.set({
      id: "draft",
      title: "Backend edit",
      body: "accepted by durable side",
      savedBy: "backend",
      version: 2,
    })
    await until(() => browserDraft.get().savedBy === "backend")

    expect(browserDraft.get()).toEqual(backendDraft.get())

    await browser.dispose()
    await backend.dispose()
    await gateway.close()
  })

  test("replicates through the fetch protocol and streamed watches", async () => {
    const wire = sync.memory()
    const gateway = web.server({
      namespace,
      transport: wire,
      authorize: (value) => value === token,
    })
    const live = await serve(gateway)
    const browser = createBrowserScope({
      gateway: web.client({ url: live.url, fetch }),
      token,
      peer: "browser",
      namespace,
    })
    const backend = createScope({
      extensions: [sync.extension()],
      tags: [
        sync.runtime({
          peer: "backend",
          namespace,
          transport: wire,
        }),
      ],
    })

    const browserDraft = await browser.controller(draft, { resolve: true })
    const backendDraft = await backend.controller(draft, { resolve: true })

    backendDraft.set({
      id: "draft",
      title: "Backend streamed",
      body: "delivered by fetch watch",
      savedBy: "backend",
      version: 1,
    })
    await until(() => browserDraft.get().savedBy === "backend")

    browserDraft.set({
      id: "draft",
      title: "Browser fetched",
      body: "written through fetch",
      savedBy: "browser",
      version: 2,
    })
    await until(() => backendDraft.get().savedBy === "browser")

    expect(browserDraft.get()).toEqual(backendDraft.get())

    await browser.dispose()
    await backend.dispose()
    await live.close()
    await gateway.close()
  })

  test("enforces token, namespace, and close boundaries", async () => {
    const gateway = web.server({
      namespace,
      transport: sync.memory(),
      authorize: (value) => value === token,
    })

    await expect(gateway.read("bad", key)).rejects.toThrow("sync token rejected")
    await expect(gateway.read(token, "workspace:other:draft")).rejects.toThrow("sync key outside namespace workspace:demo")

    await gateway.close()
    await expect(gateway.read(token, key)).rejects.toThrow("sync gateway closed")
  })

  test("handles protocol errors and write result variants", async () => {
    const transport: Sync.Transport = {
      read: () => undefined,
      write: (message) => {
        if (message.peer === "ack") return { version: 7 }
        if (message.peer === "conflict") return { conflict: { ...message, peer: "server", version: 8 } }
      },
      subscribe: () => () => {},
    }
    const gateway = web.server({
      namespace,
      transport,
      authorize: (value) => value === token,
    })
    const http = web.client({ url: "http://example.test/sync", fetch: (request, init) => gateway.handle(new Request(request, init)) })
    const message: Sync.Message = {
      key,
      peer: "ack",
      version: 1,
      value: {
        ok: true,
        list: [1, "two", null],
      },
    }

    expect(await http.read(token, key)).toBeUndefined()
    await expect(http.read("bad", key)).rejects.toThrow("sync token rejected")
    expect(await http.write(token, message)).toEqual({ version: 7 })
    expect(await http.write(token, { ...message, peer: "conflict" })).toEqual({
      conflict: {
        ...message,
        peer: "server",
        version: 8,
      },
    })

    const missingToken = await gateway.handle(new Request(`http://example.test/sync/read?key=${encodeURIComponent(key)}`))
    const missingKey = await gateway.handle(new Request("http://example.test/sync/read", {
      headers: { authorization: `Bearer ${token}` },
    }))
    const invalid = await gateway.handle(new Request("http://example.test/sync/write", {
      method: "PUT",
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ peer: "bad", version: 1, value: 1 }),
    }))
    const notFound = await gateway.handle(new Request("http://example.test/sync/nope", {
      headers: { authorization: `Bearer ${token}` },
    }))

    expect(missingToken.status).toBe(400)
    expect(await missingToken.json()).toEqual({ error: "sync token missing" })
    expect(missingKey.status).toBe(400)
    expect(await missingKey.json()).toEqual({ error: "sync parameter key missing" })
    expect(invalid.status).toBe(400)
    expect(await invalid.json()).toEqual({ error: "sync message key invalid" })
    expect(notFound.status).toBe(404)
  })

  test("rejects malformed protocol payloads", async () => {
    const message: Sync.Message = {
      key,
      peer: "ack",
      version: 1,
      value: {
        ok: true,
      },
    }
    const invalidWrite = web.client({
      url: "http://example.test/sync",
      fetch: async () => json({ kind: "bad" }),
    })
    const invalidMessage = web.client({
      url: "http://example.test/sync",
      fetch: async () => json({ message: [] }),
    })
    const invalidPeer = web.client({
      url: "http://example.test/sync",
      fetch: async () => json({ message: { key, version: 1, value: null } }),
    })
    const invalidVersion = web.client({
      url: "http://example.test/sync",
      fetch: async () => json({ message: { key, peer: "bad", value: null } }),
    })
    const invalidNumber = web.client({
      url: "http://example.test/sync",
      fetch: async () => json({ message: { key, peer: "bad", version: 1, value: Number.NaN } }),
    })
    const invalidValue = web.client({
      url: "http://example.test/sync",
      fetch: async () => json({ message: { key, peer: "bad", version: 1, value: () => undefined } }),
    })
    const streamErrors: unknown[] = []
    const missingBody = web.client({
      url: "http://example.test/sync",
      fetch: async () => new Response(null),
      onError: (error) => {
        streamErrors.push(error)
      },
    })
    const streamed: Sync.Message[] = []
    const stream = web.client({
      url: "http://example.test/sync",
      fetch: async () => new Response(`\n${JSON.stringify(message)}\n`),
    })

    await expect(invalidWrite.write(token, message)).rejects.toThrow("sync write result invalid")
    await expect(invalidMessage.read(token, key)).rejects.toThrow("sync payload invalid")
    await expect(invalidPeer.read(token, key)).rejects.toThrow("sync message peer invalid")
    await expect(invalidVersion.read(token, key)).rejects.toThrow("sync message version invalid")
    await expect(invalidNumber.read(token, key)).rejects.toThrow("sync number is not finite")
    await expect(invalidValue.read(token, key)).rejects.toThrow("sync value is not JSON")

    const off = await missingBody.subscribe(token, key, () => {})
    await until(() => streamErrors.length === 1)
    off()
    missingBody.close()

    const streamOff = await stream.subscribe(token, key, (value) => {
      streamed.push(value)
    })
    await until(() => streamed.length === 1)
    streamOff()
    stream.close()
  })

  test("closes server watch streams through cancellation", async () => {
    let listeners = 0
    const gateway = web.server({
      namespace,
      transport: {
        read: () => undefined,
        write: () => undefined,
        subscribe: () => {
          listeners += 1
          return () => {
            listeners -= 1
          }
        },
      },
      authorize: (value) => value === token,
    })

    const response = await gateway.handle(new Request(`http://example.test/sync/watch?key=${encodeURIComponent(key)}`, {
      headers: { authorization: `Bearer ${token}` },
    }))
    await until(() => listeners === 1)
    const body = response.body
    if (!body) throw new Error("expected watch body")
    await body.cancel()

    expect(listeners).toBe(0)
  })

  test("serializes non-error boundary failures", async () => {
    const gateway = web.server({
      namespace,
      transport: {
        read: () => {
          throw "plain failure"
        },
        write: () => undefined,
        subscribe: () => () => {},
      },
      authorize: (value) => value === token,
    })

    const response = await gateway.handle(new Request(`http://example.test/sync/read?key=${encodeURIComponent(key)}`, {
      headers: { authorization: `Bearer ${token}` },
    }))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: "plain failure" })
  })

  test("preserves backend write conflicts as sync conflicts", async () => {
    const initial: Sync.Message = {
      key,
      peer: "backend",
      version: 3,
      value: {
        id: "draft",
        title: "Backend base",
        body: "accepted",
        savedBy: "backend",
        version: 3,
      },
    }
    const incoming: Sync.Message = {
      key,
      peer: "backend",
      version: 4,
      value: {
        id: "draft",
        title: "Backend concurrent",
        body: "same revision",
        savedBy: "backend",
        version: 4,
      },
    }
    let writes = 0
    const transport: Sync.Transport = {
      read: () => initial,
      write: () => {
        writes += 1
        return { conflict: incoming }
      },
      subscribe: () => () => {},
    }
    const gateway = web.server({
      namespace,
      transport,
      authorize: (value) => value === token,
    })
    const conflicts: Sync.Conflict<unknown>[] = []
    const browser = createBrowserScope({
      gateway,
      token,
      peer: "browser",
      namespace,
      onConflict: (conflict) => {
        conflicts.push(conflict)
      },
    })

    const current = await browser.controller(draft, { resolve: true })
    current.set({
      id: "draft",
      title: "Browser concurrent",
      body: "same revision",
      savedBy: "browser",
      version: 4,
    })

    await until(() => conflicts.length === 1)

    expect(writes).toBe(1)
    expect(conflicts[0]).toEqual({
      current: {
        id: "draft",
        title: "Browser concurrent",
        body: "same revision",
        savedBy: "browser",
        version: 4,
      },
      incoming: incoming.value,
    })

    await browser.dispose()
    await gateway.close()
  })

  test("keeps browser peer identity stable through the environment store", () => {
    const writes: string[] = []
    let saved: string | undefined
    const store: Web.PeerStore = {
      read: () => saved,
      write: (value) => {
        saved = value
        writes.push(value)
      },
    }

    expect(web.peer(store, () => "peer-a")).toBe("peer-a")
    expect(web.peer(store, () => "peer-b")).toBe("peer-a")
    expect(writes).toEqual(["peer-a"])
  })
})

async function until(check: () => boolean): Promise<void> {
  for (let i = 0; i < 50; i++) {
    if (check()) return
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  throw new Error("condition did not settle")
}

function json(value: unknown): Response {
  return {
    ok: true,
    body: null,
    json: async () => value,
    text: async () => JSON.stringify(value),
  } as Response
}

async function serve(gateway: Web.Server): Promise<{ readonly url: string; close(): Promise<void> }> {
  const node = createServer(async (req, res) => {
    const body = await read(req)
    const address = node.address() as AddressInfo
    const response = await gateway.handle(new Request(`http://127.0.0.1:${address.port}${req.url ?? "/"}`, {
      method: req.method,
      headers: headers(req.headers),
      body: requestBody(req.method ?? "GET", body),
    }))
    await send(res, response)
  })

  await new Promise<void>((resolve) => {
    node.listen(0, "127.0.0.1", resolve)
  })
  const address = node.address() as AddressInfo

  return {
    url: `http://127.0.0.1:${address.port}/sync`,
    close: () => new Promise<void>((resolve, reject) => {
      node.close((error) => {
        if (error) reject(error)
        else resolve()
      })
    }),
  }
}

async function read(req: AsyncIterable<unknown>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk as Uint8Array)
  }
  return Buffer.concat(chunks)
}

function requestBody(method: string, body: Uint8Array): BodyInit | undefined {
  return method === "GET" || method === "HEAD" || body.byteLength === 0 ? undefined : Buffer.from(body).toString("utf8")
}

function headers(input: IncomingHttpHeaders): Headers {
  const out = new Headers()
  for (const [key, value] of Object.entries(input)) {
    if (Array.isArray(value)) out.set(key, value.join(", "))
    else if (value) out.set(key, value)
  }
  return out
}

async function send(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status
  response.headers.forEach((value, key) => res.setHeader(key, value))
  if (!response.body) {
    res.end()
    return
  }
  res.flushHeaders()
  const reader = response.body.getReader()
  for (;;) {
    const chunk = await reader.read()
    if (chunk.done) {
      res.end()
      return
    }
    res.write(chunk.value)
  }
}
