import { atom, controller, FlowFault, flow, tag, tags, typed } from "@pumped-fn/lite"
import { z } from "zod"

export interface FleetOps {
  dispatchPickup(scooterId: string): Promise<{ accepted: boolean }>
}

type Position =
  | { kind: "gps"; scooterId: string; lat: number; lng: number; batteryPct: number }
  | { kind: "cell"; scooterId: string; cellId: string; batteryPct: number }

type DispatchFailure = { kind: "dispatch-rejected"; scooterId: string }

class WireValidationError extends Error {
  constructor(field: string, cause: unknown) {
    super(`Invalid position report field: ${field}`, { cause })
    this.name = "WireValidationError"
  }
}

const positionReport = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("gps"),
    scooterId: z.string(),
    lat: z.number(),
    lng: z.number(),
    batteryPct: z.number(),
  }),
  z.object({
    kind: z.literal("cell"),
    scooterId: z.string(),
    cellId: z.string(),
    batteryPct: z.number(),
  }),
])

export const fleetOps = tag<FleetOps>({ label: "fleet-ops" })

function parsePositionReport(raw: unknown): Position {
  try {
    return positionReport.parse(raw)
  } catch (error) {
    const field = error instanceof z.ZodError ? error.issues[0]?.path.join(".") ?? "input" : "input"
    throw new WireValidationError(field, error)
  }
}

const fleet = atom({
  factory: function fleetState() {
    return [] as Position[]
  },
})

export const reportPosition = flow({
  name: "report-position",
  parse: parsePositionReport,
  deps: { fleet: controller(fleet, { resolve: true }) },
  factory: (ctx, { fleet }) => {
    const position = ctx.input
    fleet.update((positions) => [
      ...positions.filter((stored) => stored.scooterId !== position.scooterId),
      position,
    ])
  },
})

const dispatchPickup = flow({
  name: "fleetops.dispatchPickup",
  parse: typed<string>(),
  faults: typed<DispatchFailure>(),
  deps: { fleetOps: tags.required(fleetOps) },
  factory: (ctx, { fleetOps }) => {
    const client = fleetOps
    return client.dispatchPickup(ctx.input).then((result) => {
      if (!result.accepted) return ctx.fail({ kind: "dispatch-rejected", scooterId: ctx.input })
      return result
    })
  },
})

function isDispatchFailure(fault: unknown): fault is DispatchFailure {
  return typeof fault === "object"
    && fault !== null
    && "kind" in fault
    && fault.kind === "dispatch-rejected"
    && "scooterId" in fault
    && typeof fault.scooterId === "string"
}

export const lowBatterySweep = flow({
  name: "low-battery-sweep",
  parse: typed<void>(),
  faults: typed<DispatchFailure>(),
  deps: {
    fleet: controller(fleet, { resolve: true }),
    dispatchPickup: controller(dispatchPickup),
  },
  factory: async (ctx, { fleet, dispatchPickup }) => {
    const dispatched: string[] = []
    for (const position of fleet.get()) {
      if (position.batteryPct >= 15) continue
      try {
        await dispatchPickup.exec({ input: position.scooterId })
        dispatched.push(position.scooterId)
      } catch (error) {
        if (error instanceof FlowFault && isDispatchFailure(error.fault)) return ctx.fail(error.fault)
        throw error
      }
    }
    return { dispatched }
  },
})
