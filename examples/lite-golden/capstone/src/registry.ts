import { flow, tags, typed } from "@pumped-fn/lite"
import { NotFoundError, type HealthCheck, type Service } from "./domain"
import { clock } from "./infra/clock"
import { ids } from "./infra/ids"
import { store } from "./infra/store"
import { checkDefaults } from "./tags"

export type RegisterServiceInput = Omit<Service, "id" | "createdAt" | "updatedAt">
export type UpdateServiceInput = {
  id: string
  patch: Partial<Omit<Service, "id" | "createdAt" | "updatedAt">>
}
export type ServiceStatus = Service & {
  status: HealthCheck["status"]
}
export type ServiceDetail = {
  service: Service
  recentChecks: HealthCheck[]
}

function parseRegisterService(raw: unknown): RegisterServiceInput {
  if (typeof raw !== "object" || raw === null) throw new Error("service input must be an object")
  return raw as RegisterServiceInput
}

export const registerService = flow({
  name: "register-service",
  parse: parseRegisterService,
  deps: {
    clock,
    defaults: tags.required(checkDefaults),
    ids,
    store,
  },
  factory: (ctx, { clock, defaults, ids, store }) => {
    const now = clock.now()
    const service = {
      ...ctx.input,
      checkInterval: ctx.input.checkInterval ?? defaults.checkInterval,
      timeout: ctx.input.timeout ?? defaults.timeout,
      id: ids.next("service"),
      createdAt: now,
      updatedAt: now,
    }
    store.services.upsert(service)
    return service
  },
})

export const updateService = flow({
  name: "update-service",
  parse: typed<UpdateServiceInput>(),
  deps: { clock, store },
  factory: (ctx, { clock, store }) => {
    const current = store.services.get(ctx.input.id)
    if (current === undefined) throw new NotFoundError("service", ctx.input.id)
    const updated = {
      ...current,
      ...ctx.input.patch,
      id: current.id,
      createdAt: current.createdAt,
      updatedAt: clock.now(),
    }
    store.services.upsert(updated)
    return updated
  },
})

export const deregisterService = flow({
  name: "deregister-service",
  parse: typed<{ id: string }>(),
  deps: { store },
  factory: (ctx, { store }) => store.services.delete(ctx.input.id),
})

export const getService = flow({
  name: "get-service",
  parse: typed<{ id: string }>(),
  deps: { clock, store },
  factory: (ctx, { clock, store }): ServiceDetail => {
    const service = store.services.get(ctx.input.id)
    if (service === undefined) throw new NotFoundError("service", ctx.input.id)
    return {
      service,
      recentChecks: store.checks.range(service.id, 0, clock.now()).slice(-10),
    }
  },
})

export const listServices = flow({
  name: "list-services",
  deps: { store },
  factory: (_ctx, { store }): ServiceStatus[] => store.services.list().map((service) => ({
    ...service,
    status: store.checks.latest(service.id)?.status ?? "unknown",
  })),
})
