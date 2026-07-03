import { preset, type Lite } from "@pumped-fn/lite"
import { describe, expect, test } from "vitest"
import {
  checkInVehicle,
  configureLot,
  createMemoryStore,
  pairPayment,
  prepareExit,
  recordPaymentFailure,
  refundPayment,
  store,
  type Actor,
  type ParkingStore,
} from "../src"
import { parking } from "./harness"

const manager: Actor = { id: "manager-1", role: "manager" }
const operator: Actor = { id: "operator-1", role: "operator" }
const user: Actor = { id: "user-1", role: "user" }

async function exec<T>(
  backing: ParkingStore,
  who: Actor,
  iso: string,
  fn: (ctx: Lite.ExecutionContext) => Promise<T>
): Promise<T> {
  const { scope, ctx } = parking(iso, who, preset(store, backing))
  try {
    return await fn(ctx)
  } finally {
    await ctx.close({ ok: true })
    await scope.dispose()
  }
}

async function setupPendingPayment(backing: ParkingStore, refundWindowMinutes = 60) {
  const lot = await exec(backing, manager, "2026-07-01T08:00:00.000Z", (ctx) =>
    ctx.exec({
      flow: configureLot,
      input: {
        bookingLeadMinutes: 60,
        capacity: 2,
        currency: "USD",
        graceMinutes: 15,
        name: "Payment Matrix Lot",
        rateCentsPerHour: 500,
        refundWindowMinutes,
      },
    }))

  const session = await exec(backing, operator, "2026-07-01T09:00:00.000Z", (ctx) =>
    ctx.exec({ flow: checkInVehicle, input: { lotId: lot.id, plate: "pay-001" } }))

  const prepared = await exec(backing, operator, "2026-07-01T10:00:00.000Z", (ctx) =>
    ctx.exec({ flow: prepareExit, input: { sessionId: session.id } }))

  return { lot, session, prepared }
}

