import { createScope, flow, type Lite, typed } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import { alertChannel, atRiskOf, ingestReading, readings, sameRoomSet, watchAtRisk } from "../src/climate.js"

const recordingAlert = (calls: string[]): Lite.Flow<void, { galleryId: string }> => flow({
  name: "record-alert",
  parse: typed<{ galleryId: string }>(),
  factory: (ctx) => {
    calls.push(ctx.input.galleryId)
  },
})

async function ingest(
  ctx: Lite.ExecutionContext,
  galleryId: string,
  rh: number,
  options: { note?: string; tempC?: number } = {},
): Promise<void> {
  await ctx.exec({
    flow: ingestReading,
    input: { galleryId, rh, tempC: options.tempC ?? 20, ...(options.note === undefined ? {} : { note: options.note }) },
  })
}

describe("museum climate watch", () => {
  it("derives sorted at-risk galleries and compares room sets by contents", () => {
    expect(atRiskOf({ west: { tempC: 20, rh: 55 }, east: { tempC: 21, rh: 56 }, attic: { tempC: 19, rh: 39 } }))
      .toEqual(["attic", "east"])
    expect(sameRoomSet(["east", "attic"], ["attic", "east"])).toBe(true)
    expect(sameRoomSet(["east", "attic"], ["east", "west"])).toBe(false)
  })

  it("notifies a selected view only when at-risk membership changes", async () => {
    const scope = createScope()
    await scope.resolve(readings)
    const view = scope.select(readings, atRiskOf, { eq: sameRoomSet })
    let notifications = 0
    const unsubscribe = view.subscribe(() => { notifications += 1 })
    const ctx = scope.createContext()

    await ingest(ctx, "safe", 45)
    await ingest(ctx, "safe", 50)
    await ingest(ctx, "east", 60)
    await ingest(ctx, "east", 61)
    await ingest(ctx, "west", 60)
    await ingest(ctx, "east", 50)

    expect(notifications).toBe(3)
    expect(view.get()).toEqual(["west"])
    unsubscribe()
    view.dispose()
    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("replaces a gallery reading wholesale", async () => {
    const scope = createScope()
    await scope.resolve(readings)
    const ctx = scope.createContext()

    await ingest(ctx, "north", 62, { note: "calibrated", tempC: 23 })
    await ingest(ctx, "north", 48, { tempC: 18 })

    expect((await scope.resolve(readings)).north).toEqual({ tempC: 18, rh: 48 })
    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("alerts on entry, ignores churn, and alerts again after recovery", async () => {
    const calls: string[] = []
    const scope = createScope({ tags: [alertChannel(recordingAlert(calls))] })
    await scope.resolve(readings)
    const view = scope.select(readings, atRiskOf, { eq: sameRoomSet })
    const session = scope.createContext()
    const monitor = session.exec({ flow: watchAtRisk, input: { view } })

    await ingest(session, "west", 62)
    await scope.flush()
    await ingest(session, "west", 63)
    await scope.flush()
    await ingest(session, "west", 45)
    await scope.flush()
    await ingest(session, "west", 38)
    await scope.flush()

    expect(calls).toEqual(["west", "west"])
    view.dispose()
    await scope.dispose()
    await monitor
  })

  it("drains the latest set safely after a burst of membership changes", async () => {
    const calls: string[] = []
    const scope = createScope({ tags: [alertChannel(recordingAlert(calls))] })
    await scope.resolve(readings)
    const view = scope.select(readings, atRiskOf, { eq: sameRoomSet })
    const session = scope.createContext()
    const monitor = session.exec({ flow: watchAtRisk, input: { view } })

    await ingest(session, "west", 62)
    await ingest(session, "east", 61)
    await ingest(session, "west", 44)
    await ingest(session, "north", 38)
    await ingest(session, "east", 42)
    await scope.flush()

    expect(calls.sort()).toEqual(["east", "north", "west"])
    view.dispose()
    await scope.dispose()
    await monitor
  })

  it("keeps readings during a zero-observer period", async () => {
    const scope = createScope()
    await scope.resolve(readings)
    const ctx = scope.createContext()
    await ingest(ctx, "vault", 58)
    const view = scope.select(readings, atRiskOf, { eq: sameRoomSet })
    view.dispose()

    expect((await scope.resolve(readings)).vault).toEqual({ tempC: 20, rh: 58 })
    await ctx.close({ ok: true })
    await scope.dispose()
  })
})
