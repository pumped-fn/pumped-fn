import {
  ClientSideConnection,
  PROTOCOL_VERSION,
  ndJsonStream,
  type Client,
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
import { spawnProcess, webStreams } from "./adapters/process"

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

export const codexConfig = tag<CodexConfig>({ label: "codex.config" })

const environment = atom({
  factory: () => process.env,
})

const workingDirectory = atom({
  factory: () => process.cwd(),
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
  command?: string
  args?: readonly string[]
  cwd?: string
  permission?: "grant" | "deny"
}

export const codexAcpConfig = tag<CodexAcpConfig>({ label: "codex.acp.config" })

export const acp = resource({
  name: "codex.acp",
  ownership: "boundary",
  deps: {
    buffer: events,
    config: tags.required(codexAcpConfig),
    spawn: spawnProcess,
    streams: webStreams,
    workingDirectory,
  },
  tags: [step({ workflow: true, kind: "llm" })],
  factory: async (ctx, { buffer, config, spawn, streams, workingDirectory }) => {
    const sessions = new Map<string, string[]>()
    const metadata = new Map<string, { agentName: string; round: number }>()
    const child = spawn(config.command ?? "codex-acp", [...(config.args ?? [])], {
      cwd: config.cwd,
      stdio: ["pipe", "pipe", "pipe"],
    })
    if (!child.stdin || !child.stdout) throw new CodexConfigError("ACP adapter requires piped stdio")
    const client: Client = {
      sessionUpdate: async (notification: SessionNotification) => {
        const session = sessions.get(notification.sessionId)
        if (
          session
          && notification.update.sessionUpdate === "agent_message_chunk"
          && notification.update.content.type === "text"
        ) {
          session.push(notification.update.content.text)
        }
      },
      requestPermission: async (request: RequestPermissionRequest): Promise<RequestPermissionResponse> => {
        const meta = metadata.get(request.sessionId)
        buffer.record({
          type: "agent_tool_end",
          agentName: meta?.agentName ?? "acp",
          round: meta?.round,
          targetName: "acp.permission",
          input: request.options,
          output: config.permission ?? "deny",
        })
        const granted = request.options.find((option) => option.kind === "allow_once" || option.kind === "allow_always")
        if (config.permission === "grant" && granted) {
          return { outcome: { outcome: "selected", optionId: granted.optionId } }
        }
        return { outcome: { outcome: "cancelled" } }
      },
    }
    const connection = new ClientSideConnection(
      () => client,
      ndJsonStream(
        streams.writable(child.stdin) as WritableStream<Uint8Array>,
        streams.readable(child.stdout) as ReadableStream<Uint8Array>,
      ),
    )
    await connection.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: {},
    })
    ctx.cleanup(() => {
      child.kill()
    })
    return { connection, cwd: config.cwd ?? workingDirectory, sessions, metadata }
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
    const session = await acp.connection.newSession({ cwd: acp.cwd, mcpServers: [] })
    const chunks: string[] = []
    acp.sessions.set(session.sessionId, chunks)
    acp.metadata.set(session.sessionId, { agentName: ctx.input.agentName, round: ctx.input.round })
    const cancel = () => void acp.connection.cancel({ sessionId: session.sessionId })
    signal?.addEventListener("abort", cancel, { once: true })
    await acp.connection.prompt({
      sessionId: session.sessionId,
      prompt: [{ type: "text", text: formatModelPrompt(ctx.input) }],
    }).finally(() => {
      signal?.removeEventListener("abort", cancel)
      acp.sessions.delete(session.sessionId)
      acp.metadata.delete(session.sessionId)
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

function requiredEnvironment(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]
  if (!value) throw new CodexConfigError(`Codex API key environment variable "${name}" is not set`)
  return value
}
