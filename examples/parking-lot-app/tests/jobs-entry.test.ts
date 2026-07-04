import { createScope, preset } from "@pumped-fn/lite"
import { pumped } from "@pumped-fn/pumped"
import { describe, expect, test } from "vitest"
import { actor, clock, createMemoryStore, expireBookings, store, type Actor } from "@pumped-fn/parking-lot-shared"

process.env["PARKING_ACTOR_ID"] = "ops-bot"
process.env["PARKING_ROLE"] = "operator"

const { default: app } = await import("../src/app")

const rider: Actor = { id: "user-1", role: "user" }

describe("JOB-01 expireBookings and the real pumped.jobRun tag", () => {
  test("rejects role != manager/operator inside a pumped.jobRun-tagged context", async () => {
    const backing = createMemoryStore()
    const scope = createScope({
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T09:20:00.000Z")],
      tags: [actor(rider), pumped.jobRun({ job: "expire-bookings", tickId: "tick-01" })],
    })
    const ctx = scope.createContext()

    expect(ctx.data.getTag(pumped.jobRun)).toMatchObject({ job: "expire-bookings" })

    await expect(ctx.exec({ flow: expireBookings, input: {} })).rejects.toMatchObject({
      fault: { kind: "forbidden", action: "expire bookings", actorId: rider.id },
    })

    await ctx.close({ ok: false, error: new Error("rejected") })
    await scope.dispose()
  })
})

describe("JOB-02 job ticks resolve the actor from scope-level tags, not app.context()", () => {
  test("a job tick through the real app config resolves the env-derived actor via tx, with no request in play", async () => {
    const backing = createMemoryStore()
    const manifest: pumped.Manifest = {
      app: { ...app, presets: [preset(store, backing), preset(clock, () => "2026-07-01T09:20:00.000Z")] },
      entries: [],
    }

    const scope = pumped.createAppScope(manifest)
    const ctx = scope.createContext()

    const result = await ctx.exec({ flow: expireBookings, input: {} })
    expect(result).toMatchObject({ closedSessions: [], expiredBookings: [] })

    await ctx.close({ ok: true })
    await scope.dispose()
  })

  test("app.context() is never consulted for a request-less job tick: the request-only actor override does not leak in", async () => {
    const backing = createMemoryStore()
    const manifest: pumped.Manifest = {
      app: { ...app, presets: [preset(store, backing), preset(clock, () => "2026-07-01T09:20:00.000Z")] },
      entries: [],
    }

    const scope = pumped.createAppScope(manifest)
    const ctx = scope.createContext()

    const found = ctx.data.seekTag(actor)
    expect(found).toEqual({ id: "ops-bot", role: "operator" })

    await ctx.close({ ok: true })
    await scope.dispose()
  })
})
