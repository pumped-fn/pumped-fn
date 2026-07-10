import { createScope, preset } from "@pumped-fn/lite"
import { scheduler } from "@pumped-fn/lite-extension-scheduler"
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

class SimulatedClock implements BackendClock {
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
  }
}

const store = new MemoryStore()
const clock = new SimulatedClock()
const manifests: number[][] = []
let exposures = 0

const first = createScope({
  presets: [preset(instrument, { read: async () => ++exposures }), preset(archive, {
    send: async ({ readings }) => { manifests.push(readings) },
  })],
  tags: [scheduler.backend(createObservatoryBackend({ store, clock }))],
})
const firstCapture = await first.resolve(captureJob)
const firstUpload = await first.resolve(uploadJob)
await firstCapture.trigger()
await firstUpload.trigger()
await firstCapture.stop()
await firstUpload.stop()
await first.dispose()

clock.advance(10_800_000)
const restarted = createScope({
  presets: [preset(instrument, { read: async () => ++exposures }), preset(archive, {
    send: async ({ readings }) => { manifests.push(readings) },
  })],
  tags: [scheduler.backend(createObservatoryBackend({ store, clock }))],
})
const restartedCapture = await restarted.resolve(captureJob)
const restartedUpload = await restarted.resolve(uploadJob)
await restartedUpload.stop()
await restartedCapture.stop()
await restarted.dispose()

console.log(JSON.stringify({
  exposures,
  uploadRuns: manifests.length,
  restartUploadRuns: manifests.slice(1).length,
  manifests,
}))
