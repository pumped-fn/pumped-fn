import { createScope, flow, typed } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import {
  alertChannel,
  atRiskOf,
  ingestReading,
  readings,
  sameRoomSet,
  watchAtRisk,
  type ReadingsState,
} from "../src/climate.ts"

function recordingAlert(recorded: string[]) {
  return flow({
    name: "recording-alert",
    parse: typed<{ galleryId: string }>(),
    factory: (ctx) => {
      recorded.push(ctx.input.galleryId)
    },
  })
}

describe("atRiskOf", () => {
  it("selects at-risk galleries sorted ascending, boundary values are safe", () => {
    const state: ReadingsState = {
      west: { tempC: 20, rh: 62 },
      east: { tempC: 21, rh: 45 },
      north: { tempC: 19, rh: 40 },
      south: { tempC: 22, rh: 55 },
      attic: { tempC: 18, rh: 39 },
    }
    expect(atRiskOf(state)).toEqual(["attic", "west"])
  })
})

describe("sameRoomSet", () => {
  it("is true for identical sets regardless of order", () => {
    expect(sameRoomSet(["a", "b"], ["b", "a"])).toBe(true)
  })

  it("is false when membership differs, even at the same size", () => {
    expect(sameRoomSet(["a", "b"], ["a", "c"])).toBe(false)
  })

  it("is false when lengths differ", () => {
    expect(sameRoomSet(["a"], ["a", "b"])).toBe(false)
  })
})

