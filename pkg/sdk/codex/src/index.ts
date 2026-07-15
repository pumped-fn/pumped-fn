import {
  PROTOCOL_VERSION,
  client,
  ndJsonStream,
  type ActiveSession,
  type ClientContext,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type SessionNotification,
} from "@agentclientprotocol/sdk"
import { atom, controller, flow, resource, tag, tags, typed } from "@pumped-fn/lite"
import {
  formatModelPrompt,
  model,
  parseModelResponse,
  runCli,
  step,
  type CliIsolateOptions,
  type ModelRequest,
  type PromptInput,
} from "@pumped-fn/sdk"
import { absolutePath, spawnProcess, webStreams } from "./adapters/process"
import * as agent from "@pumped-fn/sdk/agent"
import * as session from "@pumped-fn/sdk/session"

export type CodexAuth =
  | { kind: "api-key"; env?: string }
  | { kind: "global" }

export interface CodexConfig {
  auth: CodexAuth
  command?: string
  sandbox?: "read-only" | "workspace-write" | "danger-full-access"
  extraArgs?: readonly string[]
  isolate?: boolean | CliIsolateOptions
  timeoutMs?: number
}

export class CodexConfigError extends Error {
  override readonly name = "CodexConfigError"
}

export class CodexShutdownError extends Error {
  override readonly name = "CodexShutdownError"
}

export class CodexConcurrencyError extends Error {
  override readonly name = "CodexConcurrencyError"
}

export const codexConfig = tag<CodexConfig>({ label: "codex.config" })

export const environment = atom({
  factory: () => process.env,
})

export const clock = atom({
  factory: () => ({
    set: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clear: (timer: ReturnType<typeof setTimeout>) => clearTimeout(timer),
  }),
})

export const codexRun = flow({
  name: "codex.run",
  parse: typed<PromptInput>(),
  deps: {
    config: tags.required(codexConfig),
    environment,
  },
  tags: [step({ workflow: true, kind: "llm" })],
  factory: async (ctx, { config, environment }) => {
    if (config.extraArgs?.some((arg) => arg === "--")) throw new CodexConfigError("Codex extraArgs cannot include --")
    const env = config.auth.kind === "api-key"
      ? { CODEX_API_KEY: requiredEnvironment(environment, config.auth.env ?? "CODEX_API_KEY") }
      : undefined
    return (await runCli({
      command: config.command ?? "codex",
      args: [
        "exec",
        "-s",
        config.sandbox ?? "read-only",
        "--ephemeral",
        "--ignore-user-config",
        ...(config.extraArgs ?? []),
        "--",
        ctx.input.prompt,
      ],
      env,
      isolate: config.isolate,
      timeoutMs: config.timeoutMs,
      signal: ctx.signal,
    })).stdout.trim()
  },
})

export const codexAttempt: agent.Attempt = flow({
  name: "codex.attempt",
  parse: typed<ModelRequest>(),
  deps: { run: controller(codexRun) },
  factory: async function* (ctx, { run }) {
    yield { type: "provider_status", status: "started" }
    const output = await run.exec({ input: { prompt: formatModelPrompt(ctx.input) } })
    yield { type: "content_delta", content: output }
    yield { type: "provider_status", status: "completed" }
    return parseModelResponse(output)
  },
})

export const codexAttemptBinding = agent.impl.attempt(codexAttempt)

export const codexTurn = flow({
  name: "codex.complete",
  parse: typed<ModelRequest>(),
  deps: { attempt: controller(codexAttempt) },
  factory: (ctx, { attempt }) => attempt.exec({ input: ctx.input }),
})

export const codex = model(codexTurn)

export interface CodexAcpConfig {
  auth: CodexAuth
  command?: string
  args?: readonly string[]
  cwd: string
  additionalDirectories: readonly string[]
  permission: "grant" | "deny"
  shutdownTimeoutMs: number
}

export const codexAcpConfig = tag<CodexAcpConfig>({ label: "codex.acp.config" })

