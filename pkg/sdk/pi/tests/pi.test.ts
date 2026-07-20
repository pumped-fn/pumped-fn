import type {
  AssistantMessage,
  AssistantMessageEventStream,
  Api,
  Model as PiModel,
  MutableModels,
} from "@earendil-works/pi-ai"
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai"
import { createScope, preset } from "@pumped-fn/lite"
import { type Model, type ModelRequest } from "@pumped-fn/sdk"
import * as session from "@pumped-fn/sdk/session"
import { expect, expectTypeOf, it } from "vitest"
import { models, piAttempt, piConfig, piTurn, supportedModels } from "../src/index"

const selected: PiModel<Api> = {
  id: "test-model",
  name: "Test model",
  api: "openai-responses",
  provider: "test",
  baseUrl: "https://example.invalid",
  reasoning: true,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 1_000,
  maxTokens: 100,
}

const response: AssistantMessage = {
  role: "assistant",
  content: [
    { type: "text", text: "working" },
    { type: "toolCall", id: "tool-1", name: "lookup", arguments: { id: 7 } },
    { type: "toolCall", id: "skill-1", name: "load_skill", arguments: { name: "search" } },
    { type: "toolCall", id: "sub-1", name: "call_subagent", arguments: { name: "reviewer", prompt: "check" } },
  ],
  api: selected.api,
  provider: selected.provider,
  model: selected.id,
  usage: {
    input: 10,
    output: 5,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 15,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0.01 },
  },
  stopReason: "toolUse",
  timestamp: 1,
}

function collection(result = response): MutableModels {
  return {
    getProviders: () => [],
    getProvider: () => undefined,
    getModels: (provider?: string) => provider === undefined || provider === "test" ? [selected] : [],
    getModel: (provider, id) => provider === "test" && id === selected.id ? selected : undefined,
    refresh: async () => undefined,
    getAuth: async () => undefined,
    stream: () => streamOf(result),
    complete: async () => result,
    streamSimple: () => streamOf(result),
    completeSimple: async () => result,
    setProvider: () => undefined,
    deleteProvider: () => undefined,
    clearProviders: () => undefined,
  }
}

function streamOf(result: AssistantMessage): AssistantMessageEventStream {
  const stream = createAssistantMessageEventStream()
  queueMicrotask(() => {
    stream.push({ type: "start", partial: result })
    stream.push({ type: "text_delta", contentIndex: 0, delta: "working", partial: result })
    stream.push({ type: "done", reason: "toolUse", message: result })
  })
  return stream
}

function request(): ModelRequest {
  return {
    agentName: "planner",
    instructions: "Plan.",
    messages: [],
    tools: [],
    skills: [],
    loadedSkills: [],
    subagents: [],
    round: 0,
  }
}

it("requires session provenance before using a bound provider", async () => {
  const authority = session.createAuthority({
    tenant: "pi-test",
    roots: [],
    permissions: [],
    tools: [],
    sandbox: { roots: [], commands: [], write: false, network: true },
  })
  const scope = createScope({
    presets: [preset(models, collection())],
    tags: [piConfig({ provider: "test", modelId: "test-model" })],
  })
  const ctx = scope.createContext({ tags: [session.current.authority(authority)] })

  await expect(ctx.exec({ flow: piAttempt, input: request() })).rejects.toThrow("complete session provenance")
  await ctx.close()
  await scope.dispose()
})

it("maps native pi-ai tool calls", async () => {
  const scope = createScope({
    presets: [preset(models, collection())],
    tags: [piConfig({ provider: "test", modelId: "test-model" })],
  })
  const ctx = scope.createContext()

  const result = await ctx.exec({
    flow: piTurn,
    input: {
      agentName: "planner",
      instructions: "Plan.",
      messages: [{ role: "user", content: "start" }],
      tools: [{ name: "lookup", description: "Look up a value." }],
      skills: [{ name: "search", description: "Search sources." }],
      loadedSkills: [],
      subagents: [{ name: "reviewer", description: "Review the plan." }],
      round: 0,
    },
  })

  expect(result).toEqual({
    content: "working",
    toolCalls: [{ name: "lookup", input: { id: 7 }, id: "tool-1" }],
    skillCalls: [{ name: "search", id: "skill-1" }],
    subagentCalls: [{ name: "reviewer", input: { prompt: "check" }, id: "sub-1" }],
    stop: false,
  })
  expectTypeOf(piTurn).toMatchTypeOf<Model>()
  expect(piTurn.deps).toMatchObject({ attempt: { flow: piAttempt } })

  await ctx.close()
  await scope.dispose()
})

