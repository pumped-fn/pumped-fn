import { flow, typed } from "@pumped-fn/lite"
import type { ParkingSession, Payment } from "./model"
import { tx } from "./resource.tx"
import { allow, amountDue, completeBookingForSession } from "./rules"

export interface PrepareExitInput {
  sessionId: string
}

export const prepareExit = flow({
  name: "parking.prepare-exit",
  parse: typed<PrepareExitInput>(),
  deps: { tx },
  factory: (ctx, deps): { payment: Payment; session: ParkingSession } => {
    allow(deps.tx.actor, ["operator"], "prepare exit")
    const session = deps.tx.store.session(ctx.input.sessionId)
    if (session.status !== "parked") throw new Error(`session ${session.id} is not parked`)
    const exitedAt = deps.tx.at()
    const lot = deps.tx.store.lot(session.lotId)
    const payment: Payment = {
      amountCents: amountDue(lot, session.enteredAt, exitedAt),
      createdAt: exitedAt,
      id: deps.tx.id("payment"),
      sessionId: session.id,
      status: "pending",
    }
    const next = deps.tx.store.saveSession({ ...session, exitedAt, status: "awaiting_payment" })
    deps.tx.store.savePayment(payment)
    completeBookingForSession(deps.tx.store, next)
    deps.tx.record("session.exit-prepared", next.id, { amountCents: payment.amountCents, paymentId: payment.id })
    return { payment, session: next }
  },
})
