import { isAbsolute, resolve } from "node:path"
import { createInterface } from "node:readline"
import { spawn } from "node:child_process"
import { atom, controller, flow, resource, tag, tags, typed } from "@pumped-fn/lite"
import {
  formatModelPrompt,
  model,
  parseModelResponse,
  step,
  type CliIsolateOptions,
  type ModelRequest,
  type PromptInput,
} from "@pumped-fn/sdk"
import * as agent from "@pumped-fn/sdk/agent"
import * as session from "@pumped-fn/sdk/session"

export type ClaudeAuth =
  | { kind: "token"; env?: string }
  | { kind: "global" }

/** Configures Claude authentication, roots, isolation, permission, and process timeouts. */
export interface ClaudeConfig {
  auth: ClaudeAuth
  command?: string
  cwd: string
  roots: readonly string[]
  permission: "deny"
  isolate?: boolean | CliIsolateOptions
  shutdownTimeoutMs: number
  timeoutMs?: number
}

export class ClaudeConfigError extends Error {
  override readonly name = "ClaudeConfigError"
}

export class ClaudeProcessError extends Error {
  override readonly name = "ClaudeProcessError"
}

export class ClaudeShutdownError extends Error {
  override readonly name = "ClaudeShutdownError"
}

export const claudeConfig = tag<ClaudeConfig>({ label: "claude.config" })

export const engine = atom({
  factory: () => spawn,
})

export const clock = atom({
  factory: () => {
    let next = 0
    const timers = new Map<number, ReturnType<typeof setTimeout>>()
    return {
      set(fn: () => void, ms: number) {
        const token = next++
        timers.set(token, setTimeout(() => {
          timers.delete(token)
          fn()
        }, ms))
        return token
      },
      clear(token: number) {
        const timer = timers.get(token)
        if (timer) clearTimeout(timer)
        timers.delete(token)
      },
    }
  },
})

const environment = atom({
  factory: () => process.env,
})

const lineReader = atom({
  factory: () => createInterface,
})

