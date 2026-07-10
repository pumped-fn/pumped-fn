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
    siteConfig({ siteName: "demo-greenhouse", ventTargetC: 20, alertThresholdC: 24 }),
    ventDriver(stepperDriver),
  ],
})
const session = scope.createContext()

try {
  const reading = await session.exec({ flow: captureReading, input: { temperatureC: 25 } })
  await scope.flush()
  const glance = await scope.resolve(status)
  const adjustment = await session.exec({ flow: runVentAdjustment, input: reading })
  const outlook = await session.exec({ flow: fetchDailyOutlook })
  console.log(JSON.stringify({ status: glance, adjustment, outlook }))
  await session.close({ ok: true })
} catch (error) {
  await session.close({ ok: false, error })
  throw error
} finally {
  await scope.dispose()
}
