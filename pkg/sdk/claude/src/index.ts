import { atom, controller, flow, tag, tags, typed, type Lite } from "@pumped-fn/lite"
import {
  abortSignal,
  formatModelPrompt,
  model,
  parseModelResponse,
  runCli,
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
  extraArgs?: readonly string[]
  isolate?: boolean | CliIsolateOptions
  timeoutMs?: number
}

export class ClaudeConfigError extends Error {
  override readonly name = "ClaudeConfigError"
}

export const claudeConfig = tag<ClaudeConfig>({ label: "claude.config" })

const environment = atom({
  factory: () => process.env,
})

export const claudeRun = flow({
  name: "claude.run",
  parse: typed<PromptInput>(),
  deps: {
    config: tags.required(claudeConfig),
    environment,
    signal: tags.optional(abortSignal),
  },
  tags: [step({ workflow: true, kind: "llm" })],
  factory: async (ctx, { config, environment, signal }) => {
    if (config.extraArgs?.some((arg) => arg === "--")) throw new ClaudeConfigError("Claude extraArgs cannot include --")
    if (config.extraArgs?.some((arg) => arg === "--bare" || arg.startsWith("--bare="))) {
      throw new ClaudeConfigError("Claude provider must not use --bare")
    }
    const env = config.auth.kind === "token"
      ? { CLAUDE_CODE_OAUTH_TOKEN: requiredEnvironment(environment, config.auth.env ?? "CLAUDE_CODE_OAUTH_TOKEN") }
      : undefined
    return (await runCli({
      command: config.command ?? "claude",
      args: ["-p", "--no-session-persistence", ...(config.extraArgs ?? []), "--", ctx.input.prompt],
      env,
      isolate: config.isolate,
      timeoutMs: config.timeoutMs,
      signal,
    })).stdout.trim()
  },
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

function requiredEnvironment(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]
  if (!value) throw new ClaudeConfigError(`Claude token environment variable "${name}" is not set`)
  return value
}
