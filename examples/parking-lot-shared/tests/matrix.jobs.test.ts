import { createScope, preset, tag, type Lite } from "@pumped-fn/lite"
import { describe, expect, test } from "vitest"
import {
  actor,
  bookSpace,
  checkInVehicle,
  clock,
  configureLot,
  createMemoryStore,
  expireBookings,
  prepareExit,
  store,
  type Actor,
  type ParkingStore,
} from "../src"

const manager: Actor = { id: "manager-1", role: "manager" }
const operator: Actor = { id: "operator-1", role: "operator" }
const rider: Actor = { id: "user-1", role: "user" }

// `pumped.jobRun` (pkg/framework/pumped/src/tags.ts) is what a real job runner
// tags every scheduled-tick context with — it is not a dependency of this
// package, so this test defines a structurally identical tag with the same
// `tag()` primitive to drive expireBookings inside a job-identifying tagged
// context and prove the propagation mechanism works.
const jobRun = tag<{ job: string; tickId: string }>({ label: "test.jobRun" })

async function exec<T>(
  backing: ParkingStore,
  who: Actor,
  iso: string,
  fn: (ctx: Lite.ExecutionContext) => Promise<T>,
  extraTags: Lite.Tagged<any>[] = []
): Promise<T> {
  const scope = createScope({
    presets: [preset(store, backing), preset(clock, () => iso)],
    tags: [actor(who), ...extraTags],
  })
  const ctx = scope.createContext()
  try {
    return await fn(ctx)
  } finally {
    await ctx.close({ ok: true })
    await scope.dispose()
  }
}

function runJobTick<T>(backing: ParkingStore, iso: string, fn: (ctx: Lite.ExecutionContext) => Promise<T>) {
  return exec(backing, manager, iso, (ctx) => {
    expect(ctx.data.getTag(jobRun)).toMatchObject({ job: "expire-bookings" })
    return fn(ctx)
  }, [jobRun({ job: "expire-bookings", tickId: `tick-${iso}` })])
}

