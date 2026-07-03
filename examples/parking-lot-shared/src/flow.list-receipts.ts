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
  factory: (ctx, deps): Receipt[] => {
    const requestedUser = ctx.input.userId ?? deps.tx.actor.id
    if (deps.tx.actor.role === "user" && requestedUser !== deps.tx.actor.id) {
      throw new Error(`user ${deps.tx.actor.id} cannot read receipts for ${requestedUser}`)
    }
    return deps.tx.store.receipts().filter((receipt) => {
      if (deps.tx.actor.role !== "user") return true
      return deps.tx.store.session(receipt.sessionId).userId === requestedUser
    })
  },
})
