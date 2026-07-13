import type {
  AssistantMessage,
  AssistantMessageEventStream,
  Api,
  Context,
  Model as PiModel,
  MutableModels,
} from "@earendil-works/pi-ai"
import { createScope, preset } from "@pumped-fn/lite"
import { events, type Model } from "@pumped-fn/sdk"
import { expect, expectTypeOf, it } from "vitest"
import { models, piConfig, piTurn, supportedModels } from "../src/index"

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

function collection(result = response, capture?: (context: Context) => void): MutableModels {
  return {
    getProviders: () => [],
    getProvider: () => undefined,
    getModels: (provider?: string) => provider === undefined || provider === "test" ? [selected] : [],
    getModel: (provider, id) => provider === "test" && id === selected.id ? selected : undefined,
    refresh: async () => undefined,
    getAuth: async () => undefined,
    stream: () => unavailable(),
    complete: async (_model, context) => {
      capture?.(context)
      return result
    },
    streamSimple: () => unavailable(),
    completeSimple: async () => result,
    setProvider: () => undefined,
    deleteProvider: () => undefined,
    clearProviders: () => undefined,
  }
}

function unavailable(): AssistantMessageEventStream {
  throw new Error("stream unavailable")
}

it("maps native pi-ai tool calls and records usage", async () => {
  let received: Context | undefined
  const scope = createScope({
    presets: [preset(models, collection(response, (context) => { received = context }))],
    tags: [piConfig({ provider: "test", modelId: "test-model" })],
  })
  const ctx = scope.createContext()

  const result = await ctx.exec({
    flow: piTurn,
    input: {
      agentName: "planner",
      instructions: "Plan.",
      messages: [{ role: "user", content: "start" }],
      tools: [{
        name: "lookup",
        description: "Look up a value.",
        inputSchema: {
          type: "object",
          properties: { id: { type: "integer" } },
          required: ["id"],
          additionalProperties: false,
        },
      }],
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
  expect(received?.tools?.[0]?.parameters).toEqual({
    type: "object",
    properties: { id: { type: "integer" } },
    required: ["id"],
    additionalProperties: false,
  })
  expect((await ctx.resolve(events)).events.at(-1)?.output).toMatchObject({
    provider: "test",
    modelId: "test-model",
    usage: { totalTokens: 15, cost: { total: 0.01 } },
  })
  expectTypeOf(piTurn).toMatchTypeOf<Model>()

  await ctx.close()
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
