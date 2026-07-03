import { flow, typed } from "@pumped-fn/lite"
import type { LotReport, Report } from "./model"
import { tx } from "./resource.tx"
import { allow } from "./rules"

export interface ReadReportInput {
  lotId?: string
}

export const readReport = flow({
  name: "parking.read-report",
  parse: typed<ReadReportInput>(),
  deps: { tx },
  factory: (ctx, deps): Report => {
    allow(deps.tx.actor, ["manager"], "read report")
    const lots = deps.tx.store.lots()
      .filter((lot) => ctx.input.lotId === undefined || lot.id === ctx.input.lotId)
      .map((lot): LotReport => {
        const sessions = deps.tx.store.sessions().filter((session) => session.lotId === lot.id)
        const payments = deps.tx.store.payments().filter((payment) => sessions.some((session) => session.id === payment.sessionId))
        const disputes = deps.tx.store.disputes().filter((dispute) => payments.some((payment) => payment.id === dispute.paymentId))
        return {
          awaitingPayment: sessions.filter((session) => session.status === "awaiting_payment").length,
          capacity: lot.capacity,
          failedPayments: payments.filter((payment) => payment.status === "failed").length,
          heldBookings: deps.tx.store.bookings().filter((booking) => booking.lotId === lot.id && booking.status === "held").length,
          lotId: lot.id,
          name: lot.name,
          openDisputes: disputes.filter((dispute) => dispute.status === "open").length,
          parked: sessions.filter((session) => session.status === "parked").length,
          revenueCents: deps.tx.store.receipts().filter((receipt) => receipt.type === "charge").reduce((sum, receipt) => sum + receipt.amountCents, 0),
        }
      })
    return {
      generatedAt: deps.tx.at(),
      lots,
      totals: {
        capacity: lots.reduce((sum, lot) => sum + lot.capacity, 0),
        failedPayments: lots.reduce((sum, lot) => sum + lot.failedPayments, 0),
        openDisputes: lots.reduce((sum, lot) => sum + lot.openDisputes, 0),
        parked: lots.reduce((sum, lot) => sum + lot.parked, 0),
        revenueCents: lots.reduce((sum, lot) => sum + lot.revenueCents, 0),
      },
    }
  },
})
