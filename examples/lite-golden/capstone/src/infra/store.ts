import { atom, controller, type Lite } from "@pumped-fn/lite"
import { NotFoundError, type HealthCheck, type Incident, type Service } from "../domain"
import type { StorePort, StoreTx } from "../ports"

export interface MemoryStore extends StorePort {
  readonly txEvents: string[]
}

async function retryStoreDriver(driver: Lite.Controller<StorePort>): Promise<StorePort> {
  try {
    return await driver.resolve()
  } catch {
    await driver.release()
    return driver.resolve()
  }
}

export function createMemoryStore(): MemoryStore {
  const services = new Map<string, Service>()
  const checks = new Map<string, HealthCheck[]>()
  const incidents = new Map<string, Incident>()
  const txEvents: string[] = []

  const appendCheck = (check: HealthCheck) => {
    const items = checks.get(check.serviceId) ?? []
    items.push(check)
    checks.set(check.serviceId, items)
  }
  const openIncident = (incident: Incident) => {
    incidents.set(incident.id, incident)
  }
  const closeIncident = (id: string, recoveredAt: number) => {
    const incident = incidents.get(id)
    if (incident === undefined) throw new NotFoundError("incident", id)
    incidents.set(id, {
      ...incident,
      recoveredAt,
      duration: recoveredAt - incident.startedAt,
    })
  }

  return {
    txEvents,
    services: {
      upsert(service) {
        services.set(service.id, service)
      },
      get: (id) => services.get(id),
      delete: (id) => services.delete(id),
      list: () => [...services.values()],
    },
    checks: {
      append: appendCheck,
      range(serviceId, from, to) {
        return (checks.get(serviceId) ?? []).filter((check) => check.timestamp >= from && check.timestamp <= to)
      },
      latest(serviceId) {
        const items = checks.get(serviceId) ?? []
        return items[items.length - 1]
      },
    },
    incidents: {
      open: openIncident,
      close: closeIncident,
      active: () => [...incidents.values()].filter((incident) => incident.recoveredAt === null),
      byService: (serviceId) => [...incidents.values()].filter((incident) => incident.serviceId === serviceId),
    },
    begin(): StoreTx {
      txEvents.push("begin")
      const ops: Array<() => void> = []
      return {
        checks: {
          append(check) {
            ops.push(() => appendCheck(check))
          },
        },
        incidents: {
          open(incident) {
            ops.push(() => openIncident(incident))
          },
          close(id, recoveredAt) {
            ops.push(() => closeIncident(id, recoveredAt))
          },
        },
        async commit() {
          for (const op of ops) op()
          txEvents.push("commit")
        },
        async rollback() {
          txEvents.push("rollback")
        },
      }
    },
  }
}

export const storeRevision = atom({
  factory: () => 0,
})

export const serviceRevision = atom({
  factory: () => 0,
})

export const storeDriver = atom<StorePort>({
  keepAlive: true,
  factory: () => createMemoryStore(),
})

export const store = atom({
  keepAlive: true,
  deps: {
    driver: controller(storeDriver),
    revision: controller(storeRevision, { resolve: true }),
    servicesChanged: controller(serviceRevision, { resolve: true }),
  },
  factory: async (_ctx, { driver, revision, servicesChanged }): Promise<StorePort> => {
    const port = await retryStoreDriver(driver)
    const touch = () => revision.update((value) => value + 1)
    const touchServices = () => {
      touch()
      servicesChanged.update((value) => value + 1)
    }
    return {
      services: {
        upsert(service) {
          port.services.upsert(service)
          touchServices()
        },
        get: (id) => port.services.get(id),
        delete(id) {
          const deleted = port.services.delete(id)
          touchServices()
          return deleted
        },
        list: () => port.services.list(),
      },
      checks: {
        append(check) {
          port.checks.append(check)
          touch()
        },
        range: (serviceId, from, to) => port.checks.range(serviceId, from, to),
        latest: (serviceId) => port.checks.latest(serviceId),
      },
      incidents: {
        open(incident) {
          port.incidents.open(incident)
          touch()
        },
        close(id, recoveredAt) {
          port.incidents.close(id, recoveredAt)
          touch()
        },
        active: () => port.incidents.active(),
        byService: (serviceId) => port.incidents.byService(serviceId),
      },
      begin() {
        const tx = port.begin()
        return {
          checks: tx.checks,
          incidents: tx.incidents,
          async commit() {
            await tx.commit()
            touch()
          },
          rollback: () => tx.rollback(),
        }
      },
    }
  },
})
