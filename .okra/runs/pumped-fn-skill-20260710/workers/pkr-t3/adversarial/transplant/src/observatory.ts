import { atom, flow, typed } from "@pumped-fn/lite"
import { scheduler } from "@pumped-fn/lite-extension-scheduler"

export type Manifest = { readings: number[] }

export const instrument = atom({
  factory: () => ({ read: async (): Promise<number> => 0 }),
})

export const archive = atom({
  factory: () => ({ send: async (_manifest: Manifest): Promise<void> => {} }),
})

const observationLog = atom({
  keepAlive: true,
  factory: () => ({ entries: [] as number[], shipped: [] as Manifest[] }),
})

export const nightlyCapture = flow({
  name: "nightly-capture",
  parse: typed<void>(),
  deps: { observationLog },
  factory: (_ctx, { observationLog }) => {
    const reading = observationLog.entries.length + 1
    observationLog.entries.push(reading)
    return { reading }
  },
})

export const archiveUpload = flow({
  name: "archive-upload",
  parse: typed<void>(),
  deps: { observationLog },
  factory: (_ctx, { observationLog }) => {
    const manifest: Manifest = { readings: [...observationLog.entries] }
    observationLog.shipped.push(manifest)
    observationLog.entries = []
    return { uploaded: manifest.readings.length }
  },
})

export const captureJob = scheduler.schedule({
  name: "nightly-capture",
  cadence: { every: "3600000" },
  overlap: "skip",
  catchUp: "skip",
  flow: nightlyCapture,
  input: () => undefined,
})

export const uploadJob = scheduler.schedule({
  name: "archive-upload",
  cadence: { every: "600000" },
  overlap: "queue",
  catchUp: "skip",
  flow: archiveUpload,
  input: () => undefined,
})
