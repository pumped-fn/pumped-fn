import { atom } from "@pumped-fn/lite"
import { authedBffClient } from "./bff"
import type { DashboardView } from "./bff"

export const dashboard = atom({
  deps: { client: authedBffClient },
  factory: async (_ctx, { client }): Promise<DashboardView | null> => {
    if (client === null) return null
    return client.dashboard()
  },
})
