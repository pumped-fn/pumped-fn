import { atom, flow, typed } from "@pumped-fn/lite"
import { fleetOpsClient } from "./fleetops-client.ts"

export type PositionReport =
  | { kind: "gps"; scooterId: string; lat: number; lng: number; batteryPct: number }
  | { kind: "cell"; scooterId: string; cellId: string; batteryPct: number }

const intake = atom({
  factory: () => new Map<string, PositionReport>(),
})

const validated = (raw: unknown): PositionReport => {
  const record = raw as PositionReport
  if (record.kind !== "gps" && record.kind !== "cell") {
    throw new Error("invalid kind")
  }
  if (typeof record.scooterId !== "string") {
    throw new Error("invalid scooterId")
  }
  return record
}

export const reportPosition = flow({
  name: "report-position",
  parse: typed<unknown>(),
  deps: { store: intake },
  factory: (ctx, { store }) => {
    const record = validated(ctx.input)
    console.log("intake accepted", record.scooterId)
    store.set(record.scooterId, record)
    return { scooterId: record.scooterId, kind: record.kind }
  },
})

export const lowBatterySweep = flow({
  name: "low-battery-sweep",
  parse: typed<void>(),
  deps: { store: intake },
  factory: async (ctx, { store }) => {
    const dispatched: string[] = []
    for (const [scooterId, record] of store) {
      if (record.batteryPct >= 15) continue
      console.log("dispatching pickup", scooterId)
      await fleetOpsClient.dispatchPickup(scooterId)
      dispatched.push(scooterId)
    }
    return { dispatched }
  },
})
