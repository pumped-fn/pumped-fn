import { flow, typed } from "@pumped-fn/lite"
import type { Receipt } from "./model"
import { tx } from "./resource.tx"

export interface ListReceiptsInput {
  userId?: string
}

export const listReceipts = flow({
  name: "parking.list-receipts",
  parse: typed<ListReceiptsInput>(),
  deps: { tx },
  factory: (ctx, { tx }): Receipt[] => {
    const requestedUser = ctx.input.userId ?? tx.actor.id
    if (tx.actor.role === "user" && requestedUser !== tx.actor.id) {
      throw new Error(`user ${tx.actor.id} cannot read receipts for ${requestedUser}`)
    }
    return tx.store.receipts().filter((receipt) => {
      if (tx.actor.role !== "user") return true
      return tx.store.session(receipt.sessionId).userId === requestedUser
    })
  },
})
