import { FlowFault } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import { createApp } from "../src/wire.ts"
import { lowBatterySweep, reportPosition, type FleetOps } from "../src/telemetry.ts"

function scripted(results: boolean[] = []) {
  const calls: string[] = []
  const fleetOps: FleetOps = {
    async dispatchPickup(scooterId) {
      calls.push(scooterId)
      return { accepted: results.shift() ?? true }
    },
  }
  return { calls, fleetOps }
}

function counter() {
  let value = 0
  return () => value++
}

async function report(app: ReturnType<typeof createApp>, rawInput: unknown) {
  const session = app.scope.createContext()
  try {
    await session.exec({ flow: reportPosition, rawInput })
    await session.close({ ok: true })
  } catch (error) {
    await session.close({ ok: false, error })
    throw error
  }
}

async function sweep(app: ReturnType<typeof createApp>) {
  const session = app.scope.createContext()
  try {
    const result = await session.exec({ flow: lowBatterySweep })
    await session.close({ ok: true })
    return result
  } catch (error) {
    await session.close({ ok: false, error })
    throw error
  }
}

describe("scooter telemetry", () => {
  it("accepts both wire shapes and dispatches low batteries in report order", async () => {
    const client = scripted()
    const app = createApp({ fleetOps: client.fleetOps, now: counter() })
    await report(app, { kind: "gps", scooterId: "gps-low", lat: 1, lng: 2, batteryPct: 14 })
    await report(app, { kind: "cell", scooterId: "cell-high", cellId: "x", batteryPct: 15 })
    await report(app, { kind: "cell", scooterId: "cell-low", cellId: "y", batteryPct: 2 })

    await expect(sweep(app)).resolves.toEqual({ dispatched: ["gps-low", "cell-low"] })
    expect(client.calls).toEqual(["gps-low", "cell-low"])
    await app.scope.dispose()
  })

  it("rejects malformed wire input by field without storing a report", async () => {
    const client = scripted()
    const app = createApp({ fleetOps: client.fleetOps, now: counter() })

    await expect(report(app, { kind: "gps", scooterId: "bad", lat: 1, lng: 2 })).rejects.toSatisfy((error) =>
      String((error as Error & { cause?: unknown }).cause).includes("batteryPct"),
    )
    await expect(sweep(app)).resolves.toEqual({ dispatched: [] })
    expect(client.calls).toEqual([])
    await app.scope.dispose()
  })

  it("records nested success and rejection entries in completion order", async () => {
    const client = scripted([true, false])
    const app = createApp({ fleetOps: client.fleetOps, now: counter() })
    await report(app, { kind: "cell", scooterId: "first", cellId: "a", batteryPct: 1 })
    await report(app, { kind: "cell", scooterId: "second", cellId: "b", batteryPct: 2 })

    await expect(sweep(app)).rejects.toMatchObject({
      constructor: FlowFault,
      fault: { kind: "dispatch-rejected", scooterId: "second" },
    })
    const executions = app.trail().filter((entry) => entry.kind === "exec")
    expect(executions.slice(-3).map(({ name, parent, ok }) => ({ name, parent, ok }))).toEqual([
      { name: "fleetops.dispatchPickup", parent: "low-battery-sweep", ok: true },
      { name: "fleetops.dispatchPickup", parent: "low-battery-sweep", ok: false },
      { name: "low-battery-sweep", parent: null, ok: false },
    ])
    expect(app.trail().some((entry) => entry.kind === "resolve")).toBe(true)
    await app.scope.dispose()
  })

  it("keeps only the latest 100 audit entries", async () => {
    const client = scripted()
    const app = createApp({ fleetOps: client.fleetOps, now: counter() })
    for (let index = 0; index < 101; index += 1) {
      await report(app, { kind: "cell", scooterId: `s-${index}`, cellId: "tower", batteryPct: 80 })
    }
    const entries = app.trail()
    expect(entries).toHaveLength(100)
    expect(entries.some((entry) => entry.name === "fleetState" && entry.kind === "resolve")).toBe(false)
    expect(entries[0]).toMatchObject({ kind: "exec", name: "report-position", ok: true })
    await app.scope.dispose()
  })
})
