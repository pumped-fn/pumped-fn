import { createScope, preset } from "@pumped-fn/lite"
import { describe, expect, test } from "vitest"
import type { HealthCheck, Service } from "../src/domain"
import { activeIncidents, detectTransition, meanTimeToRecovery, serviceIncidents } from "../src/incidents"
import { clock } from "../src/infra/clock"
import { createMemoryStore, storeDriver } from "../src/infra/store"
import { FakeClock } from "./fakes"

const service: Service = {
  id: "service",
  name: "api",
  type: "http",
  endpoint: "https://api.test",
  checkInterval: 60,
  timeout: 1000,
  criticality: "critical",
  createdAt: 0,
  updatedAt: 0,
}

function check(id: string, status: HealthCheck["status"], timestamp: number): HealthCheck {
  return {
    id,
    serviceId: service.id,
    status,
    responseTime: status === "healthy" ? 10 : null,
    error: status === "healthy" ? null : "down",
    timestamp,
  }
}

function seedIncident(store: ReturnType<typeof createMemoryStore>, id: string, startedAt: number): void {
  store.incidents.open({
    id,
    serviceId: service.id,
    startedAt,
    recoveredAt: null,
    duration: null,
    checksFailedCount: 1,
  })
}

describe("inside-out", () => {
  test("IO1: MTTR averages resolved incident durations", async () => {
    const store = createMemoryStore()
    seedIncident(store, "i1", 0)
    store.incidents.close("i1", 10)
    seedIncident(store, "i2", 20)
    store.incidents.close("i2", 40)
    seedIncident(store, "i3", 50)
    const scope = createScope({ presets: [preset(storeDriver, store)] })
    const ctx = scope.createContext()

    expect(await ctx.exec({ flow: meanTimeToRecovery, input: { serviceId: "service" } })).toBe(15)
    await ctx.close()
    await scope.dispose()
  })

  test("IO2: MTTR returns zero when no incident has resolved", async () => {
    const scope = createScope({ presets: [preset(storeDriver, createMemoryStore())] })
    const ctx = scope.createContext()

    expect(await ctx.exec({ flow: meanTimeToRecovery, input: { serviceId: "service" } })).toBe(0)
    await ctx.close()
    await scope.dispose()
  })

  test("IO3: consecutive unhealthy checks increment the open incident and report no transition", async () => {
    const fakeClock = new FakeClock()
    const store = createMemoryStore()
    const scope = createScope({ presets: [preset(storeDriver, store), preset(clock, fakeClock)] })
    const first = scope.createContext()
    const second = scope.createContext()

    const opened = await first.exec({ flow: detectTransition, input: { service, check: check("c1", "unhealthy", 0) } })
    await first.close({ ok: true })
    await fakeClock.advance(1_000)
    const repeated = await second.exec({ flow: detectTransition, input: { service, check: check("c2", "unhealthy", 1_000) } })
    await second.close({ ok: true })

    expect(opened.type).toBe("open")
    expect(repeated).toEqual({ type: "none", incident: null })
    expect(store.incidents.active()).toEqual([expect.objectContaining({ serviceId: service.id, checksFailedCount: 2 })])
    await scope.dispose()
  })

  test("IO4: active incidents are exposed through a flow boundary", async () => {
    const store = createMemoryStore()
    seedIncident(store, "i1", 0)
    const scope = createScope({ presets: [preset(storeDriver, store)] })
    const ctx = scope.createContext()

    expect(await ctx.exec({ flow: activeIncidents, input: undefined })).toEqual([
      expect.objectContaining({ id: "i1" }),
    ])
    await ctx.close()
    await scope.dispose()
  })

  test("IO5: an unhealthy check with no active incident opens one", async () => {
    const fakeClock = new FakeClock()
    await fakeClock.advance(2_000)
    const store = createMemoryStore()
    const scope = createScope({ presets: [preset(storeDriver, store), preset(clock, fakeClock)] })
    const ctx = scope.createContext()

    const event = await ctx.exec({ flow: detectTransition, input: { service, check: check("c1", "unhealthy", 2_000) } })
    await ctx.close({ ok: true })

    expect(event).toEqual({
      type: "open",
      incident: expect.objectContaining({
        serviceId: service.id,
        startedAt: 2_000,
        recoveredAt: null,
        duration: null,
        checksFailedCount: 1,
      }),
    })
    expect(store.incidents.active()).toEqual([expect.objectContaining({ serviceId: service.id })])
    await scope.dispose()
  })

  test("IO6: a healthy check resolves the active incident with recovery time and duration", async () => {
    const fakeClock = new FakeClock()
    await fakeClock.advance(5_000)
    const store = createMemoryStore()
    seedIncident(store, "i1", 1_000)
    const scope = createScope({ presets: [preset(storeDriver, store), preset(clock, fakeClock)] })
    const ctx = scope.createContext()

    const event = await ctx.exec({ flow: detectTransition, input: { service, check: check("c1", "healthy", 5_000) } })
    await ctx.close({ ok: true })

    expect(event).toEqual({
      type: "resolve",
      incident: expect.objectContaining({ id: "i1", recoveredAt: 5_000, duration: 4_000 }),
    })
    expect(store.incidents.active()).toEqual([])
    expect(store.incidents.byService(service.id)).toEqual([
      expect.objectContaining({ id: "i1", recoveredAt: 5_000, duration: 4_000 }),
    ])
    await scope.dispose()
  })

  test("IO7: a healthy check with no active incident reports no transition", async () => {
    const store = createMemoryStore()
    const scope = createScope({ presets: [preset(storeDriver, store)] })
    const ctx = scope.createContext()

    const event = await ctx.exec({ flow: detectTransition, input: { service, check: check("c1", "healthy", 0) } })
    await ctx.close({ ok: true })

    expect(event).toEqual({ type: "none", incident: null })
    expect(store.incidents.byService(service.id)).toEqual([])
    await scope.dispose()
  })

  test("IO8: serviceIncidents exposes per-service incident history through a flow boundary", async () => {
    const store = createMemoryStore()
    seedIncident(store, "i1", 0)
    store.incidents.close("i1", 10)
    seedIncident(store, "i2", 20)
    store.incidents.open({
      id: "other",
      serviceId: "other-service",
      startedAt: 0,
      recoveredAt: null,
      duration: null,
      checksFailedCount: 1,
    })
    const scope = createScope({ presets: [preset(storeDriver, store)] })
    const ctx = scope.createContext()

    expect((await ctx.exec({ flow: serviceIncidents, input: { serviceId: service.id } })).map((incident) => incident.id))
      .toEqual(["i1", "i2"])
    await ctx.close()
    await scope.dispose()
  })
})
