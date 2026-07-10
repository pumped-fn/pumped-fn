import { atom, controller, flow, tag, tags, typed, type Lite } from "@pumped-fn/lite"

export interface Reading {
  tempC: number
  rh: number
  note?: string
}

export type Readings = Record<string, Reading>

export interface ReadingInput extends Reading {
  galleryId: string
}

export interface AlertInput {
  galleryId: string
}

export const alertChannel = tag<Lite.Flow<void, AlertInput>>({ label: "climate.alert-channel" })

export const readings = atom({
  keepAlive: true,
  factory: function createReadings(): Readings {
    return {}
  },
})

export function atRiskOf(state: Readings): string[] {
  return Object.entries(state)
    .filter(([, reading]) => reading.rh < 40 || reading.rh > 55)
    .map(([galleryId]) => galleryId)
    .sort()
}

export function sameRoomSet(prev: string[], next: string[]): boolean {
  const previous = new Set(prev)
  const following = new Set(next)
  return previous.size === following.size && [...previous].every((galleryId) => following.has(galleryId))
}

export const ingestReading = flow({
  name: "ingest-reading",
  parse: typed<ReadingInput>(),
  deps: { readings: controller(readings, { resolve: true }) },
  factory: (ctx, { readings }) => {
    const { galleryId, tempC, rh, note } = ctx.input
    const reading = note === undefined ? { tempC, rh } : { tempC, rh, note }
    readings.set({ ...readings.get(), [galleryId]: reading })
  },
})

export const watchAtRisk = flow({
  name: "watch-at-risk",
  parse: typed<{ view: Lite.SelectHandle<string[]> }>(),
  deps: { alert: tags.required(alertChannel) },
  factory: async (ctx, { alert }) => {
    let previous = new Set<string>()

    const alertNewGalleries = async (current: string[]) => {
      const active = new Set(current)
      const entered = current.filter((galleryId) => !previous.has(galleryId))
      previous = active
      for (const galleryId of entered) {
        await alert.exec({ input: { galleryId } })
      }
    }

    await alertNewGalleries(ctx.input.view.get())
    for await (const current of ctx.changes(ctx.input.view)) {
      await alertNewGalleries(current)
    }
  },
})
