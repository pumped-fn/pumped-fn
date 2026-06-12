import { preset } from "@pumped-fn/lite"
import { describe, expect, test } from "vitest"
import { createApp } from "../src/app"
import { checkExecutors } from "../src/checker"
import { observability } from "../src/extensions/observability"
import type { ObservabilityRecord } from "../src/extensions/observability"
import { clock } from "../src/infra/clock"
import { FakeClock } from "./fakes"

describe("outside-in", () => {
  test("OI-SC1: register 100 services via api flow; list shows 100 with status", async () => {
    const app = createApp()

    for (let i = 0; i < 100; i++) {
      await app.api.registerService({
        name: `service-${i}`,
        type: "http",
        endpoint: `https://service-${i}.test`,
        checkInterval: 60,
        timeout: 1000,
        criticality: "medium",
      })
    }

    const services = await app.api.listServices()
    expect(services).toHaveLength(100)
    expect(services.every((service) => service.status === "unknown")).toBe(true)
    await app.scope.dispose()
  })

  test("OI1: app API exposes raw register, update, deregister, and uptime boundaries", async () => {
    const app = createApp()
    const raw = await app.api.registerRaw({
      name: "raw",
      type: "tcp",
      endpoint: "localhost:443",
      criticality: "medium",
    })

    const updated = await app.api.updateService(raw.id, { criticality: "critical" })
    expect(updated.criticality).toBe("critical")
    expect(await app.api.uptime({ serviceId: raw.id, period: "7d" })).toBe(0)
    expect(await app.api.deregisterService(raw.id)).toBe(true)
    await expect(app.api.registerRaw("invalid")).rejects.toMatchObject({
      name: "ParseError",
      phase: "flow-input",
      label: "register-service",
    })
    await app.scope.dispose()
  })

  test("OI2: read endpoints expose service detail, history, current health, and incidents", async () => {
    const fakeClock = new FakeClock()
    const app = createApp({
      presets: [
        preset(clock, fakeClock),
        preset(checkExecutors, {
          http: async () => ({ status: "unhealthy", responseTime: 5, error: "down" }),
          tcp: async () => ({ status: "healthy", responseTime: 1, error: null }),
          custom: async () => ({ status: "healthy", responseTime: 1, error: null }),
        }),
      ],
    })
    const service = await app.api.registerService({
      name: "api",
      type: "http",
      endpoint: "https://api.test",
      checkInterval: 60,
      timeout: 1000,
      criticality: "high",
    })
    await fakeClock.advance(1_000)
    await app.api.runCheck(service.id)

    const detail = await app.api.getService(service.id)
    expect(detail.service.id).toBe(service.id)
    expect(detail.recentChecks).toHaveLength(1)
    expect(await app.api.currentHealth(service.id)).toBe("unhealthy")
    expect(await app.api.healthHistory({ serviceId: service.id, from: 0, to: fakeClock.now() })).toHaveLength(1)
    expect(await app.api.serviceIncidents(service.id)).toEqual([
      expect.objectContaining({ serviceId: service.id, recoveredAt: null }),
    ])
    await app.scope.dispose()
  })

  test("OI3: a root exec chain shares one requestId and a second root exec gets a fresh one", async () => {
    const fakeClock = new FakeClock()
    const records: ObservabilityRecord[] = []
    let nextId = 0
    const extension = observability(records, {
      now: () => fakeClock.now(),
      nextRequestId: () => `req-${++nextId}`,
    })
    const app = createApp({ extensions: [extension], presets: [preset(clock, fakeClock)] })

    const service = await app.api.registerService({
      name: "api",
      type: "http",
      endpoint: "https://api.test",
      checkInterval: 60,
      timeout: 1000,
      criticality: "medium",
    })
    await app.api.runCheck(service.id)

    const execs = records.filter((record) => record.kind === "exec")
    expect(execs.map((record) => [record.name, record.requestId])).toEqual([
      ["register-service", "req-1"],
      ["detect-transition", "req-2"],
      ["run-check", "req-2"],
    ])
    await app.scope.dispose()
  })

  test("OI-SC3: force unhealthy executor opens incident within one interval tick", async () => {
    const fakeClock = new FakeClock()
    const app = createApp({
      presets: [
        preset(clock, fakeClock),
        preset(checkExecutors, {
          http: async () => ({ status: "unhealthy", responseTime: 5, error: "down" }),
          tcp: async () => ({ status: "healthy", responseTime: 1, error: null }),
          custom: async () => ({ status: "healthy", responseTime: 1, error: null }),
        }),
      ],
    })

    await app.api.startScheduler()
    const service = await app.api.registerService({
      name: "api",
      type: "http",
      endpoint: "https://api.test",
      checkInterval: 60,
      timeout: 1000,
      criticality: "critical",
    })

    await fakeClock.advance(60_000)
    expect(await app.api.activeIncidents()).toEqual([
      expect.objectContaining({ serviceId: service.id, recoveredAt: null }),
    ])
    await app.scope.dispose()
  })

  test("OI-SC4: observability extension recorded latency for every exec", async () => {
    const fakeClock = new FakeClock()
    const records: ObservabilityRecord[] = []
    const extension = observability(records, { now: () => fakeClock.now(), nextRequestId: () => "req-1" })
    const app = createApp({
      extensions: [extension],
      presets: [
        preset(clock, fakeClock),
        preset(checkExecutors, {
          http: async () => ({ status: "healthy", responseTime: 7, error: null }),
          tcp: async () => ({ status: "healthy", responseTime: 1, error: null }),
          custom: async () => ({ status: "healthy", responseTime: 1, error: null }),
        }),
      ],
    })

    await app.api.startScheduler()
    await app.api.registerService({
      name: "api",
      type: "http",
      endpoint: "https://api.test",
      checkInterval: 60,
      timeout: 1000,
      criticality: "high",
    })
    await fakeClock.advance(60_000)

    const execs = records.filter((record) => record.kind === "exec")
    expect(execs.map((record) => record.name)).toEqual(["register-service", "detect-transition", "run-check"])
    expect(execs.every((record) => record.durationMs >= 0 && record.ok)).toBe(true)
    await app.scope.dispose()
  })

  test("OI-SC4b: observability extension records failed executions before rethrowing", async () => {
    const fakeClock = new FakeClock()
    const records: ObservabilityRecord[] = []
    const extension = observability(records, { now: () => fakeClock.now(), nextRequestId: () => "req-1" })
    const app = createApp({
      extensions: [extension],
      presets: [preset(clock, fakeClock)],
    })

    await expect(app.api.runCheck("missing")).rejects.toThrow("service not found: missing")

    expect(records.filter((record) => record.kind === "exec")).toEqual([
      expect.objectContaining({ name: "run-check", ok: false }),
    ])
    await app.scope.dispose()
  })
})
