import { createScope, preset } from "@pumped-fn/lite"
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
} from "../src"

describe("expireBookings", () => {
  test("cancels no-show held bookings past the grace window", async () => {
    const backing = createMemoryStore()
    const managerScope = createScope({
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T08:00:00.000Z")],
      tags: [actor({ id: "manager-1", role: "manager" })],
    })
    const manager = managerScope.createContext()
    const lot = await manager.exec({
      flow: configureLot,
      input: {
        bookingLeadMinutes: 60,
        capacity: 2,
        currency: "USD",
        graceMinutes: 15,
        name: "No-Show Lot",
        rateCentsPerHour: 500,
        refundWindowMinutes: 60,
      },
    })

    const userScope = createScope({
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T08:05:00.000Z")],
      tags: [actor({ id: "user-1", role: "user" })],
    })
    const user = userScope.createContext()
    const booking = await user.exec({
      flow: bookSpace,
      input: { endAt: "2026-07-01T12:00:00.000Z", lotId: lot.id, plate: "no-show", startAt: "2026-07-01T09:00:00.000Z" },
    })

    const jobScope = createScope({
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T09:20:00.000Z")],
      tags: [actor({ id: "manager-1", role: "manager" })],
    })
    const job = jobScope.createContext()
    const result = await job.exec({ flow: expireBookings, input: {} })

    expect(result.expiredBookings).toHaveLength(1)
    expect(result.expiredBookings[0]).toMatchObject({ id: booking.id, status: "cancelled" })
    expect(result.closedSessions).toHaveLength(0)

    await manager.close({ ok: true })
    await user.close({ ok: true })
    await job.close({ ok: true })
    await managerScope.dispose()
    await userScope.dispose()
    await jobScope.dispose()
  })

  test("force-collects payments and issues charge receipts past the refund window", async () => {
    const backing = createMemoryStore()
    const managerScope = createScope({
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T08:00:00.000Z")],
      tags: [actor({ id: "manager-1", role: "manager" })],
    })
    const manager = managerScope.createContext()
    const lot = await manager.exec({
      flow: configureLot,
      input: {
        bookingLeadMinutes: 60,
        capacity: 2,
        currency: "USD",
        graceMinutes: 0,
        name: "Stale Payment Lot",
        rateCentsPerHour: 500,
        refundWindowMinutes: 30,
      },
    })

    const operatorScope = createScope({
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T10:00:00.000Z")],
      tags: [actor({ id: "operator-1", role: "operator" })],
    })
    const operator = operatorScope.createContext()
    const session = await operator.exec({
      flow: checkInVehicle,
      input: { lotId: lot.id, plate: "stale-001" },
    })

    const exitScope = createScope({
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T11:00:00.000Z")],
      tags: [actor({ id: "operator-1", role: "operator" })],
    })
    const exit = exitScope.createContext()
    const prepared = await exit.exec({ flow: prepareExit, input: { sessionId: session.id } })

    const jobScope = createScope({
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T11:45:00.000Z")],
      tags: [actor({ id: "manager-1", role: "manager" })],
    })
    const job = jobScope.createContext()
    const result = await job.exec({ flow: expireBookings, input: {} })

    expect(result.closedSessions).toHaveLength(1)
    expect(result.closedSessions[0]).toMatchObject({
      payment: { id: prepared.payment.id, status: "paired" },
      receipt: { amountCents: prepared.payment.amountCents, type: "charge" },
      session: { id: session.id, status: "released" },
    })

    await manager.close({ ok: true })
    await operator.close({ ok: true })
    await exit.close({ ok: true })
    await job.close({ ok: true })
    await managerScope.dispose()
    await operatorScope.dispose()
    await exitScope.dispose()
    await jobScope.dispose()
  })
})
