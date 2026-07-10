import { atom, controller, flow, tag, tags, typed, type Lite } from "@pumped-fn/lite"

export type Reading = {
  tempC: number
  rh: number
  note?: string
}

export type Readings = Record<string, Reading>

export const readings = atom({
  keepAlive: true,
  factory: () => ({}) satisfies Readings,
})

export function atRiskOf(state: Readings): string[] {
  return Object.entries(state)
    .filter(([, reading]) => reading.rh < 40 || reading.rh > 55)
    .map(([galleryId]) => galleryId)
    .sort()
}

export function sameRoomSet(prev: string[], next: string[]): boolean {
  return prev.every((galleryId) => next.includes(galleryId)) && next.every((galleryId) => prev.includes(galleryId))
}

export const ingestReading = flow({
  name: "ingest-reading",
  parse: typed<{ galleryId: string; tempC: number; rh: number; note?: string }>(),
  deps: { readings: controller(readings, { resolve: true }) },
  factory: (ctx, { readings }) => {
    const { galleryId, tempC, rh, note } = ctx.input
    const next = { ...readings.get(), [galleryId]: note === undefined ? { tempC, rh } : { tempC, rh, note } }
    readings.set(next)
  },
})

export const alertChannel = tag<Lite.Flow<void, { galleryId: string }>>({ label: "climate.alert-channel" })

export const watchAtRisk = flow({
  name: "watch-at-risk",
  parse: typed<{ view: Lite.SelectHandle<string[]> }>(),
  deps: { alert: tags.required(alertChannel) },
  factory: async function* (ctx, { alert }) {
    let atRisk = new Set<string>()
    for await (const current of ctx.changes(ctx.input.view)) {
      const next = new Set(current)
      for (const galleryId of next) {
        if (!atRisk.has(galleryId)) await alert.exec({ input: { galleryId } })
      }
      atRisk = next
    }
  },
})
