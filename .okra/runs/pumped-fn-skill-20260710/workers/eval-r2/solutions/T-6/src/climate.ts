import { atom, controller, flow, tag, tags, typed, type Lite } from "@pumped-fn/lite"

export interface Reading {
  tempC: number
  rh: number
  note?: string
}

export type Readings = Record<string, Reading>

export interface IngestReading {
  galleryId: string
  tempC: number
  rh: number
  note?: string
}

export const alertChannel = tag<Lite.Flow<void, { galleryId: string }>>({
  label: "museum.alert-channel",
})

export const readings = atom({
  keepAlive: true,
  factory: function readingsState(): Readings {
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
  const prevRooms = new Set(prev)
  const nextRooms = new Set(next)
  return [...prevRooms].every((room) => nextRooms.has(room))
    && [...nextRooms].every((room) => prevRooms.has(room))
}

export const ingestReading = flow({
  name: "ingest-reading",
  parse: typed<IngestReading>(),
  deps: { readings: controller(readings, { resolve: true }) },
  factory: (ctx, { readings: storedReadings }) => {
    const { galleryId, tempC, rh, note } = ctx.input
    const reading = note === undefined ? { tempC, rh } : { tempC, rh, note }
    storedReadings.set({ ...storedReadings.get(), [galleryId]: reading })
  },
})

export const watchAtRisk = flow({
  name: "watch-at-risk",
  parse: typed<{ view: Lite.SelectHandle<string[]> }>(),
  deps: { alert: tags.required(alertChannel) },
  factory: async (ctx, { alert }) => {
    let alerted = new Set<string>()

    const alertNewRooms = async () => {
      const current = new Set(ctx.input.view.get())
      const entering = [...current].filter((galleryId) => !alerted.has(galleryId)).sort()
      alerted = current
      for (const galleryId of entering) {
        await alert.exec({ input: { galleryId } })
      }
    }

    await alertNewRooms()
    for await (const _wake of ctx.changes(ctx.input.view)) {
      await alertNewRooms()
    }
  },
})
