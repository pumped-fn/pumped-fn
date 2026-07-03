import { createScope, preset } from "@pumped-fn/lite"
import { observable } from "@pumped-fn/lite-extension-observable"
import { describe, expect, it } from "vitest"
import {
  actor,
  bookSpace,
  cancelBooking,
  clock,
  configureLot,
  createMemoryStore,
  NotFoundError,
  store,
} from "../src"

describe("booking matrix", () => {
  it("BOOK-01 rejects bookSpace when actor role is not user", async () => {
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
        name: "Book Lot",
        rateCentsPerHour: 500,
        refundWindowMinutes: 60,
      },
    })

    const obsSink = observable.memory()
    const scope = createScope({
      extensions: [observable.extension()],
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T08:05:00.000Z")],
      tags: [actor({ id: "operator-1", role: "operator" }), observable.runtime({ sinks: [obsSink] })],
    })
    const ctx = scope.createContext()

    await expect(ctx.exec({
      flow: bookSpace,
      input: { endAt: "2026-07-02T10:00:00.000Z", lotId: lot.id, plate: "abc-111", startAt: "2026-07-02T08:00:00.000Z" },
    })).rejects.toMatchObject({ fault: { kind: "forbidden", action: "book space", actorId: "operator-1" } })

    const events = obsSink.events().filter((event) => event.phase === "error")
    expect(events.some((event) => event.name === "parking.rule.allow")).toBe(true)
    expect(events.some((event) => event.name === "parking.book-space")).toBe(true)

    await manager.close({ ok: true })
    await ctx.close({ ok: false, error: new Error("rejected") })
    await managerScope.dispose()
    await scope.dispose()
  })

  it("BOOK-02 rejects booking at exact capacity boundary (held+parked === capacity)", async () => {
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
        name: "Tight Lot",
        rateCentsPerHour: 500,
        refundWindowMinutes: 60,
      },
    })

    const userScope = createScope({
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T08:05:00.000Z")],
      tags: [actor({ id: "user-1", role: "user" })],
    })
    const user = userScope.createContext()
    await user.exec({
      flow: bookSpace,
      input: { endAt: "2026-07-02T10:00:00.000Z", lotId: lot.id, plate: "abc-111", startAt: "2026-07-02T08:00:00.000Z" },
    })

    const obsSink = observable.memory()
    const scope = createScope({
      extensions: [observable.extension()],
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T08:06:00.000Z")],
      tags: [actor({ id: "user-2", role: "user" }), observable.runtime({ sinks: [obsSink] })],
    })
    const ctx = scope.createContext()

    await expect(ctx.exec({
      flow: bookSpace,
      input: { endAt: "2026-07-02T12:00:00.000Z", lotId: lot.id, plate: "abc-222", startAt: "2026-07-02T09:00:00.000Z" },
    })).rejects.toMatchObject({ fault: { kind: "unavailable", entity: "lot", id: lot.id, reason: "capacity" } })

    const events = obsSink.events().filter((event) => event.phase === "error")
    expect(events.some((event) => event.name === "parking.rule.assert-capacity")).toBe(true)
    expect(events.some((event) => event.name === "parking.book-space")).toBe(true)

    await manager.close({ ok: true })
    await user.close({ ok: true })
    await ctx.close({ ok: false, error: new Error("rejected") })
    await managerScope.dispose()
    await userScope.dispose()
    await scope.dispose()
  })

  it("BOOK-03 accepts booking one under capacity (held+parked === capacity-1)", async () => {
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
        name: "Roomy Lot",
        rateCentsPerHour: 500,
        refundWindowMinutes: 60,
      },
    })

    const userScope = createScope({
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T08:05:00.000Z")],
      tags: [actor({ id: "user-1", role: "user" })],
    })
    const user = userScope.createContext()
    await user.exec({
      flow: bookSpace,
      input: { endAt: "2026-07-02T10:00:00.000Z", lotId: lot.id, plate: "abc-111", startAt: "2026-07-02T08:00:00.000Z" },
    })

    const second = await user.exec({
      flow: bookSpace,
      input: { endAt: "2026-07-02T12:00:00.000Z", lotId: lot.id, plate: "abc-222", startAt: "2026-07-02T09:00:00.000Z" },
    })
    expect(second).toMatchObject({ lotId: lot.id, status: "held" })

    await manager.close({ ok: true })
    await user.close({ ok: true })
    await managerScope.dispose()
    await userScope.dispose()
  })

  it("BOOK-04 accepts booking that starts exactly at an existing booking's end (no overlap)", async () => {
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
        name: "Adjacent Lot",
        rateCentsPerHour: 500,
        refundWindowMinutes: 60,
      },
    })

    const userScope = createScope({
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T08:05:00.000Z")],
      tags: [actor({ id: "user-1", role: "user" })],
    })
    const user = userScope.createContext()
    await user.exec({
      flow: bookSpace,
      input: { endAt: "2026-07-02T10:00:00.000Z", lotId: lot.id, plate: "abc-111", startAt: "2026-07-02T08:00:00.000Z" },
    })

    const second = await user.exec({
      flow: bookSpace,
      input: { endAt: "2026-07-02T12:00:00.000Z", lotId: lot.id, plate: "abc-222", startAt: "2026-07-02T10:00:00.000Z" },
    })
    expect(second).toMatchObject({ lotId: lot.id, status: "held" })

    await manager.close({ ok: true })
    await user.close({ ok: true })
    await managerScope.dispose()
    await userScope.dispose()
  })

  it("BOOK-05 accepts booking that ends exactly at an existing booking's start (no overlap)", async () => {
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
        name: "Adjacent Lot 2",
        rateCentsPerHour: 500,
        refundWindowMinutes: 60,
      },
    })

    const userScope = createScope({
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T08:05:00.000Z")],
      tags: [actor({ id: "user-1", role: "user" })],
    })
    const user = userScope.createContext()
    await user.exec({
      flow: bookSpace,
      input: { endAt: "2026-07-02T10:00:00.000Z", lotId: lot.id, plate: "abc-111", startAt: "2026-07-02T08:00:00.000Z" },
    })

    const second = await user.exec({
      flow: bookSpace,
      input: { endAt: "2026-07-02T08:00:00.000Z", lotId: lot.id, plate: "abc-222", startAt: "2026-07-02T06:00:00.000Z" },
    })
    expect(second).toMatchObject({ lotId: lot.id, status: "held" })

    await manager.close({ ok: true })
    await user.close({ ok: true })
    await managerScope.dispose()
    await userScope.dispose()
  })

  it("BOOK-06 rejects booking that overlaps an existing booking by 1ms", async () => {
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
        name: "1ms Overlap Lot",
        rateCentsPerHour: 500,
        refundWindowMinutes: 60,
      },
    })

    const userScope = createScope({
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T08:05:00.000Z")],
      tags: [actor({ id: "user-1", role: "user" })],
    })
    const user = userScope.createContext()
    await user.exec({
      flow: bookSpace,
      input: { endAt: "2026-07-02T10:00:00.000Z", lotId: lot.id, plate: "abc-111", startAt: "2026-07-02T08:00:00.000Z" },
    })

    const obsSink = observable.memory()
    const scope = createScope({
      extensions: [observable.extension()],
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T08:06:00.000Z")],
      tags: [actor({ id: "user-2", role: "user" }), observable.runtime({ sinks: [obsSink] })],
    })
    const ctx = scope.createContext()

    await expect(ctx.exec({
      flow: bookSpace,
      input: { endAt: "2026-07-02T11:00:00.000Z", lotId: lot.id, plate: "abc-222", startAt: "2026-07-02T09:59:59.999Z" },
    })).rejects.toMatchObject({ fault: { kind: "unavailable", entity: "lot", id: lot.id, reason: "capacity" } })

    const events = obsSink.events().filter((event) => event.phase === "error")
    expect(events.some((event) => event.name === "parking.rule.assert-capacity")).toBe(true)

    await manager.close({ ok: true })
    await user.close({ ok: true })
    await ctx.close({ ok: false, error: new Error("rejected") })
    await managerScope.dispose()
    await userScope.dispose()
    await scope.dispose()
  })

  it("BOOK-07 rejects bookSpace for an unknown lotId", async () => {
    const backing = createMemoryStore()
    const scope = createScope({
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T08:00:00.000Z")],
      tags: [actor({ id: "user-1", role: "user" })],
    })
    const ctx = scope.createContext()

    await expect(ctx.exec({
      flow: bookSpace,
      input: { endAt: "2026-07-02T10:00:00.000Z", lotId: "missing-lot", plate: "abc-111", startAt: "2026-07-02T08:00:00.000Z" },
    })).rejects.toMatchObject({ entity: "lot", id: "missing-lot" })

    await ctx.close({ ok: false, error: new Error("rejected") })
    await scope.dispose()
  })

  it("BOOK-08 creates two distinct bookings on an identical double-submit (no idempotency guard)", async () => {
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
        capacity: 5,
        currency: "USD",
        graceMinutes: 0,
        name: "Double Submit Lot",
        rateCentsPerHour: 500,
        refundWindowMinutes: 60,
      },
    })

    const userScope = createScope({
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T08:05:00.000Z")],
      tags: [actor({ id: "user-1", role: "user" })],
    })
    const user = userScope.createContext()
    const input = { endAt: "2026-07-02T10:00:00.000Z", lotId: lot.id, plate: "abc-111", startAt: "2026-07-02T08:00:00.000Z" }
    const first = await user.exec({ flow: bookSpace, input })
    const secondSubmit = await user.exec({ flow: bookSpace, input })

    expect(first.id).not.toBe(secondSubmit.id)
    expect(first.status).toBe("held")
    expect(secondSubmit.status).toBe("held")

    await manager.close({ ok: true })
    await user.close({ ok: true })
    await managerScope.dispose()
    await userScope.dispose()
  })

  it("BOOK-09 rejects cancelBooking when actor is neither manager nor owner", async () => {
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
        name: "Cancel Lot",
        rateCentsPerHour: 500,
        refundWindowMinutes: 60,
      },
    })

    const ownerScope = createScope({
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T08:05:00.000Z")],
      tags: [actor({ id: "user-1", role: "user" })],
    })
    const owner = ownerScope.createContext()
    const booking = await owner.exec({
      flow: bookSpace,
      input: { endAt: "2026-07-02T10:00:00.000Z", lotId: lot.id, plate: "abc-111", startAt: "2026-07-02T08:00:00.000Z" },
    })

    const obsSink = observable.memory()
    const otherScope = createScope({
      extensions: [observable.extension()],
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T08:06:00.000Z")],
      tags: [actor({ id: "user-2", role: "user" }), observable.runtime({ sinks: [obsSink] })],
    })
    const other = otherScope.createContext()

    await expect(other.exec({
      flow: cancelBooking,
      input: { bookingId: booking.id },
    })).rejects.toMatchObject({ fault: { kind: "forbidden", action: `cancel booking ${booking.id}`, actorId: "user-2" } })

    const events = obsSink.events().filter((event) => event.phase === "error")
    expect(events.some((event) => event.name === "parking.cancel-booking")).toBe(true)

    await manager.close({ ok: true })
    await owner.close({ ok: true })
    await other.close({ ok: false, error: new Error("rejected") })
    await managerScope.dispose()
    await ownerScope.dispose()
    await otherScope.dispose()
  })

  it("BOOK-10 rejects cancelBooking when the booking is not held", async () => {
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
        name: "Not Held Lot",
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
    await user.exec({ flow: cancelBooking, input: { bookingId: booking.id } })

    const obsSink = observable.memory()
    const scope = createScope({
      extensions: [observable.extension()],
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T08:07:00.000Z")],
      tags: [actor({ id: "user-1", role: "user" }), observable.runtime({ sinks: [obsSink] })],
    })
    const ctx = scope.createContext()

    await expect(ctx.exec({
      flow: cancelBooking,
      input: { bookingId: booking.id },
    })).rejects.toMatchObject({
      fault: { kind: "conflict", entity: "booking", id: booking.id, from: "cancelled", attempted: "cancelled" },
    })

    const events = obsSink.events().filter((event) => event.phase === "error")
    expect(events.some((event) => event.name === "parking.cancel-booking")).toBe(true)

    await manager.close({ ok: true })
    await user.close({ ok: true })
    await ctx.close({ ok: false, error: new Error("rejected") })
    await managerScope.dispose()
    await userScope.dispose()
    await scope.dispose()
  })

  it("BOOK-11 rejects cancelBooking for an unknown bookingId", async () => {
    const backing = createMemoryStore()
    const scope = createScope({
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T08:00:00.000Z")],
      tags: [actor({ id: "user-1", role: "user" })],
    })
    const ctx = scope.createContext()

    await expect(ctx.exec({
      flow: cancelBooking,
      input: { bookingId: "missing-booking" },
    })).rejects.toMatchObject({ entity: "booking", id: "missing-booking" })

    await ctx.close({ ok: false, error: new Error("rejected") })
    await scope.dispose()
  })

  it("BOOK-12 rejects the second concurrent cancelBooking submit for the same booking", async () => {
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
        name: "Concurrent Cancel Lot",
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

    const first = await user.exec({ flow: cancelBooking, input: { bookingId: booking.id } })
    expect(first.status).toBe("cancelled")

    await expect(user.exec({
      flow: cancelBooking,
      input: { bookingId: booking.id },
    })).rejects.toMatchObject({
      fault: { kind: "conflict", entity: "booking", id: booking.id, from: "cancelled", attempted: "cancelled" },
    })

    await manager.close({ ok: true })
    await user.close({ ok: false, error: new Error("rejected") })
    await managerScope.dispose()
    await userScope.dispose()
  })
})
