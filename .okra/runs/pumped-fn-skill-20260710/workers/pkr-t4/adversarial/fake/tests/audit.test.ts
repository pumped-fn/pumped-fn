import { createScope, flow, typed } from "@pumped-fn/lite"
import { describe, expect, test } from "vitest"
import { auditTrail } from "../src/audit.ts"

const probeOk = flow({
  name: "report-position",
  parse: typed<void>(),
  factory: () => "stored",
})

type ProbeFault = { code: "dispatch-failed" }

const probeFail = flow({
  name: "low-battery-sweep",
  parse: typed<void>(),
  faults: typed<ProbeFault>(),
  deps: {},
  factory: async (ctx) => {
    try {
      await ctx.exec({
        fn: () => Promise.reject(new Error("edge down")),
        params: [],
        name: "fleetops.dispatchPickup",
      })
    } catch (error) {
      if (error instanceof Error) return ctx.fail({ code: "dispatch-failed" })
    }
    return { dispatched: [] }
  },
})

const counterClock = () => {
  let tick = 0
  return () => {
    tick += 1
    return tick
  }
}

describe("auditTrail extension", () => {
  test("records ok and failed entries for nested executions", async () => {
    const audit = auditTrail({ capacity: 100, now: counterClock() })
    const scope = createScope({ extensions: [audit.extension] })
    const ctx = scope.createContext()
    await ctx.exec({ flow: probeOk })
    await expect(ctx.exec({ flow: probeFail })).rejects.toThrow("dispatch-failed")
    const entries = audit.entries()
    expect(entries.find((entry) => entry.name === "report-position")?.ok).toBe(true)
    expect(entries.find((entry) => entry.name === "fleetops.dispatchPickup")?.ok).toBe(false)
    expect(entries.find((entry) => entry.name === "low-battery-sweep")?.ok).toBe(false)
    await ctx.close()
    await scope.dispose()
  })

  test("ring buffer holds exactly the last 100 entries", async () => {
    const audit = auditTrail({ capacity: 100, now: counterClock() })
    const scope = createScope({ extensions: [audit.extension] })
    const ctx = scope.createContext()
    for (let index = 0; index < 105; index += 1) {
      await ctx.exec({ flow: probeOk })
    }
    expect(audit.entries()).toHaveLength(100)
    await ctx.close()
    await scope.dispose()
  })
})
