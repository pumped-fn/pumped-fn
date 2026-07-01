import { describe, expect, test } from "vitest"
import { createMemoryStore } from "@pumped-fn/parking-lot-shared"
import { book, checkIn, configure, exit, fail, pay, report } from "../src"

describe("parking lot CLI commands", () => {
  test("executes shared flows through per-command scopes", async () => {
    const backing = createMemoryStore()
    const manager = { actor: { id: "manager-cli", role: "manager" as const }, at: "2026-07-01T08:00:00.000Z", store: backing }
    const operator = { actor: { id: "operator-cli", role: "operator" as const }, at: "2026-07-01T10:00:00.000Z", store: backing }
    const user = { actor: { id: "user-cli", role: "user" as const }, at: "2026-07-01T08:10:00.000Z", store: backing }

    const lot = await configure(manager, {
      bookingLeadMinutes: 60,
      capacity: 3,
      currency: "USD",
      graceMinutes: 0,
      name: "CLI Garage",
      rateCentsPerHour: 400,
      refundWindowMinutes: 1440,
    })
    const booking = await book(user, {
      endAt: "2026-07-01T12:00:00.000Z",
      lotId: lot.id,
      plate: "cli-123",
      startAt: "2026-07-01T10:00:00.000Z",
    })
    expect(booking).toMatchObject({ status: "held", userId: "user-cli" })

    const session = await checkIn(operator, { lotId: lot.id, plate: "cli-456", userId: "user-cli" })
    const prepared = await exit({ ...operator, at: "2026-07-01T11:20:00.000Z" }, { sessionId: session.id })
    const paired = await pay(operator, { externalRef: "cli-payment", method: "card", paymentId: prepared.payment.id })
    const failedSession = await checkIn(operator, { lotId: lot.id, plate: "cli-789", userId: "user-cli" })
    const failedExit = await exit({ ...operator, at: "2026-07-01T11:20:00.000Z" }, { sessionId: failedSession.id })
    const failed = await fail(operator, { paymentId: failedExit.payment.id, reason: "cash drawer mismatch" })
    const current = await report(manager, {})

    expect(paired.receipt).toMatchObject({ type: "charge" })
    expect(failed).toMatchObject({ status: "failed" })
    expect(current.totals).toMatchObject({ failedPayments: 1, revenueCents: 800 })
  })
})
