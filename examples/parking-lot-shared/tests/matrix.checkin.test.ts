import { preset } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import { bookSpace, checkInBooking, checkInVehicle, configureLot, createMemoryStore, store } from "../src"
import { parking } from "./harness"

describe("check-in matrix", () => {
  it("CHECKIN-01 rejects checkInVehicle when actor role is not operator", async () => {
    const backing = createMemoryStore()
    const manager = parking("2026-07-01T08:00:00.000Z", { id: "manager-1", role: "manager" }, preset(store, backing))
    const lot = await manager.ctx.exec({
      flow: configureLot,
      input: {
        bookingLeadMinutes: 60,
        capacity: 2,
        currency: "USD",
        graceMinutes: 0,
        name: "Check-in Lot",
        rateCentsPerHour: 500,
        refundWindowMinutes: 60,
      },
    })

    const user = parking("2026-07-01T08:05:00.000Z", { id: "user-1", role: "user" }, preset(store, backing))

    await expect(user.ctx.exec({
      flow: checkInVehicle,
      input: { lotId: lot.id, plate: "abc-111" },
    })).rejects.toMatchObject({ fault: { kind: "forbidden", action: "check in vehicle", actorId: "user-1" } })

    const events = user.sink.events().filter((event) => event.phase === "error")
    expect(events.some((event) => event.name === "parking.rule.allow")).toBe(true)
    expect(events.some((event) => event.name === "parking.check-in-vehicle")).toBe(true)

    await manager.ctx.close({ ok: true })
    await user.ctx.close({ ok: false, error: new Error("rejected") })
    await manager.scope.dispose()
    await user.scope.dispose()
  })

  it("CHECKIN-02 rejects checkInVehicle at exact drive-up capacity boundary", async () => {
    const backing = createMemoryStore()
    const manager = parking("2026-07-01T08:00:00.000Z", { id: "manager-1", role: "manager" }, preset(store, backing))
    const lot = await manager.ctx.exec({
      flow: configureLot,
      input: {
        bookingLeadMinutes: 60,
        capacity: 1,
        currency: "USD",
        graceMinutes: 0,
        name: "Tight Check-in Lot",
        rateCentsPerHour: 500,
        refundWindowMinutes: 60,
      },
    })

    const operator = parking("2026-07-01T08:05:00.000Z", { id: "operator-1", role: "operator" }, preset(store, backing))
    await operator.ctx.exec({ flow: checkInVehicle, input: { lotId: lot.id, plate: "abc-111" } })

    const operator2 = parking("2026-07-01T08:06:00.000Z", { id: "operator-2", role: "operator" }, preset(store, backing))

    await expect(operator2.ctx.exec({
      flow: checkInVehicle,
      input: { lotId: lot.id, plate: "abc-222" },
    })).rejects.toMatchObject({ fault: { kind: "unavailable", entity: "lot", id: lot.id, reason: "drive-up-capacity" } })

    const events = operator2.sink.events().filter((event) => event.phase === "error")
    expect(events.some((event) => event.name === "parking.rule.assert-drive-up-capacity")).toBe(true)

    await manager.ctx.close({ ok: true })
    await operator.ctx.close({ ok: true })
    await operator2.ctx.close({ ok: false, error: new Error("rejected") })
    await manager.scope.dispose()
    await operator.scope.dispose()
    await operator2.scope.dispose()
  })

  it("CHECKIN-03 accepts checkInVehicle one under drive-up capacity", async () => {
    const backing = createMemoryStore()
    const manager = parking("2026-07-01T08:00:00.000Z", { id: "manager-1", role: "manager" }, preset(store, backing))
    const lot = await manager.ctx.exec({
      flow: configureLot,
      input: {
        bookingLeadMinutes: 60,
        capacity: 2,
        currency: "USD",
        graceMinutes: 0,
        name: "Roomy Check-in Lot",
        rateCentsPerHour: 500,
        refundWindowMinutes: 60,
      },
    })

    const operator = parking("2026-07-01T08:05:00.000Z", { id: "operator-1", role: "operator" }, preset(store, backing))
    await operator.ctx.exec({ flow: checkInVehicle, input: { lotId: lot.id, plate: "abc-111" } })
    const second = await operator.ctx.exec({ flow: checkInVehicle, input: { lotId: lot.id, plate: "abc-222" } })

    expect(second).toMatchObject({ lotId: lot.id, status: "parked" })

    await manager.ctx.close({ ok: true })
    await operator.ctx.close({ ok: true })
    await manager.scope.dispose()
    await operator.scope.dispose()
  })

  it("CHECKIN-04 rejects checkInVehicle for an unknown lotId", async () => {
    const backing = createMemoryStore()
    const operator = parking("2026-07-01T08:00:00.000Z", { id: "operator-1", role: "operator" }, preset(store, backing))

    await expect(operator.ctx.exec({
      flow: checkInVehicle,
      input: { lotId: "missing-lot", plate: "abc-111" },
    })).rejects.toMatchObject({ entity: "lot", id: "missing-lot" })

    await operator.ctx.close({ ok: false, error: new Error("rejected") })
    await operator.scope.dispose()
  })

  it("CHECKIN-05 accepts checkInVehicle with no userId (drive-up, no user)", async () => {
    const backing = createMemoryStore()
    const manager = parking("2026-07-01T08:00:00.000Z", { id: "manager-1", role: "manager" }, preset(store, backing))
    const lot = await manager.ctx.exec({
      flow: configureLot,
      input: {
        bookingLeadMinutes: 60,
        capacity: 2,
        currency: "USD",
        graceMinutes: 0,
        name: "No User Lot",
        rateCentsPerHour: 500,
        refundWindowMinutes: 60,
      },
    })

    const operator = parking("2026-07-01T08:05:00.000Z", { id: "operator-1", role: "operator" }, preset(store, backing))
    const session = await operator.ctx.exec({ flow: checkInVehicle, input: { lotId: lot.id, plate: "abc-111" } })

    expect(session).toMatchObject({ lotId: lot.id, status: "parked", userId: undefined })

    await manager.ctx.close({ ok: true })
    await operator.ctx.close({ ok: true })
    await manager.scope.dispose()
    await operator.scope.dispose()
  })

  it("CHECKIN-06 rejects checkInBooking when actor role is not operator", async () => {
    const backing = createMemoryStore()
    const manager = parking("2026-07-01T08:00:00.000Z", { id: "manager-1", role: "manager" }, preset(store, backing))
    const lot = await manager.ctx.exec({
      flow: configureLot,
      input: {
        bookingLeadMinutes: 60,
        capacity: 2,
        currency: "USD",
        graceMinutes: 0,
        name: "Booking Check-in Lot",
        rateCentsPerHour: 500,
        refundWindowMinutes: 60,
      },
    })

    const user = parking("2026-07-01T08:05:00.000Z", { id: "user-1", role: "user" }, preset(store, backing))
    const booking = await user.ctx.exec({
      flow: bookSpace,
      input: { endAt: "2026-07-02T10:00:00.000Z", lotId: lot.id, plate: "abc-111", startAt: "2026-07-02T08:00:00.000Z" },
    })

    const user2 = parking("2026-07-01T08:06:00.000Z", { id: "user-1", role: "user" }, preset(store, backing))

    await expect(user2.ctx.exec({
      flow: checkInBooking,
      input: { bookingId: booking.id },
    })).rejects.toMatchObject({ fault: { kind: "forbidden", action: "check in booking", actorId: "user-1" } })

    const events = user2.sink.events().filter((event) => event.phase === "error")
    expect(events.some((event) => event.name === "parking.rule.allow")).toBe(true)
    expect(events.some((event) => event.name === "parking.check-in-booking")).toBe(true)

    await manager.ctx.close({ ok: true })
    await user.ctx.close({ ok: true })
    await user2.ctx.close({ ok: false, error: new Error("rejected") })
    await manager.scope.dispose()
    await user.scope.dispose()
    await user2.scope.dispose()
  })

  it("CHECKIN-07 rejects checkInBooking when the booking is not held", async () => {
    const backing = createMemoryStore()
    const manager = parking("2026-07-01T08:00:00.000Z", { id: "manager-1", role: "manager" }, preset(store, backing))
    const lot = await manager.ctx.exec({
      flow: configureLot,
      input: {
        bookingLeadMinutes: 60,
        capacity: 2,
        currency: "USD",
        graceMinutes: 0,
        name: "Not Held Check-in Lot",
        rateCentsPerHour: 500,
        refundWindowMinutes: 60,
      },
    })

    const user = parking("2026-07-01T08:05:00.000Z", { id: "user-1", role: "user" }, preset(store, backing))
    const booking = await user.ctx.exec({
      flow: bookSpace,
      input: { endAt: "2026-07-02T10:00:00.000Z", lotId: lot.id, plate: "abc-111", startAt: "2026-07-02T08:00:00.000Z" },
    })
    const operator = parking("2026-07-01T08:06:00.000Z", { id: "operator-1", role: "operator" }, preset(store, backing))
    await operator.ctx.exec({ flow: checkInBooking, input: { bookingId: booking.id } })

    const operator2 = parking("2026-07-01T08:07:00.000Z", { id: "operator-1", role: "operator" }, preset(store, backing))

    await expect(operator2.ctx.exec({
      flow: checkInBooking,
      input: { bookingId: booking.id },
    })).rejects.toMatchObject({
      fault: { kind: "conflict", entity: "booking", id: booking.id, from: "checked_in", attempted: "checked_in" },
    })

    const events = operator2.sink.events().filter((event) => event.phase === "error")
    expect(events.some((event) => event.name === "parking.check-in-booking")).toBe(true)

    await manager.ctx.close({ ok: true })
    await user.ctx.close({ ok: true })
    await operator.ctx.close({ ok: true })
    await operator2.ctx.close({ ok: false, error: new Error("rejected") })
    await manager.scope.dispose()
    await user.scope.dispose()
    await operator.scope.dispose()
    await operator2.scope.dispose()
  })

  it("CHECKIN-08 rejects checkInBooking when drive-up capacity is full", async () => {
    const backing = createMemoryStore()
    const manager = parking("2026-07-01T08:00:00.000Z", { id: "manager-1", role: "manager" }, preset(store, backing))
    const lot = await manager.ctx.exec({
      flow: configureLot,
      input: {
        bookingLeadMinutes: 60,
        capacity: 1,
        currency: "USD",
        graceMinutes: 0,
        name: "Full Booking Check-in Lot",
        rateCentsPerHour: 500,
        refundWindowMinutes: 60,
      },
    })

    const user = parking("2026-07-01T08:05:00.000Z", { id: "user-1", role: "user" }, preset(store, backing))
    const booking = await user.ctx.exec({
      flow: bookSpace,
      input: { endAt: "2026-07-02T10:00:00.000Z", lotId: lot.id, plate: "abc-111", startAt: "2026-07-02T08:00:00.000Z" },
    })

    const operator = parking("2026-07-01T08:06:00.000Z", { id: "operator-1", role: "operator" }, preset(store, backing))
    await operator.ctx.exec({ flow: checkInVehicle, input: { lotId: lot.id, plate: "xyz-999" } })

    const operator2 = parking("2026-07-01T08:07:00.000Z", { id: "operator-1", role: "operator" }, preset(store, backing))

    await expect(operator2.ctx.exec({
      flow: checkInBooking,
      input: { bookingId: booking.id },
    })).rejects.toMatchObject({ fault: { kind: "unavailable", entity: "lot", id: lot.id, reason: "drive-up-capacity" } })

    const events = operator2.sink.events().filter((event) => event.phase === "error")
    expect(events.some((event) => event.name === "parking.rule.assert-drive-up-capacity")).toBe(true)

    await manager.ctx.close({ ok: true })
    await user.ctx.close({ ok: true })
    await operator.ctx.close({ ok: true })
    await operator2.ctx.close({ ok: false, error: new Error("rejected") })
    await manager.scope.dispose()
    await user.scope.dispose()
    await operator.scope.dispose()
    await operator2.scope.dispose()
  })

  it("CHECKIN-09 rejects checkInBooking for an unknown bookingId", async () => {
    const backing = createMemoryStore()
    const operator = parking("2026-07-01T08:00:00.000Z", { id: "operator-1", role: "operator" }, preset(store, backing))

    await expect(operator.ctx.exec({
      flow: checkInBooking,
      input: { bookingId: "missing-booking" },
    })).rejects.toMatchObject({ entity: "booking", id: "missing-booking" })

    await operator.ctx.close({ ok: false, error: new Error("rejected") })
    await operator.scope.dispose()
  })
})
