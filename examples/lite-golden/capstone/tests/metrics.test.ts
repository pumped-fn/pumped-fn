import { createScope, preset } from "@pumped-fn/lite"
import { describe, expect, test } from "vitest"
import { clock } from "../src/infra/clock"
import { createMemoryStore, store, storeDriver } from "../src/infra/store"
import { activeIncidentCount, uptime } from "../src/metrics"
import { FakeClock } from "./fakes"

describe("inside-out", () => {
  test("IO-SC5: synthetic history gives exact uptime arithmetic for 90d/30d/7d windows", async () => {
    const fakeClock = new FakeClock()
    const driver = createMemoryStore()
    const service90 = "service-90"
    const service30 = "service-30"
    const service7 = "service-7"
    const day = 86_400_000
    await fakeClock.advance(100 * day)

    for (let i = 0; i < 10; i++) {
      driver.checks.append({
        id: `check-90-${i}`,
        serviceId: service90,
        status: i === 0 ? "unhealthy" : "healthy",
        responseTime: i,
        error: i === 0 ? "down" : null,
        timestamp: fakeClock.now() - i * day,
      })
    }
    for (let i = 0; i < 10; i++) {
      driver.checks.append({
        id: `check-30-${i}`,
        serviceId: service30,
        status: i === 0 ? "unhealthy" : "healthy",
        responseTime: i,
        error: i === 0 ? "down" : null,
        timestamp: fakeClock.now() - i * day,
      })
    }
    for (let i = 0; i < 8; i++) {
      driver.checks.append({
        id: `check-7-${i}`,
        serviceId: service7,
        status: i === 0 ? "unhealthy" : "healthy",
        responseTime: i,
        error: i === 0 ? "down" : null,
        timestamp: fakeClock.now() - i * day,
      })
    }

    const scope = createScope({
      presets: [preset(clock, fakeClock), preset(storeDriver, driver)],
    })
    const ctx = scope.createContext()
    expect(await ctx.exec({ flow: uptime, input: { serviceId: service90, period: "90d" } })).toBe(90)
    expect(await ctx.exec({ flow: uptime, input: { serviceId: service30, period: "30d" } })).toBe(90)
    expect(await ctx.exec({ flow: uptime, input: { serviceId: service7, period: "7d" } })).toBe(87.5)
    expect(await scope.resolve(activeIncidentCount)).toBe(0)
    await ctx.close()
    await scope.dispose()
  })

  test("IO2: empty uptime window returns zero instead of NaN", async () => {
    const fakeClock = new FakeClock()
    const scope = createScope({ presets: [preset(clock, fakeClock), preset(storeDriver, createMemoryStore())] })
    const ctx = scope.createContext()

    expect(await ctx.exec({ flow: uptime, input: { serviceId: "missing", period: "7d" } })).toBe(0)
    await ctx.close()
    await scope.dispose()
  })

  test("IO3: watch-derived active incident count tracks committed incident writes", async () => {
    const scope = createScope({ presets: [preset(storeDriver, createMemoryStore())] })
    const port = await scope.resolve(store)

    expect(await scope.resolve(activeIncidentCount)).toBe(0)

    port.incidents.open({
      id: "i1",
      serviceId: "service",
      startedAt: 0,
      recoveredAt: null,
      duration: null,
      checksFailedCount: 1,
    })
    await scope.flush()
    expect(scope.controller(activeIncidentCount).get()).toBe(1)

    port.incidents.close("i1", 5)
    await scope.flush()
    expect(scope.controller(activeIncidentCount).get()).toBe(0)
    await scope.dispose()
  })
})
