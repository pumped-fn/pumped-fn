import { flow, typed } from "@pumped-fn/lite"
import type { Booking, ParkingSession, Payment, Receipt } from "./model"
import { tx } from "./resource.tx"
import { issueReceipt } from "./flow.issue-receipt"
import { allow } from "./flow.rule.allow"

export interface ExpireBookingsInput {}

export interface ClosedSession {
  payment: Payment
  receipt: Receipt
  session: ParkingSession
}

export interface ExpireBookingsResult {
  closedSessions: ClosedSession[]
  expiredBookings: Booking[]
}

export const expireBookings = flow({
  name: "parking.expire-bookings",
  parse: typed<ExpireBookingsInput>(),
  deps: { tx, allow, issueReceipt },
  factory: async (_ctx, { tx, allow, issueReceipt }): Promise<ExpireBookingsResult> => {
    await allow.exec({ input: { action: "expire bookings", roles: ["manager", "operator"] } })
    const nowMs = Date.parse(tx.at())

    const expiredBookings = tx.store.bookings()
      .filter((booking) => booking.status === "held")
      .filter((booking) => {
        const lot = tx.store.lot(booking.lotId)
        return nowMs > Date.parse(booking.startAt) + lot.settings.graceMinutes * 60000
      })
      .map((booking) => {
        const next = tx.store.saveBooking({ ...booking, cancelledAt: tx.at(), status: "cancelled" })
        tx.record("booking.expired", next.id, { lotId: next.lotId })
        return next
      })

    const closedSessions: ClosedSession[] = []
    for (const payment of tx.store.payments()) {
      if (payment.status !== "pending" && payment.status !== "failed") continue
      const session = tx.store.session(payment.sessionId)
      if (session.status !== "awaiting_payment" || session.exitedAt === undefined) continue
      const lot = tx.store.lot(session.lotId)
      const deadline = Date.parse(session.exitedAt) + lot.settings.refundWindowMinutes * 60000
      if (nowMs <= deadline) continue
      const collected = tx.store.savePayment({ ...payment, pairedAt: tx.at(), status: "paired" })
      const receipt = await issueReceipt.exec({ input: { amountCents: collected.amountCents, payment: collected, type: "charge" } })
      const released = tx.store.saveSession({ ...session, status: "released" })
      tx.record("session.expired", released.id, { paymentId: collected.id, receiptId: receipt.id })
      closedSessions.push({ payment: collected, receipt, session: released })
    }

    return { closedSessions, expiredBookings }
  },
})