export const claudeSession = resource({
  name: "claude.session",
  ownership: "boundary",
  deps: {
    authority: tags.optional(session.current.authority),
    config: tags.required(claudeConfig),
    clock,
    engine,
    environment,
    lineReader,
    work: tags.optional(session.current.work),
  },
  factory: (ctx, { authority, clock, config, engine, environment, lineReader, work }) => {
    const boundAuthority = bindClaudeAuthority(authority, work)
    const effectiveConfig = boundAuthority ? authorizeClaudeConfig(config, boundAuthority) : config
    const resolved = resolveConfig(effectiveConfig, environment)
    const child = engine(resolved.command, [...resolved.args], {
      cwd: resolved.cwd,
      env: resolved.env,
      stdio: ["pipe", "pipe", "pipe"],
    })
    const lines = lineReader({ input: child.stdout })
    const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
      child.once("error", reject)
      child.once("close", (code, signal) => resolve({ code, signal }))
    })
    let current: {
      resolve(value: string): void
      reject(error: Error): void
      signal?: AbortSignal
      abort?: () => void
      timeout?: number
    } | undefined
    let closed = false
    let closing = false
    let shutdownPhase: "open" | "graceful" | "force" = "open"
    let stderr = ""
    let tail = Promise.resolve()

    const settle = (result: { value: string } | { error: Error }) => {
      const transaction = current
      if (!transaction) return
      current = undefined
      if (transaction.abort) transaction.signal?.removeEventListener("abort", transaction.abort)
      if (transaction.timeout !== undefined) clock.clear(transaction.timeout)
      if ("value" in result) transaction.resolve(result.value)
      else transaction.reject(result.error)
    }

    const fail = (error: Error) => {
      closed = true
      settle({ error })
    }

    const requestGraceful = () => {
      if (shutdownPhase !== "open") return
      shutdownPhase = "graceful"
      if (closed) return
      if (current) child.kill("SIGINT")
      else child.stdin.end()
    }

    const awaitExit = () => new Promise<boolean>((resolve, reject) => {
      const timeout = clock.set(() => resolve(false), config.shutdownTimeoutMs)
      exited.then(() => {
        clock.clear(timeout)
        resolve(true)
      }, (error) => {
        clock.clear(timeout)
        reject(error)
      })
    })

    const close = async () => {
      closing = true
      requestGraceful()
      if (await awaitExit()) {
        lines.close()
        settle({ error: new ClaudeProcessError("Claude session closed during prompt") })
        return
      }
      shutdownPhase = "force"
      child.kill("SIGKILL")
      if (await awaitExit()) {
        lines.close()
        settle({ error: new ClaudeProcessError("Claude session closed during prompt") })
        return
      }
      const error = new ClaudeShutdownError(`Claude process did not exit within two ${config.shutdownTimeoutMs}ms shutdown bounds`)
      lines.close()
      settle({ error })
      throw error
    }

    child.stderr.setEncoding("utf8")
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk
    })
    exited.then(({ code, signal }) => {
      closed = true
      if (!closing && current) {
        fail(new ClaudeProcessError(`Claude process closed before result (code=${code}, signal=${signal ?? "none"}): ${stderr.trim()}`))
      }
    }, (error: Error) => fail(error))
    lines.on("line", (line) => {
      try {
        const event = parseEvent(line)
        if (event.type !== "result") return
        if (event.is_error) settle({ error: new ClaudeProcessError(event.result) })
        else settle({ value: event.result })
      } catch (error) {
        fail(error instanceof Error ? error : new ClaudeProcessError(String(error)))
      }
    })

    const prompt = (value: string, signal?: AbortSignal) => {
      const transaction = tail.then(() => new Promise<string>((resolve, reject) => {
        if (closed || closing) {
          reject(new ClaudeProcessError("Claude session is closed"))
          return
        }
        if (signal?.aborted) {
          reject(new DOMException("Claude prompt aborted", "AbortError"))
          return
        }
        const abort = () => {
          closing = true
          requestGraceful()
          settle({ error: new DOMException("Claude prompt aborted", "AbortError") })
        }
        current = { resolve, reject, signal, abort }
        signal?.addEventListener("abort", abort, { once: true })
        if (config.timeoutMs !== undefined) {
          current.timeout = clock.set(() => {
            closing = true
            requestGraceful()
            settle({ error: new ClaudeProcessError(`Claude prompt timed out after ${config.timeoutMs}ms`) })
          }, config.timeoutMs)
        }
        child.stdin.write(`${JSON.stringify({ type: "user", message: { role: "user", content: value } })}\n`)
      }))
      tail = transaction.then(() => undefined, () => undefined)
      return transaction
    }

    const lifetime = { close, shutdown: undefined as Promise<void> | undefined }
    ctx.cleanup((target) => target.shutdown ??= target.close(), lifetime)

    return { prompt }
  },
})

/** Manages reusable and transient Claude sessions keyed by session identity. */
export interface ClaudeLeaseManager {
  prompt(
    sessionId: string,
    prompt: string,
    signal?: AbortSignal,
  ): { readonly events: AsyncIterable<agent.ModelEvent>; readonly result: Promise<string> }
  release(sessionId: string): Promise<void>
  transient(): string
}

export const claudeLeases = resource({
  name: "claude.leases",
  ownership: "boundary",
  deps: {
    authority: tags.optional(session.current.authority),
    config: tags.required(claudeConfig),
    clock,
    engine,
    environment,
    lineReader,
    work: tags.optional(session.current.work),
  },
  factory: (ctx, { authority, clock, config, engine, environment, lineReader, work }): ClaudeLeaseManager => {
    const boundAuthority = bindClaudeAuthority(authority, work)
    const effectiveConfig = boundAuthority ? authorizeClaudeConfig(config, boundAuthority) : config
    const leases = new Map<string, ReturnType<typeof createManagedLease>>()
    let next = 0
    const lease = (sessionId: string) => {
      const existing = leases.get(sessionId)
      if (existing) return existing
      const created = createManagedLease(effectiveConfig, { clock, engine, environment, lineReader })
      leases.set(sessionId, created)
      return created
    }
    const release = async (sessionId: string) => {
      const current = leases.get(sessionId)
      if (!current) return
      try {
        await current.close()
      } finally {
        if (leases.get(sessionId) === current) leases.delete(sessionId)
      }
    }
    ctx.cleanup(async (active) => {
      const current = [...active.entries()]
      active.clear()
      await Promise.all(current.map(([, value]) => value.close()))
    }, leases)
    return {
      prompt: (sessionId, prompt, signal) => lease(sessionId).prompt(prompt, signal),
      release,
      transient: () => `transient-${next++}`,
    }
  },
})