describe("ingestReading", () => {
  it("replaces a gallery's reading wholesale, dropping a stale note", async () => {
    const scope = createScope()
    const ctx = scope.createContext()
    await ctx.exec({
      flow: ingestReading,
      input: { galleryId: "west", tempC: 20, rh: 62, note: "leak reported" },
    })
    await ctx.exec({ flow: ingestReading, input: { galleryId: "west", tempC: 21, rh: 50 } })
    const state = await scope.resolve(readings)
    expect(state).toEqual({ west: { tempC: 21, rh: 50 } })
    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("keeps other galleries untouched", async () => {
    const scope = createScope()
    const ctx = scope.createContext()
    await ctx.exec({ flow: ingestReading, input: { galleryId: "west", tempC: 20, rh: 62 } })
    await ctx.exec({ flow: ingestReading, input: { galleryId: "east", tempC: 21, rh: 45 } })
    const state = await scope.resolve(readings)
    expect(state).toEqual({
      west: { tempC: 20, rh: 62 },
      east: { tempC: 21, rh: 45 },
    })
    await ctx.close({ ok: true })
    await scope.dispose()
  })
})

describe("at-risk selected slice", () => {
  it("does not notify on churn that leaves the at-risk set unchanged, notifies on membership change", async () => {
    const scope = createScope()
    await scope.resolve(readings)
    const view = scope.select(readings, atRiskOf, { eq: sameRoomSet })
    let notifications = 0
    const unsubscribe = view.subscribe(() => {
      notifications += 1
    })
    const ctx = scope.createContext()

    await ctx.exec({ flow: ingestReading, input: { galleryId: "west", tempC: 20, rh: 62 } })
    expect(notifications).toBe(1)
    expect(view.get()).toEqual(["west"])

    await ctx.exec({ flow: ingestReading, input: { galleryId: "west", tempC: 20, rh: 70 } })
    expect(notifications).toBe(1)
    expect(view.get()).toEqual(["west"])

    await ctx.exec({ flow: ingestReading, input: { galleryId: "east", tempC: 21, rh: 45 } })
    expect(notifications).toBe(1)
    expect(view.get()).toEqual(["west"])

    await ctx.exec({ flow: ingestReading, input: { galleryId: "west", tempC: 20, rh: 50 } })
    expect(notifications).toBe(2)
    expect(view.get()).toEqual([])

    await ctx.exec({ flow: ingestReading, input: { galleryId: "east", tempC: 21, rh: 65 } })
    expect(notifications).toBe(3)
    expect(view.get()).toEqual(["east"])

    unsubscribe()
    view.dispose()
    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("notifies on a same-size at-risk membership swap made in one state replacement", async () => {
    const scope = createScope()
    await scope.resolve(readings)
    const view = scope.select(readings, atRiskOf, { eq: sameRoomSet })
    let notifications = 0
    const unsubscribe = view.subscribe(() => {
      notifications += 1
    })
    const ctx = scope.createContext()
    await ctx.exec({ flow: ingestReading, input: { galleryId: "west", tempC: 20, rh: 62 } })
    await ctx.exec({ flow: ingestReading, input: { galleryId: "east", tempC: 21, rh: 45 } })
    expect(notifications).toBe(1)
    expect(view.get()).toEqual(["west"])

    const readingsCtrl = await scope.controller(readings, { resolve: true })
    readingsCtrl.update((prev) => ({
      ...prev,
      west: { tempC: 20, rh: 50 },
      east: { tempC: 21, rh: 65 },
    }))
    expect(notifications).toBe(2)
    expect(view.get()).toEqual(["east"])

    unsubscribe()
    view.dispose()
    await ctx.close({ ok: true })
    await scope.dispose()
  })
})

describe("watchAtRisk", () => {
  it("alerts once on entry, stays silent on churn, re-alerts on re-entry", async () => {
    const recorded: string[] = []
    const scope = createScope({ tags: [alertChannel(recordingAlert(recorded))] })
    await scope.resolve(readings)
    const view = scope.select(readings, atRiskOf, { eq: sameRoomSet })
    const session = scope.createContext()
    const monitor = session.exec({ flow: watchAtRisk, input: { view } })

    await session.exec({ flow: ingestReading, input: { galleryId: "west", tempC: 20, rh: 62 } })
    await scope.flush()
    expect(recorded).toEqual(["west"])

    await session.exec({ flow: ingestReading, input: { galleryId: "west", tempC: 20, rh: 70 } })
    await scope.flush()
    expect(recorded).toEqual(["west"])

    await session.exec({ flow: ingestReading, input: { galleryId: "west", tempC: 20, rh: 50 } })
    await scope.flush()
    expect(recorded).toEqual(["west"])

    await session.exec({ flow: ingestReading, input: { galleryId: "west", tempC: 20, rh: 63 } })
    await scope.flush()
    expect(recorded).toEqual(["west", "west"])

    view.dispose()
    await scope.dispose()
    await monitor
  })

  it("alerts galleries already at risk when the monitor starts, exactly once", async () => {
    const recorded: string[] = []
    const scope = createScope({ tags: [alertChannel(recordingAlert(recorded))] })
    await scope.resolve(readings)
    const seedCtx = scope.createContext()
    await seedCtx.exec({ flow: ingestReading, input: { galleryId: "west", tempC: 20, rh: 62 } })
    await seedCtx.close({ ok: true })

    const view = scope.select(readings, atRiskOf, { eq: sameRoomSet })
    const session = scope.createContext()
    const monitor = session.exec({ flow: watchAtRisk, input: { view } })
    await scope.flush()
    expect(recorded).toEqual(["west"])

    await session.exec({ flow: ingestReading, input: { galleryId: "west", tempC: 20, rh: 40 } })
    await scope.flush()
    expect(recorded).toEqual(["west"])

    view.dispose()
    await scope.dispose()
    await monitor
  })

  it("coalesces a burst of updates safely: no missed newly-at-risk gallery, no duplicate alert", async () => {
    const recorded: string[] = []
    const scope = createScope({ tags: [alertChannel(recordingAlert(recorded))] })
    await scope.resolve(readings)
    const view = scope.select(readings, atRiskOf, { eq: sameRoomSet })
    const session = scope.createContext()
    const monitor = session.exec({ flow: watchAtRisk, input: { view } })

    await Promise.all([
      session.exec({ flow: ingestReading, input: { galleryId: "west", tempC: 20, rh: 62 } }),
      session.exec({ flow: ingestReading, input: { galleryId: "east", tempC: 21, rh: 45 } }),
      session.exec({ flow: ingestReading, input: { galleryId: "north", tempC: 19, rh: 30 } }),
    ])
    await scope.flush()

    expect(view.get()).toEqual(["north", "west"])
    expect(new Set(recorded)).toEqual(new Set(["north", "west"]))
    expect(recorded.length).toBe(new Set(recorded).size)

    view.dispose()
    await scope.dispose()
    await monitor
  })
})

describe("readings state lifecycle", () => {
  it("survives a period with zero observers instead of resetting", async () => {
    const scope = createScope()
    await scope.resolve(readings)
    const ctx = scope.createContext()
    await ctx.exec({ flow: ingestReading, input: { galleryId: "west", tempC: 20, rh: 62 } })

    const view = scope.select(readings, atRiskOf, { eq: sameRoomSet })
    view.dispose()

    await ctx.exec({ flow: ingestReading, input: { galleryId: "east", tempC: 21, rh: 45 } })
    const state = await scope.resolve(readings)
    expect(state).toEqual({
      west: { tempC: 20, rh: 62 },
      east: { tempC: 21, rh: 45 },
    })

    await ctx.close({ ok: true })
    await scope.dispose()
  })
})
