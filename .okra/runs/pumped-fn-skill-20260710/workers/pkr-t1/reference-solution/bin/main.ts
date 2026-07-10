import { createScope } from "@pumped-fn/lite"
import {
  captureReading,
  fetchDailyOutlook,
  runVentAdjustment,
  servoDriver,
  siteConfig,
  status,
  ventDriver,
} from "../src/greenhouse"

const scope = createScope({
  tags: [
    siteConfig({ siteName: "demo-house", ventTargetC: 20, alertThresholdC: 28 }),
    ventDriver(servoDriver),
  ],
})
const ctx = scope.createContext()
await ctx.exec({ flow: captureReading, input: { temperatureC: 30 } })
const glance = await scope.resolve(status)
const adjustment = await ctx.exec({ flow: runVentAdjustment, input: { temperatureC: 23.4 } })
const outlook = await ctx.exec({ flow: fetchDailyOutlook })
console.log(JSON.stringify({ glance, adjustment, outlook }))
await ctx.close()
await scope.dispose()
