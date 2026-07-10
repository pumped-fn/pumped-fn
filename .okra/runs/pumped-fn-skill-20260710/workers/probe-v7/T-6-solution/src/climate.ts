import { atom, controller, flow, tag, tags, typed, type Lite } from "@pumped-fn/lite"

export interface Reading {
  tempC: number
  rh: number
  note?: string
}

export type ReadingsState = Record<string, Reading>

const LOW_RH = 40
const HIGH_RH = 55

export const alertChannel = tag<Lite.Flow<unknown, { galleryId: string }>>({
  label: "climate.alert-channel",
})

export const readings = atom({
  keepAlive: true,
  factory: (): ReadingsState => ({}),
})

export function atRiskOf(state: ReadingsState): string[] {
  return Object.keys(state)
    .filter((galleryId) => {
      const { rh } = state[galleryId]!
      return rh < LOW_RH || rh > HIGH_RH
    })
    .sort()
}

export function sameRoomSet(prev: string[], next: string[]): boolean {
  if (prev.length !== next.length) return false
  const prevSet = new Set(prev)
  return next.every((galleryId) => prevSet.has(galleryId))
}

export const ingestReading = flow({
  name: "ingest-reading",
  parse: typed<{ galleryId: string; tempC: number; rh: number; note?: string }>(),
  deps: { readings: controller(readings, { resolve: true }) },
  factory: (ctx, { readings }) => {
    const { galleryId, tempC, rh, note } = ctx.input
    const nextReading: Reading = note === undefined ? { tempC, rh } : { tempC, rh, note }
    readings.update((prev) => ({ ...prev, [galleryId]: nextReading }))
  },
})

export const watchAtRisk = flow({
  name: "watch-at-risk",
  parse: typed<{ view: Lite.SelectHandle<string[]> }>(),
  deps: { deliver: tags.required(alertChannel) },
  factory: async (ctx, { deliver }) => {
    const { view } = ctx.input
    let alerted = new Set(view.get())
    for (const galleryId of alerted) {
      await deliver.exec({ input: { galleryId } })
    }
    for await (const ids of ctx.changes(view)) {
      const next = new Set(ids)
      for (const galleryId of ids) {
        if (!alerted.has(galleryId)) {
          await deliver.exec({ input: { galleryId } })
        }
      }
      alerted = next
    }
  },
})
