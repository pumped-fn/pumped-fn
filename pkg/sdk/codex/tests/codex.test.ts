import { createScope, flow, preset, typed } from "@pumped-fn/lite"
import { agent, model, type Model, type ModelRequest, type PromptInput } from "@pumped-fn/sdk"
import { expect, expectTypeOf, it } from "vitest"
import {
  codex,
  codexAcp,
  codexAcpConfig,
  codexAcpPrompt,
  codexConfig,
  codexRun,
  codexTurn,
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
    presets: [preset(codexAcpPrompt, fakeAcp)],
    tags: [codexAcp, codexAcpConfig({ permission: "deny" })],
  })
  const ctx = scope.createContext()

  await expect(ctx.exec({ flow: target.turn, input: { prompt: "check" } })).resolves.toMatchObject({
    content: "provider=codex-acp",
  })

  await ctx.close()
  await scope.dispose()
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
