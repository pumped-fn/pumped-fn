import { createScope, preset } from "@pumped-fn/lite"
import { scheduler } from "@pumped-fn/lite-extension-scheduler"
import { describe, expect, it } from "vitest"
import { createObservatoryBackend, type BackendClock, type ScheduleStore } from "../src/backend.js"
import { archive, captureJob, instrument, uploadJob } from "../src/observatory.js"

class MemoryStore implements ScheduleStore {
  private readonly states = new Map<string, { lastRunMs: number }>()

  load(name: string) {
    return this.states.get(name)
  }

  save(name: string, state: { lastRunMs: number }) {
    this.states.set(name, state)
  }
}

class ManualClock implements BackendClock {
  private now = 0
  private readonly listeners = new Set<() => void>()

  nowMs() {
    return this.now
  }

  every(_ms: number, onTick: () => void) {
    this.listeners.add(onTick)
    return () => this.listeners.delete(onTick)
  }

  advance(ms: number) {
    this.now += ms
    for (const listener of this.listeners) listener()
  }
}

function gate() {
  let open!: () => void
  const wait = new Promise<void>((resolve) => { open = resolve })
  return { open, wait }
}

describe("observatory schedules", () => {
  it("drops overlapping capture windows and stores one frame per run", async () => {
    const store = new MemoryStore()
    const clock = new ManualClock()
    const entered = gate()
    const release = gate()
    const readings: number[] = []
    const scope = createScope({
      presets: [preset(instrument, {
        read: async () => {
          entered.open()
          await release.wait
          return 7
        },
      }), preset(archive, { send: async (manifest) => { readings.push(...manifest.readings) } })],
      tags: [scheduler.backend(createObservatoryBackend({ store, clock }))],
    })
    const capture = await scope.resolve(captureJob)
    const upload = await scope.resolve(uploadJob)
    const first = capture.trigger()
    await entered.wait
    await capture.trigger()
    release.open()
    await first
    await upload.trigger()
    expect(readings).toEqual([7])
    await capture.stop()
    await upload.stop()
    await scope.dispose()
  })

  it("replays every missed upload window in order but loses capture windows", async () => {
    const store = new MemoryStore()
    store.save("nightly-capture", { lastRunMs: -86_400_000 })
    store.save("archive-upload", { lastRunMs: 0 })
    const clock = new ManualClock()
    clock.advance(10_800_000)
    const manifests: number[][] = []
    const scope = createScope({
      presets: [preset(instrument, { read: async () => 99 }), preset(archive, {
        send: async ({ readings }) => { manifests.push(readings) },
      })],
      tags: [scheduler.backend(createObservatoryBackend({ store, clock }))],
    })
    const capture = await scope.resolve(captureJob)
    const upload = await scope.resolve(uploadJob)
    await upload.stop()
    expect(manifests).toEqual([[], [], []])
    expect(store.load("nightly-capture")).toEqual({ lastRunMs: 0 })
    await capture.stop()
    await scope.dispose()
  })

  it("keeps rejected frames for the next queued upload", async () => {
    const store = new MemoryStore()
    const clock = new ManualClock()
    const manifests: number[][] = []
    let reject = true
    const scope = createScope({
      presets: [preset(instrument, { read: async () => 4 }), preset(archive, {
        send: async ({ readings }) => {
          manifests.push(readings)
          if (reject) throw new ArchiveRejected()
        },
      })],
      tags: [scheduler.backend(createObservatoryBackend({ store, clock }))],
    })
    const capture = await scope.resolve(captureJob)
    const upload = await scope.resolve(uploadJob)
    await capture.trigger()
    await expect(upload.trigger()).rejects.toBeInstanceOf(ArchiveRejected)
    reject = false
    await upload.trigger()
    expect(manifests).toEqual([[4], [4]])
    await capture.stop()
    await upload.stop()
    await scope.dispose()
  })
})

class ArchiveRejected extends Error {
  readonly kind = "archive-rejected"
}
