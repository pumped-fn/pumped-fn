import { flow, typed } from "@pumped-fn/lite"
import type { Dispute, Payment, Receipt } from "./model"
import { tx } from "./resource.tx"
import { allow, issueReceipt } from "./rules"

export interface OpenDisputeInput {
  paymentId: string
  reason: string
}

export interface ResolveDisputeInput {
  decision: "accepted" | "rejected"
  disputeId: string
}

export const openDispute = flow({
  name: "parking.open-dispute",
  parse: typed<OpenDisputeInput>(),
  deps: { tx },
  factory: (ctx, deps): { dispute: Dispute; payment: Payment; receipt: Receipt } => {
    allow(deps.tx.actor, ["user"], "open dispute")
    const payment = deps.tx.store.payment(ctx.input.paymentId)
    const session = deps.tx.store.session(payment.sessionId)
    if (session.userId !== deps.tx.actor.id) throw new Error(`user ${deps.tx.actor.id} cannot dispute payment ${payment.id}`)
    if (payment.status !== "paired") throw new Error(`payment ${payment.id} cannot be disputed from ${payment.status}`)
    const disputed = deps.tx.store.savePayment({
      ...payment,
      disputedAt: deps.tx.at(),
      status: "disputed",
    })
    const dispute: Dispute = deps.tx.store.saveDispute({
      id: deps.tx.id("dispute"),
      openedAt: deps.tx.at(),
      paymentId: payment.id,
      reason: ctx.input.reason,
      status: "open",
      userId: deps.tx.actor.id,
    })
    const receipt = issueReceipt(deps.tx, disputed, "dispute", 0)
    deps.tx.record("payment.disputed", disputed.id, { disputeId: dispute.id, receiptId: receipt.id })
    return { dispute, payment: disputed, receipt }
  },
})

export const resolveDispute = flow({
  name: "parking.resolve-dispute",
  parse: typed<ResolveDisputeInput>(),
  deps: { tx },
  factory: (ctx, deps): { dispute: Dispute; payment: Payment; receipt?: Receipt } => {
    allow(deps.tx.actor, ["manager"], "resolve dispute")
    const dispute = deps.tx.store.dispute(ctx.input.disputeId)
    if (dispute.status !== "open") throw new Error(`dispute ${dispute.id} is not open`)
    const payment = deps.tx.store.payment(dispute.paymentId)
    const resolved = deps.tx.store.saveDispute({
      ...dispute,
      resolvedAt: deps.tx.at(),
      status: ctx.input.decision,
    })
    if (ctx.input.decision === "rejected") {
      const paired = deps.tx.store.savePayment({ ...payment, status: "paired" })
      deps.tx.record("dispute.rejected", resolved.id, { paymentId: payment.id })
      return { dispute: resolved, payment: paired }
    }
    const refunded = deps.tx.store.savePayment({
      ...payment,
      refundedAt: deps.tx.at(),
      status: "refunded",
    })
    const receipt = issueReceipt(deps.tx, refunded, "refund", -refunded.amountCents)
    deps.tx.record("dispute.accepted", resolved.id, { paymentId: payment.id, receiptId: receipt.id })
    return { dispute: resolved, payment: refunded, receipt }
  },
})
