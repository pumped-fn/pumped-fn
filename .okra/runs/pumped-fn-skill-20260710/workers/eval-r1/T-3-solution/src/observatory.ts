import { atom, controller, flow, typed } from "@pumped-fn/lite"
import { scheduler } from "@pumped-fn/lite-extension-scheduler"

export const instrument = atom({
  factory: () => ({
    read: async () => 0,
  }),
})

export const archive = atom({
  factory: () => ({
    send: async (_manifest: { readings: number[] }) => {},
  }),
})

const frames = atom({
  factory: () => [] as number[],
})

export const nightlyCapture = flow({
  name: "nightly-capture",
  parse: typed<void>(),
  deps: {
    instrument,
    frames: controller(frames, { resolve: true }),
  },
  factory: async (ctx, { instrument, frames }) => {
    const reading = await ctx.exec({
      fn: () => instrument.read(),
      params: [],
      name: "instrument.read",
    })
    frames.update((readings) => [...readings, reading])
  },
})

export const archiveUpload = flow({
  name: "archive-upload",
  parse: typed<void>(),
  deps: {
    archive,
    frames: controller(frames, { resolve: true }),
  },
  factory: async (ctx, { archive, frames }) => {
    const readings = frames.get()
    await ctx.exec({
      fn: () => archive.send({ readings }),
      params: [],
      name: "archive.send",
    })
    frames.update((current) => current.slice(readings.length))
  },
})

export const captureJob = scheduler.schedule({
  name: "nightly-capture",
  cadence: { every: "86400000" },
  overlap: "skip",
  catchUp: "skip",
  flow: nightlyCapture,
  input: () => undefined,
})

export const uploadJob = scheduler.schedule({
  name: "archive-upload",
  cadence: { every: "3600000" },
  overlap: "queue",
  catchUp: "all",
  flow: archiveUpload,
  input: () => undefined,
})
