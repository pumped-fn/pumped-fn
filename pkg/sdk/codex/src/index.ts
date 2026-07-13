import {
  PROTOCOL_VERSION,
  client,
  ndJsonStream,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type SessionNotification,
} from "@agentclientprotocol/sdk"
import { atom, controller, flow, resource, tag, tags, typed } from "@pumped-fn/lite"
import {
  abortSignal,
  events,
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
    signal: tags.optional(abortSignal),
  },
  tags: [step({ workflow: true, kind: "llm" })],
  factory: async (ctx, { config, environment, signal }) => {
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
      signal,
    })).stdout.trim()
  },
})

export const codexTurn = flow({
  name: "codex.complete",
  parse: typed<ModelRequest>(),
  deps: { run: controller(codexRun) },
  factory: async (ctx, { run }) => parseModelResponse(await run.exec({
    input: { prompt: formatModelPrompt(ctx.input) },
  })),
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
    buffer: events,
    clock,
    config: tags.required(codexAcpConfig),
    environment,
    absolutePath,
    spawn: spawnProcess,
    streams: webStreams,
  },
  tags: [step({ workflow: true, kind: "llm" })],
  factory: async (ctx, { absolutePath, buffer, clock, config, environment, spawn, streams }) => {
    if (!config.auth) throw new CodexConfigError("ACP auth must be explicitly set")
    if (!absolutePath(config.cwd)) throw new CodexConfigError("ACP cwd must be absolute")
    if (config.additionalDirectories.some((directory) => !absolutePath(directory))) {
      throw new CodexConfigError("ACP additionalDirectories must be absolute")
    }
    if (!Number.isFinite(config.shutdownTimeoutMs) || config.shutdownTimeoutMs <= 0) {
      throw new CodexConfigError("ACP shutdownTimeoutMs must be greater than zero")
    }
    const sessions = new Map<string, string[]>()
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
        }
      })
      .onRequest("session/request_permission", async ({ params: request }: { params: RequestPermissionRequest }): Promise<RequestPermissionResponse> => {
        const meta = metadata.get(request.sessionId)
        buffer.record({
          type: "agent_tool_end",
          agentName: meta?.agentName ?? "acp",
          round: meta?.round,
          targetName: "acp.permission",
          input: request.options,
          output: config.permission,
        })
        const granted = request.options.find((option) => option.kind === "allow_once" || option.kind === "allow_always")
        if (config.permission === "grant" && granted) {
          return { outcome: { outcome: "selected", optionId: granted.optionId } }
        }
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
    return { connection, sessions, metadata }
  },
})

export const codexAcpPrompt = flow({
  name: "codex.acp.prompt",
  parse: typed<ModelRequest>(),
  deps: {
    acp,
    config: tags.required(codexAcpConfig),
    signal: tags.optional(abortSignal),
  },
  tags: [step({ workflow: true, kind: "llm" })],
  factory: async (ctx, { acp, config, signal }) => {
    signal?.throwIfAborted()
    const session = await acp.connection.agent.request("session/new", {
      cwd: config.cwd,
      additionalDirectories: [...config.additionalDirectories],
      mcpServers: [],
    })
    const chunks: string[] = []
    acp.sessions.set(session.sessionId, chunks)
    acp.metadata.set(session.sessionId, { agentName: ctx.input.agentName, round: ctx.input.round })
    let cancellation: Promise<void> | undefined
    const cancel = () => {
      cancellation ??= acp.connection.agent.notify("session/cancel", { sessionId: session.sessionId })
    }
    signal?.addEventListener("abort", cancel, { once: true })
    if (signal?.aborted) cancel()
    await (signal?.aborted
      ? Promise.reject(signal.reason)
      : acp.connection.agent.request("session/prompt", {
          sessionId: session.sessionId,
          prompt: [{ type: "text", text: formatModelPrompt(ctx.input) }],
        })).finally(async () => {
      signal?.removeEventListener("abort", cancel)
      try {
        if (cancellation) await cancellation
      } finally {
        acp.sessions.delete(session.sessionId)
        acp.metadata.delete(session.sessionId)
      }
    })
    return chunks.join("")
  },
})

export const codexAcpTurn = flow({
  name: "codex.acp.complete",
  parse: typed<ModelRequest>(),
  deps: { prompt: controller(codexAcpPrompt) },
  factory: async (ctx, { prompt }) => parseModelResponse(await prompt.exec({ input: ctx.input })),
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
