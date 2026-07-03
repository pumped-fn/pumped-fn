import { flow, typed } from "@pumped-fn/lite"
import type { ParkingSession, Payment, Receipt } from "./model"
import { tx } from "./resource.tx"
import { issueReceipt } from "./flow.issue-receipt"
import { allow } from "./flow.rule.allow"

export interface PairPaymentInput {
  externalRef: string
  method: string
  paymentId: string
}

export interface RecordPaymentFailureInput {
  paymentId: string
  reason: string
}

export interface RefundPaymentInput {
  paymentId: string
  reason: string
}

export const pairPayment = flow({
  name: "parking.pair-payment",
  parse: typed<PairPaymentInput>(),
  deps: { tx, allow, issueReceipt },
  factory: async (ctx, { tx, allow, issueReceipt }): Promise<{ payment: Payment; receipt: Receipt; session: ParkingSession }> => {
    await allow.exec({ input: { action: "pair payment", roles: ["operator"] } })
    const payment = tx.store.payment(ctx.input.paymentId)
    if (payment.status !== "pending" && payment.status !== "failed") {
      throw new Error(`payment ${payment.id} cannot be paired from ${payment.status}`)
    }
    const session = tx.store.session(payment.sessionId)
    const paired: Payment = {
      ...payment,
      externalRef: ctx.input.externalRef,
      method: ctx.input.method,
      pairedAt: tx.at(),
      status: "paired",
    }
    const receipt = await issueReceipt.exec({ input: { amountCents: paired.amountCents, payment: paired, type: "charge" } })
    const released = tx.store.saveSession({ ...session, status: "released" })
    tx.store.savePayment(paired)
    tx.record("payment.paired", paired.id, { amountCents: paired.amountCents, receiptId: receipt.id })
    return { payment: paired, receipt, session: released }
  },
})

export const recordPaymentFailure = flow({
  name: "parking.record-payment-failure",
  parse: typed<RecordPaymentFailureInput>(),
  deps: { tx, allow },
  factory: async (ctx, { tx, allow }): Promise<Payment> => {
    await allow.exec({ input: { action: "record payment failure", roles: ["operator"] } })
    const payment = tx.store.payment(ctx.input.paymentId)
    if (payment.status !== "pending") throw new Error(`payment ${payment.id} is not pending`)
    const failed = tx.store.savePayment({
      ...payment,
      failureReason: ctx.input.reason,
      status: "failed",
    })
    tx.record("payment.failed", failed.id, { reason: ctx.input.reason })
    return failed
  },
})

export const refundPayment = flow({
  name: "parking.refund-payment",
  parse: typed<RefundPaymentInput>(),
  deps: { tx, allow, issueReceipt },
  factory: async (ctx, { tx, allow, issueReceipt }): Promise<{ payment: Payment; receipt: Receipt }> => {
    await allow.exec({ input: { action: "refund payment", roles: ["manager"] } })
    const payment = tx.store.payment(ctx.input.paymentId)
    if (payment.status !== "paired" && payment.status !== "disputed") {
      throw new Error(`payment ${payment.id} cannot be refunded from ${payment.status}`)
    }
    const refunded = tx.store.savePayment({
      ...payment,
      refundedAt: tx.at(),
      status: "refunded",
    })
    const receipt = await issueReceipt.exec({ input: { amountCents: -refunded.amountCents, payment: refunded, type: "refund" } })
    tx.record("payment.refunded", refunded.id, { reason: ctx.input.reason, receiptId: receipt.id })
    return { payment: refunded, receipt }
  },
})
