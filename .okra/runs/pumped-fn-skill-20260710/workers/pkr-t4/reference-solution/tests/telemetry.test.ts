import { createScope } from "@pumped-fn/lite"
import { describe, expect, test } from "vitest"
import type { AuditEntry } from "../src/audit.ts"
import { auditTrail } from "../src/audit.ts"
import type { FleetOps } from "../src/telemetry.ts"
import { fleetOps, lowBatterySweep, reportPosition } from "../src/telemetry.ts"
import { createApp } from "../src/wire.ts"

const scriptedOps = (rejectIds: string[] = []) => {
  const calls: string[] = []
  const ops: FleetOps = {
    dispatchPickup: (scooterId) => {
      calls.push(scooterId)
      if (rejectIds.includes(scooterId)) {
        return Promise.reject(new Error(`fleet-ops refused ${scooterId}`))
      }
      return Promise.resolve({ accepted: true })
    },
  }
  return { calls, ops }
}

const counterClock = () => {
  let tick = 0
  return () => {
    tick += 1
    return tick
  }
}

const gps = (scooterId: string, batteryPct: number) => ({
  kind: "gps",
  scooterId,
  lat: 48.2,
  lng: 16.4,
  batteryPct,
})

const cell = (scooterId: string, batteryPct: number) => ({
  kind: "cell",
  scooterId,
  cellId: "cell-7",
  batteryPct,
})

type AppContext = ReturnType<ReturnType<typeof createApp>["scope"]["createContext"]>

const session = async (
  rejectIds: string[],
  run: (input: { ctx: AppContext; calls: string[]; trail: () => AuditEntry[] }) => Promise<void>,
) => {
  const { calls, ops } = scriptedOps(rejectIds)
  const app = createApp({ fleetOps: ops, now: counterClock() })
  const ctx = app.scope.createContext()
  try {
    await run({ ctx, calls, trail: app.trail })
  } finally {
    await ctx.close()
    await app.scope.dispose()
  }
}

const execEntries = (trail: AuditEntry[]) => trail.filter((entry) => entry.kind === "exec")

const mentions = (error: unknown, field: string): boolean => {
  let current: unknown = error
  while (current instanceof Error) {
    const issues = (current as { issues?: unknown }).issues
    if (current.message.includes(field) || JSON.stringify(issues ?? null).includes(field)) return true
    current = current.cause
  }
  return false
}

describe("scooter telemetry daemon", () => {
  test("both wire shapes are accepted and drive the sweep in report order", async () => {
    await session([], async ({ ctx, calls }) => {
      await ctx.exec({ flow: reportPosition, rawInput: cell("s-cell", 9) })
      await ctx.exec({ flow: reportPosition, rawInput: gps("s-gps", 3) })
      await ctx.exec({ flow: reportPosition, rawInput: gps("s-healthy", 88) })
      const result = await ctx.exec({ flow: lowBatterySweep })
      expect(result).toEqual({ dispatched: ["s-cell", "s-gps"] })
      expect(calls).toEqual(["s-cell", "s-gps"])
    })
  })

  test("a malformed report names the offending field and stores nothing", async () => {
    await session([], async ({ ctx, calls }) => {
      const malformed = { kind: "gps", scooterId: "s-1", lat: "north", lng: 16.4, batteryPct: 2 }
      await expect(ctx.exec({ flow: reportPosition, rawInput: malformed })).rejects.toSatisfy(
        (error) => mentions(error, "lat"),
      )
      await ctx.exec({ flow: lowBatterySweep })
      expect(calls).toEqual([])
    })
  })

  test("a replaced report drops the scooter out of the sweep set", async () => {
    await session([], async ({ ctx, calls }) => {
      await ctx.exec({ flow: reportPosition, rawInput: gps("s-1", 4) })
      await ctx.exec({ flow: reportPosition, rawInput: cell("s-1", 96) })
      await ctx.exec({ flow: lowBatterySweep })
      expect(calls).toEqual([])
    })
  })

  test("audit trail binds public operations, client edges, and resolves", async () => {
    await session([], async ({ ctx, trail }) => {
      await ctx.exec({ flow: reportPosition, rawInput: gps("s-low", 5) })
      await ctx.exec({ flow: lowBatterySweep })
      const entries = trail()
      const resolves = entries.filter((entry) => entry.kind === "resolve")
      expect(resolves.length).toBeGreaterThan(0)
      expect(resolves.every((entry) => entry.ok && entry.name.length > 0)).toBe(true)
      expect(execEntries(entries).map(({ name, parent, ok }) => ({ name, parent, ok }))).toEqual([
        { name: "report-position", parent: null, ok: true },
        { name: "fleetops.dispatchPickup", parent: "low-battery-sweep", ok: true },
        { name: "low-battery-sweep", parent: null, ok: true },
      ])
      expect(entries.every((entry) => Number.isFinite(entry.durationMs) && entry.durationMs >= 0)).toBe(true)
    })
  })

  test("a rejected dispatch leaves both failure entries in completion order", async () => {
    await session(["s-dead"], async ({ ctx, calls, trail }) => {
      await ctx.exec({ flow: reportPosition, rawInput: gps("s-ok", 8) })
      await ctx.exec({ flow: reportPosition, rawInput: gps("s-dead", 6) })
      await expect(ctx.exec({ flow: lowBatterySweep })).rejects.toThrow("dispatch-failed")
      expect(calls).toEqual(["s-ok", "s-dead"])
      const entries = trail()
      const dispatches = entries.filter((entry) => entry.name === "fleetops.dispatchPickup")
      expect(dispatches.map((entry) => entry.ok)).toEqual([true, false])
      const sweeps = entries.filter((entry) => entry.name === "low-battery-sweep")
      expect(sweeps.map((entry) => entry.ok)).toEqual([false])
      const failedDispatchAt = entries.findIndex(
        (entry) => entry.name === "fleetops.dispatchPickup" && !entry.ok,
      )
      const sweepAt = entries.findIndex((entry) => entry.name === "low-battery-sweep")
      expect(sweepAt).toBeGreaterThan(failedDispatchAt)
    })
  })

  test("the ring keeps exactly the last 100 entries and evicts the oldest", async () => {
    await session([], async ({ ctx, trail }) => {
      await ctx.exec({ flow: lowBatterySweep })
      expect(trail().some((entry) => entry.name === "low-battery-sweep")).toBe(true)
      expect(trail().some((entry) => entry.kind === "resolve")).toBe(true)
      for (let index = 0; index < 105; index += 1) {
        await ctx.exec({ flow: reportPosition, rawInput: gps(`s-${index}`, 90) })
      }
      const entries = trail()
      expect(entries).toHaveLength(100)
      expect(entries.every((entry) => entry.kind === "exec" && entry.name === "report-position")).toBe(true)
    })
  })

  test("the same flows compose under a locally wired scope", async () => {
    const { calls, ops } = scriptedOps()
    const audit = auditTrail({ capacity: 3, now: counterClock() })
    const scope = createScope({ tags: [fleetOps(ops)], extensions: [audit.extension] })
    const ctx = scope.createContext()
    try {
      await ctx.exec({ flow: reportPosition, rawInput: gps("s-solo", 1) })
      await ctx.exec({ flow: lowBatterySweep })
      expect(calls).toEqual(["s-solo"])
      expect(audit.entries()).toHaveLength(3)
      expect(audit.entries().every((entry) => entry.kind === "exec")).toBe(true)
    } finally {
      await ctx.close()
      await scope.dispose()
    }
  })
})
