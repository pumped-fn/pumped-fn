import { describe, test, expect } from "vitest"
import { createScope, preset } from "@pumped-fn/lite"
import { capstoneClient, type CapstoneClient } from "../src/client"
import { dashboardView } from "../src/dashboard"
import type { Criticality, Incident, ServiceStatus, Status } from "../src/wire"

function fakeClient(over: Partial<CapstoneClient>): CapstoneClient {
  return {
    listServices: async () => [],
    activeIncidents: async () => [],
    uptime: async () => 100,
    getService: async () => {
      throw new Error("not used")
    },
    ...over,
  }
}

function svc(id: string, status: Status, criticality: Criticality): ServiceStatus {
  return {
    id,
    name: id,
    type: "http",
    endpoint: "x",
    checkInterval: 30,
    timeout: 1000,
    criticality,
    status,
    createdAt: 0,
    updatedAt: 0,
  }
}

describe("inside-out", () => {
  test("IO1: summary counts services by status and counts active incidents", async () => {
    const services = [
      svc("a", "healthy", "low"),
      svc("b", "unhealthy", "high"),
      svc("c", "unknown", "low"),
      svc("d", "healthy", "low"),
    ]
    const incidents: Incident[] = [
      { id: "i1", serviceId: "b", startedAt: 0, recoveredAt: null, duration: null, checksFailedCount: 2 },
    ]
    const scope = createScope({
      presets: [preset(capstoneClient, fakeClient({ listServices: async () => services, activeIncidents: async () => incidents }))],
    })
    const ctx = scope.createContext()
    const view = await ctx.exec({ flow: dashboardView })
    expect(view.summary).toEqual({ total: 4, healthy: 2, unhealthy: 1, unknown: 1, activeIncidents: 1 })
    await ctx.close({ ok: true })
    await scope.dispose()
  })

  test("IO2: attention drops healthy services and sorts the rest by criticality", async () => {
    const services = [
      svc("a", "healthy", "critical"),
      svc("b", "unhealthy", "low"),
      svc("c", "unknown", "critical"),
    ]
    const scope = createScope({
      presets: [preset(capstoneClient, fakeClient({ listServices: async () => services }))],
    })
    const ctx = scope.createContext()
    const view = await ctx.exec({ flow: dashboardView })
    expect(view.attention.map((r) => r.id)).toEqual(["c", "b"])
    await ctx.close({ ok: true })
    await scope.dispose()
  })
})
