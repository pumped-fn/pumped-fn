import { flow, typed } from "@pumped-fn/lite"
import type { ParkingSession } from "./model"
import { tx } from "./resource.tx"

export interface CompleteBookingInput {
  session: ParkingSession
}

export const completeBooking = flow({
  name: "parking.complete-booking",
  parse: typed<CompleteBookingInput>(),
  deps: { tx },
  factory: (ctx, { tx }): void => {
    if (ctx.input.session.bookingId === undefined) return
    const booking = tx.store.booking(ctx.input.session.bookingId)
    tx.store.saveBooking({ ...booking, status: "completed" })
  },
})
