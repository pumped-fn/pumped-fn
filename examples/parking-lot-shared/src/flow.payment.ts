import { flow, typed } from "@pumped-fn/lite"
import type { ParkingSession, Payment, Receipt } from "./model"
import { tx } from "./resource.tx"
import { allow, issueReceipt } from "./rules"

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
  deps: { tx },
  factory: (ctx, deps): { payment: Payment; receipt: Receipt; session: ParkingSession } => {
    allow(deps.tx.actor, ["operator"], "pair payment")
    const payment = deps.tx.store.payment(ctx.input.paymentId)
    if (payment.status !== "pending" && payment.status !== "failed") {
      throw new Error(`payment ${payment.id} cannot be paired from ${payment.status}`)
    }
    const session = deps.tx.store.session(payment.sessionId)
    const paired: Payment = {
      ...payment,
      externalRef: ctx.input.externalRef,
      method: ctx.input.method,
      pairedAt: deps.tx.at(),
      status: "paired",
    }
    const receipt = issueReceipt(deps.tx, paired, "charge", paired.amountCents)
    const released = deps.tx.store.saveSession({ ...session, status: "released" })
    deps.tx.store.savePayment(paired)
    deps.tx.record("payment.paired", paired.id, { amountCents: paired.amountCents, receiptId: receipt.id })
    return { payment: paired, receipt, session: released }
  },
})

export const recordPaymentFailure = flow({
  name: "parking.record-payment-failure",
  parse: typed<RecordPaymentFailureInput>(),
  deps: { tx },
  factory: (ctx, deps): Payment => {
    allow(deps.tx.actor, ["operator"], "record payment failure")
    const payment = deps.tx.store.payment(ctx.input.paymentId)
    if (payment.status !== "pending") throw new Error(`payment ${payment.id} is not pending`)
    const failed = deps.tx.store.savePayment({
      ...payment,
      failureReason: ctx.input.reason,
      status: "failed",
    })
    deps.tx.record("payment.failed", failed.id, { reason: ctx.input.reason })
    return failed
  },
})

export const refundPayment = flow({
  name: "parking.refund-payment",
  parse: typed<RefundPaymentInput>(),
  deps: { tx },
  factory: (ctx, deps): { payment: Payment; receipt: Receipt } => {
    allow(deps.tx.actor, ["manager"], "refund payment")
    const payment = deps.tx.store.payment(ctx.input.paymentId)
    if (payment.status !== "paired" && payment.status !== "disputed") {
      throw new Error(`payment ${payment.id} cannot be refunded from ${payment.status}`)
    }
    const refunded = deps.tx.store.savePayment({
      ...payment,
      refundedAt: deps.tx.at(),
      status: "refunded",
    })
    const receipt = issueReceipt(deps.tx, refunded, "refund", -refunded.amountCents)
    deps.tx.record("payment.refunded", refunded.id, { reason: ctx.input.reason, receiptId: receipt.id })
    return { payment: refunded, receipt }
  },
})
