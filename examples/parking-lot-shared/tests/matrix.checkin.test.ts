import { createScope, preset } from "@pumped-fn/lite"
import { observable } from "@pumped-fn/lite-extension-observable"
import { describe, expect, it } from "vitest"
import {
  actor,
  bookSpace,
  checkInBooking,
  checkInVehicle,
  clock,
  configureLot,
  createMemoryStore,
  store,
} from "../src"

describe("check-in matrix", () => {
  it("CHECKIN-01 rejects checkInVehicle when actor role is not operator", async () => {
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
        name: "Check-in Lot",
        rateCentsPerHour: 500,
        refundWindowMinutes: 60,
      },
    })

    const obsSink = observable.memory()
    const scope = createScope({
      extensions: [observable.extension()],
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T08:05:00.000Z")],
      tags: [actor({ id: "user-1", role: "user" }), observable.runtime({ sinks: [obsSink] })],
    })
    const ctx = scope.createContext()

    await expect(ctx.exec({
      flow: checkInVehicle,
      input: { lotId: lot.id, plate: "abc-111" },
    })).rejects.toMatchObject({ fault: { kind: "forbidden", action: "check in vehicle", actorId: "user-1" } })

    const events = obsSink.events().filter((event) => event.phase === "error")
    expect(events.some((event) => event.name === "parking.rule.allow")).toBe(true)
    expect(events.some((event) => event.name === "parking.check-in-vehicle")).toBe(true)

    await manager.close({ ok: true })
    await ctx.close({ ok: false, error: new Error("rejected") })
    await managerScope.dispose()
    await scope.dispose()
  })

  it("CHECKIN-02 rejects checkInVehicle at exact drive-up capacity boundary", async () => {
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
        capacity: 1,
        currency: "USD",
        graceMinutes: 0,
        name: "Tight Check-in Lot",
        rateCentsPerHour: 500,
        refundWindowMinutes: 60,
      },
    })

    const operatorScope = createScope({
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T08:05:00.000Z")],
      tags: [actor({ id: "operator-1", role: "operator" })],
    })
    const operator = operatorScope.createContext()
    await operator.exec({ flow: checkInVehicle, input: { lotId: lot.id, plate: "abc-111" } })

    const obsSink = observable.memory()
    const scope = createScope({
      extensions: [observable.extension()],
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T08:06:00.000Z")],
      tags: [actor({ id: "operator-2", role: "operator" }), observable.runtime({ sinks: [obsSink] })],
    })
    const ctx = scope.createContext()

    await expect(ctx.exec({
      flow: checkInVehicle,
      input: { lotId: lot.id, plate: "abc-222" },
    })).rejects.toMatchObject({ fault: { kind: "unavailable", entity: "lot", id: lot.id, reason: "drive-up-capacity" } })

    const events = obsSink.events().filter((event) => event.phase === "error")
    expect(events.some((event) => event.name === "parking.rule.assert-drive-up-capacity")).toBe(true)

    await manager.close({ ok: true })
    await operator.close({ ok: true })
    await ctx.close({ ok: false, error: new Error("rejected") })
    await managerScope.dispose()
    await operatorScope.dispose()
    await scope.dispose()
  })

  it("CHECKIN-03 accepts checkInVehicle one under drive-up capacity", async () => {
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
        name: "Roomy Check-in Lot",
        rateCentsPerHour: 500,
        refundWindowMinutes: 60,
      },
    })

    const operatorScope = createScope({
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T08:05:00.000Z")],
      tags: [actor({ id: "operator-1", role: "operator" })],
    })
    const operator = operatorScope.createContext()
    await operator.exec({ flow: checkInVehicle, input: { lotId: lot.id, plate: "abc-111" } })
    const second = await operator.exec({ flow: checkInVehicle, input: { lotId: lot.id, plate: "abc-222" } })

    expect(second).toMatchObject({ lotId: lot.id, status: "parked" })

    await manager.close({ ok: true })
    await operator.close({ ok: true })
    await managerScope.dispose()
    await operatorScope.dispose()
  })

  it("CHECKIN-04 rejects checkInVehicle for an unknown lotId", async () => {
    const backing = createMemoryStore()
    const scope = createScope({
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T08:00:00.000Z")],
      tags: [actor({ id: "operator-1", role: "operator" })],
    })
    const ctx = scope.createContext()

    await expect(ctx.exec({
      flow: checkInVehicle,
      input: { lotId: "missing-lot", plate: "abc-111" },
    })).rejects.toMatchObject({ entity: "lot", id: "missing-lot" })

    await ctx.close({ ok: false, error: new Error("rejected") })
    await scope.dispose()
  })

  it("CHECKIN-05 accepts checkInVehicle with no userId (drive-up, no user)", async () => {
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
        name: "No User Lot",
        rateCentsPerHour: 500,
        refundWindowMinutes: 60,
      },
    })

    const operatorScope = createScope({
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T08:05:00.000Z")],
      tags: [actor({ id: "operator-1", role: "operator" })],
    })
    const operator = operatorScope.createContext()
    const session = await operator.exec({ flow: checkInVehicle, input: { lotId: lot.id, plate: "abc-111" } })

    expect(session).toMatchObject({ lotId: lot.id, status: "parked", userId: undefined })

    await manager.close({ ok: true })
    await operator.close({ ok: true })
    await managerScope.dispose()
    await operatorScope.dispose()
  })

  it("CHECKIN-06 rejects checkInBooking when actor role is not operator", async () => {
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
        name: "Booking Check-in Lot",
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
      input: { endAt: "2026-07-02T10:00:00.000Z", lotId: lot.id, plate: "abc-111", startAt: "2026-07-02T08:00:00.000Z" },
    })

    const obsSink = observable.memory()
    const scope = createScope({
      extensions: [observable.extension()],
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T08:06:00.000Z")],
      tags: [actor({ id: "user-1", role: "user" }), observable.runtime({ sinks: [obsSink] })],
    })
    const ctx = scope.createContext()

    await expect(ctx.exec({
      flow: checkInBooking,
      input: { bookingId: booking.id },
    })).rejects.toMatchObject({ fault: { kind: "forbidden", action: "check in booking", actorId: "user-1" } })

    const events = obsSink.events().filter((event) => event.phase === "error")
    expect(events.some((event) => event.name === "parking.rule.allow")).toBe(true)
    expect(events.some((event) => event.name === "parking.check-in-booking")).toBe(true)

    await manager.close({ ok: true })
    await user.close({ ok: true })
    await ctx.close({ ok: false, error: new Error("rejected") })
    await managerScope.dispose()
    await userScope.dispose()
    await scope.dispose()
  })

  it("CHECKIN-07 rejects checkInBooking when the booking is not held", async () => {
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
        name: "Not Held Check-in Lot",
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
      input: { endAt: "2026-07-02T10:00:00.000Z", lotId: lot.id, plate: "abc-111", startAt: "2026-07-02T08:00:00.000Z" },
    })
    const operatorScope = createScope({
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T08:06:00.000Z")],
      tags: [actor({ id: "operator-1", role: "operator" })],
    })
    const operator = operatorScope.createContext()
    await operator.exec({ flow: checkInBooking, input: { bookingId: booking.id } })

    const obsSink = observable.memory()
    const scope = createScope({
      extensions: [observable.extension()],
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T08:07:00.000Z")],
      tags: [actor({ id: "operator-1", role: "operator" }), observable.runtime({ sinks: [obsSink] })],
    })
    const ctx = scope.createContext()

    await expect(ctx.exec({
      flow: checkInBooking,
      input: { bookingId: booking.id },
    })).rejects.toMatchObject({
      fault: { kind: "conflict", entity: "booking", id: booking.id, from: "checked_in", attempted: "checked_in" },
    })

    const events = obsSink.events().filter((event) => event.phase === "error")
    expect(events.some((event) => event.name === "parking.check-in-booking")).toBe(true)

    await manager.close({ ok: true })
    await user.close({ ok: true })
    await operator.close({ ok: true })
    await ctx.close({ ok: false, error: new Error("rejected") })
    await managerScope.dispose()
    await userScope.dispose()
    await operatorScope.dispose()
    await scope.dispose()
  })

  it("CHECKIN-08 rejects checkInBooking when drive-up capacity is full", async () => {
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
        capacity: 1,
        currency: "USD",
        graceMinutes: 0,
        name: "Full Booking Check-in Lot",
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
      input: { endAt: "2026-07-02T10:00:00.000Z", lotId: lot.id, plate: "abc-111", startAt: "2026-07-02T08:00:00.000Z" },
    })

    const operatorScope = createScope({
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T08:06:00.000Z")],
      tags: [actor({ id: "operator-1", role: "operator" })],
    })
    const operator = operatorScope.createContext()
    await operator.exec({ flow: checkInVehicle, input: { lotId: lot.id, plate: "xyz-999" } })

    const obsSink = observable.memory()
    const scope = createScope({
      extensions: [observable.extension()],
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T08:07:00.000Z")],
      tags: [actor({ id: "operator-1", role: "operator" }), observable.runtime({ sinks: [obsSink] })],
    })
    const ctx = scope.createContext()

    await expect(ctx.exec({
      flow: checkInBooking,
      input: { bookingId: booking.id },
    })).rejects.toMatchObject({ fault: { kind: "unavailable", entity: "lot", id: lot.id, reason: "drive-up-capacity" } })

    const events = obsSink.events().filter((event) => event.phase === "error")
    expect(events.some((event) => event.name === "parking.rule.assert-drive-up-capacity")).toBe(true)

    await manager.close({ ok: true })
    await user.close({ ok: true })
    await operator.close({ ok: true })
    await ctx.close({ ok: false, error: new Error("rejected") })
    await managerScope.dispose()
    await userScope.dispose()
    await operatorScope.dispose()
    await scope.dispose()
  })

  it("CHECKIN-09 rejects checkInBooking for an unknown bookingId", async () => {
    const backing = createMemoryStore()
    const scope = createScope({
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T08:00:00.000Z")],
      tags: [actor({ id: "operator-1", role: "operator" })],
    })
    const ctx = scope.createContext()

    await expect(ctx.exec({
      flow: checkInBooking,
      input: { bookingId: "missing-booking" },
    })).rejects.toMatchObject({ entity: "booking", id: "missing-booking" })

    await ctx.close({ ok: false, error: new Error("rejected") })
    await scope.dispose()
  })
})
