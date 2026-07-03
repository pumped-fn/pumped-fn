import type { ParkingSession, Payment, Receipt } from "./model"
import type { ParkingStore } from "./store"
import type { Work } from "./resource.tx"

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
