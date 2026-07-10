import { createScope } from "@pumped-fn/lite"
import { auditTrail } from "./audit.ts"
import { fleetOps, type FleetOps } from "./telemetry.ts"

class DispatchRejectedError extends Error {
  readonly kind = "dispatch-rejected"
  readonly op = "fleetops.dispatchPickup"

  constructor(readonly scooterId: string) {
    super(`Dispatch rejected for scooter ${scooterId}`)
    this.name = "DispatchRejectedError"
  }
}

export function createApp(options: { fleetOps: FleetOps; now: () => number }) {
  const audit = auditTrail(options.now)
  const checkedFleetOps: FleetOps = {
    dispatchPickup: (scooterId) => options.fleetOps.dispatchPickup(scooterId).then((response) => {
      if (!response.accepted) throw new DispatchRejectedError(scooterId)
      return response
    }),
  }
  const scope = createScope({
    extensions: [audit.extension],
    tags: [fleetOps(checkedFleetOps)],
  })
  return { scope, trail: audit.entries }
}
