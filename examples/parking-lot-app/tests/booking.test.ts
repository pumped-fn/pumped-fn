import { createScope, preset } from "@pumped-fn/lite"
import { describe, expect, test } from "vitest"
import {
  actor,
  bookSpace,
  checkInVehicle,
  clock,
  configureLot,
  createMemoryStore,
  prepareExit,
  store,
} from "@pumped-fn/parking-lot-shared"

describe("parking lot app domain", () => {
  test("configures a lot, books a space, checks in and prepares exit through the scope seam", async () => {
    const backing = createMemoryStore()
    const scope = createScope({
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T08:00:00.000Z")],
      tags: [actor({ id: "manager-1", role: "manager" })],
    })
    const manager = scope.createContext()

    const lot = await manager.exec({
      flow: configureLot,
      input: {
        bookingLeadMinutes: 120,
        capacity: 2,
        currency: "USD",
        graceMinutes: 10,
        name: "Downtown",
        rateCentsPerHour: 500,
        refundWindowMinutes: 1440,
      },
    })

    const userScope = createScope({
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T08:05:00.000Z")],
      tags: [actor({ id: "user-1", role: "user" })],
    })
    const user = userScope.createContext()
    const booking = await user.exec({
      flow: bookSpace,
      input: { endAt: "2026-07-01T12:00:00.000Z", lotId: lot.id, plate: "abc-123", startAt: "2026-07-01T10:00:00.000Z" },
    })
    expect(booking.status).toBe("held")

    const operatorScope = createScope({
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T10:05:00.000Z")],
      tags: [actor({ id: "operator-1", role: "operator" })],
    })
    const operator = operatorScope.createContext()
    const session = await operator.exec({
      flow: checkInVehicle,
      input: { lotId: lot.id, plate: "xyz-999" },
    })
    expect(session.status).toBe("parked")

    const exitScope = createScope({
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T11:05:00.000Z")],
      tags: [actor({ id: "operator-1", role: "operator" })],
    })
    const exit = await exitScope.createContext().exec({
      flow: prepareExit,
      input: { sessionId: session.id },
    })
    expect(exit.payment.amountCents).toBeGreaterThan(0)

    await manager.close({ ok: true })
    await user.close({ ok: true })
    await operator.close({ ok: true })
    await scope.dispose()
    await userScope.dispose()
    await operatorScope.dispose()
    await exitScope.dispose()
  })
})