describe("PAY matrix", () => {
  test("PAY-01 pairPayment rejects role != operator", async () => {
    const backing = createMemoryStore()
    const { prepared } = await setupPendingPayment(backing)

    await expect(exec(backing, user, "2026-07-01T10:05:00.000Z", (ctx) =>
      ctx.exec({
        flow: pairPayment,
        input: { externalRef: "ext-1", method: "card", paymentId: prepared.payment.id },
      })
    )).rejects.toMatchObject({ fault: { kind: "forbidden", action: "pair payment", actorId: user.id } })
  })

  test("PAY-02 pairPayment rejects payment.status not in {pending, failed}", async () => {
    const backing = createMemoryStore()
    const { prepared } = await setupPendingPayment(backing)

    await exec(backing, operator, "2026-07-01T10:05:00.000Z", (ctx) =>
      ctx.exec({
        flow: pairPayment,
        input: { externalRef: "ext-1", method: "card", paymentId: prepared.payment.id },
      }))

    await expect(exec(backing, operator, "2026-07-01T10:06:00.000Z", (ctx) =>
      ctx.exec({
        flow: pairPayment,
        input: { externalRef: "ext-2", method: "card", paymentId: prepared.payment.id },
      })
    )).rejects.toMatchObject({
      fault: { kind: "conflict", entity: "payment", id: prepared.payment.id, from: "paired", attempted: "paired" },
    })
  })

  test("PAY-03 pairPayment double-submit same payment twice hits PAY-02 on the second call", async () => {
    const backing = createMemoryStore()
    const { prepared } = await setupPendingPayment(backing)
    const input = { externalRef: "ext-1", method: "card", paymentId: prepared.payment.id }

    const first = await exec(backing, operator, "2026-07-01T10:05:00.000Z", (ctx) =>
      ctx.exec({ flow: pairPayment, input }))
    expect(first.payment.status).toBe("paired")

    await expect(exec(backing, operator, "2026-07-01T10:05:01.000Z", (ctx) =>
      ctx.exec({ flow: pairPayment, input })
    )).rejects.toMatchObject({ fault: { kind: "conflict", entity: "payment", from: "paired" } })
  })

  test("PAY-04 pairPayment rejects unknown paymentId", async () => {
    const backing = createMemoryStore()
    await setupPendingPayment(backing)

    await expect(exec(backing, operator, "2026-07-01T10:05:00.000Z", (ctx) =>
      ctx.exec({
        flow: pairPayment,
        input: { externalRef: "ext-1", method: "card", paymentId: "missing-payment" },
      })
    )).rejects.toThrow(/unknown payment/)
  })

  test("PAY-05 pairPayment rejects when session was independently released (bug fix)", async () => {
    const backing = createMemoryStore()
    const { prepared, session } = await setupPendingPayment(backing)

    // simulate an out-of-band release (e.g. force-collect or an admin fixup) that the
    // original code never guarded against — session flips to "released" while the
    // payment is still "pending".
    backing.saveSession({ ...session, status: "released" })

    await expect(exec(backing, operator, "2026-07-01T10:05:00.000Z", (ctx) =>
      ctx.exec({
        flow: pairPayment,
        input: { externalRef: "ext-1", method: "card", paymentId: prepared.payment.id },
      })
    )).rejects.toMatchObject({
      fault: { kind: "conflict", entity: "session", id: session.id, from: "released", attempted: "release" },
    })
  })

  test("PAY-06 recordPaymentFailure rejects role != operator", async () => {
    const backing = createMemoryStore()
    const { prepared } = await setupPendingPayment(backing)

    await expect(exec(backing, manager, "2026-07-01T10:05:00.000Z", (ctx) =>
      ctx.exec({ flow: recordPaymentFailure, input: { paymentId: prepared.payment.id, reason: "card declined" } })
    )).rejects.toMatchObject({ fault: { kind: "forbidden", action: "record payment failure", actorId: manager.id } })
  })

  test("PAY-07 recordPaymentFailure rejects payment.status !== pending", async () => {
    const backing = createMemoryStore()
    const { prepared } = await setupPendingPayment(backing)

    await exec(backing, operator, "2026-07-01T10:05:00.000Z", (ctx) =>
      ctx.exec({
        flow: pairPayment,
        input: { externalRef: "ext-1", method: "card", paymentId: prepared.payment.id },
      }))

    await expect(exec(backing, operator, "2026-07-01T10:06:00.000Z", (ctx) =>
      ctx.exec({ flow: recordPaymentFailure, input: { paymentId: prepared.payment.id, reason: "late failure" } })
    )).rejects.toMatchObject({
      fault: { kind: "conflict", entity: "payment", id: prepared.payment.id, from: "paired", attempted: "failed" },
    })
  })

  test("PAY-08 recordPaymentFailure rejects unknown paymentId", async () => {
    const backing = createMemoryStore()
    await setupPendingPayment(backing)

    await expect(exec(backing, operator, "2026-07-01T10:05:00.000Z", (ctx) =>
      ctx.exec({ flow: recordPaymentFailure, input: { paymentId: "missing-payment", reason: "n/a" } })
    )).rejects.toThrow(/unknown payment/)
  })

  test("PAY-09 refundPayment rejects role != manager", async () => {
    const backing = createMemoryStore()
    const { prepared } = await setupPendingPayment(backing)

    await exec(backing, operator, "2026-07-01T10:05:00.000Z", (ctx) =>
      ctx.exec({
        flow: pairPayment,
        input: { externalRef: "ext-1", method: "card", paymentId: prepared.payment.id },
      }))

    await expect(exec(backing, operator, "2026-07-01T10:06:00.000Z", (ctx) =>
      ctx.exec({ flow: refundPayment, input: { paymentId: prepared.payment.id, reason: "customer request" } })
    )).rejects.toMatchObject({ fault: { kind: "forbidden", action: "refund payment", actorId: operator.id } })
  })

  test("PAY-10 refundPayment rejects payment.status not in {paired, disputed}", async () => {
    const backing = createMemoryStore()
    const { prepared } = await setupPendingPayment(backing)

    await expect(exec(backing, manager, "2026-07-01T10:05:00.000Z", (ctx) =>
      ctx.exec({ flow: refundPayment, input: { paymentId: prepared.payment.id, reason: "customer request" } })
    )).rejects.toMatchObject({
      fault: { kind: "conflict", entity: "payment", id: prepared.payment.id, from: "pending", attempted: "refunded" },
    })
  })

  test("PAY-11 refundPayment rejects unknown paymentId", async () => {
    const backing = createMemoryStore()
    await setupPendingPayment(backing)

    await expect(exec(backing, manager, "2026-07-01T10:05:00.000Z", (ctx) =>
      ctx.exec({ flow: refundPayment, input: { paymentId: "missing-payment", reason: "n/a" } })
    )).rejects.toThrow(/unknown payment/)
  })

  test("PAY-12a refundPayment succeeds exactly at the refund-window boundary (bug fix)", async () => {
    const backing = createMemoryStore()
    // exit at 10:00, refundWindowMinutes 60 -> deadline 11:00 exactly
    const { prepared } = await setupPendingPayment(backing, 60)

    await exec(backing, operator, "2026-07-01T10:05:00.000Z", (ctx) =>
      ctx.exec({
        flow: pairPayment,
        input: { externalRef: "ext-1", method: "card", paymentId: prepared.payment.id },
      }))

    const result = await exec(backing, manager, "2026-07-01T11:00:00.000Z", (ctx) =>
      ctx.exec({ flow: refundPayment, input: { paymentId: prepared.payment.id, reason: "customer request" } }))

    expect(result.payment.status).toBe("refunded")
  })

  test("PAY-12b refundPayment rejects one ms past the refund-window boundary for ANY role incl. manager (bug fix)", async () => {
    const backing = createMemoryStore()
    // exit at 10:00, refundWindowMinutes 60 -> deadline 11:00 exactly; 11:00:00.001 is one ms past
    const { prepared } = await setupPendingPayment(backing, 60)

    await exec(backing, operator, "2026-07-01T10:05:00.000Z", (ctx) =>
      ctx.exec({
        flow: pairPayment,
        input: { externalRef: "ext-1", method: "card", paymentId: prepared.payment.id },
      }))

    await expect(exec(backing, manager, "2026-07-01T11:00:00.001Z", (ctx) =>
      ctx.exec({ flow: refundPayment, input: { paymentId: prepared.payment.id, reason: "customer request" } })
    )).rejects.toMatchObject({
      fault: { kind: "conflict", entity: "payment", id: prepared.payment.id, from: "paired", attempted: "refund" },
    })
  })

  test("PAY-12c refundPayment traces the window-expired rejection as an observable error event", async () => {
    const backing = createMemoryStore()
    const { prepared } = await setupPendingPayment(backing, 60)

    await exec(backing, operator, "2026-07-01T10:05:00.000Z", (ctx) =>
      ctx.exec({
        flow: pairPayment,
        input: { externalRef: "ext-1", method: "card", paymentId: prepared.payment.id },
      }))

    const managerCtx = parking("2026-07-01T11:00:00.001Z", manager, preset(store, backing))

    await expect(managerCtx.ctx.exec({
      flow: refundPayment,
      input: { paymentId: prepared.payment.id, reason: "customer request" },
    })).rejects.toMatchObject({
      fault: { kind: "conflict", entity: "payment", from: "paired", attempted: "refund" },
    })

    await managerCtx.ctx.close({ ok: false, error: new Error("refund window expired") })
    await managerCtx.scope.dispose()

    const refundError = managerCtx.sink.events().find((event) => event.phase === "error" && event.name === "parking.refund-payment")
    expect(refundError).toBeDefined()
    expect((refundError?.error as { fault?: unknown } | undefined)?.fault).toMatchObject({
      kind: "conflict",
      entity: "payment",
      attempted: "refund",
    })
  })
})
