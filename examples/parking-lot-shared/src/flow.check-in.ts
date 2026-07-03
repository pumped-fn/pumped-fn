import { flow, typed, type Lite } from "@pumped-fn/lite"
import type { ParkingSession } from "./model"
import { tx } from "./resource.tx"
import { normalizePlate } from "./rules"
import { allow } from "./flow.rule.allow"
import { assertDriveUpCapacity } from "./flow.rule.assert-drive-up-capacity"
import type { Fault } from "./error"

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
  faults: typed<Lite.Utils.FaultsOf<typeof allow> | Lite.Utils.FaultsOf<typeof assertDriveUpCapacity>>(),
  deps: { tx, allow, assertDriveUpCapacity },
  factory: async (ctx, { tx, allow, assertDriveUpCapacity }): Promise<ParkingSession> => {
    await allow.exec({ input: { action: "check in vehicle", roles: ["operator"] } })
    const lot = tx.store.lot(ctx.input.lotId)
    await assertDriveUpCapacity.exec({ input: { lot } })
    const session: ParkingSession = {
      enteredAt: tx.at(),
      id: tx.id("session"),
      lotId: lot.id,
      plate: normalizePlate(ctx.input.plate),
      status: "parked",
      userId: ctx.input.userId,
    }
    tx.store.saveSession(session)
    tx.record("session.parked", session.id, { lotId: lot.id, plate: session.plate })
    return session
  },
})

export const checkInBooking = flow({
  name: "parking.check-in-booking",
  parse: typed<CheckInBookingInput>(),
  faults: typed<
    | Extract<Fault, { kind: "conflict" }>
    | Lite.Utils.FaultsOf<typeof allow>
    | Lite.Utils.FaultsOf<typeof assertDriveUpCapacity>
  >(),
  deps: { tx, allow, assertDriveUpCapacity },
  factory: async (ctx, { tx, allow, assertDriveUpCapacity }): Promise<ParkingSession> => {
    await allow.exec({ input: { action: "check in booking", roles: ["operator"] } })
    const booking = tx.store.booking(ctx.input.bookingId)
    if (booking.status !== "held") {
      ctx.fail({ kind: "conflict", entity: "booking", id: booking.id, from: booking.status, attempted: "checked_in" })
    }
    const lot = tx.store.lot(booking.lotId)
    await assertDriveUpCapacity.exec({ input: { lot } })
    const session: ParkingSession = {
      bookingId: booking.id,
      enteredAt: tx.at(),
      id: tx.id("session"),
      lotId: lot.id,
      plate: booking.plate,
      status: "parked",
      userId: booking.userId,
    }
    tx.store.saveSession(session)
    tx.store.saveBooking({ ...booking, sessionId: session.id, status: "checked_in" })
    tx.record("booking.checked-in", booking.id, { sessionId: session.id })
    return session
  },
})
