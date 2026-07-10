import { atom, controller, flow, typed } from "@pumped-fn/lite"
import { z } from "zod"

export type FleetOps = {
  dispatchPickup(scooterId: string): Promise<{ accepted: boolean }>
}

type Position =
  | { kind: "gps"; scooterId: string; lat: number; lng: number; batteryPct: number }
  | { kind: "cell"; scooterId: string; cellId: string; batteryPct: number }

type DispatchRejected = { kind: "dispatch-rejected"; scooterId: string; message?: string }

const position = z.discriminatedUnion("kind", [
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

export const fleetOps = atom({
  factory: function fleetOpsClient() {
    return {
      async dispatchPickup(_scooterId: string) {
        return { accepted: false }
      },
    } satisfies FleetOps
  },
})

const fleet = atom({
  factory: function fleetState() {
    return [] as Position[]
  },
})

export const reportPosition = flow({
  name: "report-position",
  parse: (raw) => position.parse(raw),
  deps: { fleet: controller(fleet, { resolve: true }) },
  factory: (_ctx, { fleet }) => {
    const incoming = _ctx.input
    fleet.update((positions) => {
      const index = positions.findIndex((item) => item.scooterId === incoming.scooterId)
      return index === -1
        ? [...positions, incoming]
        : positions.map((item, itemIndex) => itemIndex === index ? incoming : item)
    })
  },
})

export const lowBatterySweep = flow({
  name: "low-battery-sweep",
  parse: typed<void>(),
  faults: typed<DispatchRejected>(),
  deps: { fleet, fleetOps },
  factory: async (ctx, { fleet, fleetOps }) => {
    const dispatched: string[] = []
    for (const scooter of fleet) {
      if (scooter.batteryPct >= 15) continue
      const fault = { kind: "dispatch-rejected" as const, scooterId: scooter.scooterId }
      let accepted: boolean | undefined
      try {
        accepted = (await ctx.exec({
          fn: () => fleetOps.dispatchPickup(scooter.scooterId),
          params: [],
          name: "fleetops.dispatchPickup",
        })).accepted
      } catch (error) {
        ctx.fail({ ...fault, message: String(error) })
      }
      if (!accepted) ctx.fail(fault)
      dispatched.push(scooter.scooterId)
    }
    return { dispatched }
  },
})
