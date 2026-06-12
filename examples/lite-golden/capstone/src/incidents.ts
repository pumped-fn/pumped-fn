import { flow, typed } from "@pumped-fn/lite"
import type { HealthCheck, Incident, Service } from "./domain"
import { clock } from "./infra/clock"
import { ids } from "./infra/ids"
import { store } from "./infra/store"
import { tx } from "./infra/tx"

export type TransitionInput = {
  service: Service
  check: HealthCheck
}

export type IncidentEvent =
  | { type: "none"; incident: null }
  | { type: "open"; incident: Incident }
  | { type: "resolve"; incident: Incident }

export const detectTransition = flow({
  name: "detect-transition",
  parse: typed<TransitionInput>(),
  deps: {
    clock,
    ids,
    store,
    tx,
  },
  factory: (ctx, { clock, ids, store, tx }) => {
    const active = store.incidents.byService(ctx.input.service.id).find((incident) => incident.recoveredAt === null)
    if (ctx.input.check.status !== "healthy" && active === undefined) {
      const incident = {
        id: ids.next("incident"),
        serviceId: ctx.input.service.id,
        startedAt: clock.now(),
        recoveredAt: null,
        duration: null,
        checksFailedCount: 1,
      }
      tx.incidents.open(incident)
      return { type: "open", incident }
    }
    if (ctx.input.check.status !== "healthy" && active !== undefined) {
      tx.incidents.open({
        ...active,
        checksFailedCount: active.checksFailedCount + 1,
      })
      return { type: "none", incident: null }
    }
    if (ctx.input.check.status === "healthy" && active !== undefined) {
      const recoveredAt = clock.now()
      tx.incidents.close(active.id, recoveredAt)
      return {
        type: "resolve",
        incident: { ...active, recoveredAt, duration: recoveredAt - active.startedAt },
      }
    }
    return { type: "none", incident: null }
  },
})

export const activeIncidents = flow({
  name: "active-incidents",
  deps: { store },
  factory: (_ctx, { store }) => store.incidents.active(),
})

export const serviceIncidents = flow({
  name: "service-incidents",
  parse: typed<{ serviceId: string }>(),
  deps: { store },
  factory: (ctx, { store }) => store.incidents.byService(ctx.input.serviceId),
})

export const meanTimeToRecovery = flow({
  name: "mean-time-to-recovery",
  parse: typed<{ serviceId: string }>(),
  deps: { store },
  factory: (ctx, { store }) => {
    const durations = store.incidents.byService(ctx.input.serviceId).flatMap((incident) =>
      incident.duration === null ? [] : [incident.duration]
    )
    if (durations.length === 0) return 0
    return durations.reduce((total, duration) => total + duration, 0) / durations.length
  },
})
