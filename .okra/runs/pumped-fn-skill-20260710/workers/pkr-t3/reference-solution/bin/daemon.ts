import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createScope, preset } from "@pumped-fn/lite"
import { scheduler } from "@pumped-fn/lite-extension-scheduler"
import { createObservatoryBackend, type BackendClock, type ScheduleStore } from "../src/backend.ts"
import { archive, captureJob, instrument, uploadJob, type Manifest } from "../src/observatory.ts"

const statePath = process.argv[2] ?? join(tmpdir(), "observatory-schedule.json")
if (existsSync(statePath)) unlinkSync(statePath)

const fileStore: ScheduleStore = {
  load: (name) => {
    if (!existsSync(statePath)) return undefined
    const state = JSON.parse(readFileSync(statePath, "utf8")) as Record<string, { lastRunMs: number }>
    return state[name]
  },
  save: (name, entry) => {
    const state = existsSync(statePath)
      ? (JSON.parse(readFileSync(statePath, "utf8")) as Record<string, { lastRunMs: number }>)
      : {}
    state[name] = entry
    writeFileSync(statePath, JSON.stringify(state))
  },
}

let offsetMs = 0
const clock: BackendClock = {
  nowMs: () => Date.now() + offsetMs,
  every: (ms, onTick) => {
    const handle = setInterval(onTick, ms)
    return () => clearInterval(handle)
  },
}

const runStation = async (label: string) => {
  const manifests: Manifest[] = []
  let exposures = 0
  const scope = createScope({
    tags: [scheduler.backend(createObservatoryBackend({ store: fileStore, clock }))],
    presets: [
      preset(instrument, {
        read: async () => {
          exposures += 1
          return exposures * 100
        },
      }),
      preset(archive, { send: async (manifest: Manifest) => void manifests.push(manifest) }),
    ],
  })
  const capture = await scope.resolve(captureJob)
  await capture.trigger()
  const upload = await scope.resolve(uploadJob)
  await upload.stop()
  await scope.dispose()
  return { label, exposures, manifests, nextUpload: upload.next() === undefined }
}

const phase1 = await runStation("first-night")
offsetMs = 3 * 600_000
const phase2 = await runStation("after-restart-3-upload-windows-later")

const state = JSON.parse(readFileSync(statePath, "utf8")) as Record<string, { lastRunMs: number }>
console.log(
  JSON.stringify(
    {
      phase1,
      phase2,
      catchUpRunsAfterRestart: phase2.manifests.length,
      captureRunsAfterRestart: phase2.exposures,
      persisted: state,
    },
    null,
    2,
  ),
)

const healthy = phase2.manifests.length === 3 && phase2.exposures === 1
process.exit(healthy ? 0 : 1)
