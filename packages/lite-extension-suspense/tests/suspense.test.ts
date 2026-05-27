import { describe, expect, it } from "vitest"
import { createScope, flow, typed } from "@pumped-fn/lite"
import {
  SuspendSignal,
  extension,
  formatSuspenseStepKey,
  replay,
  run,
  suspend,
  type SuspenseEventLog,
  type SuspenseStepEntry,
  type SuspenseStepKey,
} from "../src"

class InMemorySuspenseEventLog implements SuspenseEventLog {
  private readonly store = new Map<string, SuspenseStepEntry>()

  async get(key: SuspenseStepKey): Promise<SuspenseStepEntry | undefined> {
    return this.store.get(formatSuspenseStepKey(key))
  }

  async putPending(entry: Extract<SuspenseStepEntry, { status: "pending" }>): Promise<void> {
    this.store.set(formatSuspenseStepKey(entry.key), entry)
  }

  async putCompleted(entry: Extract<SuspenseStepEntry, { status: "completed" }>): Promise<void> {
    this.store.set(formatSuspenseStepKey(entry.key), entry)
  }

  async resolve(key: SuspenseStepKey, value: unknown): Promise<void> {
    const current = this.store.get(formatSuspenseStepKey(key))
    if (!current || current.status !== "pending") throw new Error(`Pending step "${formatSuspenseStepKey(key)}" not found`)
    this.store.set(formatSuspenseStepKey(key), {
      status: "resolved",
      key,
      targetName: current.targetName,
      value,
    })
  }

  entries(): SuspenseStepEntry[] {
    return [...this.store.values()]
  }
}

describe("suspense extension", () => {
  it("uses distinct tag labels", () => {
    expect(replay.label).toBe("suspense.replay")
    expect(suspend.label).toBe("suspense.suspend")
  })

  it("replays completed marked steps", async () => {
    const log = new InMemorySuspenseEventLog()
    const scope = createScope({ extensions: [extension({ log })] })
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

    const ctx1 = scope.createContext(run({ taskId: "sync-a", runId: "run-a" }))
    expect(await ctx1.exec({ flow: step, input: 1 })).toBe(2)
    await ctx1.close()

    const ctx2 = scope.createContext(run({ taskId: "sync-a", runId: "run-a" }))
    expect(await ctx2.exec({ flow: step, input: 100 })).toBe(2)
    await ctx2.close()
    expect(calls).toBe(1)
  })

  it("rejects replay when the positional key points at a different target", async () => {
    const log = new InMemorySuspenseEventLog()
    const scope = createScope({ extensions: [extension({ log })] })
    await scope.ready
    const first = flow({
      name: "first-step",
      tags: [replay(true)],
      factory: () => "first",
    })
    const second = flow({
      name: "second-step",
      tags: [replay(true)],
      factory: () => "second",
    })

    const ctx1 = scope.createContext(run({ taskId: "sync-mismatch", runId: "run-mismatch" }))
    expect(await ctx1.exec({ flow: first })).toBe("first")
    await ctx1.close()

    const ctx2 = scope.createContext(run({ taskId: "sync-mismatch", runId: "run-mismatch" }))
    await expect(ctx2.exec({ flow: second })).rejects.toThrow("Suspense replay target mismatch")
    await ctx2.close({ ok: false, error: new Error("expected") })
  })

  it("rejects unnamed suspense targets", async () => {
    const log = new InMemorySuspenseEventLog()
    const scope = createScope({ extensions: [extension({ log })] })
    await scope.ready
    const unnamed = flow({
      tags: [replay(true)],
      factory: () => "unsafe",
    })

    const ctx = scope.createContext(run({ taskId: "sync-unnamed", runId: "run-unnamed" }))
    await expect(ctx.exec({ flow: unnamed })).rejects.toThrow("Suspense target must have a name")
    await ctx.close({ ok: false, error: new Error("expected") })
  })

  it("suspends marked steps and resumes from resolved value", async () => {
    const log = new InMemorySuspenseEventLog()
    const scope = createScope({ extensions: [extension({ log })] })
    await scope.ready
    const externalSync = flow({
      name: "external-sync",
      tags: [suspend(true)],
      factory: () => "unreachable",
    })

    const ctx1 = scope.createContext(run({ taskId: "sync-b", runId: "run-b" }))
    await expect(ctx1.exec({ flow: externalSync })).rejects.toBeInstanceOf(SuspendSignal)
    await ctx1.close({ ok: false, error: new Error("suspended") })

    const pending = log.entries().find((entry) => entry.status === "pending")
    expect(pending?.targetName).toBe("external-sync")
    if (!pending) throw new Error("external-sync step did not suspend")
    await log.resolve(pending.key, "synced")

    const ctx2 = scope.createContext(run({ taskId: "sync-b", runId: "run-b" }))
    expect(await ctx2.exec({ flow: externalSync })).toBe("synced")
    await ctx2.close()
  })
})
