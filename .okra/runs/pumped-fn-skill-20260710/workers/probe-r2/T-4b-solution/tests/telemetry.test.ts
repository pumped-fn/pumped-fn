import { FlowFault } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import { createApp } from "../src/wire.ts"
import { lowBatterySweep, reportPosition, type FleetOps } from "../src/telemetry.ts"

function counterClock() {
  let value = 0
  return () => value++
}

function client(outcomes: boolean[], calls: string[]): FleetOps {
  return {
    async dispatchPickup(scooterId) {
      calls.push(scooterId)
      return { accepted: outcomes.shift() ?? true }
    },
  }
}

function messages(error: unknown): string {
  if (error instanceof Error) return `${error.message} ${messages(error.cause)}`
  return String(error)
}

async function report(session: ReturnType<ReturnType<typeof createApp>["scope"]["createContext"]>, rawInput: unknown) {
  await session.exec({ flow: reportPosition, rawInput })
}

describe("scooter telemetry", () => {
  it("accepts both wire reports and dispatches low batteries in report order", async () => {
    const calls: string[] = []
    const app = createApp({ fleetOps: client([true, true], calls), now: counterClock() })
    const session = app.scope.createContext()
    await report(session, { kind: "gps", scooterId: "gps-low", lat: 1, lng: 2, batteryPct: 14 })
    await report(session, { kind: "cell", scooterId: "cell-high", cellId: "a", batteryPct: 15 })
    await report(session, { kind: "cell", scooterId: "cell-low", cellId: "b", batteryPct: 2 })
    await expect(session.exec({ flow: lowBatterySweep })).resolves.toEqual({ dispatched: ["gps-low", "cell-low"] })
    expect(calls).toEqual(["gps-low", "cell-low"])
    await session.close({ ok: true })
    await app.scope.dispose()
  })

  it("rejects malformed wire input without storing it", async () => {
    const calls: string[] = []
    const app = createApp({ fleetOps: client([], calls), now: counterClock() })
    const session = app.scope.createContext()
    await expect(report(session, { kind: "gps", scooterId: "bad", lat: "north", lng: 2, batteryPct: 1 })).rejects.toSatisfy(
      (error) => messages(error).includes("lat"),
    )
    await expect(session.exec({ flow: lowBatterySweep })).resolves.toEqual({ dispatched: [] })
    expect(calls).toEqual([])
    await session.close({ ok: true })
    await app.scope.dispose()
  })

  it("records nested dispatch and sweep failures in completion order", async () => {
    const calls: string[] = []
    const app = createApp({ fleetOps: client([true, false], calls), now: counterClock() })
    const session = app.scope.createContext()
    await report(session, { kind: "cell", scooterId: "first", cellId: "a", batteryPct: 1 })
    await report(session, { kind: "cell", scooterId: "second", cellId: "b", batteryPct: 2 })
    await expect(session.exec({ flow: lowBatterySweep })).rejects.toMatchObject({
      fault: { kind: "dispatch-failed", scooterId: "second" },
      flow: "low-battery-sweep",
    } satisfies Partial<FlowFault>)
    expect(calls).toEqual(["first", "second"])
    const entries = app.trail()
    expect(entries.filter((entry) => entry.kind === "exec" && entry.name === "fleetops.dispatchPickup")).toMatchObject([
      { parent: "low-battery-sweep", ok: true },
      { parent: "low-battery-sweep", ok: false },
    ])
    expect(entries.at(-1)).toMatchObject({ kind: "exec", name: "low-battery-sweep", parent: null, ok: false })
    await session.close({ ok: false, error: new Error("dispatch failed") })
    await app.scope.dispose()
  })

  it("keeps only the newest 100 trail entries and distinguishes resolves", async () => {
    const calls: string[] = []
    const app = createApp({ fleetOps: client([], calls), now: counterClock() })
    const session = app.scope.createContext()
    await report(session, { kind: "cell", scooterId: "seed", cellId: "a", batteryPct: 100 })
    const initial = app.trail()
    expect(initial.some((entry) => entry.kind === "resolve" && entry.name.length > 0)).toBe(true)
    expect(initial.some((entry) => entry.kind === "exec" && entry.name === "report-position")).toBe(true)
    for (let index = 0; index < 101; index += 1) {
      await report(session, { kind: "cell", scooterId: `high-${index}`, cellId: "a", batteryPct: 100 })
    }
    const entries = app.trail()
    expect(entries).toHaveLength(100)
    expect(entries.every((entry) => entry.kind === "exec" && entry.name === "report-position")).toBe(true)
    expect(entries.some((entry) => entry.kind === "resolve")).toBe(false)
    expect(entries.some((entry) => entry.name === "report-position" && entry.parent === null)).toBe(true)
    await session.close({ ok: true })
    await app.scope.dispose()
  })
})
