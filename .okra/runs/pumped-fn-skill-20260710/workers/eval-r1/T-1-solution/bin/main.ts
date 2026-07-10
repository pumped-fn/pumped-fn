import { createScope } from "@pumped-fn/lite"
import {
  captureReading,
  fetchDailyOutlook,
  runVentAdjustment,
  siteConfig,
  status,
  stepperDriver,
  ventDriver,
} from "../src/greenhouse.js"

const scope = createScope({
  tags: [
    siteConfig({ siteName: "demo-greenhouse", ventTargetC: 21, alertThresholdC: 28 }),
    ventDriver(stepperDriver),
  ],
})
const session = scope.createContext()
const reading = await session.exec({ flow: captureReading, input: { temperatureC: 23.4 } })
await scope.flush()
const glance = await scope.resolve(status)
const adjustment = await session.exec({ flow: runVentAdjustment, input: { temperatureC: 23.4 } })
const outlook = await session.exec({ flow: fetchDailyOutlook })
console.log(JSON.stringify({ reading, status: glance, adjustment, outlook }))
await session.close({ ok: true })
await scope.dispose()
