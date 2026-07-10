import { createScope, flow, typed } from "@pumped-fn/lite"
import { alertChannel, atRiskOf, ingestReading, readings, sameRoomSet, watchAtRisk } from "../src/climate.js"

const consoleAlert = flow({
  name: "console-alert",
  parse: typed<{ galleryId: string }>(),
  factory: (ctx) => {
    console.log(`alert:${ctx.input.galleryId}`)
  },
})

const scope = createScope({ tags: [alertChannel(consoleAlert)] })
await scope.resolve(readings)
const view = scope.select(readings, atRiskOf, { eq: sameRoomSet })
const session = scope.createContext()
const monitor = session.exec({ flow: watchAtRisk, input: { view } })

await session.exec({ flow: ingestReading, input: { galleryId: "east", tempC: 20, rh: 62 } })
await session.exec({ flow: ingestReading, input: { galleryId: "east", tempC: 21, rh: 63 } })
await session.exec({ flow: ingestReading, input: { galleryId: "south", tempC: 19, rh: 44 } })
await scope.flush()
console.log(JSON.stringify(view.get()))

view.dispose()
await scope.dispose()
await monitor
