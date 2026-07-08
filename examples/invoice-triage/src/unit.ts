import { resource, type Lite } from "@pumped-fn/lite"
import { database } from "./database"
import { tx, txStore, type Tx } from "./tx"

export const txBoundary = resource({
  name: "invoice.txBoundary",
  ownership: "current",
  deps: { db: database },
  factory: async (ctx, { db }): Promise<ReturnType<typeof txStore>> => {
    let close!: (result: Lite.CloseResult) => void
    let publish!: (store: ReturnType<typeof txStore>) => void
    let fail!: (error: unknown) => void
    const result = new Promise<Lite.CloseResult>((resolve) => {
      close = resolve
    })
    const ready = new Promise<ReturnType<typeof txStore>>((resolve, reject) => {
      publish = resolve
      fail = reject
    })
    const settled = db.transaction(async (conn) => {
      const store = txStore(conn as Tx)
      ctx.data.setTag(tx, store)
      publish(store)
      const closeResult = await result
      if (closeResult.ok) return store
      throw closeResult.error
    })
    settled.catch(fail)
    const store = await ready
    ctx.onClose(async (closeResult) => {
      close(closeResult)
      await settled.catch((error) => {
        if (closeResult.ok) throw error
      })
    })
    return store
  },
})
