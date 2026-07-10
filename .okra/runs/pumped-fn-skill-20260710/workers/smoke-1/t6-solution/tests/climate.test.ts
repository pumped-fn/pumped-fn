import { createScope, flow, typed } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import { alertChannel, atRiskOf, ingestReading, readings, sameRoomSet, watchAtRisk } from "../src/climate.js"

function recordingAlert(calls: string[]) {
  return flow({
    name: "record-alert",
    parse: typed<{ galleryId: string }>(),
    factory: (ctx) => {
      calls.push(ctx.input.galleryId)
    },
  })
}

async function settle(scope: ReturnType<typeof createScope>) {
  await scope.flush()
  await Promise.resolve()
}

describe("climate monitor", () => {
  it("derives a sorted at-risk list and compares room sets by contents", () => {
    expect(atRiskOf({ west: { tempC: 20, rh: 56 }, east: { tempC: 19, rh: 39 }, safe: { tempC: 21, rh: 55 } })).toEqual(["east", "west"])
    expect(sameRoomSet(["east", "west"], ["west", "east"])).toBe(true)
    expect(sameRoomSet(["east", "west"], ["east", "north"])).toBe(false)
  })

  it("suppresses unchanged selected-set notifications and notifies membership changes", async () => {
    const scope = createScope()
    await scope.resolve(readings)
    const view = scope.select(readings, atRiskOf, { eq: sameRoomSet })
    let notifications = 0
    const unsubscribe = view.subscribe(() => { notifications += 1 })
    const ctx = scope.createContext()
    await ctx.exec({ flow: ingestReading, input: { galleryId: "safe", tempC: 20, rh: 45 } })
    await ctx.exec({ flow: ingestReading, input: { galleryId: "safe", tempC: 22, rh: 46 } })
    await ctx.exec({ flow: ingestReading, input: { galleryId: "west", tempC: 20, rh: 60 } })
    await ctx.exec({ flow: ingestReading, input: { galleryId: "west", tempC: 21, rh: 61 } })
    await ctx.exec({ flow: ingestReading, input: { galleryId: "west", tempC: 21, rh: 50 } })
    expect(notifications).toBe(2)
    unsubscribe()
    view.dispose()
    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("replaces a reading wholesale", async () => {
    const scope = createScope()
    await scope.resolve(readings)
    const ctx = scope.createContext()
    await ctx.exec({ flow: ingestReading, input: { galleryId: "east", tempC: 20, rh: 60, note: "inspect seal" } })
    await ctx.exec({ flow: ingestReading, input: { galleryId: "east", tempC: 21, rh: 50 } })
    expect(scope.controller(readings).get()).toEqual({ east: { tempC: 21, rh: 50 } })
    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("alerts on entry, ignores churn, and alerts after re-entry", async () => {
    const calls: string[] = []
    const scope = createScope({ tags: [alertChannel(recordingAlert(calls))] })
    await scope.resolve(readings)
    const view = scope.select(readings, atRiskOf, { eq: sameRoomSet })
    const session = scope.createContext()
    const monitor = session.exec({ flow: watchAtRisk, input: { view } })
    await settle(scope)
    await session.exec({ flow: ingestReading, input: { galleryId: "west", tempC: 20, rh: 60 } })
    await settle(scope)
    await session.exec({ flow: ingestReading, input: { galleryId: "west", tempC: 21, rh: 61 } })
    await settle(scope)
    await session.exec({ flow: ingestReading, input: { galleryId: "west", tempC: 21, rh: 50 } })
    await settle(scope)
    await session.exec({ flow: ingestReading, input: { galleryId: "west", tempC: 20, rh: 39 } })
    await settle(scope)
    expect(calls).toEqual(["west", "west"])
    view.dispose()
    await scope.dispose()
    await monitor
    await session.close({ ok: true })
  })

  it("does not lose final newly at-risk rooms across a burst", async () => {
    const calls: string[] = []
    const scope = createScope({ tags: [alertChannel(recordingAlert(calls))] })
    await scope.resolve(readings)
    const view = scope.select(readings, atRiskOf, { eq: sameRoomSet })
    const session = scope.createContext()
    const monitor = session.exec({ flow: watchAtRisk, input: { view } })
    await Promise.all([
      session.exec({ flow: ingestReading, input: { galleryId: "west", tempC: 20, rh: 60 } }),
      session.exec({ flow: ingestReading, input: { galleryId: "east", tempC: 20, rh: 39 } }),
      session.exec({ flow: ingestReading, input: { galleryId: "west", tempC: 21, rh: 62 } }),
      session.exec({ flow: ingestReading, input: { galleryId: "lobby", tempC: 20, rh: 50 } }),
    ])
    await settle(scope)
    expect(calls.slice().sort()).toEqual(["east", "west"])
    view.dispose()
    await scope.dispose()
    await monitor
    await session.close({ ok: true })
  })

  it("retains readings after all selected observers are gone", async () => {
    const scope = createScope()
    await scope.resolve(readings)
    const ctx = scope.createContext()
    await ctx.exec({ flow: ingestReading, input: { galleryId: "east", tempC: 20, rh: 60 } })
    const first = scope.select(readings, atRiskOf, { eq: sameRoomSet })
    first.dispose()
    await scope.flush()
    const second = scope.select(readings, atRiskOf, { eq: sameRoomSet })
    expect(second.get()).toEqual(["east"])
    second.dispose()
    await ctx.close({ ok: true })
    await scope.dispose()
  })
})
