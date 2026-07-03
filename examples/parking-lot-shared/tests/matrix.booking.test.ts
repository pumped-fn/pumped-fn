import { preset } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import { bookSpace, cancelBooking, configureLot, createMemoryStore, store } from "../src"
import { parking } from "./harness"

describe("booking matrix", () => {
  it("BOOK-01 rejects bookSpace when actor role is not user", async () => {
    const backing = createMemoryStore()
    const manager = parking("2026-07-01T08:00:00.000Z", { id: "manager-1", role: "manager" }, preset(store, backing))
    const lot = await manager.ctx.exec({
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

    const operator = parking("2026-07-01T08:05:00.000Z", { id: "operator-1", role: "operator" }, preset(store, backing))

    await expect(operator.ctx.exec({
      flow: bookSpace,
      input: { endAt: "2026-07-02T10:00:00.000Z", lotId: lot.id, plate: "abc-111", startAt: "2026-07-02T08:00:00.000Z" },
    })).rejects.toMatchObject({ fault: { kind: "forbidden", action: "book space", actorId: "operator-1" } })

    const events = operator.sink.events().filter((event) => event.phase === "error")
    expect(events.some((event) => event.name === "parking.rule.allow")).toBe(true)
    expect(events.some((event) => event.name === "parking.book-space")).toBe(true)

    await manager.ctx.close({ ok: true })
    await operator.ctx.close({ ok: false, error: new Error("rejected") })
    await manager.scope.dispose()
    await operator.scope.dispose()
  })

  it("BOOK-02 rejects booking at exact capacity boundary (held+parked === capacity)", async () => {
    const backing = createMemoryStore()
    const manager = parking("2026-07-01T08:00:00.000Z", { id: "manager-1", role: "manager" }, preset(store, backing))
    const lot = await manager.ctx.exec({
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

    const user = parking("2026-07-01T08:05:00.000Z", { id: "user-1", role: "user" }, preset(store, backing))
    await user.ctx.exec({
      flow: bookSpace,
      input: { endAt: "2026-07-02T10:00:00.000Z", lotId: lot.id, plate: "abc-111", startAt: "2026-07-02T08:00:00.000Z" },
    })

    const user2 = parking("2026-07-01T08:06:00.000Z", { id: "user-2", role: "user" }, preset(store, backing))

    await expect(user2.ctx.exec({
      flow: bookSpace,
      input: { endAt: "2026-07-02T12:00:00.000Z", lotId: lot.id, plate: "abc-222", startAt: "2026-07-02T09:00:00.000Z" },
    })).rejects.toMatchObject({ fault: { kind: "unavailable", entity: "lot", id: lot.id, reason: "capacity" } })

    const events = user2.sink.events().filter((event) => event.phase === "error")
    expect(events.some((event) => event.name === "parking.rule.assert-capacity")).toBe(true)
    expect(events.some((event) => event.name === "parking.book-space")).toBe(true)

    await manager.ctx.close({ ok: true })
    await user.ctx.close({ ok: true })
    await user2.ctx.close({ ok: false, error: new Error("rejected") })
    await manager.scope.dispose()
    await user.scope.dispose()
    await user2.scope.dispose()
  })

  it("BOOK-03 accepts booking one under capacity (held+parked === capacity-1)", async () => {
    const backing = createMemoryStore()
    const manager = parking("2026-07-01T08:00:00.000Z", { id: "manager-1", role: "manager" }, preset(store, backing))
    const lot = await manager.ctx.exec({
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

    const user = parking("2026-07-01T08:05:00.000Z", { id: "user-1", role: "user" }, preset(store, backing))
    await user.ctx.exec({
      flow: bookSpace,
      input: { endAt: "2026-07-02T10:00:00.000Z", lotId: lot.id, plate: "abc-111", startAt: "2026-07-02T08:00:00.000Z" },
    })

    const second = await user.ctx.exec({
      flow: bookSpace,
      input: { endAt: "2026-07-02T12:00:00.000Z", lotId: lot.id, plate: "abc-222", startAt: "2026-07-02T09:00:00.000Z" },
    })
    expect(second).toMatchObject({ lotId: lot.id, status: "held" })

    await manager.ctx.close({ ok: true })
    await user.ctx.close({ ok: true })
    await manager.scope.dispose()
    await user.scope.dispose()
  })

  it("BOOK-04 accepts booking that starts exactly at an existing booking's end (no overlap)", async () => {
    const backing = createMemoryStore()
    const manager = parking("2026-07-01T08:00:00.000Z", { id: "manager-1", role: "manager" }, preset(store, backing))
    const lot = await manager.ctx.exec({
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

    const user = parking("2026-07-01T08:05:00.000Z", { id: "user-1", role: "user" }, preset(store, backing))
    await user.ctx.exec({
      flow: bookSpace,
      input: { endAt: "2026-07-02T10:00:00.000Z", lotId: lot.id, plate: "abc-111", startAt: "2026-07-02T08:00:00.000Z" },
    })

    const second = await user.ctx.exec({
      flow: bookSpace,
      input: { endAt: "2026-07-02T12:00:00.000Z", lotId: lot.id, plate: "abc-222", startAt: "2026-07-02T10:00:00.000Z" },
    })
    expect(second).toMatchObject({ lotId: lot.id, status: "held" })

    await manager.ctx.close({ ok: true })
    await user.ctx.close({ ok: true })
    await manager.scope.dispose()
    await user.scope.dispose()
  })

  it("BOOK-05 accepts booking that ends exactly at an existing booking's start (no overlap)", async () => {
    const backing = createMemoryStore()
    const manager = parking("2026-07-01T08:00:00.000Z", { id: "manager-1", role: "manager" }, preset(store, backing))
    const lot = await manager.ctx.exec({
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

    const user = parking("2026-07-01T08:05:00.000Z", { id: "user-1", role: "user" }, preset(store, backing))
    await user.ctx.exec({
      flow: bookSpace,
      input: { endAt: "2026-07-02T10:00:00.000Z", lotId: lot.id, plate: "abc-111", startAt: "2026-07-02T08:00:00.000Z" },
    })

    const second = await user.ctx.exec({
      flow: bookSpace,
      input: { endAt: "2026-07-02T08:00:00.000Z", lotId: lot.id, plate: "abc-222", startAt: "2026-07-02T06:00:00.000Z" },
    })
    expect(second).toMatchObject({ lotId: lot.id, status: "held" })

    await manager.ctx.close({ ok: true })
    await user.ctx.close({ ok: true })
    await manager.scope.dispose()
    await user.scope.dispose()
  })

  it("BOOK-06 rejects booking that overlaps an existing booking by 1ms", async () => {
    const backing = createMemoryStore()
    const manager = parking("2026-07-01T08:00:00.000Z", { id: "manager-1", role: "manager" }, preset(store, backing))
    const lot = await manager.ctx.exec({
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

    const user = parking("2026-07-01T08:05:00.000Z", { id: "user-1", role: "user" }, preset(store, backing))
    await user.ctx.exec({
      flow: bookSpace,
      input: { endAt: "2026-07-02T10:00:00.000Z", lotId: lot.id, plate: "abc-111", startAt: "2026-07-02T08:00:00.000Z" },
    })

    const user2 = parking("2026-07-01T08:06:00.000Z", { id: "user-2", role: "user" }, preset(store, backing))

    await expect(user2.ctx.exec({
      flow: bookSpace,
      input: { endAt: "2026-07-02T11:00:00.000Z", lotId: lot.id, plate: "abc-222", startAt: "2026-07-02T09:59:59.999Z" },
    })).rejects.toMatchObject({ fault: { kind: "unavailable", entity: "lot", id: lot.id, reason: "capacity" } })

    const events = user2.sink.events().filter((event) => event.phase === "error")
    expect(events.some((event) => event.name === "parking.rule.assert-capacity")).toBe(true)

    await manager.ctx.close({ ok: true })
    await user.ctx.close({ ok: true })
    await user2.ctx.close({ ok: false, error: new Error("rejected") })
    await manager.scope.dispose()
    await user.scope.dispose()
    await user2.scope.dispose()
  })

  it("BOOK-07 rejects bookSpace for an unknown lotId", async () => {
    const backing = createMemoryStore()
    const user = parking("2026-07-01T08:00:00.000Z", { id: "user-1", role: "user" }, preset(store, backing))

    await expect(user.ctx.exec({
      flow: bookSpace,
      input: { endAt: "2026-07-02T10:00:00.000Z", lotId: "missing-lot", plate: "abc-111", startAt: "2026-07-02T08:00:00.000Z" },
    })).rejects.toMatchObject({ entity: "lot", id: "missing-lot" })

    await user.ctx.close({ ok: false, error: new Error("rejected") })
    await user.scope.dispose()
  })

  it("BOOK-08 creates two distinct bookings on an identical double-submit (no idempotency guard)", async () => {
    const backing = createMemoryStore()
    const manager = parking("2026-07-01T08:00:00.000Z", { id: "manager-1", role: "manager" }, preset(store, backing))
    const lot = await manager.ctx.exec({
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

    const user = parking("2026-07-01T08:05:00.000Z", { id: "user-1", role: "user" }, preset(store, backing))
    const input = { endAt: "2026-07-02T10:00:00.000Z", lotId: lot.id, plate: "abc-111", startAt: "2026-07-02T08:00:00.000Z" }
    const first = await user.ctx.exec({ flow: bookSpace, input })
    const secondSubmit = await user.ctx.exec({ flow: bookSpace, input })

    expect(first.id).not.toBe(secondSubmit.id)
    expect(first.status).toBe("held")
    expect(secondSubmit.status).toBe("held")

    await manager.ctx.close({ ok: true })
    await user.ctx.close({ ok: true })
    await manager.scope.dispose()
    await user.scope.dispose()
  })

  it("BOOK-09 rejects cancelBooking when actor is neither manager nor owner", async () => {
    const backing = createMemoryStore()
    const manager = parking("2026-07-01T08:00:00.000Z", { id: "manager-1", role: "manager" }, preset(store, backing))
    const lot = await manager.ctx.exec({
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

    const owner = parking("2026-07-01T08:05:00.000Z", { id: "user-1", role: "user" }, preset(store, backing))
    const booking = await owner.ctx.exec({
      flow: bookSpace,
      input: { endAt: "2026-07-02T10:00:00.000Z", lotId: lot.id, plate: "abc-111", startAt: "2026-07-02T08:00:00.000Z" },
    })

    const other = parking("2026-07-01T08:06:00.000Z", { id: "user-2", role: "user" }, preset(store, backing))

    await expect(other.ctx.exec({
      flow: cancelBooking,
      input: { bookingId: booking.id },
    })).rejects.toMatchObject({ fault: { kind: "forbidden", action: `cancel booking ${booking.id}`, actorId: "user-2" } })

    const events = other.sink.events().filter((event) => event.phase === "error")
    expect(events.some((event) => event.name === "parking.cancel-booking")).toBe(true)

    await manager.ctx.close({ ok: true })
    await owner.ctx.close({ ok: true })
    await other.ctx.close({ ok: false, error: new Error("rejected") })
    await manager.scope.dispose()
    await owner.scope.dispose()
    await other.scope.dispose()
  })

  it("BOOK-10 rejects cancelBooking when the booking is not held", async () => {
    const backing = createMemoryStore()
    const manager = parking("2026-07-01T08:00:00.000Z", { id: "manager-1", role: "manager" }, preset(store, backing))
    const lot = await manager.ctx.exec({
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

    const user = parking("2026-07-01T08:05:00.000Z", { id: "user-1", role: "user" }, preset(store, backing))
    const booking = await user.ctx.exec({
      flow: bookSpace,
      input: { endAt: "2026-07-02T10:00:00.000Z", lotId: lot.id, plate: "abc-111", startAt: "2026-07-02T08:00:00.000Z" },
    })
    await user.ctx.exec({ flow: cancelBooking, input: { bookingId: booking.id } })

    const user2 = parking("2026-07-01T08:07:00.000Z", { id: "user-1", role: "user" }, preset(store, backing))

    await expect(user2.ctx.exec({
      flow: cancelBooking,
      input: { bookingId: booking.id },
    })).rejects.toMatchObject({
      fault: { kind: "conflict", entity: "booking", id: booking.id, from: "cancelled", attempted: "cancelled" },
    })

    const events = user2.sink.events().filter((event) => event.phase === "error")
    expect(events.some((event) => event.name === "parking.cancel-booking")).toBe(true)

    await manager.ctx.close({ ok: true })
    await user.ctx.close({ ok: true })
    await user2.ctx.close({ ok: false, error: new Error("rejected") })
    await manager.scope.dispose()
    await user.scope.dispose()
    await user2.scope.dispose()
  })

  it("BOOK-11 rejects cancelBooking for an unknown bookingId", async () => {
    const backing = createMemoryStore()
    const user = parking("2026-07-01T08:00:00.000Z", { id: "user-1", role: "user" }, preset(store, backing))

    await expect(user.ctx.exec({
      flow: cancelBooking,
      input: { bookingId: "missing-booking" },
    })).rejects.toMatchObject({ entity: "booking", id: "missing-booking" })

    await user.ctx.close({ ok: false, error: new Error("rejected") })
    await user.scope.dispose()
  })

  it("BOOK-12 rejects the second concurrent cancelBooking submit for the same booking", async () => {
    const backing = createMemoryStore()
    const manager = parking("2026-07-01T08:00:00.000Z", { id: "manager-1", role: "manager" }, preset(store, backing))
    const lot = await manager.ctx.exec({
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

    const user = parking("2026-07-01T08:05:00.000Z", { id: "user-1", role: "user" }, preset(store, backing))
    const booking = await user.ctx.exec({
      flow: bookSpace,
      input: { endAt: "2026-07-02T10:00:00.000Z", lotId: lot.id, plate: "abc-111", startAt: "2026-07-02T08:00:00.000Z" },
    })

    const first = await user.ctx.exec({ flow: cancelBooking, input: { bookingId: booking.id } })
    expect(first.status).toBe("cancelled")

    await expect(user.ctx.exec({
      flow: cancelBooking,
      input: { bookingId: booking.id },
    })).rejects.toMatchObject({
      fault: { kind: "conflict", entity: "booking", id: booking.id, from: "cancelled", attempted: "cancelled" },
    })

    await manager.ctx.close({ ok: true })
    await user.ctx.close({ ok: false, error: new Error("rejected") })
    await manager.scope.dispose()
    await user.scope.dispose()
  })
})
