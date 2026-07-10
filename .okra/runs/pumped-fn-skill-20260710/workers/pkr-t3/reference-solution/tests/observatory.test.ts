import { describe, expect, test } from "vitest"
import { createScope, preset } from "@pumped-fn/lite"
import { scheduler } from "@pumped-fn/lite-extension-scheduler"
import { createObservatoryBackend, type BackendClock, type ScheduleStore } from "../src/backend.ts"
import { archive, captureJob, instrument, uploadJob, type Manifest } from "../src/observatory.ts"

const T0 = 1_750_000_000_000
const CAPTURE_EVERY = 3_600_000
const UPLOAD_EVERY = 600_000

const memStore = (seed: Record<string, { lastRunMs: number }> = {}): ScheduleStore => {
  const state = new Map(Object.entries(seed))
  return {
    load: (name) => state.get(name),
    save: (name, entry) => {
      state.set(name, { ...entry })
    },
  }
}

const frozenClock = (nowMs: number): BackendClock => ({
  nowMs: () => nowMs,
  every: () => () => {},
})

const deferred = () => {
  let release: () => void = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  return { gate, release }
}

const settle = async () => {
  for (let i = 0; i < 10; i += 1) await new Promise((resolve) => setTimeout(resolve, 0))
}

const station = (options: {
  store: ScheduleStore
  nowMs?: number
  read?: () => Promise<number>
  send?: (manifest: Manifest) => Promise<void>
}) => {
  const reads: number[] = []
  const sends: Manifest[] = []
  return {
    reads,
    sends,
    scope: createScope({
      tags: [
        scheduler.backend(
          createObservatoryBackend({ store: options.store, clock: frozenClock(options.nowMs ?? T0) }),
        ),
      ],
      presets: [
        preset(instrument, {
          read: async () => {
            const value = (reads.length + 1) * 100
            reads.push(value)
            if (options.read) return options.read()
            return value
          },
        }),
        preset(archive, {
          send: async (manifest: Manifest) => {
            sends.push(manifest)
            if (options.send) await options.send(manifest)
          },
        }),
      ],
    }),
  }
}

describe("archive-upload catch-up", () => {
  test("runs every window missed while the station was down, oldest first", async () => {
    const store = memStore({
      "nightly-capture": { lastRunMs: T0 },
      "archive-upload": { lastRunMs: T0 - 3 * UPLOAD_EVERY },
    })
    const s = station({ store })
    const capture = await s.scope.resolve(captureJob)
    await capture.trigger()
    await capture.trigger()
    const upload = await s.scope.resolve(uploadJob)
    await upload.stop()
    await s.scope.dispose()
    expect(s.sends).toEqual([{ readings: [100, 200] }, { readings: [] }, { readings: [] }])
    expect(store.load("archive-upload")).toEqual({ lastRunMs: T0 })
  })

  test("a restart after catch-up finds nothing left to run", async () => {
    const store = memStore({ "archive-upload": { lastRunMs: T0 - 2 * UPLOAD_EVERY } })
    const first = station({ store })
    const firstUpload = await first.scope.resolve(uploadJob)
    await firstUpload.stop()
    await first.scope.dispose()
    expect(first.sends).toHaveLength(2)

    const second = station({ store })
    const secondUpload = await second.scope.resolve(uploadJob)
    await secondUpload.stop()
    await second.scope.dispose()
    expect(second.sends).toHaveLength(0)
  })

  test("a fresh station starts from now without inventing history", async () => {
    const store = memStore()
    const s = station({ store })
    await s.scope.resolve(uploadJob)
    await s.scope.dispose()
    expect(s.sends).toHaveLength(0)
    expect(store.load("archive-upload")).toEqual({ lastRunMs: T0 })
  })
})

describe("nightly-capture missed windows are lost", () => {
  test("startup never replays capture windows and marks them handled", async () => {
    const store = memStore({ "nightly-capture": { lastRunMs: T0 - 3 * CAPTURE_EVERY } })
    const s = station({ store })
    await s.scope.resolve(captureJob)
    await s.scope.dispose()
    expect(s.reads).toHaveLength(0)
    expect(store.load("nightly-capture")).toEqual({ lastRunMs: T0 })
  })
})

describe("overlap policies", () => {
  test("an overlapping capture is dropped outright, not deferred", async () => {
    const { gate, release } = deferred()
    const s = station({ store: memStore(), read: () => gate.then(() => 1) })
    const capture = await s.scope.resolve(captureJob)
    const firstRun = capture.trigger()
    const secondRun = capture.trigger()
    await settle()
    expect(s.reads).toHaveLength(1)
    release()
    await Promise.all([firstRun, secondRun])
    await settle()
    expect(s.reads).toHaveLength(1)
    await capture.trigger()
    expect(s.reads).toHaveLength(2)
    await s.scope.dispose()
  })

  test("overlapping uploads queue strictly one at a time", async () => {
    const gates = [deferred(), deferred()]
    let active = 0
    let maxActive = 0
    let calls = 0
    const s = station({
      store: memStore(),
      send: async () => {
        active += 1
        maxActive = Math.max(maxActive, active)
        const slot = gates[calls]
        calls += 1
        await slot.gate
        active -= 1
      },
    })
    const upload = await s.scope.resolve(uploadJob)
    const firstRun = upload.trigger()
    const secondRun = upload.trigger()
    await settle()
    expect(s.sends).toHaveLength(1)
    gates[0].release()
    await settle()
    expect(s.sends).toHaveLength(2)
    gates[1].release()
    await Promise.all([firstRun, secondRun])
    expect(maxActive).toBe(1)
    await s.scope.dispose()
  })

  test("a failed upload rejects its trigger, keeps frames unsent, and does not block the next run", async () => {
    let attempts = 0
    const s = station({
      store: memStore(),
      send: async () => {
        attempts += 1
        if (attempts === 1) throw new Error("archive offline")
      },
    })
    const capture = await s.scope.resolve(captureJob)
    await capture.trigger()
    const upload = await s.scope.resolve(uploadJob)
    await expect(upload.trigger()).rejects.toThrow("archive offline")
    await upload.trigger()
    await upload.trigger()
    expect(s.sends).toEqual([{ readings: [100] }, { readings: [100] }, { readings: [] }])
    await s.scope.dispose()
  })
})

describe("shutdown", () => {
  test("dispose resolves only after the in-flight capture settled", async () => {
    const { gate, release } = deferred()
    const s = station({ store: memStore(), read: () => gate.then(() => 1) })
    const capture = await s.scope.resolve(captureJob)
    const run = capture.trigger()
    await settle()
    let disposed = false
    const disposal = s.scope.dispose().then(() => {
      disposed = true
    })
    await settle()
    expect(disposed).toBe(false)
    release()
    await run
    await disposal
    expect(disposed).toBe(true)
  })
})
