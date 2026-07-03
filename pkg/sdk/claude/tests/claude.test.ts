import { createScope } from "@pumped-fn/lite"
import { agent, model, type Model } from "@pumped-fn/sdk"
import { expect, it } from "vitest"
import { claude } from "../src/index"

it("provides Claude through a lazy agent model tag", async () => {
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

it("defers Claude harness validation until the model is used", async () => {
  const target = agent({ name: "planner" })
  const scope = createScope({
    tags: [claude({ command: "echo", isolate: false, extraArgs: ["--bare"] })],
  })
  const ctx = scope.createContext()

  await expect(ctx.exec({
    flow: target.turn,
    input: { prompt: "plan" },
  })).rejects.toThrow("Claude harness must not use --bare")

  await ctx.close({ ok: false, error: new Error("expected") })
  await scope.dispose()
})

it("can be replaced per execution context without rebuilding the agent", async () => {
  const target = agent({ name: "planner" })
  const replacement: Model = {
    complete: () => ({ content: "provider=fake", stop: true }),
  }
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
