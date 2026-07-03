import { flow, typed } from "@pumped-fn/lite"
import type { ParkingSession } from "./model"
import { tx } from "./resource.tx"
import { allow, assertDriveUpCapacity, normalizePlate } from "./rules"

export interface CheckInVehicleInput {
  lotId: string
  plate: string
  userId?: string
}

export interface CheckInBookingInput {
  bookingId: string
}

export const checkInVehicle = flow({
  name: "parking.check-in-vehicle",
  parse: typed<CheckInVehicleInput>(),
  deps: { tx },
  factory: (ctx, deps): ParkingSession => {
    allow(deps.tx.actor, ["operator"], "check in vehicle")
    const lot = deps.tx.store.lot(ctx.input.lotId)
    assertDriveUpCapacity(deps.tx.store, lot)
    const session: ParkingSession = {
      enteredAt: deps.tx.at(),
      id: deps.tx.id("session"),
      lotId: lot.id,
      plate: normalizePlate(ctx.input.plate),
      status: "parked",
      userId: ctx.input.userId,
    }
    deps.tx.store.saveSession(session)
    deps.tx.record("session.parked", session.id, { lotId: lot.id, plate: session.plate })
    return session
  },
})

export const checkInBooking = flow({
  name: "parking.check-in-booking",
  parse: typed<CheckInBookingInput>(),
  deps: { tx },
  factory: (ctx, deps): ParkingSession => {
    allow(deps.tx.actor, ["operator"], "check in booking")
    const booking = deps.tx.store.booking(ctx.input.bookingId)
    if (booking.status !== "held") throw new Error(`booking ${booking.id} is not held`)
    const lot = deps.tx.store.lot(booking.lotId)
    assertDriveUpCapacity(deps.tx.store, lot)
    const session: ParkingSession = {
      bookingId: booking.id,
      enteredAt: deps.tx.at(),
      id: deps.tx.id("session"),
      lotId: lot.id,
      plate: booking.plate,
      status: "parked",
      userId: booking.userId,
    }
    deps.tx.store.saveSession(session)
    deps.tx.store.saveBooking({ ...booking, sessionId: session.id, status: "checked_in" })
    deps.tx.record("booking.checked-in", booking.id, { sessionId: session.id })
    return session
  },
})
