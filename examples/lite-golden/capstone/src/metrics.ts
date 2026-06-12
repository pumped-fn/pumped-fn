import { atom, controller, flow, typed } from "@pumped-fn/lite"
import { clock } from "./infra/clock"
import { store, storeRevision } from "./infra/store"

export type UptimeInput = {
  serviceId: string
  period: "7d" | "30d" | "90d"
}

const periodDays: Record<UptimeInput["period"], number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
}

export const uptime = flow({
  name: "uptime",
  parse: typed<UptimeInput>(),
  deps: { clock, store },
  factory: (ctx, { clock, store }) => {
    const from = clock.now() - periodDays[ctx.input.period] * 86_400_000
    const checks = store.checks.range(ctx.input.serviceId, from, clock.now())
    if (checks.length === 0) return 0
    const healthy = checks.filter((check) => check.status === "healthy").length
    return healthy / checks.length * 100
  },
})

export const activeIncidentCount = atom({
  deps: {
    revision: controller(storeRevision, { resolve: true, watch: true }),
    store,
  },
  factory: (_ctx, { store }) => store.incidents.active().length,
})