export const acp = resource({
  name: "codex.acp",
  ownership: "boundary",
  deps: {
    clock,
    config: tags.required(codexAcpConfig),
    environment,
    absolutePath,
    spawn: spawnProcess,
    streams: webStreams,
  },
  tags: [step({ workflow: true, kind: "llm" })],
  factory: async (ctx, { absolutePath, clock, config, environment, spawn, streams }) => {
    if (!config.auth) throw new CodexConfigError("ACP auth must be explicitly set")
    if (!absolutePath(config.cwd)) throw new CodexConfigError("ACP cwd must be absolute")
    if (config.additionalDirectories.some((directory) => !absolutePath(directory))) {
      throw new CodexConfigError("ACP additionalDirectories must be absolute")
    }
    if (!Number.isFinite(config.shutdownTimeoutMs) || config.shutdownTimeoutMs <= 0) {
      throw new CodexConfigError("ACP shutdownTimeoutMs must be greater than zero")
    }
    const sessions = new Map<string, string[]>()
    const eventStreams = new Map<string, EventQueue<agent.ModelEvent>>()
    const continuations = new Map<string, string | Promise<string>>()
    const metadata = new Map<string, { agentName: string; round: number }>()
    const child = spawn(config.command ?? "codex-acp", [...(config.args ?? [])], {
      cwd: config.cwd,
      env: config.auth.kind === "api-key"
        ? Object.assign({}, environment, { CODEX_API_KEY: requiredEnvironment(environment, config.auth.env ?? "CODEX_API_KEY") })
        : environment,
      stdio: ["pipe", "pipe", "pipe"],
    })
    if (!child.stdin || !child.stdout || !child.stderr) throw new CodexConfigError("ACP adapter requires piped stdio")
    child.stderr.resume()
    let childFailure: unknown
    const childClosed = child.exitCode === null
      ? new Promise<void>((resolve) => {
          child.once("error", (error) => {
            childFailure = error
            resolve()
          })
          child.once("close", () => resolve())
        })
      : Promise.resolve()
    const app = client({ name: "pumped-fn" })
      .onNotification("session/update", async ({ params: notification }: { params: SessionNotification }) => {
        const session = sessions.get(notification.sessionId)
        if (
          session
          && notification.update.sessionUpdate === "agent_message_chunk"
          && notification.update.content.type === "text"
        ) {
          session.push(notification.update.content.text)
          eventStreams.get(notification.sessionId)?.push({
            type: "content_delta",
            content: notification.update.content.text,
          })
        }
      })
      .onRequest("session/request_permission", async ({ params: request }: { params: RequestPermissionRequest }): Promise<RequestPermissionResponse> => {
        const granted = request.options.find((option) => option.kind === "allow_once" || option.kind === "allow_always")
        if (config.permission === "grant" && granted) {
          eventStreams.get(request.sessionId)?.push({ type: "provider_status", status: "permission:selected" })
          return { outcome: { outcome: "selected", optionId: granted.optionId } }
        }
        eventStreams.get(request.sessionId)?.push({ type: "provider_status", status: "permission:cancelled" })
        return { outcome: { outcome: "cancelled" } }
      })
    const connection = app.connect(
      ndJsonStream(
        streams.writable(child.stdin) as WritableStream<Uint8Array>,
        streams.readable(child.stdout) as ReadableStream<Uint8Array>,
      ),
    )
    ctx.cleanup(async () => {
      sessions.clear()
      eventStreams.clear()
      continuations.clear()
      metadata.clear()
      let connectionFailure: unknown
      const transportClosed = connection.closed.catch((error) => {
        connectionFailure = error
      })
      const settled = Promise.all([transportClosed, childClosed])
      const within = async () => {
        let timer: ReturnType<typeof setTimeout> | undefined
        const timeout = new Promise<false>((resolve) => {
          timer = clock.set(() => resolve(false), config.shutdownTimeoutMs)
        })
        const result = await Promise.race([settled.then(() => true as const), timeout])
        if (timer) clock.clear(timer)
        return result
      }
      try {
        connection.close()
      } catch (error) {
        connectionFailure = error
      }
      if (child.exitCode === null) {
        try {
          child.kill("SIGTERM")
        } catch (error) {
          childFailure = error
        }
      }
      if (!await within()) {
        if (child.exitCode === null) {
          try {
            child.kill("SIGKILL")
          } catch (error) {
            childFailure = error
          }
        }
        if (!await within()) {
          throw new CodexShutdownError(`Codex ACP did not close within ${config.shutdownTimeoutMs * 2}ms`)
        }
      }
      if (connectionFailure || childFailure) {
        throw new CodexShutdownError("Codex ACP closed with a lifecycle failure", { cause: connectionFailure ?? childFailure })
      }
    })
    await connection.agent.request("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: {},
    })
    return { connection, sessions, streams: eventStreams, continuations, metadata }
  },
})

