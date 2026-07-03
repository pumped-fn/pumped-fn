import { flow, typed } from "@pumped-fn/lite"
import type { Receipt } from "./model"
import { tx } from "./resource.tx"
import type { Fault } from "./error"

export interface ListReceiptsInput {
  userId?: string
}

export const listReceipts = flow({
  name: "parking.list-receipts",
  parse: typed<ListReceiptsInput>(),
  faults: typed<Extract<Fault, { kind: "forbidden" }>>(),
  deps: { tx },
  factory: (ctx, { tx }): Receipt[] => {
    const requestedUser = ctx.input.userId ?? tx.actor.id
    if (tx.actor.role === "user" && requestedUser !== tx.actor.id) {
      ctx.fail({ kind: "forbidden", action: `read receipts for ${requestedUser}`, actorId: tx.actor.id })
    }
    return tx.store.receipts().filter((receipt) => {
      if (tx.actor.role !== "user") return true
      return tx.store.session(receipt.sessionId).userId === requestedUser
    })
  },
})
