import { describe, expect, it } from "vitest"
import { createApp } from "../src/wire.ts"
import { lowBatterySweep, reportPosition, type FleetOps } from "../src/telemetry.ts"

function createFixture(replies: boolean[] = []) {
  const calls: string[] = []
  let tick = 0
  const fleetOps: FleetOps = {
    async dispatchPickup(scooterId) {
      calls.push(scooterId)
      return { accepted: replies.shift() ?? true }
    },
  }
  return { app: createApp({ fleetOps, now: () => ++tick }), calls }
}

async function close(app: ReturnType<typeof createApp>, session: ReturnType<ReturnType<typeof createApp>["scope"]["createContext"]>) {
  await session.close({ ok: true })
  await app.scope.dispose()
}

describe("scooter telemetry", () => {
  it("accepts both wire shapes and dispatches low batteries in report order", async () => {
    const { app, calls } = createFixture()
    const session = app.scope.createContext()
    await session.exec({ flow: reportPosition, rawInput: { kind: "gps", scooterId: "gps-low", lat: 1, lng: 2, batteryPct: 14 } })
    await session.exec({ flow: reportPosition, rawInput: { kind: "cell", scooterId: "cell-high", cellId: "c1", batteryPct: 15 } })
    await session.exec({ flow: reportPosition, rawInput: { kind: "cell", scooterId: "cell-low", cellId: "c2", batteryPct: 3 } })
    await expect(session.exec({ flow: lowBatterySweep })).resolves.toEqual({ dispatched: ["gps-low", "cell-low"] })
    expect(calls).toEqual(["gps-low", "cell-low"])
    await close(app, session)
  })

  it("rejects malformed wire input without storing it", async () => {
    const { app, calls } = createFixture()
    const session = app.scope.createContext()
    const rejected = await session.exec({ flow: reportPosition, rawInput: { kind: "gps", scooterId: "bad", lat: 1, lng: 2 } }).catch((error: unknown) => error)
    expect(String((rejected as Error).cause)).toMatch(/batteryPct/)
    await expect(session.exec({ flow: lowBatterySweep })).resolves.toEqual({ dispatched: [] })
    expect(calls).toEqual([])
    await close(app, session)
  })

  it("records nested dispatch and sweep failures in completion order", async () => {
    const { app, calls } = createFixture([true, false])
    const session = app.scope.createContext()
    await session.exec({ flow: reportPosition, rawInput: { kind: "cell", scooterId: "first", cellId: "a", batteryPct: 1 } })
    await session.exec({ flow: reportPosition, rawInput: { kind: "cell", scooterId: "second", cellId: "b", batteryPct: 2 } })
    await expect(session.exec({ flow: lowBatterySweep })).rejects.toMatchObject({ fault: { kind: "pickup-rejected", scooterId: "second" } })
    expect(calls).toEqual(["first", "second"])
    const entries = app.trail().filter((entry) => entry.kind === "exec")
    expect(entries.slice(-3)).toMatchObject([
      { name: "fleetops.dispatchPickup", parent: "low-battery-sweep", ok: true },
      { name: "fleetops.dispatchPickup", parent: "low-battery-sweep", ok: false },
      { name: "low-battery-sweep", parent: null, ok: false },
    ])
    await session.close({ ok: false, error: new Error("expected failure") })
    await app.scope.dispose()
  })

  it("keeps exactly the newest one hundred audit entries", async () => {
    const { app } = createFixture()
    for (let index = 0; index < 102; index += 1) {
      const session = app.scope.createContext()
      await session.exec({ flow: reportPosition, rawInput: { kind: "cell", scooterId: `s${index}`, cellId: `c${index}`, batteryPct: 50 } })
      await session.close({ ok: true })
    }
    const entries = app.trail()
    expect(entries).toHaveLength(100)
    expect(entries.every((entry) => entry.name === "report-position")).toBe(true)
    expect(entries[0]).toMatchObject({ kind: "exec", name: "report-position", parent: null })
    expect(entries.some((entry) => entry.kind === "resolve")).toBe(false)
    await app.scope.dispose()
  })

  it("records resolve and execution entries as distinct kinds", async () => {
    const { app } = createFixture()
    const session = app.scope.createContext()
    await session.exec({ flow: reportPosition, rawInput: { kind: "cell", scooterId: "s", cellId: "c", batteryPct: 20 } })
    const entries = app.trail()
    expect(entries.some((entry) => entry.kind === "resolve" && entry.name.length > 0 && entry.parent === null)).toBe(true)
    expect(entries.some((entry) => entry.kind === "exec" && entry.name === "report-position")).toBe(true)
    await close(app, session)
  })
})
