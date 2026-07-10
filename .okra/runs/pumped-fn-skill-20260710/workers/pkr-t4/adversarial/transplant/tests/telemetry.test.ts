import { createScope } from "@pumped-fn/lite"
import { expect, test } from "vitest"
import { lowBatterySweep, reportPosition } from "../src/telemetry.ts"

test("reports flow through the intake and the sweep dispatches", async () => {
  const names: string[] = []
  const scope = createScope({
    extensions: [
      {
        name: "inline-tracer",
        wrapExec: (next, _target, ctx) => {
          names.push(ctx.name ?? "anonymous")
          return next()
        },
      },
    ],
  })
  const ctx = scope.createContext()
  await ctx.exec({
    flow: reportPosition,
    input: { kind: "gps", scooterId: "s-1", lat: 1, lng: 2, batteryPct: 4 },
  })
  const result = await ctx.exec({ flow: lowBatterySweep })
  expect(result).toEqual({ dispatched: ["s-1"] })
  expect(names).toContain("report-position")
  await ctx.close()
  await scope.dispose()
})
