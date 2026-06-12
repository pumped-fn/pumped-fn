import { resource } from "@pumped-fn/lite"
import { store } from "./store"

export const tx = resource({
  name: "capstone.tx",
  deps: { store },
  factory: async (ctx, { store }) => {
    const tx = store.begin()
    ctx.onClose((result) => result.ok ? tx.commit() : tx.rollback())
    return tx
  },
})
