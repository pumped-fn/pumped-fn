import { createScope, preset, type Lite } from "@pumped-fn/lite"
import { describe, expect, test } from "vitest"
import {
  actor,
  checkInVehicle,
  clock,
  configureLot,
  createMemoryStore,
  openDispute,
  pairPayment,
  prepareExit,
  resolveDispute,
  store,
  type Actor,
  type ParkingStore,
} from "../src"

const manager: Actor = { id: "manager-1", role: "manager" }
const operator: Actor = { id: "operator-1", role: "operator" }
const rider: Actor = { id: "user-1", role: "user" }
const otherRider: Actor = { id: "user-2", role: "user" }

async function exec<T>(
  backing: ParkingStore,
  who: Actor,
  iso: string,
  fn: (ctx: Lite.ExecutionContext) => Promise<T>
): Promise<T> {
  const scope = createScope({
    presets: [preset(store, backing), preset(clock, () => iso)],
    tags: [actor(who)],
  })
  const ctx = scope.createContext()
  try {
    return await fn(ctx)
  } finally {
    await ctx.close({ ok: true })
    await scope.dispose()
  }
}

async function setupPairedPayment(backing: ParkingStore) {
  const lot = await exec(backing, manager, "2026-07-01T08:00:00.000Z", (ctx) =>
    ctx.exec({
      flow: configureLot,
      input: {
        bookingLeadMinutes: 60,
        capacity: 2,
        currency: "USD",
        graceMinutes: 15,
        name: "Dispute Matrix Lot",
        rateCentsPerHour: 500,
        refundWindowMinutes: 120,
      },
    }))

  const session = await exec(backing, operator, "2026-07-01T09:00:00.000Z", (ctx) =>
    ctx.exec({ flow: checkInVehicle, input: { lotId: lot.id, plate: "dis-001", userId: rider.id } }))

  const prepared = await exec(backing, operator, "2026-07-01T10:00:00.000Z", (ctx) =>
    ctx.exec({ flow: prepareExit, input: { sessionId: session.id } }))

  const paired = await exec(backing, operator, "2026-07-01T10:05:00.000Z", (ctx) =>
    ctx.exec({
      flow: pairPayment,
      input: { externalRef: "ext-1", method: "card", paymentId: prepared.payment.id },
    }))

  return { lot, session, paired }
}

