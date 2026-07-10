import { createScope } from "@pumped-fn/lite"
import { auditTrail } from "./audit.ts"
import type { FleetOps } from "./telemetry.ts"
import { fleetOps } from "./telemetry.ts"

export const createApp = (options: { fleetOps: FleetOps; now: () => number }) => {
  const audit = auditTrail({ capacity: 100, now: options.now })
  const scope = createScope({
    tags: [fleetOps(options.fleetOps)],
  })
  return { scope, trail: audit.entries }
}