export const claudeAttempt: agent.Attempt = flow({
  name: "claude.attempt",
  parse: typed<ModelRequest>(),
  deps: {
    attempt: tags.optional(session.current.attempt),
    authority: tags.optional(session.current.authority),
    branch: tags.optional(session.current.branch),
    config: tags.optional(claudeConfig),
    leases: claudeLeases,
    record: tags.optional(session.record),
    runtime: tags.optional(session.current.session),
    work: tags.optional(session.current.work),
  },
  tags: [step({ workflow: true, kind: "llm" })],
  factory: async function* (ctx, { attempt, authority, branch, config, leases, record, runtime, work }) {
    if ((work || attempt) && (!runtime || !work || !attempt || !branch || !authority)) {
      throw new ClaudeConfigError("Claude session tags must be provided as one bound tuple")
    }
    const boundAuthority = bindClaudeAuthority(authority, work)
    if (boundAuthority) {
      if (!config) throw new ClaudeConfigError("Claude session authority requires config")
      authorizeClaudeConfig(config, boundAuthority)
    }
    const sessionId = record
      ? branch
        ? `${record.id}:${branch.id}`
        : record.id
      : leases.transient()
    const invocation = leases.prompt(sessionId, formatModelPrompt(ctx.input), ctx.signal)
    let completed = false
    try {
      for await (const event of invocation.events) yield event
      const result = parseModelResponse(await invocation.result)
      completed = true
      return result
    } finally {
      if (!completed || !record) await leases.release(sessionId)
    }
  },
})

export const claudeAttemptBinding = agent.impl.attempt(claudeAttempt)

export const claudeRun = flow({
  name: "claude.run",
  parse: typed<PromptInput>(),
  deps: {
    authority: tags.optional(session.current.authority),
    session: claudeSession,
    work: tags.optional(session.current.work),
  },
  tags: [step({ workflow: true, kind: "llm" })],
  factory: (ctx, { authority, session, work }) => {
    bindClaudeAuthority(authority, work)
    return session.prompt(ctx.input.prompt, ctx.signal)
  },
})

export const claudeTurn = flow({
  name: "claude.complete",
  parse: typed<ModelRequest>(),
  deps: { attempt: controller(claudeAttempt) },
  factory: (ctx, { attempt }) => attempt.exec({ input: ctx.input }),
})

export const claude = model(claudeTurn)

export {
  claudeConfig as config,
  claudeRun as run,
  claudeTurn as turn,
  claude as provider,
}

function resolveConfig(config: ClaudeConfig, environment: NodeJS.ProcessEnv) {
  if (config.isolate !== undefined && config.isolate !== false) {
    throw new ClaudeConfigError("Managed Claude sessions do not support isolated CLI state")
  }
  if (config.permission !== "deny") throw new ClaudeConfigError('Claude permission must be explicitly set to "deny"')
  if (!Number.isFinite(config.shutdownTimeoutMs) || config.shutdownTimeoutMs <= 0) {
    throw new ClaudeConfigError("Claude shutdownTimeoutMs must be greater than zero")
  }
  if (!config.cwd || !isAbsolute(config.cwd)) throw new ClaudeConfigError("Claude cwd must be an absolute path")
  if (!config.roots) throw new ClaudeConfigError("Claude roots must be explicitly set, including an empty array")
  if (config.roots.some((root) => !isAbsolute(root))) throw new ClaudeConfigError("Claude roots must contain only absolute paths")
  const env = config.auth.kind === "token"
    ? Object.assign({}, environment, { CLAUDE_CODE_OAUTH_TOKEN: requiredEnvironment(environment, config.auth.env ?? "CLAUDE_CODE_OAUTH_TOKEN") })
    : environment
  return {
    command: config.command ?? "claude",
    args: [
      "-p",
      "--verbose",
      "--input-format",
      "stream-json",
      "--output-format",
      "stream-json",
      "--tools",
      "",
      "--permission-mode",
      "dontAsk",
      "--no-session-persistence",
      ...config.roots.flatMap((root) => ["--add-dir", root]),
    ],
    cwd: config.cwd,
    env,
  }
}

