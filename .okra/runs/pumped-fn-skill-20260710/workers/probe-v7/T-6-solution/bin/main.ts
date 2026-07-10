import { createScope, flow, typed } from "@pumped-fn/lite"
import { alertChannel, atRiskOf, ingestReading, readings, sameRoomSet, watchAtRisk } from "../src/climate.ts"

const consoleAlert = flow({
  name: "console-alert",
  parse: typed<{ galleryId: string }>(),
  factory: (ctx) => {
    console.error(`ALERT: gallery "${ctx.input.galleryId}" is at risk`)
  },
})

const scope = createScope({ tags: [alertChannel(consoleAlert)] })
await scope.resolve(readings)
const view = scope.select(readings, atRiskOf, { eq: sameRoomSet })
const session = scope.createContext()
const monitor = session.exec({ flow: watchAtRisk, input: { view } })

await session.exec({ flow: ingestReading, input: { galleryId: "west", tempC: 20, rh: 62 } })
await session.exec({ flow: ingestReading, input: { galleryId: "east", tempC: 21, rh: 45 } })
await session.exec({
  flow: ingestReading,
  input: { galleryId: "west", tempC: 20, rh: 63, note: "recheck scheduled" },
})

console.log(JSON.stringify(view.get()))

view.dispose()
await session.close({ ok: true })
await scope.dispose()
await monitor
