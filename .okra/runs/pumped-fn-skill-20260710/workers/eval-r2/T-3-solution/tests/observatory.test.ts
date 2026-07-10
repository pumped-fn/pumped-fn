import { createScope, preset } from "@pumped-fn/lite"
import { scheduler } from "@pumped-fn/lite-extension-scheduler"
import { createObservatoryBackend, type BackendClock, type ScheduleStore } from "../src/backend.js"
import { archive, captureJob, instrument, uploadJob } from "../src/observatory.js"
import { describe, expect, it } from "vitest"

const day = 86_400_000

function station(startMs = 0) {
  let now = startMs
  const ticks = new Set<() => void>()
  const state = new Map<string, { lastRunMs: number }>()
  const store: ScheduleStore = {
    load: (name) => state.get(name),
    save: (name, value) => { state.set(name, value) },
  }
  const clock: BackendClock = {
    nowMs: () => now,
    every: (_ms, onTick) => {
      ticks.add(onTick)
      return () => { ticks.delete(onTick) }
    },
  }
  return {
    backend: createObservatoryBackend({ store, clock }),
    advance(ms: number) {
      now += ms
      for (const tick of ticks) tick()
    },
    state,
  }
}

async function close(scope: ReturnType<typeof createScope>) {
  await scope.dispose()
}

describe("observatory schedules", () => {
  it("drops overlapping capture windows and retains one frame per completed run", async () => {
    const platform = station()
    let release!: () => void
    const entered = new Promise<void>((resolve) => { release = resolve })
    let reading = 0
    const scope = createScope({
      presets: [preset(instrument, {
        read: async () => {
          release()
          return ++reading
        },
      })],
      tags: [scheduler.backend(platform.backend)],
    })
    const job = await scope.resolve(captureJob)
    const first = job.trigger()
    await entered
    platform.advance(day)
    await first
    await job.trigger()
    expect(reading).toBe(2)
    expect(platform.state.get("nightly-capture")).toEqual({ lastRunMs: day })
    await job.stop()
    await close(scope)
  })

  it("replays every missed upload window in order and keeps frames after rejection", async () => {
    const platform = station(3 * day)
    platform.state.set("nightly-capture", { lastRunMs: 0 })
    platform.state.set("archive-upload", { lastRunMs: 0 })
    const manifests: number[][] = []
    const scope = createScope({
      presets: [
        preset(instrument, { read: async () => 99 }),
        preset(archive, {
          send: async ({ readings }) => { manifests.push(readings) },
        }),
      ],
      tags: [scheduler.backend(platform.backend)],
    })
    const capture = await scope.resolve(captureJob)
    const upload = await scope.resolve(uploadJob)
    await upload.trigger()
    expect(manifests).toEqual([[], [], [], []])
    await capture.stop()
    await upload.stop()
    await close(scope)
  })

  it("keeps a rejected manifest intact for the next upload", async () => {
    const platform = station()
    const manifests: number[][] = []
    let rejected = true
    const scope = createScope({
      presets: [
        preset(instrument, { read: async () => 7 }),
        preset(archive, {
          send: async ({ readings }) => {
            manifests.push(readings)
            if (rejected) {
              rejected = false
              throw new TypeError("archive unavailable")
            }
          },
        }),
      ],
      tags: [scheduler.backend(platform.backend)],
    })
    const capture = await scope.resolve(captureJob)
    const upload = await scope.resolve(uploadJob)
    await capture.trigger()
    await expect(upload.trigger()).rejects.toThrow("archive unavailable")
    await upload.trigger()
    expect(manifests).toEqual([[7], [7]])
    await capture.stop()
    await upload.stop()
    await close(scope)
  })
})