it("normalizes pi-ai stream events without changing the scalar result", async () => {
  const scope = createScope({
    presets: [preset(models, collection())],
    tags: [piConfig({ provider: "test", modelId: "test-model" })],
  })
  const ctx = scope.createContext()
  const input: ModelRequest = {
    agentName: "planner",
    instructions: "Plan.",
    messages: [{ role: "user", content: "start" }],
    tools: [{ name: "lookup", description: "Look up a value." }],
    skills: [{ name: "search", description: "Search sources." }],
    loadedSkills: [],
    subagents: [{ name: "reviewer", description: "Review the plan." }],
    round: 0,
  }
  const stream = ctx.execStream({ flow: piAttempt, input })
  const normalized = []

  for await (const event of stream) normalized.push(event)

  expect(normalized).toEqual([
    { type: "provider_status", status: "started" },
    { type: "content_delta", content: "working" },
    { type: "provider_status", status: "completed" },
  ])
  await expect(stream.result).resolves.toMatchObject({ content: "working", stop: false })

  await ctx.close()
  await scope.dispose()
})

it("publishes resolved capability schemas to pi-ai", async () => {
  const captured: unknown[] = []
  const collectionWithSchema = collection()
  collectionWithSchema.stream = (_model, context) => {
    captured.push(context.tools?.[0]?.parameters)
    return streamOf(response)
  }
  const scope = createScope({
    presets: [preset(models, collectionWithSchema)],
    tags: [piConfig({ provider: "test", modelId: "test-model" })],
  })
  const ctx = scope.createContext()
  const inputSchema = {
    type: "object",
    properties: { id: { type: "number" } },
    required: ["id"],
    additionalProperties: false,
  }

  await ctx.exec({
    flow: piTurn,
    input: {
      agentName: "planner",
      instructions: "Plan.",
      messages: [],
      tools: [{ name: "lookup", description: "Look up a value.", inputSchema }],
      skills: [{ name: "search", description: "Search sources." }],
      loadedSkills: [],
      subagents: [{ name: "reviewer", description: "Review the plan." }],
      round: 0,
    },
  })

  expect(captured).toEqual([inputSchema])
  await ctx.close()
  await scope.dispose()
})

it("aborts the pi-ai producer when the consumer stops", async () => {
  let signal: AbortSignal | undefined
  const waiting = collection()
  waiting.stream = (_model, _context, options) => {
    signal = options?.signal
    const stream = createAssistantMessageEventStream()
    queueMicrotask(() => stream.push({ type: "start", partial: response }))
    return stream
  }
  const scope = createScope({
    presets: [preset(models, waiting)],
    tags: [piConfig({ provider: "test", modelId: "test-model" })],
  })
  const ctx = scope.createContext()
  const stream = ctx.execStream({ flow: piAttempt, input: {
    agentName: "planner",
    instructions: "Plan.",
    messages: [],
    tools: [],
    skills: [],
    loadedSkills: [],
    subagents: [],
    round: 0,
  } })
  const iterator = stream[Symbol.asyncIterator]()

  await expect(iterator.next()).resolves.toMatchObject({ done: false })
  const result = stream.result.catch(() => undefined)
  await iterator.return?.()
  expect(signal?.aborted).toBe(true)
  await result
  await ctx.close()
  await scope.dispose()
})

it("isolates consumer aborts across pi-ai attempt contexts", async () => {
  const signals: AbortSignal[] = []
  const waiting = collection()
  waiting.stream = (_model, _context, options) => {
    if (options?.signal) signals.push(options.signal)
    const stream = createAssistantMessageEventStream()
    queueMicrotask(() => stream.push({ type: "start", partial: response }))
    return stream
  }
  const scope = createScope({
    presets: [preset(models, waiting)],
    tags: [piConfig({ provider: "test", modelId: "test-model" })],
  })
  const firstContext = scope.createContext()
  const secondContext = scope.createContext()
  const first = firstContext.execStream({ flow: piAttempt, input: request() })
  const second = secondContext.execStream({ flow: piAttempt, input: request() })
  const firstIterator = first[Symbol.asyncIterator]()
  const secondIterator = second[Symbol.asyncIterator]()

  await expect(firstIterator.next()).resolves.toMatchObject({ done: false })
  await expect(secondIterator.next()).resolves.toMatchObject({ done: false })
  const firstResult = first.result.catch(() => undefined)
  const secondResult = second.result.catch(() => undefined)
  await firstIterator.return?.()
  expect(signals).toHaveLength(2)
  expect(signals[0]?.aborted).toBe(true)
  expect(signals[1]?.aborted).toBe(false)

  await secondIterator.return?.()
  expect(signals[1]?.aborted).toBe(true)
  await firstResult
  await secondResult
  await firstContext.close()
  await secondContext.close()
  await scope.dispose()
})

it("lists models and rejects unsupported selections", async () => {
  const scope = createScope({
    presets: [preset(models, collection())],
    tags: [piConfig({ provider: "test", modelId: "missing" })],
  })
  const ctx = scope.createContext()

  await expect(ctx.exec({ flow: supportedModels, input: { provider: "test" } })).resolves.toEqual([selected])
  await expect(ctx.exec({
    flow: piTurn,
    input: {
      agentName: "planner",
      instructions: "",
      messages: [],
      tools: [],
      skills: [],
      loadedSkills: [],
      subagents: [],
      round: 0,
    },
  })).rejects.toThrow('Unsupported pi-ai model "test/missing". Supported: test-model')

  await ctx.close({ ok: false, error: new Error("expected") })
  await scope.dispose()
})
