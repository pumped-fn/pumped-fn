import { createScope } from "@pumped-fn/lite"
import { auditTrail } from "./audit.ts"
import { fleetOps, type FleetOps } from "./telemetry.ts"

export function createApp(options: { fleetOps: FleetOps; now: () => number }) {
  const audit = auditTrail(options.now)
  const scope = createScope({
    extensions: [audit.extension],
    tags: [fleetOps(options.fleetOps)],
  })
  return { scope, trail: audit.entries }
}
