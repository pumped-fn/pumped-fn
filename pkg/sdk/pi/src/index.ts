import {
  StringEnum,
  Type,
  getSupportedThinkingLevels,
  validateToolCall,
  type AssistantMessage,
  type AssistantMessageEvent,
  type Api,
  type Context,
  type Message as PiMessage,
  type Model as PiModel,
  type Models,
  type Tool,
  type ToolCall as PiToolCall,
} from "@earendil-works/pi-ai"
import { builtinModels } from "@earendil-works/pi-ai/providers/all"
import { atom, controller, flow, resource, tag, tags, typed } from "@pumped-fn/lite"
import {
  model,
  step,
  type Capability,
  type Message,
  type ModelRequest,
  type ModelResponse,
} from "@pumped-fn/sdk"
import * as agent from "@pumped-fn/sdk/agent"
import * as session from "@pumped-fn/sdk/session"

/** Selects a Pi provider, model, thinking level, and API-key environment variable. */
export interface PiConfig {
  provider: string
  modelId: string
  thinking?: "minimal" | "low" | "medium" | "high" | "xhigh"
  apiKeyEnv?: string
}

export class PiProviderError extends Error {
  override readonly name = "PiProviderError"

  constructor(
    message: string,
    readonly provider: string,
    readonly modelId: string,
  ) {
    super(message)
  }
}

export const piConfig = tag<PiConfig>({ label: "pi.config" })

const environment = atom({
  factory: () => process.env,
})

const clock = atom({
  factory: () => Date.now,
})

export const models = resource({
  name: "pi.models",
  ownership: "boundary",
  factory: (ctx) => {
    const collection = builtinModels()
    ctx.cleanup((target) => target.clearProviders(), collection)
    return collection
  },
})

export const supportedModels = flow({
  name: "pi.supported-models",
  parse: typed<{ provider?: string }>(),
  deps: { models },
  factory: (ctx, { models }) => models.getModels(ctx.input.provider),
})

export const piAttempt: agent.Attempt = flow({
  name: "pi.attempt",
  parse: typed<ModelRequest>(),
  deps: {
    attempt: tags.optional(session.current.attempt),
    authority: tags.optional(session.current.authority),
    branch: tags.optional(session.current.branch),
    clock,
    config: tags.required(piConfig),
    environment,
    epoch: tags.optional(session.current.epoch),
    models,
    runtime: tags.optional(session.current.session),
    work: tags.optional(session.current.work),
  },
  tags: [step({ workflow: true, kind: "llm" })],
  factory: async function* (ctx, { attempt, authority, branch, clock, config, environment, epoch, models, runtime, work }) {
    const signal = ctx.signal
    assertPiAuthority(config, authority, runtime, work, attempt, branch, epoch)
    const selected = requireModel(models, config)
    if (config.thinking && !getSupportedThinkingLevels(selected).includes(config.thinking)) {
      throw new PiProviderError(
        `Unsupported thinking level "${config.thinking}" for "${config.provider}/${config.modelId}". Supported: ${getSupportedThinkingLevels(selected).join(", ")}`,
        config.provider,
        config.modelId,
      )
    }
    const tools = toolsOf(ctx.input)
    const context: Context = {
      systemPrompt: ctx.input.instructions || undefined,
      messages: ctx.input.messages.flatMap((message, index) => messagesOf(message, selected, clock(), index)),
      ...(tools.length ? { tools } : {}),
    }
    const apiKey = config.apiKeyEnv ? requireEnvironment(environment, config.apiKeyEnv, config) : undefined
    const controller = new AbortController()
    const abort = () => controller.abort(signal.reason)
    signal.addEventListener("abort", abort, { once: true })
    if (signal.aborted) abort()
    const stream = config.thinking
      ? models.streamSimple(selected, context, { reasoning: config.thinking, apiKey, signal: controller.signal })
      : models.stream(selected, context, { apiKey, signal: controller.signal })
    let response: AssistantMessage | undefined
    let completed = false
    try {
      for await (const event of stream) {
        const normalized = piEvent(event)
        if (normalized) yield normalized
        if (event.type === "done") response = event.message
        if (event.type === "error") response = event.error
      }
      response ??= await stream.result()
      if (response.stopReason === "error" || response.stopReason === "aborted") {
        throw new PiProviderError(response.errorMessage ?? `pi-ai ${response.stopReason}`, config.provider, config.modelId)
      }
      completed = true
      return responseOf(response, tools)
    } finally {
      signal.removeEventListener("abort", abort)
      if (!completed) controller.abort(new DOMException("Pi attempt stream closed", "AbortError"))
    }
  },
})

