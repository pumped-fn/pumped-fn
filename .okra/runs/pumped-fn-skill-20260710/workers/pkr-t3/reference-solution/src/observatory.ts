import { atom, flow, typed } from "@pumped-fn/lite"
import { scheduler } from "@pumped-fn/lite-extension-scheduler"

export type Frame = { reading: number; sent: boolean }
export type Manifest = { readings: number[] }

export const instrument = atom({
  factory: () => {
    let exposures = 0
    return {
      read: async (): Promise<number> => {
        exposures += 1
        return exposures * 100
      },
    }
  },
})

export const archive = atom({
  factory: () => {
    const shipped: Manifest[] = []
    return {
      send: async (manifest: Manifest): Promise<void> => {
        shipped.push(manifest)
      },
    }
  },
})

const frameStore = atom({
  keepAlive: true,
  factory: () => ({ frames: [] as Frame[] }),
})

export const nightlyCapture = flow({
  name: "nightly-capture",
  parse: typed<void>(),
  deps: { instrument, frameStore },
  factory: async (ctx, { instrument, frameStore }) => {
    const reading = await ctx.exec({ fn: () => instrument.read(), params: [], name: "instrument.read" })
    frameStore.frames.push({ reading, sent: false })
    return { reading }
  },
})

export const archiveUpload = flow({
  name: "archive-upload",
  parse: typed<void>(),
  deps: { archive, frameStore },
  factory: async (ctx, { archive, frameStore }) => {
    const pending = frameStore.frames.filter((frame) => !frame.sent)
    const manifest: Manifest = { readings: pending.map((frame) => frame.reading) }
    await ctx.exec({ fn: () => archive.send(manifest), params: [], name: "archive.send" })
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
