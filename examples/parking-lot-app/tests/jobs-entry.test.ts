import { createScope, preset } from "@pumped-fn/lite"
import { pumped } from "@pumped-fn/pumped"
import { describe, expect, test } from "vitest"
import { actor, clock, createMemoryStore, expireBookings, store, type Actor } from "@pumped-fn/parking-lot-shared"

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
