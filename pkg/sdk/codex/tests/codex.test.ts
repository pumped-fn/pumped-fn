import { createScope, flow, preset, typed } from "@pumped-fn/lite"
import { complete, model, type Model, type ModelRequest, type PromptInput } from "@pumped-fn/sdk"
import { expect, expectTypeOf, it } from "vitest"
import * as codexModule from "../src/index"
import {
  codex,
  codexAttempt,
  codexAcp,
  codexAcpAttempt,
  codexAcpConfig,
  codexAcpPrompt,
  codexAcpTurn,
  codexConfig,
  codexRun,
  codexTurn,
  engine,
} from "../src/index"

const fake = flow({
  name: "codex.fake",
  parse: typed<PromptInput>(),
  factory: (ctx) => JSON.stringify({ content: `provider=codex prompt=${ctx.input.prompt.includes("Agent: review")}`, stop: true }),
})

const fakeAcp = flow({
  name: "codex.acp.fake",
  parse: typed<ModelRequest>(),
  factory: async function* () {
    yield { type: "provider_status" as const, status: "started" }
    return { content: "provider=codex-acp", stop: true }
  },
})

const request: ModelRequest = {
  agentName: "review",
  instructions: "Review.",
  messages: [{ role: "user", content: "check" }],
  tools: [],
  skills: [],
  loadedSkills: [],
  subagents: [],
  round: 0,
}

it("provides Codex through stable module handles", async () => {
  const scope = createScope({
    presets: [preset(codexRun, fake)],
    tags: [codex, codexConfig({ auth: { kind: "global" } })],
  })
  const ctx = scope.createContext()

  await expect(ctx.exec({ flow: complete, input: request })).resolves.toMatchObject({
    content: "provider=codex prompt=true",
  })
  expectTypeOf(codexTurn).toMatchTypeOf<Model>()

  await ctx.close()
  await scope.dispose()
})

it("normalizes the CLI attempt without changing its scalar response", async () => {
  const scope = createScope({
    presets: [preset(codexRun, fake)],
    tags: [codexConfig({ auth: { kind: "global" } })],
  })
  const ctx = scope.createContext()
  const stream = ctx.execStream({ flow: codexAttempt, input: {
    agentName: "review",
    instructions: "Review.",
    messages: [],
    tools: [],
    skills: [],
    loadedSkills: [],
    subagents: [],
    round: 0,
  } })
  const normalized = []

  for await (const event of stream) normalized.push(event)

  expect(normalized).toEqual([
    { type: "provider_status", status: "started" },
    { type: "content_delta", content: JSON.stringify({ content: "provider=codex prompt=true", stop: true }) },
    { type: "provider_status", status: "completed" },
  ])
  await expect(stream.result).resolves.toMatchObject({ content: "provider=codex prompt=true" })

  await ctx.close()
  await scope.dispose()
})

it("provides ACP through a preset prompt edge", async () => {
  const scope = createScope({
    presets: [preset(codexAcpAttempt, fakeAcp)],
    tags: [codexModule.provider, codexModule.config({
      auth: { kind: "global" },
      cwd: process.cwd(),
      additionalDirectories: [],
      permission: "deny",
      shutdownTimeoutMs: 5_000,
    })],
  })
  const ctx = scope.createContext()

  await expect(ctx.exec({ flow: complete, input: request })).resolves.toMatchObject({
    content: "provider=codex-acp",
  })

  await ctx.close()
  await scope.dispose()
})

it("exports the managed ACP path as module namespace handles", () => {
  expect(codexModule.config).toBe(codexAcpConfig)
  expect(codexModule.engine).toBe(engine)
  expect(codexModule.run).toBe(codexAcpPrompt)
  expect(codexModule.turn).toBe(codexAcpTurn)
  expect(codexModule.provider).toBe(codexAcp)
  expectTypeOf(codexModule.turn).toMatchTypeOf<Model>()
})

it("declares the public model through the provider turn, prompt, and boundary", () => {
  expect(complete.deps?.["impl"]).toMatchObject({ tag: model, mode: "required" })
  expect(codexTurn.deps?.["attempt"]).toMatchObject({ flow: codexAttempt })
  expect(codexAcp.tag).toBe(model)
  expect(codexAcp.value).toBe(codexAcpTurn)
  expect(codexAcpTurn.deps?.["attempt"]).toMatchObject({ flow: codexAcpAttempt })
  expect(codexAcpPrompt.deps?.["acp"]).toBe(codexModule.acp)
})

it("can replace the model tag per context", async () => {
  const replacement: Model = flow({
    parse: typed<ModelRequest>(),
    factory: () => ({ content: "provider=fake", stop: true }),
  })
  const scope = createScope({
    presets: [preset(codexRun, fake)],
    tags: [codex, codexConfig({ auth: { kind: "global" } })],
  })
  const codexCtx = scope.createContext()
  const fakeCtx = scope.createContext({ tags: [model(replacement)] })

  await expect(codexCtx.exec({ flow: complete, input: request })).resolves.toMatchObject({
    content: "provider=codex prompt=true",
  })
  await expect(fakeCtx.exec({ flow: complete, input: request })).resolves.toMatchObject({
    content: "provider=fake",
  })

  await codexCtx.close()
  await fakeCtx.close()
  await scope.dispose()
})
