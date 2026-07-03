import { createScope, preset } from "@pumped-fn/lite"
import { actor, clock, createMemoryStore, store } from "@pumped-fn/parking-lot-shared"
import { describe, expect, test } from "vitest"
import { book, checkIn, configure, exit, pay, report } from "../src"

describe("parking lot TanStack Start handlers", () => {
  test("server-function handlers exec shared flows through Lite context", async () => {
    const backing = createMemoryStore()
    const fixedClock = { value: "2026-07-01T08:00:00.000Z" }
    const scope = createScope({
      presets: [preset(store, backing), preset(clock, () => fixedClock.value)],
    })
    const manager = scope.createContext({
      tags: [actor({ id: "manager-start", role: "manager" })],
    })
    const user = scope.createContext({
      tags: [actor({ id: "user-start", role: "user" })],
    })
    const operator = scope.createContext({
      tags: [actor({ id: "operator-start", role: "operator" })],
    })
    const exitOperator = scope.createContext({
      tags: [actor({ id: "operator-start", role: "operator" })],
    })

    fixedClock.value = "2026-07-01T08:00:00.000Z"
    const lot = await configure({
      context: { lite: manager },
      data: {
        bookingLeadMinutes: 60,
        capacity: 2,
        currency: "USD",
        graceMinutes: 0,
        name: "Start Garage",
        rateCentsPerHour: 900,
        refundWindowMinutes: 1440,
      },
    })
    fixedClock.value = "2026-07-01T08:10:00.000Z"
    const booking = await book({
      context: { lite: user },
      data: {
        endAt: "2026-07-01T12:00:00.000Z",
        lotId: lot.id,
        plate: "start-111",
        startAt: "2026-07-01T10:00:00.000Z",
      },
    })
    fixedClock.value = "2026-07-01T10:00:00.000Z"
    const session = await checkIn({
      context: { lite: operator },
      data: {
        lotId: lot.id,
        plate: "start-222",
        userId: booking.userId,
      },
    })
    fixedClock.value = "2026-07-01T10:50:00.000Z"
    const prepared = await exit({ context: { lite: exitOperator }, data: { sessionId: session.id } })
    const paired = await pay({
      context: { lite: exitOperator },
      data: {
        externalRef: "start-payment",
        method: "card",
        paymentId: prepared.payment.id,
      },
    })
    const current = await report({ context: { lite: manager }, data: {} })

    expect(paired.receipt).toMatchObject({ amountCents: 900, type: "charge" })
    expect(current.totals).toMatchObject({ revenueCents: 900 })

    await manager.close({ ok: true })
    await user.close({ ok: true })
    await operator.close({ ok: true })
    await exitOperator.close({ ok: true })
    await scope.dispose()
  })
})
