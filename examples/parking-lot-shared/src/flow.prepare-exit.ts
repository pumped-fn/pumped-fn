import { flow, typed } from "@pumped-fn/lite"
import type { ParkingSession, Payment } from "./model"
import { tx } from "./resource.tx"
import { completeBooking } from "./flow.complete-booking"
import { allow } from "./flow.rule.allow"
import { amountDue } from "./flow.rule.amount-due"

export interface PrepareExitInput {
  sessionId: string
}

export const prepareExit = flow({
  name: "parking.prepare-exit",
  parse: typed<PrepareExitInput>(),
  deps: { tx, allow, amountDue, completeBooking },
  factory: async (ctx, { tx, allow, amountDue, completeBooking }): Promise<{ payment: Payment; session: ParkingSession }> => {
    await allow.exec({ input: { action: "prepare exit", roles: ["operator"] } })
    const session = tx.store.session(ctx.input.sessionId)
    if (session.status !== "parked") throw new Error(`session ${session.id} is not parked`)
    const exitedAt = tx.at()
    const lot = tx.store.lot(session.lotId)
    const payment: Payment = {
      amountCents: await amountDue.exec({ input: { enteredAt: session.enteredAt, exitedAt, lot } }),
      createdAt: exitedAt,
      id: tx.id("payment"),
      sessionId: session.id,
      status: "pending",
    }
    const next = tx.store.saveSession({ ...session, exitedAt, status: "awaiting_payment" })
    tx.store.savePayment(payment)
    await completeBooking.exec({ input: { session: next } })
    tx.record("session.exit-prepared", next.id, { amountCents: payment.amountCents, paymentId: payment.id })
    return { payment, session: next }
  },
})
