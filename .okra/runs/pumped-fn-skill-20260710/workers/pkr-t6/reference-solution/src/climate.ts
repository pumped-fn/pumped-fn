import { atom, controller, flow, tag, tags, typed } from "@pumped-fn/lite"
import type { Lite } from "@pumped-fn/lite"

export type Reading = { tempC: number; rh: number; note?: string }
export type Readings = Record<string, Reading>

export const readings = atom({
  keepAlive: true,
  factory: (): Readings => ({}),
})

export const alertChannel = tag<Lite.Flow<void, { galleryId: string }>>({
  label: "climate.alertChannel",
})

export const atRiskOf = (state: Readings): string[] =>
  Object.keys(state)
    .filter((galleryId) => {
      const reading = state[galleryId]!
      return reading.rh < 40 || reading.rh > 55
    })
    .sort()

export const sameRoomSet = (prev: string[], next: string[]): boolean =>
  prev.length === next.length && prev.every((galleryId) => next.includes(galleryId))

export const ingestReading = flow({
  name: "climate.ingestReading",
  parse: typed<{ galleryId: string } & Reading>(),
  deps: { readings: controller(readings, { resolve: true }) },
  factory: (ctx, { readings }): void => {
    const { galleryId, ...reading } = ctx.input
    readings.set({ ...readings.get(), [galleryId]: reading })
  },
})

export const watchAtRisk = flow({
  name: "climate.watchAtRisk",
  parse: typed<{ view: Lite.SelectHandle<string[]> }>(),
  deps: { alert: tags.required(alertChannel) },
  factory: async (ctx, { alert }): Promise<void> => {
    let alerted = new Set<string>()
    for await (const atRisk of ctx.changes(ctx.input.view)) {
      for (const galleryId of atRisk) {
        if (!alerted.has(galleryId)) await alert.exec({ input: { galleryId } })
      }
      alerted = new Set(atRisk)
    }
  },
})