describe("JOB matrix", () => {
  test("JOB-01 expireBookings rejects role != manager/operator inside a jobRun-tagged context", async () => {
    const backing = createMemoryStore()

    await expect(exec(
      backing,
      rider,
      "2026-07-01T09:20:00.000Z",
      (ctx) => {
        expect(ctx.data.getTag(jobRun)).toMatchObject({ job: "expire-bookings" })
        return ctx.exec({ flow: expireBookings, input: {} })
      },
      [jobRun({ job: "expire-bookings", tickId: "tick-01" })]
    )).rejects.toMatchObject({ fault: { kind: "forbidden", action: "expire bookings", actorId: rider.id } })
  })

  test("JOB-02 expireBookings leaves a held booking exactly at the grace-window boundary untouched (no-op)", async () => {
    const backing = createMemoryStore()
    const lot = await exec(backing, manager, "2026-07-01T08:00:00.000Z", (ctx) =>
      ctx.exec({
        flow: configureLot,
        input: {
          bookingLeadMinutes: 60,
          capacity: 2,
          currency: "USD",
          graceMinutes: 15,
          name: "Job Boundary Lot",
          rateCentsPerHour: 500,
          refundWindowMinutes: 60,
        },
      }))
    const booking = await exec(backing, rider, "2026-07-01T08:05:00.000Z", (ctx) =>
      ctx.exec({
        flow: bookSpace,
        input: { endAt: "2026-07-01T12:00:00.000Z", lotId: lot.id, plate: "job-002", startAt: "2026-07-01T09:00:00.000Z" },
      }))

    // startAt 09:00 + graceMinutes 15 => boundary exactly 09:15:00.000
    const result = await runJobTick(backing, "2026-07-01T09:15:00.000Z", (ctx) =>
      ctx.exec({ flow: expireBookings, input: {} }))

    expect(result.expiredBookings).toHaveLength(0)
    expect(backing.booking(booking.id).status).toBe("held")
  })

  test("JOB-03 expireBookings cancels the held booking one ms past the grace-window boundary", async () => {
    const backing = createMemoryStore()
    const lot = await exec(backing, manager, "2026-07-01T08:00:00.000Z", (ctx) =>
      ctx.exec({
        flow: configureLot,
        input: {
          bookingLeadMinutes: 60,
          capacity: 2,
          currency: "USD",
          graceMinutes: 15,
          name: "Job Boundary Lot",
          rateCentsPerHour: 500,
          refundWindowMinutes: 60,
        },
      }))
    const booking = await exec(backing, rider, "2026-07-01T08:05:00.000Z", (ctx) =>
      ctx.exec({
        flow: bookSpace,
        input: { endAt: "2026-07-01T12:00:00.000Z", lotId: lot.id, plate: "job-003", startAt: "2026-07-01T09:00:00.000Z" },
      }))

    const result = await runJobTick(backing, "2026-07-01T09:15:00.001Z", (ctx) =>
      ctx.exec({ flow: expireBookings, input: {} }))

    expect(result.expiredBookings).toHaveLength(1)
    expect(result.expiredBookings[0]).toMatchObject({ id: booking.id, status: "cancelled" })
  })

  test("JOB-04 expireBookings does not force-collect exactly at the refund-window deadline (no-op)", async () => {
    const backing = createMemoryStore()
    const lot = await exec(backing, manager, "2026-07-01T08:00:00.000Z", (ctx) =>
      ctx.exec({
        flow: configureLot,
        input: {
          bookingLeadMinutes: 60,
          capacity: 2,
          currency: "USD",
          graceMinutes: 0,
          name: "Job Force-Collect Lot",
          rateCentsPerHour: 500,
          refundWindowMinutes: 30,
        },
      }))
    const session = await exec(backing, operator, "2026-07-01T09:00:00.000Z", (ctx) =>
      ctx.exec({ flow: checkInVehicle, input: { lotId: lot.id, plate: "job-004" } }))
    const prepared = await exec(backing, operator, "2026-07-01T10:00:00.000Z", (ctx) =>
      ctx.exec({ flow: prepareExit, input: { sessionId: session.id } }))

    // exitedAt 10:00 + refundWindowMinutes 30 => deadline exactly 10:30:00.000
    const result = await runJobTick(backing, "2026-07-01T10:30:00.000Z", (ctx) =>
      ctx.exec({ flow: expireBookings, input: {} }))

    expect(result.closedSessions).toHaveLength(0)
    expect(backing.payment(prepared.payment.id).status).toBe("pending")
  })

  test("JOB-05 expireBookings force-collects one ms past the refund-window deadline", async () => {
    const backing = createMemoryStore()
    const lot = await exec(backing, manager, "2026-07-01T08:00:00.000Z", (ctx) =>
      ctx.exec({
        flow: configureLot,
        input: {
          bookingLeadMinutes: 60,
          capacity: 2,
          currency: "USD",
          graceMinutes: 0,
          name: "Job Force-Collect Lot",
          rateCentsPerHour: 500,
          refundWindowMinutes: 30,
        },
      }))
    const session = await exec(backing, operator, "2026-07-01T09:00:00.000Z", (ctx) =>
      ctx.exec({ flow: checkInVehicle, input: { lotId: lot.id, plate: "job-005" } }))
    const prepared = await exec(backing, operator, "2026-07-01T10:00:00.000Z", (ctx) =>
      ctx.exec({ flow: prepareExit, input: { sessionId: session.id } }))

    const result = await runJobTick(backing, "2026-07-01T10:30:00.001Z", (ctx) =>
      ctx.exec({ flow: expireBookings, input: {} }))

    expect(result.closedSessions).toHaveLength(1)
    expect(result.closedSessions[0]).toMatchObject({
      payment: { id: prepared.payment.id, status: "paired" },
      session: { id: session.id, status: "released" },
    })
  })

  test("JOB-06 expireBookings aborts the whole batch with no per-item isolation when one stale booking references an unknown lot", async () => {
    const backing = createMemoryStore()
    const lot = await exec(backing, manager, "2026-07-01T08:00:00.000Z", (ctx) =>
      ctx.exec({
        flow: configureLot,
        input: {
          bookingLeadMinutes: 60,
          capacity: 2,
          currency: "USD",
          graceMinutes: 15,
          name: "Job Isolation Lot",
          rateCentsPerHour: 500,
          refundWindowMinutes: 60,
        },
      }))
    const goodBooking = await exec(backing, rider, "2026-07-01T08:05:00.000Z", (ctx) =>
      ctx.exec({
        flow: bookSpace,
        input: { endAt: "2026-07-01T12:00:00.000Z", lotId: lot.id, plate: "job-006-good", startAt: "2026-07-01T09:00:00.000Z" },
      }))
    const staleBooking = await exec(backing, rider, "2026-07-01T08:06:00.000Z", (ctx) =>
      ctx.exec({
        flow: bookSpace,
        input: { endAt: "2026-07-01T12:00:00.000Z", lotId: lot.id, plate: "job-006-stale", startAt: "2026-07-01T09:01:00.000Z" },
      }))

    // simulate a stale booking pointing at a lot that no longer exists
    backing.saveBooking({ ...backing.booking(staleBooking.id), lotId: "deleted-lot" })

    await expect(runJobTick(backing, "2026-07-01T09:30:00.000Z", (ctx) =>
      ctx.exec({ flow: expireBookings, input: {} })
    )).rejects.toThrow(/unknown lot: deleted-lot/)

    // no partial progress: the good booking, which would otherwise have expired
    // by this tick, is left untouched because the batch aborted before it committed.
    expect(backing.booking(goodBooking.id).status).toBe("held")
  })
})
