import { flow, typed } from "@pumped-fn/lite"
import type { Payment, Receipt } from "./model"
import { tx } from "./resource.tx"

export interface IssueReceiptInput {
  amountCents: number
  payment: Payment
  type: Receipt["type"]
}

export const issueReceipt = flow({
  name: "parking.issue-receipt",
  parse: typed<IssueReceiptInput>(),
  deps: { tx },
  factory: (ctx, { tx }): Receipt =>
    tx.store.saveReceipt({
      amountCents: ctx.input.amountCents,
      id: tx.id("receipt"),
      issuedAt: tx.at(),
      paymentId: ctx.input.payment.id,
      sessionId: ctx.input.payment.sessionId,
      type: ctx.input.type,
    }),
})