export const codexAcpPrompt = flow({
  name: "codex.acp.prompt",
  parse: typed<ModelRequest>(),
  deps: {
    acp,
    config: tags.required(codexAcpConfig),
  },
  tags: [step({ workflow: true, kind: "llm" })],
  factory: async (ctx, { acp, config }) => {
    const signal = ctx.signal
    signal.throwIfAborted()
    const sessionId = await createAcpSession(acp.connection.agent, config, signal)
    const chunks: string[] = []
    acp.sessions.set(sessionId, chunks)
    acp.metadata.set(sessionId, { agentName: ctx.input.agentName, round: ctx.input.round })
    let cancellation: Promise<void> | undefined
    const cancel = () => {
      cancellation ??= acp.connection.agent.notify("session/cancel", { sessionId })
    }
    signal.addEventListener("abort", cancel, { once: true })
    if (signal.aborted) cancel()
    await (signal.aborted
      ? Promise.reject(signal.reason)
      : acp.connection.agent.request("session/prompt", {
          sessionId,
          prompt: [{ type: "text", text: formatModelPrompt(ctx.input) }],
        })).finally(async () => {
      signal.removeEventListener("abort", cancel)
      try {
        if (cancellation) await cancellation
      } finally {
        acp.sessions.delete(sessionId)
        acp.metadata.delete(sessionId)
      }
    })
    return chunks.join("")
  },
})

export const codexAcpAttempt: agent.Attempt = flow({
  name: "codex.acp.attempt",
  parse: typed<ModelRequest>(),
  deps: {
    acp,
    clock,
    config: tags.required(codexAcpConfig),
    record: tags.optional(session.record),
    branch: tags.optional(session.current.branch),
    runtime: tags.optional(session.current.session),
  },
  tags: [step({ workflow: true, kind: "llm" })],
  factory: async function* (ctx, { acp, branch, clock, config, record, runtime }) {
    const signal = ctx.signal
    signal.throwIfAborted()
    const continuationKey = record && branch ? `codex-acp:${record.id}:${branch.id}` : undefined
    const createSession = () => createAcpSession(acp.connection.agent, config, signal)
    let sessionId: string
    if (continuationKey) {
      let continuation: string | Promise<string> | undefined = runtime?.continuations.get(continuationKey)
        ?? acp.continuations.get(continuationKey)
      if (typeof continuation === "string" && !acp.continuations.has(continuationKey)) {
        acp.continuations.set(continuationKey, continuation)
      }
      if (!continuation) {
        let reservation: Promise<string>
        reservation = createSession().then((created) => {
          if (acp.continuations.get(continuationKey) === reservation) {
            if (runtime && runtime.status !== "open") {
              acp.continuations.delete(continuationKey)
            } else {
              acp.continuations.set(continuationKey, created)
              runtime?.continuations.set(continuationKey, created)
            }
          }
          return created
        }, (error) => {
          if (acp.continuations.get(continuationKey) === reservation) {
            acp.continuations.delete(continuationKey)
          }
          throw error
        })
        acp.continuations.set(continuationKey, reservation)
        continuation = reservation
      }
      sessionId = typeof continuation === "string"
        ? continuation
        : await abortable(continuation, signal)
    } else {
      sessionId = await abortable(createSession(), signal)
    }
    signal.throwIfAborted()
    if (acp.sessions.has(sessionId)) {
      throw new CodexConcurrencyError(`ACP session ${sessionId} already has an active prompt`)
    }
    const chunks: string[] = []
    const stream = new EventQueue<agent.ModelEvent>()
    acp.sessions.set(sessionId, chunks)
    acp.streams.set(sessionId, stream)
    acp.metadata.set(sessionId, { agentName: ctx.input.agentName, round: ctx.input.round })
    let cancellation: Promise<void> | undefined
    let settled = false
    const cancel = () => {
      cancellation ??= acp.connection.agent.notify("session/cancel", { sessionId })
      stream.fail(signal.reason ?? new DOMException("Codex ACP stream closed", "AbortError"))
    }
    signal.addEventListener("abort", cancel, { once: true })
    if (signal.aborted) cancel()
    const prompt = acp.connection.agent.request("session/prompt", {
      sessionId,
      prompt: [{ type: "text", text: formatModelPrompt(ctx.input) }],
    }).then(() => {
      settled = true
      stream.push({ type: "provider_status", status: "completed" })
      stream.end()
    }, (error) => {
      settled = true
      stream.fail(error)
    })
    stream.push({ type: "provider_status", status: "started" })
    try {
      for await (const event of stream) yield event
      await prompt
      return parseModelResponse(chunks.join(""))
    } finally {
      signal.removeEventListener("abort", cancel)
      if (!settled) cancel()
      const release = () => {
        acp.sessions.delete(sessionId)
        acp.streams.delete(sessionId)
        acp.metadata.delete(sessionId)
      }
      const completion = Promise.allSettled([
        ...(cancellation ? [cancellation] : []),
        prompt,
      ])
      if (await bounded(completion, clock, config.shutdownTimeoutMs)) {
        release()
      } else {
        if (continuationKey && runtime?.continuations.get(continuationKey) === sessionId) {
          runtime.continuations.delete(continuationKey)
        }
        void completion.then(() => {
          release()
          if (continuationKey && acp.continuations.get(continuationKey) === sessionId) {
            acp.continuations.delete(continuationKey)
          }
        })
      }
    }
  },
})

