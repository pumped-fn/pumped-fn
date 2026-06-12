import { createScope, type Lite } from "@pumped-fn/lite"
import type { HealthCheck, Incident, Service } from "./domain"
import { currentHealth, healthHistory, runCheck, type RunCheckResult } from "./checker"
import { activeIncidents, serviceIncidents } from "./incidents"
import { activeIncidentCount, uptime, type UptimeInput } from "./metrics"
import {
  deregisterService,
  getService,
  listServices,
  registerService,
  type RegisterServiceInput,
  type ServiceDetail,
  type ServiceStatus,
  updateService,
  type UpdateServiceInput,
} from "./registry"
import { scheduler } from "./scheduler"
import { store, storeDriver } from "./infra/store"

export interface HealthMonitorApi {
  registerService(input: RegisterServiceInput): Promise<Service>
  registerRaw(rawInput: unknown): Promise<Service>
  updateService(id: string, patch: UpdateServiceInput["patch"]): Promise<Service>
  deregisterService(id: string): Promise<boolean>
  listServices(): Promise<ServiceStatus[]>
  getService(id: string): Promise<ServiceDetail>
  runCheck(serviceId: string): Promise<RunCheckResult>
  healthHistory(input: { serviceId: string; from: number; to: number }): Promise<HealthCheck[]>
  currentHealth(serviceId: string): Promise<HealthCheck["status"]>
  uptime(input: UptimeInput): Promise<number>
  activeIncidents(): Promise<Incident[]>
  serviceIncidents(serviceId: string): Promise<Incident[]>
  activeIncidentCount(): Promise<number>
  startScheduler(): Promise<void>
  reconnectStore(): Promise<void>
}

export interface HealthMonitorApp {
  scope: Lite.Scope
  api: HealthMonitorApi
}

export function createApp(options: Lite.ScopeOptions = {}): HealthMonitorApp {
  const scope = createScope(options)

  async function run<Output>(exec: (ctx: Lite.ExecutionContext) => Promise<Output>): Promise<Output> {
    const ctx = scope.createContext()
    try {
      const output = await exec(ctx)
      await ctx.close({ ok: true })
      await scope.flush()
      return output
    } catch (error) {
      await ctx.close({ ok: false, error })
      throw error
    }
  }

  return {
    scope,
    api: {
      registerService: (input) => run((ctx) => ctx.exec({ flow: registerService, input })),
      registerRaw: (rawInput) => run((ctx) => ctx.exec({ flow: registerService, rawInput })),
      updateService: (id, patch) => run((ctx) => ctx.exec({ flow: updateService, input: { id, patch } })),
      deregisterService: (id) => run((ctx) => ctx.exec({ flow: deregisterService, input: { id } })),
      listServices: () => run((ctx) => ctx.exec({ flow: listServices, input: undefined })),
      getService: (id) => run((ctx) => ctx.exec({ flow: getService, input: { id } })),
      runCheck: (serviceId) => run((ctx) => ctx.exec({ flow: runCheck, input: { serviceId } })),
      healthHistory: (input) => run((ctx) => ctx.exec({ flow: healthHistory, input })),
      currentHealth: (serviceId) => run((ctx) => ctx.exec({ flow: currentHealth, input: { serviceId } })),
      uptime: (input) => run((ctx) => ctx.exec({ flow: uptime, input })),
      activeIncidents: () => run((ctx) => ctx.exec({ flow: activeIncidents, input: undefined })),
      serviceIncidents: (serviceId) => run((ctx) => ctx.exec({ flow: serviceIncidents, input: { serviceId } })),
      activeIncidentCount: () => scope.resolve(activeIncidentCount),
      startScheduler: async () => {
        await scope.resolve(scheduler)
      },
      reconnectStore: async () => {
        await scope.release(store)
        await scope.controller(storeDriver).release()
        await scope.flush()
        await scope.resolve(store)
      },
    },
  }
}
