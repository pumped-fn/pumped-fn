import { flow, typed } from "@pumped-fn/lite"
import { tx } from "./resource.tx"
import { allow } from "./flow.rule.allow"

export interface DayCloseInput {}

export interface DayCloseSummary {
  date: string
  discrepancyCents: number
  netReceiptsCents: number
  paymentsCollectedCents: number
  receiptsChargeCents: number
  receiptsRefundCents: number
  reconciled: boolean
}

export const dayClose = flow({
  name: "parking.day-close",
  parse: typed<DayCloseInput>(),
  deps: { tx, allow },
  factory: async (_ctx, { tx, allow }): Promise<DayCloseSummary> => {
    await allow.exec({ input: { action: "close day", roles: ["manager"] } })
    const date = tx.at().slice(0, 10)

    const paymentsCollectedCents = tx.store.payments()
      .filter((payment) => payment.status === "paired" && payment.pairedAt !== undefined && payment.pairedAt.startsWith(date))
      .reduce((sum, payment) => sum + payment.amountCents, 0)

    const dayReceipts = tx.store.receipts().filter((receipt) => receipt.issuedAt.startsWith(date))
    const receiptsChargeCents = dayReceipts
      .filter((receipt) => receipt.type === "charge")
      .reduce((sum, receipt) => sum + receipt.amountCents, 0)
    const receiptsRefundCents = dayReceipts
      .filter((receipt) => receipt.type === "refund")
      .reduce((sum, receipt) => sum + receipt.amountCents, 0)
    const netReceiptsCents = receiptsChargeCents + receiptsRefundCents
    const discrepancyCents = paymentsCollectedCents - receiptsChargeCents

    const summary: DayCloseSummary = {
      date,
      discrepancyCents,
      netReceiptsCents,
      paymentsCollectedCents,
      receiptsChargeCents,
      receiptsRefundCents,
      reconciled: discrepancyCents === 0,
    }
    tx.record("day.closed", date, {
      discrepancyCents,
      netReceiptsCents,
      paymentsCollectedCents,
    })
    return summary
  },
})
