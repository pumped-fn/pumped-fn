import { createScope, flow, typed } from "@pumped-fn/lite"
import { agent, model, type Model, type ModelRequest } from "@pumped-fn/sdk"
import { expect, it } from "vitest"
import { codex } from "../src/index"

it("provides Codex through the agent model tag", async () => {
  const target = agent({ name: "review" })
  const scope = createScope({
    tags: [
      codex({
        command: "echo",
        isolate: false,
        prompt: (request) => `provider=codex agent=${request.agentName}`,
      }),
    ],
  })
  const ctx = scope.createContext()

  await expect(ctx.exec({
    flow: target.turn,
    input: { prompt: "check" },
  })).resolves.toMatchObject({
    content: "exec -s read-only --ephemeral --ignore-user-config -- provider=codex agent=review",
  })

  await ctx.close()
  await scope.dispose()
})

it("can be replaced per execution context without rebuilding the agent", async () => {
  const target = agent({ name: "review" })
  const replacement: Model = flow({
    parse: typed<ModelRequest>(),
    factory: () => ({ content: "provider=fake", stop: true }),
  })
  const scope = createScope({
    tags: [
      codex({
        command: "echo",
        isolate: false,
        prompt: () => "provider=codex",
      }),
    ],
  })
  const codexCtx = scope.createContext()
  const fakeCtx = scope.createContext({ tags: [model(replacement)] })

  await expect(codexCtx.exec({
    flow: target.turn,
    input: { prompt: "check" },
  })).resolves.toMatchObject({
    content: "exec -s read-only --ephemeral --ignore-user-config -- provider=codex",
  })
  await expect(fakeCtx.exec({
    flow: target.turn,
    input: { prompt: "check" },
  })).resolves.toMatchObject({
    content: "provider=fake",
  })

  await codexCtx.close()
  await fakeCtx.close()
  await scope.dispose()
})
