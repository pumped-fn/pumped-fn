import { atom, controller, flow, tag, tags, typed } from "@pumped-fn/lite"
import { z } from "zod"

export interface FleetOps {
  dispatchPickup(scooterId: string): Promise<{ accepted: boolean }>
}

export const fleetOps = tag<FleetOps>({ label: "fleet-ops" })

const GpsPosition = z.object({
  kind: z.literal("gps"),
  scooterId: z.string(),
  lat: z.number(),
  lng: z.number(),
  batteryPct: z.number(),
})

const CellPosition = z.object({
  kind: z.literal("cell"),
  scooterId: z.string(),
  cellId: z.string(),
  batteryPct: z.number(),
})

const Position = z.discriminatedUnion("kind", [GpsPosition, CellPosition])

type Position = z.infer<typeof Position>

function fleetStateFactory() {
  return [] as Position[]
}

const fleetState = atom({ factory: fleetStateFactory })

export const reportPosition = flow({
  name: "report-position",
  parse: (raw) => Position.parse(raw),
  deps: { fleetState: controller(fleetState, { resolve: true }) },
  factory: (ctx, { fleetState }) => {
    fleetState.update((positions) => [
      ...positions.filter((position) => position.scooterId !== ctx.input.scooterId),
      ctx.input,
    ])
  },
})

type PickupRejected = { kind: "pickup-rejected"; scooterId: string }

class PickupRejectedError extends Error {
  readonly kind = "pickup-rejected"
  readonly op = "fleetops.dispatchPickup"
  readonly entity: string

  constructor(scooterId: string) {
    super(`Pickup rejected for ${scooterId}`)
    this.entity = scooterId
    this.name = "PickupRejectedError"
  }
}

function requestPickup(client: FleetOps, scooterId: string) {
  return client.dispatchPickup(scooterId).then((result) => {
    if (!result.accepted) throw new PickupRejectedError(scooterId)
  })
}

export const lowBatterySweep = flow({
  name: "low-battery-sweep",
  parse: typed<void>(),
  faults: typed<PickupRejected>(),
  deps: {
    fleetState: controller(fleetState, { resolve: true }),
    fleetOps: tags.required(fleetOps),
  },
  factory: async (ctx, { fleetState, fleetOps }) => {
    const dispatched: string[] = []
    for (const position of fleetState.get()) {
      if (position.batteryPct >= 15) continue
      try {
        await ctx.exec({
          fn: () => requestPickup(fleetOps, position.scooterId),
          params: [],
          name: "fleetops.dispatchPickup",
        })
      } catch (error) {
        if (error instanceof PickupRejectedError) {
          return ctx.fail({ kind: "pickup-rejected", scooterId: error.entity })
        }
        return ctx.fail({ kind: "pickup-rejected", scooterId: position.scooterId })
      }
      dispatched.push(position.scooterId)
    }
    return { dispatched }
  },
})
