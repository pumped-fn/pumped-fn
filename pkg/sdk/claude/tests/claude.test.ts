import { createScope, flow, typed } from "@pumped-fn/lite"
import { agent, model, type Model, type ModelRequest } from "@pumped-fn/sdk"
import { expect, it } from "vitest"
import { claude } from "../src/index"

it("provides Claude through the agent model tag", async () => {
  const target = agent({ name: "planner" })
  const scope = createScope({
    tags: [
      claude({
        command: "echo",
        isolate: false,
        prompt: (request) => `provider=claude agent=${request.agentName}`,
      }),
    ],
  })
  const ctx = scope.createContext()

  await expect(ctx.exec({
    flow: target.turn,
    input: { prompt: "plan" },
  })).resolves.toMatchObject({
    content: "-p --no-session-persistence -- provider=claude agent=planner",
  })

  await ctx.close()
  await scope.dispose()
})

it("validates Claude harness configuration eagerly", () => {
  expect(() => claude({ command: "echo", isolate: false, extraArgs: ["--bare"] })).toThrow(
    "Claude harness must not use --bare"
  )
})

it("can be replaced per execution context without rebuilding the agent", async () => {
  const target = agent({ name: "planner" })
  const replacement: Model = flow({
    parse: typed<ModelRequest>(),
    factory: () => ({ content: "provider=fake", stop: true }),
  })
  const scope = createScope({
    tags: [
      claude({
        command: "echo",
        isolate: false,
        prompt: () => "provider=claude",
      }),
    ],
  })
  const claudeCtx = scope.createContext()
  const fakeCtx = scope.createContext({ tags: [model(replacement)] })

  await expect(claudeCtx.exec({
    flow: target.turn,
    input: { prompt: "plan" },
  })).resolves.toMatchObject({
    content: "-p --no-session-persistence -- provider=claude",
  })
  await expect(fakeCtx.exec({
    flow: target.turn,
    input: { prompt: "plan" },
  })).resolves.toMatchObject({
    content: "provider=fake",
  })

  await claudeCtx.close()
  await fakeCtx.close()
  await scope.dispose()
})
