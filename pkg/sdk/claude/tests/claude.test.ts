import { createScope, flow, preset, typed } from "@pumped-fn/lite"
import { agent, model, type Model, type ModelRequest, type PromptInput } from "@pumped-fn/sdk"
import { expect, expectTypeOf, it } from "vitest"
import { claude, claudeConfig, claudeRun, claudeTurn } from "../src/index"

const fake = flow({
  name: "claude.fake",
  parse: typed<PromptInput>(),
  factory: (ctx) => JSON.stringify({ content: `provider=claude prompt=${ctx.input.prompt.includes("Agent: planner")}`, stop: true }),
})

it("provides Claude through stable module handles", async () => {
  const target = agent({ name: "planner" })
  const scope = createScope({
    presets: [preset(claudeRun, fake)],
    tags: [claude, claudeConfig({ auth: { kind: "global" } })],
  })
  const ctx = scope.createContext()

  await expect(ctx.exec({ flow: target.turn, input: { prompt: "plan" } })).resolves.toMatchObject({
    content: "provider=claude prompt=true",
  })
  expectTypeOf(claudeTurn).toMatchTypeOf<Model>()

  await ctx.close()
  await scope.dispose()
})

it("can replace the model tag per context", async () => {
  const target = agent({ name: "planner" })
  const replacement: Model = flow({
    parse: typed<ModelRequest>(),
    factory: () => ({ content: "provider=fake", stop: true }),
  })
  const scope = createScope({
    presets: [preset(claudeRun, fake)],
    tags: [claude, claudeConfig({ auth: { kind: "global" } })],
  })
  const claudeCtx = scope.createContext()
  const fakeCtx = scope.createContext({ tags: [model(replacement)] })

  await expect(claudeCtx.exec({ flow: target.turn, input: { prompt: "plan" } })).resolves.toMatchObject({
    content: "provider=claude prompt=true",
  })
  await expect(fakeCtx.exec({ flow: target.turn, input: { prompt: "plan" } })).resolves.toMatchObject({
    content: "provider=fake",
  })

  await claudeCtx.close()
  await fakeCtx.close()
  await scope.dispose()
})
