import { describe, test, expect } from "vitest"
import { createScope, preset } from "@pumped-fn/lite"
import { capstoneClient, type CapstoneClient } from "../src/client"
import { serviceDetailView } from "../src/detail"
import type { ServiceDetail } from "../src/wire"

const detail: ServiceDetail = {
  id: "a",
  name: "api",
  type: "http",
  endpoint: "x",
  checkInterval: 30,
  timeout: 1000,
  criticality: "high",
  status: "unhealthy",
  createdAt: 0,
  updatedAt: 0,
  recentChecks: [
    { id: "c1", serviceId: "a", status: "healthy", responseTime: 12, error: null, timestamp: 1 },
    { id: "c2", serviceId: "a", status: "unhealthy", responseTime: null, error: "timeout", timestamp: 2 },
  ],
  incidents: [
    { id: "i1", serviceId: "a", startedAt: 0, recoveredAt: null, duration: null, checksFailedCount: 3 },
    { id: "i2", serviceId: "a", startedAt: 0, recoveredAt: 5, duration: 5, checksFailedCount: 1 },
  ],
}

function fakeClient(): CapstoneClient {
  return {
    listServices: async () => [],
    activeIncidents: async () => [],
    uptime: async () => 99.9,
    getService: async () => detail,
  }
}

describe("inside-out", () => {
  test("IO1: shapes a service detail — formatted uptime, mapped checks, open-incident count", async () => {
    const scope = createScope({ presets: [preset(capstoneClient, fakeClient())] })
    const ctx = scope.createContext()
    const view = await ctx.exec({ flow: serviceDetailView, input: { serviceId: "a", period: "30d" } })
    expect(view.uptimeLabel).toBe("99.90%")
    expect(view.recentChecks).toEqual([
      { status: "healthy", responseTime: 12, timestamp: 1 },
      { status: "unhealthy", responseTime: null, timestamp: 2 },
    ])
    expect(view.openIncidents).toBe(1)
    expect(view.name).toBe("api")
    await ctx.close({ ok: true })
    await scope.dispose()
  })
})
