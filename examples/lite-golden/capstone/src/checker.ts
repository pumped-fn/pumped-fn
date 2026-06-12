import { atom, flow, typed } from "@pumped-fn/lite"
import { NotFoundError, type HealthCheck } from "./domain"
import type { CheckExecutor } from "./ports"
import { detectTransition, type IncidentEvent } from "./incidents"
import { clock } from "./infra/clock"
import { ids } from "./infra/ids"
import { store } from "./infra/store"
import { tx } from "./infra/tx"

export type CheckExecutors = Record<"http" | "tcp" | "custom", CheckExecutor>

export interface RunCheckResult {
  serviceId: string
  status: "healthy" | "unhealthy" | "unknown"
  transition: IncidentEvent
}

export const checkExecutors = atom<CheckExecutors>({
  factory: () => ({
    http: async () => ({ status: "healthy", responseTime: 1, error: null }),
    tcp: async () => ({ status: "healthy", responseTime: 1, error: null }),
    custom: async () => ({ status: "healthy", responseTime: 1, error: null }),
  }),
})

export const runCheck = flow({
  name: "run-check",
  parse: typed<{ serviceId: string }>(),
  deps: {
    checkExecutors,
    clock,
    ids,
    store,
    tx,
  },
  factory: async (ctx, { checkExecutors, clock, ids, store, tx }): Promise<RunCheckResult> => {
    const service = store.services.get(ctx.input.serviceId)
    if (service === undefined) throw new NotFoundError("service", ctx.input.serviceId)
    const result = await checkExecutors[service.type](ctx, service)
    const check = {
      id: ids.next("check"),
      serviceId: service.id,
      status: result.status,
      responseTime: result.responseTime,
      error: result.error,
      timestamp: clock.now(),
    }
    tx.checks.append(check)
    const transition = await ctx.exec({ flow: detectTransition, input: { service, check } })
    return {
      serviceId: service.id,
      status: check.status,
      transition,
    }
  },
})

export const healthHistory = flow({
  name: "health-history",
  parse: typed<{ serviceId: string; from: number; to: number }>(),
  deps: { store },
  factory: (ctx, { store }): HealthCheck[] => store.checks.range(ctx.input.serviceId, ctx.input.from, ctx.input.to),
})

export const currentHealth = flow({
  name: "current-health",
  parse: typed<{ serviceId: string }>(),
  deps: { store },
  factory: (ctx, { store }): HealthCheck["status"] => store.checks.latest(ctx.input.serviceId)?.status ?? "unknown",
})