function bindClaudeAuthority(
  authority: session.Authority | undefined,
  work: session.WorkRecord | undefined,
): session.Authority | undefined {
  if (!work) return authority
  if (!authority || authority.fingerprint !== work.authority.fingerprint) {
    throw new ClaudeConfigError("Claude authority does not match current work")
  }
  return work.authority
}

function authorizeClaudeConfig(config: ClaudeConfig, authority: session.Authority): ClaudeConfig {
  if (!authority.sandbox.network) throw new ClaudeConfigError("Claude network exceeds current work authority")
  const roots = [config.cwd, ...config.roots]
  if (roots.some((root) => !isAbsolute(root))) throw new ClaudeConfigError("Claude authority roots must be absolute")
  if (roots.some((root) => !authority.sandbox.roots.some((allowed) => within(resolve(root), resolve(allowed))))) {
    throw new ClaudeConfigError("Claude roots exceed current work authority")
  }
  return config
}

function within(path: string, root: string): boolean {
  return root === "/" || path === root || path.startsWith(`${root}/`)
}

function parseEvent(line: string): { type: string; result: string; is_error: boolean } {
  const event = JSON.parse(line) as Record<string, unknown>
  if (event["type"] !== "result") return { type: String(event["type"]), result: "", is_error: false }
  if (typeof event["result"] !== "string" || typeof event["is_error"] !== "boolean") {
    throw new ClaudeProcessError("Claude result event is invalid")
  }
  return { type: "result", result: event["result"], is_error: event["is_error"] }
}

function requiredEnvironment(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]
  if (!value) throw new ClaudeConfigError(`Claude token environment variable "${name}" is not set`)
  return value
}