export const piAttemptBinding = agent.impl.attempt(piAttempt)

export const piTurn = flow({
  name: "pi.complete",
  parse: typed<ModelRequest>(),
  deps: { attempt: controller(piAttempt) },
  factory: (ctx, { attempt }) => attempt.exec({ input: ctx.input }),
})

export const pi = model(piTurn)

function piEvent(event: AssistantMessageEvent): agent.ModelEvent | undefined {
  if (event.type === "start") return { type: "provider_status", status: "started" }
  if (event.type === "text_delta") return { type: "content_delta", content: event.delta }
  if (event.type === "thinking_delta") return { type: "reasoning_delta", content: event.delta }
  if (event.type === "done") return { type: "provider_status", status: "completed" }
  if (event.type === "error") return { type: "provider_status", status: event.reason }
  return undefined
}

function requireModel(models: Models, config: PiConfig): PiModel<Api> {
  const selected = models.getModel(config.provider, config.modelId)
  if (selected) return selected
  const supported = models.getModels(config.provider).map((model) => model.id)
  throw new PiProviderError(
    `Unsupported pi-ai model "${config.provider}/${config.modelId}". Supported: ${supported.join(", ") || "none"}`,
    config.provider,
    config.modelId,
  )
}

function assertPiAuthority(
  config: PiConfig,
  authority: session.Authority | undefined,
  runtime: session.SessionRuntime | undefined,
  work: session.WorkRecord | undefined,
  attempt: session.AttemptRecord | undefined,
  branch: session.BranchRecord | undefined,
  epoch: number | undefined,
): void {
  if (!authority && !runtime && !work && !attempt && !branch && epoch === undefined) return
  if (!authority || !runtime || !work || !attempt || !branch || epoch === undefined) {
    throw new PiProviderError("Pi attempt requires complete session provenance", config.provider, config.modelId)
  }
  if (!authority.sandbox.network) throw new PiProviderError("Pi requires network authority", config.provider, config.modelId)
  if (runtime.authority.fingerprint !== authority.fingerprint || work.authority.fingerprint !== authority.fingerprint) {
    throw new PiProviderError("Pi session authority does not match work provenance", config.provider, config.modelId)
  }
  if (attempt.workId !== work.id || branch.id !== work.branchId || epoch !== attempt.snapshotEpoch) {
    throw new PiProviderError("Pi session provenance does not match the active attempt", config.provider, config.modelId)
  }
}

function requireEnvironment(environment: NodeJS.ProcessEnv, name: string, config: PiConfig): string {
  const value = environment[name]
  if (value) return value
  throw new PiProviderError(`pi-ai API key environment variable "${name}" is not set`, config.provider, config.modelId)
}

function toolsOf(request: ModelRequest): Tool[] {
  return [
    ...request.tools.map(capabilityTool),
    ...(request.skills.length ? [skillTool(request.skills)] : []),
    ...(request.subagents.length ? [subagentTool(request.subagents)] : []),
  ]
}

function capabilityTool(capability: Capability): Tool {
  return {
    name: capability.name,
    description: capability.description,
    parameters: capability.inputSchema === undefined
      ? Type.Object({}, { additionalProperties: true })
      : Type.Unsafe(capability.inputSchema === true
        ? {}
        : capability.inputSchema === false
          ? { not: {} }
          : capability.inputSchema),
  }
}

