import { flow, typed } from "@pumped-fn/lite"
import type { Dispute, Payment, Receipt } from "./model"
import { tx } from "./resource.tx"
import { issueReceipt } from "./rules"
import { allow } from "./flow.rule.allow"

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
  deps: { tx, allow },
  factory: async (ctx, { tx, allow }): Promise<{ dispute: Dispute; payment: Payment; receipt: Receipt }> => {
    await allow.exec({ input: { action: "open dispute", roles: ["user"] } })
    const payment = tx.store.payment(ctx.input.paymentId)
    const session = tx.store.session(payment.sessionId)
    if (session.userId !== tx.actor.id) throw new Error(`user ${tx.actor.id} cannot dispute payment ${payment.id}`)
    if (payment.status !== "paired") throw new Error(`payment ${payment.id} cannot be disputed from ${payment.status}`)
    const disputed = tx.store.savePayment({
      ...payment,
      disputedAt: tx.at(),
      status: "disputed",
    })
    const dispute: Dispute = tx.store.saveDispute({
      id: tx.id("dispute"),
      openedAt: tx.at(),
      paymentId: payment.id,
      reason: ctx.input.reason,
      status: "open",
      userId: tx.actor.id,
    })
    const receipt = issueReceipt(tx, disputed, "dispute", 0)
    tx.record("payment.disputed", disputed.id, { disputeId: dispute.id, receiptId: receipt.id })
    return { dispute, payment: disputed, receipt }
  },
})

export const resolveDispute = flow({
  name: "parking.resolve-dispute",
  parse: typed<ResolveDisputeInput>(),
  deps: { tx, allow },
  factory: async (ctx, { tx, allow }): Promise<{ dispute: Dispute; payment: Payment; receipt?: Receipt }> => {
    await allow.exec({ input: { action: "resolve dispute", roles: ["manager"] } })
    const dispute = tx.store.dispute(ctx.input.disputeId)
    if (dispute.status !== "open") throw new Error(`dispute ${dispute.id} is not open`)
    const payment = tx.store.payment(dispute.paymentId)
    const resolved = tx.store.saveDispute({
      ...dispute,
      resolvedAt: tx.at(),
      status: ctx.input.decision,
    })
    if (ctx.input.decision === "rejected") {
      const paired = tx.store.savePayment({ ...payment, status: "paired" })
      tx.record("dispute.rejected", resolved.id, { paymentId: payment.id })
      return { dispute: resolved, payment: paired }
    }
    const refunded = tx.store.savePayment({
      ...payment,
      refundedAt: tx.at(),
      status: "refunded",
    })
    const receipt = issueReceipt(tx, refunded, "refund", -refunded.amountCents)
    tx.record("dispute.accepted", resolved.id, { paymentId: payment.id, receiptId: receipt.id })
    return { dispute: resolved, payment: refunded, receipt }
  },
})
