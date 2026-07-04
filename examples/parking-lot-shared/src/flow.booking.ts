import { flow, typed, type Lite } from "@pumped-fn/lite"
import type { Booking } from "./model"
import { tx } from "./resource.tx"
import { normalizePlate } from "./rules"
import { allow } from "./flow.rule.allow"
import { assertCapacity } from "./flow.rule.assert-capacity"
import type { Forbidden, Conflict } from "./error"

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
  faults: typed<Lite.Utils.FaultsOf<typeof allow> | Lite.Utils.FaultsOf<typeof assertCapacity>>(),
  deps: { tx, allow, assertCapacity },
  factory: async (ctx, { tx, allow, assertCapacity }): Promise<Booking> => {
    await allow.exec({ input: { action: "book space", roles: ["user"] } })
    const lot = tx.store.lot(ctx.input.lotId)
    await assertCapacity.exec({ input: { endAt: ctx.input.endAt, lot, startAt: ctx.input.startAt } })
    const booking: Booking = {
      createdAt: tx.at(),
      endAt: ctx.input.endAt,
      id: tx.id("booking"),
      lotId: lot.id,
      plate: normalizePlate(ctx.input.plate),
      startAt: ctx.input.startAt,
      status: "held",
      userId: tx.actor.id,
    }
    tx.store.saveBooking(booking)
    tx.record("booking.held", booking.id, { lotId: lot.id, userId: booking.userId })
    return booking
  },
})

export const cancelBooking = flow({
  name: "parking.cancel-booking",
  parse: typed<CancelBookingInput>(),
  faults: typed<Forbidden | Conflict>(),
  deps: { tx },
  factory: (ctx, { tx }): Booking => {
    const booking = tx.store.booking(ctx.input.bookingId)
    if (tx.actor.role !== "manager" && tx.actor.id !== booking.userId) {
      ctx.fail({ kind: "forbidden", action: `cancel booking ${booking.id}`, actorId: tx.actor.id })
    }
    if (booking.status !== "held") {
      ctx.fail({ kind: "conflict", entity: "booking", id: booking.id, from: booking.status, attempted: "cancelled" })
    }
    const next = tx.store.saveBooking({
      ...booking,
      cancelledAt: tx.at(),
      status: "cancelled",
    })
    tx.record("booking.cancelled", next.id, { userId: next.userId })
    return next
  },
})
