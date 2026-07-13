import { createScope, flow, preset, typed } from "@pumped-fn/lite"
import { agent, complete, model, type Model, type ModelRequest, type PromptInput } from "@pumped-fn/sdk"
import { expect, expectTypeOf, it } from "vitest"
import * as codexModule from "../src/index"
import {
  codex,
  codexAcp,
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
  factory: () => JSON.stringify({ content: "provider=codex-acp", stop: true }),
})

it("provides Codex through stable module handles", async () => {
  const target = agent({ name: "review" })
  const scope = createScope({
    presets: [preset(codexRun, fake)],
    tags: [codex, codexConfig({ auth: { kind: "global" } })],
  })
  const ctx = scope.createContext()

  await expect(ctx.exec({ flow: target.turn, input: { prompt: "check" } })).resolves.toMatchObject({
    content: "provider=codex prompt=true",
  })
  expectTypeOf(codexTurn).toMatchTypeOf<Model>()

  await ctx.close()
  await scope.dispose()
})

it("provides ACP through a preset prompt edge", async () => {
  const target = agent({ name: "review" })
  const scope = createScope({
    presets: [preset(codexModule.run, fakeAcp)],
    tags: [codexModule.provider, codexModule.config({
      auth: { kind: "global" },
      cwd: process.cwd(),
      additionalDirectories: [],
      permission: "deny",
      shutdownTimeoutMs: 5_000,
    })],
  })
  const ctx = scope.createContext()

  await expect(ctx.exec({ flow: target.turn, input: { prompt: "check" } })).resolves.toMatchObject({
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
  expect(codexAcp.tag).toBe(model)
  expect(codexAcp.value).toBe(codexAcpTurn)
  expect(codexAcpTurn.deps?.["prompt"]).toMatchObject({ flow: codexAcpPrompt })
  expect(codexAcpPrompt.deps?.["acp"]).toBe(codexModule.acp)
})

it("can replace the model tag per context", async () => {
  const target = agent({ name: "review" })
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

  await expect(codexCtx.exec({ flow: target.turn, input: { prompt: "check" } })).resolves.toMatchObject({
    content: "provider=codex prompt=true",
  })
  await expect(fakeCtx.exec({ flow: target.turn, input: { prompt: "check" } })).resolves.toMatchObject({
    content: "provider=fake",
  })

  await codexCtx.close()
  await fakeCtx.close()
  await scope.dispose()
})
