import { describe, expect, it } from "vitest"
import { createScope, flow } from "@pumped-fn/lite"
import {
  extension,
  formatSuspenseStepKey,
  replay,
  run,
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

describe("suspense streaming exclusion", () => {
  it("F6 rejects replay-marked streaming flows before journaling", async () => {
    const log = new InMemorySuspenseEventLog()
    const scope = createScope({ extensions: [extension({ log })] })
    await scope.ready
    const read = flow({
      name: "stream-step",
      tags: [replay(true)],
      factory: async function* () {
        yield 1
        return "done"
      },
    })

    const execCtx = scope.createContext(run({ taskId: "streaming", runId: "exec" }))
    await expect(execCtx.exec({ flow: read })).rejects.toThrow("streaming flows are not replayable yet")
    await execCtx.close({ ok: false, error: new Error("expected") })

    const streamCtx = scope.createContext(run({ taskId: "streaming", runId: "stream" }))
    const stream = streamCtx.execStream({ flow: read })
    await expect(stream[Symbol.asyncIterator]().next()).rejects.toThrow("streaming flows are not replayable yet")
    await expect(stream.result).rejects.toThrow("streaming flows are not replayable yet")
    await streamCtx.close({ ok: false, error: new Error("expected") })

    expect(log.entries()).toEqual([])
    await scope.dispose()
  })
})
