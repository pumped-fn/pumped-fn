import { describe, expect, it } from "vitest"
import { createScope, flow, typed } from "@pumped-fn/lite"
import { replay, run as replayRun, suspend, SuspendSignal } from "@pumped-fn/lite-extension-suspense"
import {
  MemorySuspenseLog,
  suspense,
} from "../src/index"

describe("suspense test helpers", () => {
  it("replays standalone suspense steps without agent config", async () => {
    const log = new MemorySuspenseLog()
    const { extension } = suspense({ log })
    const scope = createScope({ extensions: [extension] })
    await scope.ready
    let calls = 0
    const step = flow({
      name: "standalone-step",
      parse: typed<number>(),
      tags: [replay(true)],
      factory: (ctx) => {
        calls++
        return ctx.input + 1
      },
    })

    const ctx1 = scope.createContext(replayRun({ taskId: "sync-a", runId: "run-a" }))
    expect(await ctx1.exec({ flow: step, input: 1 })).toBe(2)
    await ctx1.close()

    const ctx2 = scope.createContext(replayRun({ taskId: "sync-a", runId: "run-a" }))
    expect(await ctx2.exec({ flow: step, input: 100 })).toBe(2)
    await ctx2.close()
    expect(calls).toBe(1)
  })

  it("suspends standalone suspense steps and resumes from resolved value", async () => {
    const log = new MemorySuspenseLog()
    const { extension } = suspense({ log })
    const scope = createScope({ extensions: [extension] })
    await scope.ready
    const externalSync = flow({
      name: "external-sync",
      tags: [suspend(true)],
      factory: () => "unreachable",
    })

    const ctx1 = scope.createContext(replayRun({ taskId: "sync-b", runId: "run-b" }))
    await expect(ctx1.exec({ flow: externalSync })).rejects.toBeInstanceOf(SuspendSignal)
    await ctx1.close({ ok: false, error: new Error("suspended") })

    const pending = log.entries().find((entry) => entry.status === "pending")
    expect(pending?.targetName).toBe("external-sync")
    if (!pending) throw new Error("external-sync step did not suspend")
    await log.resolve(pending.key, "synced")

    const ctx2 = scope.createContext(replayRun({ taskId: "sync-b", runId: "run-b" }))
    expect(await ctx2.exec({ flow: externalSync })).toBe("synced")
    await ctx2.close()
  })
})