describe("DISPUTE matrix", () => {
  test("DISPUTE-01 openDispute rejects role != user", async () => {
    const backing = createMemoryStore()
    const { paired } = await setupPairedPayment(backing)

    await expect(exec(backing, manager, "2026-07-01T10:10:00.000Z", (ctx) =>
      ctx.exec({ flow: openDispute, input: { paymentId: paired.payment.id, reason: "overcharged" } })
    )).rejects.toMatchObject({ fault: { kind: "forbidden", action: "open dispute", actorId: manager.id } })
  })

  test("DISPUTE-02 openDispute rejects a non-owner disputing another user's payment", async () => {
    const backing = createMemoryStore()
    const { paired } = await setupPairedPayment(backing)

    await expect(exec(backing, otherRider, "2026-07-01T10:10:00.000Z", (ctx) =>
      ctx.exec({ flow: openDispute, input: { paymentId: paired.payment.id, reason: "overcharged" } })
    )).rejects.toMatchObject({
      fault: { kind: "forbidden", action: `dispute payment ${paired.payment.id}`, actorId: otherRider.id },
    })
  })

  test("DISPUTE-03 openDispute rejects payment.status !== paired", async () => {
    const backing = createMemoryStore()
    const { paired } = await setupPairedPayment(backing)

    await exec(backing, rider, "2026-07-01T10:10:00.000Z", (ctx) =>
      ctx.exec({ flow: openDispute, input: { paymentId: paired.payment.id, reason: "overcharged" } }))

    await expect(exec(backing, rider, "2026-07-01T10:11:00.000Z", (ctx) =>
      ctx.exec({ flow: openDispute, input: { paymentId: paired.payment.id, reason: "again" } })
    )).rejects.toMatchObject({
      fault: { kind: "conflict", entity: "payment", id: paired.payment.id, from: "disputed", attempted: "disputed" },
    })
  })

  test("DISPUTE-04 openDispute rejects unknown paymentId", async () => {
    const backing = createMemoryStore()
    await setupPairedPayment(backing)

    await expect(exec(backing, rider, "2026-07-01T10:10:00.000Z", (ctx) =>
      ctx.exec({ flow: openDispute, input: { paymentId: "missing-payment", reason: "overcharged" } })
    )).rejects.toThrow(/unknown payment/)
  })

  test("DISPUTE-05 resolveDispute rejects role != manager", async () => {
    const backing = createMemoryStore()
    const { paired } = await setupPairedPayment(backing)

    const dispute = await exec(backing, rider, "2026-07-01T10:10:00.000Z", (ctx) =>
      ctx.exec({ flow: openDispute, input: { paymentId: paired.payment.id, reason: "overcharged" } }))

    await expect(exec(backing, operator, "2026-07-01T10:20:00.000Z", (ctx) =>
      ctx.exec({ flow: resolveDispute, input: { decision: "accepted", disputeId: dispute.dispute.id } })
    )).rejects.toMatchObject({ fault: { kind: "forbidden", action: "resolve dispute", actorId: operator.id } })
  })

  test("DISPUTE-06 resolveDispute rejects dispute.status !== open", async () => {
    const backing = createMemoryStore()
    const { paired } = await setupPairedPayment(backing)

    const dispute = await exec(backing, rider, "2026-07-01T10:10:00.000Z", (ctx) =>
      ctx.exec({ flow: openDispute, input: { paymentId: paired.payment.id, reason: "overcharged" } }))

    await exec(backing, manager, "2026-07-01T10:20:00.000Z", (ctx) =>
      ctx.exec({ flow: resolveDispute, input: { decision: "rejected", disputeId: dispute.dispute.id } }))

    await expect(exec(backing, manager, "2026-07-01T10:21:00.000Z", (ctx) =>
      ctx.exec({ flow: resolveDispute, input: { decision: "accepted", disputeId: dispute.dispute.id } })
    )).rejects.toMatchObject({
      fault: { kind: "conflict", entity: "dispute", id: dispute.dispute.id, from: "rejected", attempted: "accepted" },
    })
  })

  test("DISPUTE-07 resolveDispute rejects unknown disputeId", async () => {
    const backing = createMemoryStore()
    await setupPairedPayment(backing)

    await expect(exec(backing, manager, "2026-07-01T10:10:00.000Z", (ctx) =>
      ctx.exec({ flow: resolveDispute, input: { decision: "accepted", disputeId: "missing-dispute" } })
    )).rejects.toThrow(/unknown dispute/)
  })

  test("DISPUTE-08 resolveDispute rejects when the payment was independently refunded while the dispute stayed open (bug fix)", async () => {
    const backing = createMemoryStore()
    const { paired } = await setupPairedPayment(backing)

    const dispute = await exec(backing, rider, "2026-07-01T10:10:00.000Z", (ctx) =>
      ctx.exec({ flow: openDispute, input: { paymentId: paired.payment.id, reason: "overcharged" } }))

    // simulate an out-of-band refund (e.g. a separate support tool) that never
    // touches the dispute record — the dispute's own status guard alone would
    // have let resolveDispute silently overwrite this back to paired/refunded.
    const disputedPayment = dispute.payment
    backing.savePayment({ ...disputedPayment, refundedAt: "2026-07-01T10:15:00.000Z", status: "refunded" })

    await expect(exec(backing, manager, "2026-07-01T10:20:00.000Z", (ctx) =>
      ctx.exec({ flow: resolveDispute, input: { decision: "rejected", disputeId: dispute.dispute.id } })
    )).rejects.toMatchObject({
      fault: {
        kind: "conflict",
        entity: "payment",
        id: disputedPayment.id,
        from: "refunded",
        attempted: "resolve-dispute",
      },
    })
  })
})
