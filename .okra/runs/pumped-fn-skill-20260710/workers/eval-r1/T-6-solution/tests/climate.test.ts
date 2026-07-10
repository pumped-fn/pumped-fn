import { createScope, flow, typed } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import { alertChannel, atRiskOf, ingestReading, readings, sameRoomSet, watchAtRisk } from "../src/climate.js"

function recordingAlert(sent: string[]) {
  return flow({
    name: "record-alert",
    parse: typed<{ galleryId: string }>(),
    factory: (ctx) => {
      sent.push(ctx.input.galleryId)
    },
  })
}

describe("gallery climate", () => {
  it("derives a sorted at-risk list and compares it as a set", () => {
    expect(atRiskOf({ zebra: { tempC: 20, rh: 56 }, alpha: { tempC: 20, rh: 39 }, safe: { tempC: 20, rh: 55 } })).toEqual(["alpha", "zebra"])
    expect(sameRoomSet(["zebra", "alpha"], ["alpha", "zebra"])).toBe(true)
    expect(sameRoomSet(["alpha", "zebra"], ["alpha", "west"])).toBe(false)
  })

  it("suppresses unchanged slices and reports membership changes", async () => {
    const scope = createScope()
    await scope.resolve(readings)
    const view = scope.select(readings, atRiskOf, { eq: sameRoomSet })
    let notifications = 0
    const unsubscribe = view.subscribe(() => { notifications += 1 })
    const ctx = scope.createContext()

    await ctx.exec({ flow: ingestReading, input: { galleryId: "safe", tempC: 20, rh: 45 } })
    await ctx.exec({ flow: ingestReading, input: { galleryId: "safe", tempC: 21, rh: 46 } })
    await ctx.exec({ flow: ingestReading, input: { galleryId: "west", tempC: 20, rh: 62 } })
    await ctx.exec({ flow: ingestReading, input: { galleryId: "west", tempC: 21, rh: 63 } })
    await ctx.exec({ flow: ingestReading, input: { galleryId: "east", tempC: 20, rh: 37 } })

    expect(notifications).toBe(2)
    expect(view.get()).toEqual(["east", "west"])
    unsubscribe()
    view.dispose()
    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("replaces each gallery reading wholesale and retains state after observers leave", async () => {
    const scope = createScope()
    await scope.resolve(readings)
    const ctx = scope.createContext()
    await ctx.exec({ flow: ingestReading, input: { galleryId: "west", tempC: 20, rh: 62, note: "first" } })
    const view = scope.select(readings, atRiskOf, { eq: sameRoomSet })
    view.dispose()
    await ctx.exec({ flow: ingestReading, input: { galleryId: "west", tempC: 21, rh: 48 } })

    expect(await scope.resolve(readings)).toEqual({ west: { tempC: 21, rh: 48 } })
    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("alerts through the wired capability on entry and re-entry only", async () => {
    const sent: string[] = []
    const scope = createScope({ tags: [alertChannel(recordingAlert(sent))] })
    await scope.resolve(readings)
    const view = scope.select(readings, atRiskOf, { eq: sameRoomSet })
    const ctx = scope.createContext()
    const monitor = ctx.exec({ flow: watchAtRisk, input: { view } })

    await ctx.exec({ flow: ingestReading, input: { galleryId: "west", tempC: 20, rh: 62 } })
    await Promise.resolve()
    await ctx.exec({ flow: ingestReading, input: { galleryId: "west", tempC: 21, rh: 63 } })
    await Promise.resolve()
    await ctx.exec({ flow: ingestReading, input: { galleryId: "west", tempC: 20, rh: 45 } })
    await Promise.resolve()
    await ctx.exec({ flow: ingestReading, input: { galleryId: "west", tempC: 20, rh: 62 } })
    await Promise.resolve()

    expect(sent).toEqual(["west", "west"])
    await scope.dispose()
    await monitor
    view.dispose()
  })

  it("handles a burst by alerting every gallery in the final new at-risk set once", async () => {
    const sent: string[] = []
    const scope = createScope({ tags: [alertChannel(recordingAlert(sent))] })
    await scope.resolve(readings)
    const view = scope.select(readings, atRiskOf, { eq: sameRoomSet })
    const ctx = scope.createContext()
    const monitor = ctx.exec({ flow: watchAtRisk, input: { view } })

    await Promise.resolve()
    await Promise.all([
      ctx.exec({ flow: ingestReading, input: { galleryId: "north", tempC: 20, rh: 61 } }),
      ctx.exec({ flow: ingestReading, input: { galleryId: "south", tempC: 20, rh: 37 } }),
      ctx.exec({ flow: ingestReading, input: { galleryId: "north", tempC: 21, rh: 62 } }),
    ])
    await Promise.resolve()
    await Promise.resolve()

    expect([...sent].sort()).toEqual(["north", "south"])
    await scope.dispose()
    await monitor
    view.dispose()
  })
})
