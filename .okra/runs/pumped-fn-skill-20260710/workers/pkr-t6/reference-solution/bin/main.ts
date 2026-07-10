import { createScope, flow, typed } from "@pumped-fn/lite"
import { alertChannel, atRiskOf, ingestReading, readings, sameRoomSet, watchAtRisk } from "../src/climate.ts"

const consoleAlert = flow({
  name: "climate.consoleAlert",
  parse: typed<{ galleryId: string }>(),
  factory: (ctx): void => {
    console.log(JSON.stringify({ alert: ctx.input.galleryId }))
  },
})

const scope = createScope({ tags: [alertChannel(consoleAlert)] })
await scope.resolve(readings)
const view = scope.select(readings, atRiskOf, { eq: sameRoomSet })
const session = scope.createContext()
const monitor = session.exec({ flow: watchAtRisk, input: { view } })

await session.exec({ flow: ingestReading, input: { galleryId: "rothko-room", tempC: 21, rh: 48 } })
await session.exec({ flow: ingestReading, input: { galleryId: "dutch-masters", tempC: 19, rh: 62 } })
await session.exec({ flow: ingestReading, input: { galleryId: "dutch-masters", tempC: 19, rh: 63 } })
await session.exec({ flow: ingestReading, input: { galleryId: "print-cabinet", tempC: 18, rh: 31 } })
await new Promise((resolve) => setTimeout(resolve, 50))

console.log(JSON.stringify({ atRisk: view.get() }))
await scope.dispose()
await monitor
