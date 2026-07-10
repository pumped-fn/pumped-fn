import { FlowFault } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import { createApp } from "../src/wire.ts"
import { lowBatterySweep, reportPosition, type FleetOps } from "../src/telemetry.ts"

function counterClock() {
  let tick = 0
  return () => {
    tick += 1
    return tick
  }
}

function scriptedFleetOps(results: boolean[]): { fleetOps: FleetOps; calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    fleetOps: {
      dispatchPickup: async (scooterId) => {
        calls.push(scooterId)
        return { accepted: results.shift() ?? true }
      },
    },
  }
}

async function report(session: ReturnType<ReturnType<typeof createApp>["scope"]["createContext"]>, rawInput: unknown) {
  await session.exec({ flow: reportPosition, rawInput })
}

describe("telemetry daemon", () => {
  it("accepts both wire shapes and sweeps under-15 scooters in report order", async () => {
    const scripted = scriptedFleetOps([true, true])
    const app = createApp({ fleetOps: scripted.fleetOps, now: counterClock() })
    const session = app.scope.createContext()
    await report(session, { kind: "gps", scooterId: "gps-low", lat: 1, lng: 2, batteryPct: 14 })
    await report(session, { kind: "cell", scooterId: "cell-high", cellId: "x", batteryPct: 15 })
    await report(session, { kind: "cell", scooterId: "cell-low", cellId: "y", batteryPct: 2 })
    await expect(session.exec({ flow: lowBatterySweep })).resolves.toEqual({ dispatched: ["gps-low", "cell-low"] })
    expect(scripted.calls).toEqual(["gps-low", "cell-low"])
    await session.close({ ok: true })
    await app.scope.dispose()
  })

  it("rejects malformed wire input without storing it", async () => {
    const scripted = scriptedFleetOps([])
    const app = createApp({ fleetOps: scripted.fleetOps, now: counterClock() })
    const session = app.scope.createContext()
    await expect(report(session, { kind: "gps", scooterId: "bad", lat: "north", lng: 2, batteryPct: 1 }))
      .rejects.toMatchObject({ cause: { message: /lat/ } })
    await expect(session.exec({ flow: lowBatterySweep })).resolves.toEqual({ dispatched: [] })
    expect(scripted.calls).toEqual([])
    await session.close({ ok: true })
    await app.scope.dispose()
  })

  it("records successful and failed nested dispatch executions", async () => {
    const scripted = scriptedFleetOps([true, false])
    const app = createApp({ fleetOps: scripted.fleetOps, now: counterClock() })
    const session = app.scope.createContext()
    await report(session, { kind: "cell", scooterId: "first", cellId: "a", batteryPct: 1 })
    await report(session, { kind: "cell", scooterId: "second", cellId: "b", batteryPct: 1 })
    await expect(session.exec({ flow: lowBatterySweep })).rejects.toMatchObject({
      fault: { kind: "dispatch-rejected", scooterId: "second" },
    } satisfies Partial<FlowFault>)
    const entries = app.trail()
    expect(entries.filter((entry) => entry.kind === "exec" && entry.name === "fleetops.dispatchPickup"))
      .toMatchObject([
        { parent: "low-battery-sweep", ok: true },
        { parent: "low-battery-sweep", ok: false },
      ])
    expect(entries.at(-1)).toMatchObject({ kind: "exec", name: "low-battery-sweep", ok: false, parent: null })
    await session.close({ ok: false, error: new Error("expected failure") })
    await app.scope.dispose()
  })

  it("keeps only the newest 100 audit entries and distinguishes resolves from executions", async () => {
    const scripted = scriptedFleetOps([])
    const app = createApp({ fleetOps: scripted.fleetOps, now: counterClock() })
    const session = app.scope.createContext()
    await report(session, { kind: "cell", scooterId: "seed", cellId: "a", batteryPct: 50 })
    const initial = app.trail()
    expect(initial.some((entry) => entry.kind === "resolve")).toBe(true)
    expect(initial.some((entry) => entry.kind === "exec" && entry.name === "report-position")).toBe(true)
    for (let index = 0; index < 100; index += 1) {
      await report(session, { kind: "cell", scooterId: `s${index}`, cellId: "a", batteryPct: 50 })
    }
    const entries = app.trail()
    expect(entries).toHaveLength(100)
    expect(entries.some((entry) => entry.kind === "resolve")).toBe(false)
    expect(entries).toEqual(Array.from({ length: 100 }, () => expect.objectContaining({
      kind: "exec",
      name: "report-position",
      ok: true,
    })))
    await session.close({ ok: true })
    await app.scope.dispose()
  })
})
