import { atom, flow, tag, tags, typed } from "@pumped-fn/lite"
import { z } from "zod"

export interface FleetOps {
  dispatchPickup(scooterId: string): Promise<{ accepted: boolean }>
}

export const fleetOps = tag<FleetOps>({ label: "fleet-ops" })

const gpsReport = z.object({
  kind: z.literal("gps"),
  scooterId: z.string(),
  lat: z.number(),
  lng: z.number(),
  batteryPct: z.number(),
})

const cellReport = z.object({
  kind: z.literal("cell"),
  scooterId: z.string(),
  cellId: z.string(),
  batteryPct: z.number(),
})

const positionReport = z.discriminatedUnion("kind", [gpsReport, cellReport])

type PositionReport = z.infer<typeof positionReport>

class InvalidPositionReportError extends Error {
  readonly kind = "invalid-position-report"

  constructor(readonly field: string, cause: unknown) {
    super(`Invalid position report field: ${field}`, { cause })
    this.name = "InvalidPositionReportError"
  }
}

function parsePositionReport(raw: unknown): PositionReport {
  try {
    return positionReport.parse(raw)
  } catch (error) {
    if (error instanceof z.ZodError) {
      const field = error.issues[0]?.path.join(".") || "kind"
      throw new InvalidPositionReportError(field, error)
    }
    throw error
  }
}

type FleetState = {
  replace(report: PositionReport): void
  lowBatteryIds(): string[]
}

export const fleetState = atom({
  factory: function fleetState(): FleetState {
    const reports: PositionReport[] = []
    return {
      replace(report) {
        const existing = reports.findIndex(({ scooterId }) => scooterId === report.scooterId)
        if (existing !== -1) reports.splice(existing, 1)
        reports.push(report)
      },
      lowBatteryIds() {
        return reports.filter(({ batteryPct }) => batteryPct < 15).map(({ scooterId }) => scooterId)
      },
    }
  },
})

type DispatchFailure = { kind: "dispatch-failed"; scooterId: string; message: string }

export const reportPosition = flow({
  name: "report-position",
  parse: parsePositionReport,
  deps: { fleetState },
  factory: (ctx, { fleetState }) => {
    fleetState.replace(ctx.input)
  },
})

export const lowBatterySweep = flow({
  name: "low-battery-sweep",
  parse: typed<void>(),
  faults: typed<DispatchFailure>(),
  deps: { fleetState, fleetOps: tags.required(fleetOps) },
  factory: async (ctx, { fleetState, fleetOps }) => {
    const dispatched: string[] = []
    for (const scooterId of fleetState.lowBatteryIds()) {
      try {
        await ctx.exec({
          fn: () => fleetOps.dispatchPickup(scooterId),
          params: [],
          name: "fleetops.dispatchPickup",
        })
      } catch (error) {
        return ctx.fail({
          kind: "dispatch-failed",
          scooterId,
          message: error instanceof Error ? error.message : String(error),
        })
      }
      dispatched.push(scooterId)
    }
    return { dispatched }
  },
})