function skillTool(skills: readonly Capability[]): Tool {
  return {
    name: "load_skill",
    description: "Load one available skill into the next model round.",
    parameters: Type.Object({ name: StringEnum(skills.map((skill) => skill.name)) }),
  }
}

function subagentTool(subagents: readonly Capability[]): Tool {
  return {
    name: "call_subagent",
    description: "Delegate a prompt to one available subagent.",
    parameters: Type.Object({
      name: StringEnum(subagents.map((subagent) => subagent.name)),
      prompt: Type.String(),
    }),
  }
}

function messagesOf(message: Message, model: PiModel<Api>, timestamp: number, index: number): PiMessage[] {
  if (message.role === "assistant") {
    return [{
      role: "assistant",
      content: [{ type: "text", text: message.content }],
      api: model.api,
      provider: model.provider,
      model: model.id,
      usage: emptyUsage(),
      stopReason: "stop",
      timestamp,
    }]
  }
  if (message.role === "tool" || message.role === "skill" || message.role === "subagent") {
    const name = message.role === "skill"
      ? "load_skill"
      : message.role === "subagent"
        ? "call_subagent"
        : message.name ?? "tool"
    const id = message.id ?? `${name}-${index}`
    return [{
      role: "assistant",
      content: [{ type: "toolCall", id, name, arguments: inputOf(message) }],
      api: model.api,
      provider: model.provider,
      model: model.id,
      usage: emptyUsage(),
      stopReason: "toolUse",
      timestamp,
    }, {
      role: "toolResult",
      toolCallId: id,
      toolName: name,
      content: [{ type: "text", text: message.content }],
      isError: false,
      timestamp,
    }]
  }
  return [{
    role: "user",
    content: message.name ? `${message.role}(${message.name}): ${message.content}` : message.content,
    timestamp,
  }]
}

function inputOf(message: Message): Record<string, unknown> {
  if (message.role === "skill") return { name: message.name }
  if (message.role === "subagent") {
    const prompt = isRecord(message.input) && typeof message.input["prompt"] === "string"
      ? message.input["prompt"]
      : message.content
    return { name: message.name, prompt }
  }
  return isRecord(message.input) ? message.input : { input: message.input }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function emptyUsage(): AssistantMessage["usage"] {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  }
}

function responseOf(response: AssistantMessage, tools: Tool[]): ModelResponse {
  const calls = response.content.filter((item): item is PiToolCall => item.type === "toolCall")
  for (const call of calls) validateToolCall(tools, call)
  const toolCalls = calls.filter((call) => call.name !== "load_skill" && call.name !== "call_subagent")
  const skillCalls = calls.filter((call) => call.name === "load_skill")
  const subagentCalls = calls.filter((call) => call.name === "call_subagent")
  return {
    content: response.content
      .filter((item) => item.type === "text")
      .map((item) => item.text)
      .join(""),
    ...(toolCalls.length ? { toolCalls: toolCalls.map((call) => ({ name: call.name, input: call.arguments, id: call.id })) } : {}),
    ...(skillCalls.length ? { skillCalls: skillCalls.map((call) => ({ name: stringArgument(call, "name"), id: call.id })) } : {}),
    ...(subagentCalls.length ? {
      subagentCalls: subagentCalls.map((call) => ({
        name: stringArgument(call, "name"),
        input: { prompt: stringArgument(call, "prompt") },
        id: call.id,
      })),
    } : {}),
    stop: response.stopReason === "stop" && calls.length === 0,
  }
}

function stringArgument(call: PiToolCall, name: string): string {
  const value: unknown = call.arguments[name]
  if (typeof value === "string") return value
  throw new PiProviderError(`pi-ai tool "${call.name}" requires string argument "${name}"`, call.name, name)
}
