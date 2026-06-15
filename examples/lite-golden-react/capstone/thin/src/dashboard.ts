import { atom, controller } from "@pumped-fn/lite"
import { bffClient } from "./bff"
import { sessionToken } from "./session"
import type { DashboardView } from "./bff"

export const dashboard = atom({
  deps: {
    client: bffClient,
    tokenControl: controller(sessionToken, { resolve: true, watch: true }),
  },
  factory: async (_ctx, { client, tokenControl }): Promise<DashboardView | null> => {
    const token = tokenControl.get()
    if (token === null) return null
    return client.dashboard(token)
  },
})