export const codexAcpAttemptBinding = agent.impl.attempt(codexAcpAttempt)

export const codexAcpTurn = flow({
  name: "codex.acp.complete",
  parse: typed<ModelRequest>(),
  deps: { attempt: controller(codexAcpAttempt) },
  factory: (ctx, { attempt }) => attempt.exec({ input: ctx.input }),
})

export const codexAcp = model(codexAcpTurn)

export {
  codexAcpConfig as config,
  acp as engine,
  codexAcpPrompt as run,
  codexAcpTurn as turn,
  codexAcp as provider,
}

function requiredEnvironment(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]
  if (!value) throw new CodexConfigError(`Codex API key environment variable "${name}" is not set`)
  return value
}

async function createAcpSession(
  agent: ClientContext,
  config: CodexAcpConfig,
  signal?: AbortSignal,
): Promise<string> {
  const pending = agent.buildSession({
    cwd: config.cwd,
    additionalDirectories: [...config.additionalDirectories],
    mcpServers: [],
  }).start()
  let active: ActiveSession
  try {
    active = await abortable(pending, signal)
  } catch (error) {
    void pending.then((session) => session.dispose(), () => undefined)
    throw error
  }
  const sessionId = active.sessionId
  active.dispose()
  return sessionId
}

function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason)
    signal.addEventListener("abort", abort, { once: true })
    if (signal.aborted) abort()
    promise.then((value) => {
      signal.removeEventListener("abort", abort)
      resolve(value)
    }, (error) => {
      signal.removeEventListener("abort", abort)
      reject(error)
    })
  })
}

async function bounded(
  promise: Promise<unknown>,
  scheduler: {
    set(fn: () => void, ms: number): ReturnType<typeof setTimeout>
    clear(timer: ReturnType<typeof setTimeout>): void
  },
  timeoutMs: number,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const settled = await Promise.race([
    promise.then(() => true),
    new Promise<false>((resolve) => {
      timer = scheduler.set(() => resolve(false), timeoutMs)
    }),
  ])
  if (timer) scheduler.clear(timer)
  return settled
}

class EventQueue<T> implements AsyncIterable<T> {
  private values: T[] = []
  private waiters: Array<(result: IteratorResult<T>) => void> = []
  private failure: unknown
  private closed = false

  push(value: T): void {
    if (this.closed) return
    const waiter = this.waiters.shift()
    if (waiter) waiter({ done: false, value })
    else this.values.push(value)
  }

  end(): void {
    if (this.closed) return
    this.closed = true
    for (const waiter of this.waiters.splice(0)) waiter({ done: true, value: undefined })
  }

  fail(error: unknown): void {
    this.failure = error
    this.end()
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<T, void, unknown> {
    while (true) {
      const result = await this.next()
      if (result.done) {
        if (this.failure) throw this.failure
        return
      }
      yield result.value
    }
  }

  private next(): Promise<IteratorResult<T>> {
    const value = this.values.shift()
    if (value !== undefined) return Promise.resolve({ done: false, value })
    if (this.closed) return Promise.resolve({ done: true, value: undefined })
    return new Promise((resolve) => this.waiters.push(resolve))
  }
}
