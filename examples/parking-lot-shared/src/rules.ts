import type { Actor, Lot, ParkingSession, Payment, Receipt, Role } from "./model"
import type { ParkingStore } from "./store"
import type { Work } from "./resource.tx"

export function allow(actor: Actor, roles: readonly Role[], action: string): void {
  if (!roles.includes(actor.role)) throw new Error(`role ${actor.role} cannot ${action}`)
}

export function amountDue(lot: Lot, enteredAt: string, exitedAt: string): number {
  const minutes = Math.max(0, Math.ceil((Date.parse(exitedAt) - Date.parse(enteredAt)) / 60000))
  const billable = Math.max(0, minutes - lot.settings.graceMinutes)
  return billable === 0 ? 0 : Math.max(1, Math.ceil(billable / 60)) * lot.rateCentsPerHour
}

export function assertCapacity(store: ParkingStore, lot: Lot, startAt: string, endAt: string): void {
  const held = store.bookings().filter((booking) =>
    booking.lotId === lot.id &&
    booking.status === "held" &&
    overlaps(startAt, endAt, booking.startAt, booking.endAt)
  ).length
  const parked = parkedCount(store, lot.id)
  if (held + parked >= lot.capacity) throw new Error(`lot ${lot.id} has no reservable capacity`)
}

export function assertDriveUpCapacity(store: ParkingStore, lot: Lot): void {
  if (parkedCount(store, lot.id) >= lot.capacity) throw new Error(`lot ${lot.id} is full`)
}

export function completeBookingForSession(store: ParkingStore, session: ParkingSession): void {
  if (session.bookingId === undefined) return
  const booking = store.booking(session.bookingId)
  store.saveBooking({ ...booking, status: "completed" })
}

export function issueReceipt(work: Work, payment: Payment, type: Receipt["type"], amountCents: number): Receipt {
  return work.store.saveReceipt({
    amountCents,
    id: work.id("receipt"),
    issuedAt: work.at(),
    paymentId: payment.id,
    sessionId: payment.sessionId,
    type,
  })
}

export function normalizePlate(value: string): string {
  return value.trim().toUpperCase()
}

export function overlaps(leftStart: string, leftEnd: string, rightStart: string, rightEnd: string): boolean {
  return Date.parse(leftStart) < Date.parse(rightEnd) && Date.parse(rightStart) < Date.parse(leftEnd)
}

export function parkedCount(store: ParkingStore, lotId: string): number {
  return store.sessions().filter((session) => session.lotId === lotId && session.status === "parked").length
}
