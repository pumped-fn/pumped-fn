import { createScope, preset } from "@pumped-fn/lite"
import { scheduler } from "@pumped-fn/lite-extension-scheduler"
import { createObservatoryBackend, type BackendClock, type ScheduleStore } from "../src/backend.js"
import { archive, captureJob, instrument, uploadJob } from "../src/observatory.js"

const day = 86_400_000
let now = 0
const timers = new Set<() => void>()
const saved = new Map<string, { lastRunMs: number }>()
const store: ScheduleStore = {
  load: (name) => saved.get(name),
  save: (name, state) => { saved.set(name, state) },
}
const clock: BackendClock = {
  nowMs: () => now,
  every: (_ms, tick) => {
    timers.add(tick)
    return () => { timers.delete(tick) }
  },
}

async function boot(manifests: number[][]) {
  const exposures: number[] = []
  const scope = createScope({
    presets: [
      preset(instrument, {
        read: async () => {
          const reading = exposures.length + 1
          exposures.push(reading)
          return reading
        },
      }),
      preset(archive, { send: async ({ readings: sent }) => { manifests.push(sent) } }),
    ],
    tags: [scheduler.backend(createObservatoryBackend({ store, clock }))],
  })
  const capture = await scope.resolve(captureJob)
  const upload = await scope.resolve(uploadJob)
  return { capture, exposures, scope, upload }
}

const firstManifests: number[][] = []
const first = await boot(firstManifests)
await first.capture.trigger()
await first.capture.stop()
await first.upload.stop()
await first.scope.dispose()

now = 3 * day
const restartManifests: number[][] = []
const restart = await boot(restartManifests)
await restart.upload.trigger()
await restart.capture.stop()
await restart.upload.stop()
await restart.scope.dispose()

console.log(JSON.stringify({
  captureReplayExposures: restart.exposures.length,
  missedUploadRuns: restartManifests.length - 1,
  missedUploadManifests: restartManifests.slice(0, -1),
}))
