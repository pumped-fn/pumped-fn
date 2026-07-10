import { atom, flow, typed } from "@pumped-fn/lite"
import { scheduler } from "@pumped-fn/lite-extension-scheduler"

export type Frame = { reading: number; sent: boolean }
export type Manifest = { readings: number[] }

export const instrument = atom({
  factory: () => ({ read: async (): Promise<number> => 0 }),
})

export const archive = atom({
  factory: () => ({ send: async (_manifest: Manifest): Promise<void> => {} }),
})

const frameStore = atom({
  keepAlive: true,
  factory: () => ({ frames: [] as Frame[] }),
})

export const nightlyCapture = flow({
  name: "nightly-capture",
  parse: typed<void>(),
  deps: { instrument, frameStore },
  factory: async (_ctx, { instrument, frameStore }) => {
    const reading = await instrument.read()
    frameStore.frames.push({ reading, sent: false })
    return { reading }
  },
})

export const archiveUpload = flow({
  name: "archive-upload",
  parse: typed<void>(),
  deps: { archive, frameStore },
  factory: async (_ctx, { archive, frameStore }) => {
    const pending = frameStore.frames.filter((frame) => !frame.sent)
    await archive.send({ readings: pending.map((frame) => frame.reading) })
    for (const frame of pending) frame.sent = true
    return { uploaded: pending.length }
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
  catchUp: "all",
  flow: archiveUpload,
  input: () => undefined,
})