function createManagedLease(
  config: ClaudeConfig,
  deps: {
    readonly clock: {
      set(fn: () => void, ms: number): number
      clear(token: number): void
    }
    readonly engine: typeof spawn
    readonly environment: NodeJS.ProcessEnv
    readonly lineReader: typeof createInterface
  },
) {
  const resolved = resolveConfig(config, deps.environment)
  const child = deps.engine(resolved.command, [...resolved.args], {
    cwd: resolved.cwd,
    env: resolved.env,
    stdio: ["pipe", "pipe", "pipe"],
  })
  const lines = deps.lineReader({ input: child.stdout })
  const exited = new Promise<Error | undefined>((resolve) => {
    child.once("error", resolve)
    child.once("close", () => resolve(undefined))
  })
  let current: {
    readonly events: EventQueue<agent.ModelEvent>
    readonly resolve: (value: string) => void
    readonly reject: (error: Error) => void
    readonly signal?: AbortSignal
    readonly abort?: () => void
    timeout?: number
  } | undefined
  let closed = false
  let closing = false
  let shutdown: Promise<void> | undefined
  let tail = Promise.resolve()

  const settle = (result: { value: string } | { error: Error }) => {
    const transaction = current
    if (!transaction) return
    current = undefined
    if (transaction.abort) transaction.signal?.removeEventListener("abort", transaction.abort)
    if (transaction.timeout !== undefined) deps.clock.clear(transaction.timeout)
    if ("value" in result) {
      transaction.events.push({ type: "provider_status", status: "completed" })
      transaction.events.end()
      transaction.resolve(result.value)
    } else {
      transaction.events.fail(result.error)
      transaction.reject(result.error)
    }
  }

  const awaitExit = () => new Promise<boolean>((resolve) => {
    const timeout = deps.clock.set(() => resolve(false), config.shutdownTimeoutMs)
    exited.then(() => {
      deps.clock.clear(timeout)
      resolve(true)
    })
  })

  const close = async () => {
    if (shutdown) return shutdown
    shutdown = (async () => {
      closing = true
      if (!closed) {
        if (current) child.kill("SIGINT")
        else child.stdin.end()
      }
      if (!await awaitExit()) {
        child.kill("SIGKILL")
        if (!await awaitExit()) throw new ClaudeShutdownError(`Claude process did not exit within two ${config.shutdownTimeoutMs}ms shutdown bounds`)
      }
      lines.close()
      settle({ error: new ClaudeProcessError("Claude session closed during prompt") })
    })()
    return shutdown
  }

  child.stderr.resume()
  exited.then((error) => {
    closed = true
    if (error) {
      closing = true
      lines.close()
      settle({ error })
    } else if (!closing && current) {
      settle({ error: new ClaudeProcessError("Claude process closed before result") })
    }
  })
  lines.on("line", (line) => {
    try {
      const event = parseManagedEvent(line)
      if (event.model) current?.events.push(event.model)
      if (event.result) {
        if (event.result.is_error) settle({ error: new ClaudeProcessError(event.result.value) })
        else settle({ value: event.result.value })
      }
    } catch (error) {
      settle({ error: error instanceof Error ? error : new ClaudeProcessError(String(error)) })
    }
  })

  const prompt = (value: string, signal?: AbortSignal) => {
    const events = new EventQueue<agent.ModelEvent>()
    const result = tail.then(() => new Promise<string>((resolve, reject) => {
      if (closed || closing) {
        reject(new ClaudeProcessError("Claude session is closed"))
        return
      }
      if (signal?.aborted) {
        reject(new DOMException("Claude prompt aborted", "AbortError"))
        return
      }
      const abort = () => {
        closing = true
        child.kill("SIGINT")
        settle({ error: new DOMException("Claude prompt aborted", "AbortError") })
      }
      current = { events, resolve, reject, signal, abort }
      events.push({ type: "provider_status", status: "started" })
      signal?.addEventListener("abort", abort, { once: true })
      if (config.timeoutMs !== undefined) {
        current.timeout = deps.clock.set(() => {
          closing = true
          child.kill("SIGINT")
          settle({ error: new ClaudeProcessError(`Claude prompt timed out after ${config.timeoutMs}ms`) })
        }, config.timeoutMs)
      }
      child.stdin.write(`${JSON.stringify({ type: "user", message: { role: "user", content: value } })}\n`)
    }))
    tail = result.then(() => undefined, () => undefined)
    result.catch((error) => events.fail(error))
    return { events, result }
  }

  return { prompt, close }
}

function parseManagedEvent(line: string): {
  readonly model?: agent.ModelEvent
  readonly result?: { readonly value: string; readonly is_error: boolean }
} {
  const value = JSON.parse(line) as Record<string, unknown>
  if (value["type"] === "result") {
    if (typeof value["result"] !== "string" || typeof value["is_error"] !== "boolean") {
      throw new ClaudeProcessError("Claude result event is invalid")
    }
    return { result: { value: value["result"], is_error: value["is_error"] } }
  }
  if (value["type"] === "stream_event" && isRecord(value["event"])) {
    const event = value["event"]
    if (event["type"] === "content_block_delta" && isRecord(event["delta"])) {
      const delta = event["delta"]
      if (delta["type"] === "text_delta" && typeof delta["text"] === "string") {
        return { model: { type: "content_delta", content: delta["text"] } }
      }
      if (delta["type"] === "thinking_delta" && typeof delta["thinking"] === "string") {
        return { model: { type: "reasoning_delta", content: delta["thinking"] } }
      }
    }
  }
  return {}
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
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
