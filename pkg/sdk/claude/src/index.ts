import { isAbsolute } from "node:path"
import { createInterface } from "node:readline"
import { spawn } from "node:child_process"
import { atom, controller, flow, resource, tag, tags, typed } from "@pumped-fn/lite"
import {
  abortSignal,
  formatModelPrompt,
  model,
  parseModelResponse,
  step,
  type CliIsolateOptions,
  type ModelRequest,
  type PromptInput,
} from "@pumped-fn/sdk"

export type ClaudeAuth =
  | { kind: "token"; env?: string }
  | { kind: "global" }

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
    config: tags.required(claudeConfig),
    clock,
    engine,
    environment,
    lineReader,
  },
  factory: (ctx, { clock, config, engine, environment, lineReader }) => {
    const resolved = resolveConfig(config, environment)
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
    let shutdown: Promise<void> | undefined
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

    ctx.cleanup(() => shutdown ??= close())

    return { prompt }
  },
})

export const claudeRun = flow({
  name: "claude.run",
  parse: typed<PromptInput>(),
  deps: {
    session: claudeSession,
    signal: tags.optional(abortSignal),
  },
  tags: [step({ workflow: true, kind: "llm" })],
  factory: (ctx, { session, signal }) => session.prompt(ctx.input.prompt, signal),
})

export const claudeTurn = flow({
  name: "claude.complete",
  parse: typed<ModelRequest>(),
  deps: { run: controller(claudeRun) },
  factory: async (ctx, { run }) => parseModelResponse(await run.exec({
    input: { prompt: formatModelPrompt(ctx.input) },
  })),
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
