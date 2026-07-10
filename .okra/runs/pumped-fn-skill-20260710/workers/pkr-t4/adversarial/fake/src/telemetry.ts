import { atom, flow, tag, tags, typed } from "@pumped-fn/lite"
import { z } from "zod"

const wireReport = z.discriminatedUnion("kind", [
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

export type PositionReport = z.infer<typeof wireReport>

export type FleetOps = {
  dispatchPickup: (scooterId: string) => Promise<{ accepted: boolean }>
}

export const fleetOps = tag<FleetOps>({ label: "fleet.ops" })

const fleetState = atom({
  factory: function fleetTelemetry() {
    return new Map<string, PositionReport>()
  },
})

export const reportPosition = flow({
  name: "report-position",
  parse: (raw: unknown) => wireReport.parse(raw),
  deps: { state: fleetState },
  factory: (ctx, { state }) => {
    state.set(ctx.input.scooterId, ctx.input)
    return { scooterId: ctx.input.scooterId, kind: ctx.input.kind }
  },
})

type SweepFault = { code: "dispatch-failed"; scooterId: string; message: string }

export const lowBatterySweep = flow({
  name: "low-battery-sweep",
  parse: typed<void>(),
  faults: typed<SweepFault>(),
  deps: { state: fleetState, ops: tags.required(fleetOps) },
  factory: async (ctx, { state, ops }) => {
    const dispatched: string[] = []
    for (const [scooterId, report] of state) {
      if (report.batteryPct >= 15) continue
      try {
        await ctx.exec({
          fn: () => ops.dispatchPickup(scooterId),
          params: [],
          name: "fleetops.dispatchPickup",
        })
      } catch (error) {
        return ctx.fail({
          code: "dispatch-failed",
          scooterId,
          message: error instanceof Error ? error.message : String(error),
        })
      }
      dispatched.push(scooterId)
    }
    return { dispatched }
  },
})
