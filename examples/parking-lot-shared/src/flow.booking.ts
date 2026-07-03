import { flow, typed } from "@pumped-fn/lite"
import type { Booking } from "./model"
import { tx } from "./resource.tx"
import { allow, assertCapacity, normalizePlate } from "./rules"

export interface BookSpaceInput {
  endAt: string
  lotId: string
  plate: string
  startAt: string
}

export interface CancelBookingInput {
  bookingId: string
}

export const bookSpace = flow({
  name: "parking.book-space",
  parse: typed<BookSpaceInput>(),
  deps: { tx },
  factory: (ctx, deps): Booking => {
    allow(deps.tx.actor, ["user"], "book space")
    const lot = deps.tx.store.lot(ctx.input.lotId)
    assertCapacity(deps.tx.store, lot, ctx.input.startAt, ctx.input.endAt)
    const booking: Booking = {
      createdAt: deps.tx.at(),
      endAt: ctx.input.endAt,
      id: deps.tx.id("booking"),
      lotId: lot.id,
      plate: normalizePlate(ctx.input.plate),
      startAt: ctx.input.startAt,
      status: "held",
      userId: deps.tx.actor.id,
    }
    deps.tx.store.saveBooking(booking)
    deps.tx.record("booking.held", booking.id, { lotId: lot.id, userId: booking.userId })
    return booking
  },
})

export const cancelBooking = flow({
  name: "parking.cancel-booking",
  parse: typed<CancelBookingInput>(),
  deps: { tx },
  factory: (ctx, deps): Booking => {
    const booking = deps.tx.store.booking(ctx.input.bookingId)
    if (deps.tx.actor.role !== "manager" && deps.tx.actor.id !== booking.userId) {
      throw new Error(`role ${deps.tx.actor.role} cannot cancel booking ${booking.id}`)
    }
    if (booking.status !== "held") throw new Error(`booking ${booking.id} is not held`)
    const next = deps.tx.store.saveBooking({
      ...booking,
      cancelledAt: deps.tx.at(),
      status: "cancelled",
    })
    deps.tx.record("booking.cancelled", next.id, { userId: next.userId })
    return next
  },
})
