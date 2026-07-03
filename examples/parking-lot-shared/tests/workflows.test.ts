import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createScope, flow, preset, typed } from "@pumped-fn/lite"
import type { AmountDueInput } from "../src"
import { describe, expect, test } from "vitest"
import {
  acceptedWorkflows,
  actor,
  amountDue,
  bookSpace,
  cancelBooking,
  checkInBooking,
  checkInVehicle,
  clock,
  configureLot,
  createMemoryStore,
  listReceipts,
  openDispute,
  pairPayment,
  prepareExit,
  readReport,
  recordPaymentFailure,
  refundPayment,
  resolveDispute,
  store,
} from "../src"
import { createSqliteStore } from "../src/sqlite"

describe("parking lot workflows", () => {
  test("accepts a real multi-role workflow matrix through the scope seam", async () => {
    const backing = createMemoryStore()
    const managerScope = createScope({
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T08:00:00.000Z")],
      tags: [actor({ id: "manager-1", role: "manager" })],
    })
    const manager = managerScope.createContext()

    const lot = await manager.exec({
      flow: configureLot,
      input: {
        bookingLeadMinutes: 120,
        capacity: 2,
        currency: "USD",
        graceMinutes: 10,
        name: "Central Garage",
        rateCentsPerHour: 500,
        refundWindowMinutes: 1440,
      },
    })

    const userScope = createScope({
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T08:05:00.000Z")],
      tags: [actor({ id: "user-1", role: "user" })],
    })
    const user = userScope.createContext()

    const cancelled = await user.exec({
      flow: bookSpace,
      input: {
        endAt: "2026-07-02T10:00:00.000Z",
        lotId: lot.id,
        plate: "abc-111",
        startAt: "2026-07-02T08:00:00.000Z",
      },
    })
    expect(await user.exec({ flow: cancelBooking, input: { bookingId: cancelled.id } })).toMatchObject({
      status: "cancelled",
    })

    const booking = await user.exec({
      flow: bookSpace,
      input: {
        endAt: "2026-07-02T12:00:00.000Z",
        lotId: lot.id,
        plate: "abc-222",
        startAt: "2026-07-02T08:00:00.000Z",
      },
    })

    const operatorScope = createScope({
      presets: [preset(store, backing), preset(clock, () => "2026-07-02T08:10:00.000Z")],
      tags: [actor({ id: "operator-1", role: "operator" })],
    })
    const operator = operatorScope.createContext()
    const bookedSession = await operator.exec({ flow: checkInBooking, input: { bookingId: booking.id } })

    const exitScope = createScope({
      presets: [preset(store, backing), preset(clock, () => "2026-07-02T10:20:00.000Z")],
      tags: [actor({ id: "operator-1", role: "operator" })],
    })
    const exit = exitScope.createContext()
    const bookedExit = await exit.exec({ flow: prepareExit, input: { sessionId: bookedSession.id } })
    const bookedPair = await exit.exec({
      flow: pairPayment,
      input: {
        externalRef: "pay-booked",
        method: "card",
        paymentId: bookedExit.payment.id,
      },
    })

    expect(bookedPair.receipt).toMatchObject({ amountCents: 1000, type: "charge" })
    expect(await user.exec({ flow: listReceipts, input: {} })).toHaveLength(1)

    const driveUp = await operator.exec({
      flow: checkInVehicle,
      input: {
        lotId: lot.id,
        plate: "xyz-333",
        userId: "user-1",
      },
    })
    const failedExit = await exit.exec({ flow: prepareExit, input: { sessionId: driveUp.id } })
    expect(await exit.exec({
      flow: recordPaymentFailure,
      input: {
        paymentId: failedExit.payment.id,
        reason: "terminal timeout",
      },
    })).toMatchObject({ status: "failed" })

    const disputeSession = await operator.exec({
      flow: checkInVehicle,
      input: {
        lotId: lot.id,
        plate: "xyz-444",
        userId: "user-1",
      },
    })
    const disputeExit = await exit.exec({ flow: prepareExit, input: { sessionId: disputeSession.id } })
    const disputePair = await exit.exec({
      flow: pairPayment,
      input: {
        externalRef: "pay-dispute",
        method: "wallet",
        paymentId: disputeExit.payment.id,
      },
    })
    const opened = await user.exec({
      flow: openDispute,
      input: {
        paymentId: disputePair.payment.id,
        reason: "gate stayed closed after payment",
      },
    })
    const resolved = await manager.exec({
      flow: resolveDispute,
      input: {
        decision: "accepted",
        disputeId: opened.dispute.id,
      },
    })
    const refunded = await manager.exec({
      flow: refundPayment,
      input: {
        paymentId: bookedPair.payment.id,
        reason: "operator courtesy",
      },
    })
    const report = await manager.exec({ flow: readReport, input: { lotId: lot.id } })

    expect(acceptedWorkflows).toHaveLength(12)
    expect(acceptedWorkflows.length).toBeGreaterThanOrEqual(10)
    expect(resolved).toMatchObject({ dispute: { status: "accepted" }, payment: { status: "refunded" } })
    expect(refunded.receipt).toMatchObject({ amountCents: -1000, type: "refund" })
    expect(report.totals).toMatchObject({
      failedPayments: 1,
      openDisputes: 0,
      parked: 0,
      revenueCents: 2000,
    })

    await manager.close({ ok: true })
    await user.close({ ok: true })
    await operator.close({ ok: true })
    await exit.close({ ok: true })
    await managerScope.dispose()
    await userScope.dispose()
    await operatorScope.dispose()
    await exitScope.dispose()
  })

  test("enforces role boundaries through tags", async () => {
    const scope = createScope({
      presets: [preset(clock, () => "2026-07-01T08:00:00.000Z")],
      tags: [actor({ id: "user-1", role: "user" })],
    })
    const ctx = scope.createContext()

    await expect(ctx.exec({
      flow: configureLot,
      input: {
        bookingLeadMinutes: 60,
        capacity: 1,
        currency: "USD",
        graceMinutes: 0,
        name: "Side Lot",
        rateCentsPerHour: 300,
        refundWindowMinutes: 60,
      },
    })).rejects.toThrow("role user cannot configure lot")

    await ctx.close({ ok: true })
    await scope.dispose()
  })

  test("keeps SQLite behind the same store atom seam", async () => {
    const dir = mkdtempSync(join(tmpdir(), "parking-lot-"))
    const path = join(dir, "parking.sqlite")
    const sqlite = createSqliteStore(path)
    const scope = createScope({
      presets: [preset(store, sqlite), preset(clock, () => "2026-07-01T08:00:00.000Z")],
      tags: [actor({ id: "manager-1", role: "manager" })],
    })
    const ctx = scope.createContext()

    const lot = await ctx.exec({
      flow: configureLot,
      input: {
        bookingLeadMinutes: 60,
        capacity: 4,
        currency: "USD",
        graceMinutes: 5,
        name: "SQLite Garage",
        rateCentsPerHour: 700,
        refundWindowMinutes: 720,
      },
    })

    await ctx.close({ ok: true })
    await scope.dispose()
    sqlite.close()

    const reopened = createSqliteStore(path)
    expect(reopened.lot(lot.id)).toMatchObject({ name: "SQLite Garage", rateCentsPerHour: 700 })
    reopened.close()
    rmSync(dir, { force: true, recursive: true })
  })

  test("substitutes the amount-due rule flow to change prepareExit's pricing policy", async () => {
    const backing = createMemoryStore()
    const flatFee = flow({
      name: "flat-fee-pricing",
      parse: typed<AmountDueInput>(),
      factory: () => 250,
    })
    const managerScope = createScope({
      presets: [preset(store, backing), preset(amountDue, flatFee), preset(clock, () => "2026-07-01T08:00:00.000Z")],
      tags: [actor({ id: "manager-1", role: "manager" })],
    })
    const manager = managerScope.createContext()
    const lot = await manager.exec({
      flow: configureLot,
      input: {
        bookingLeadMinutes: 60,
        capacity: 4,
        currency: "USD",
        graceMinutes: 0,
        name: "Flat Fee Garage",
        rateCentsPerHour: 900,
        refundWindowMinutes: 60,
      },
    })

    const operatorScope = createScope({
      presets: [preset(store, backing), preset(amountDue, flatFee), preset(clock, () => "2026-07-01T08:10:00.000Z")],
      tags: [actor({ id: "operator-1", role: "operator" })],
    })
    const operator = operatorScope.createContext()
    const session = await operator.exec({
      flow: checkInVehicle,
      input: { lotId: lot.id, plate: "flat-001" },
    })
    const exit = await operator.exec({ flow: prepareExit, input: { sessionId: session.id } })

    expect(exit.payment.amountCents).toBe(250)

    await manager.close({ ok: true })
    await operator.close({ ok: true })
    await managerScope.dispose()
    await operatorScope.dispose()
  })
})
