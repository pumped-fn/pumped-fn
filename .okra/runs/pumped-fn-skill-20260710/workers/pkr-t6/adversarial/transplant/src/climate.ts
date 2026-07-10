import { atom, controller, flow, shallowEqual, tag, tags, typed } from "@pumped-fn/lite"
import type { Lite } from "@pumped-fn/lite"

export type Reading = { tempC: number; rh: number; note?: string }
export type Readings = Record<string, Reading>

export const readings = atom({
  keepAlive: true,
  factory: (): Readings => ({}),
})

export const atRiskOf = (state: Readings): string[] =>
  Object.keys(state)
    .filter((galleryId) => {
      const reading = state[galleryId]!
      return reading.rh < 40 || reading.rh > 55
    })
    .sort()

export const sameRoomSet = (prev: string[], next: string[]): boolean => shallowEqual(prev, next)

const atRiskSignal = atom({
  keepAlive: true,
  deps: { readings: controller(readings, { resolve: true, watch: true }) },
  factory: (_ctx, { readings }): string[] => atRiskOf(readings.get()),
})

export const alertChannel = tag<Lite.Flow<void, { galleryId: string }>>({
  label: "climate.alertChannel",
})

export const ingestReading = flow({
  name: "climate.ingestReading",
  parse: typed<{ galleryId: string } & Reading>(),
  deps: { readings: controller(readings, { resolve: true }) },
  factory: (ctx, { readings }): void => {
    const { galleryId, ...reading } = ctx.input
    readings.update((prev) => ({ ...prev, [galleryId]: { ...prev[galleryId], ...reading } }))
  },
})

export const watchAtRisk = flow({
  name: "climate.watchAtRisk",
  parse: typed<{ view: Lite.SelectHandle<string[]> }>(),
  deps: { alert: tags.required(alertChannel) },
  factory: async (ctx, { alert }): Promise<void> => {
    const alerted = new Set<string>()
    let last = -1
    for await (const atRisk of ctx.changes(atRiskSignal)) {
      if (atRisk.length === last) continue
      last = atRisk.length
      for (const galleryId of atRisk) {
        if (!alerted.has(galleryId)) {
          await alert.exec({ input: { galleryId } })
          alerted.add(galleryId)
        }
      }
    }
  },
})
