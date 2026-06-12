import { createScope, preset } from "@pumped-fn/lite"
import { describe, expect, test } from "vitest"
import { checkExecutors, runCheck } from "../src/checker"
import { activeIncidents } from "../src/incidents"
import { clock } from "../src/infra/clock"
import { scheduler } from "../src/scheduler"
import { observability } from "../src/extensions/observability"
import type { ObservabilityRecord } from "../src/extensions/observability"
import { activeIncidentCount } from "../src/metrics"
import { listServices, registerService, updateService, deregisterService, getService } from "../src/registry"
import { exec, FakeClock } from "./fakes"

describe("outside-in", () => {
  test("OI-SC1: register 100 services via api flow; list shows 100 with status", async () => {
    const scope = createScope()

    for (let i = 0; i < 100; i++) {
      await exec(scope, registerService, {
        name: `service-${i}`,
        type: "http",
        endpoint: `https://service-${i}.test`,
        checkInterval: 60,
        timeout: 1000,
        criticality: "medium",
      })
    }

    const services = await exec(scope, listServices, undefined)
    expect(services).toHaveLength(100)
    expect(services.every((service) => service.status === "unknown")).toBe(true)
    await scope.dispose()
  })

  test("OI1: app API exposes raw register, update, deregister, and uptime boundaries", async () => {
    const scope = createScope()
    const ctx = scope.createContext()
    const raw = await ctx.exec({
      flow: registerService,
      rawInput: {
        name: "raw",
        type: "tcp",
        endpoint: "localhost:443",
        criticality: "medium",
      },
    })
    await ctx.close({ ok: true })
    await scope.flush()

    const updated = await exec(scope, updateService, { id: raw.id, patch: { criticality: "critical" } })
    expect(updated.criticality).toBe("critical")

    const uptimeCtx = scope.createContext()
    const { uptime } = await import("../src/metrics")
    expect(await uptimeCtx.exec({ flow: uptime, input: { serviceId: raw.id, period: "7d" } })).toBe(0)
    await uptimeCtx.close({ ok: true })
    await scope.flush()

    expect(await exec(scope, deregisterService, { id: raw.id })).toBe(true)

    const badCtx = scope.createContext()
    await expect(badCtx.exec({
      flow: registerService,
      rawInput: "invalid",
    })).rejects.toMatchObject({
      name: "ParseError",
      phase: "flow-input",
      label: "register-service",
    })
    await badCtx.close({ ok: false, error: new Error("parse failed") })
    await scope.dispose()
  })

  test("OI2: read endpoints expose service detail, history, current health, and incidents", async () => {
    const fakeClock = new FakeClock()
    const scope = createScope({
      presets: [
        preset(clock, fakeClock),
        preset(checkExecutors, {
          http: async () => ({ status: "unhealthy", responseTime: 5, error: "down" }),
          tcp: async () => ({ status: "healthy", responseTime: 1, error: null }),
          custom: async () => ({ status: "healthy", responseTime: 1, error: null }),
        }),
      ],
    })
    const service = await exec(scope, registerService, {
      name: "api",
      type: "http",
      endpoint: "https://api.test",
      checkInterval: 60,
      timeout: 1000,
      criticality: "high",
    })
    await fakeClock.advance(1_000)
    await exec(scope, runCheck, { serviceId: service.id })

    const { healthHistory, currentHealth } = await import("../src/checker")
    const { serviceIncidents } = await import("../src/incidents")
    const detail = await exec(scope, getService, { id: service.id })
    expect(detail.service.id).toBe(service.id)
    expect(detail.recentChecks).toHaveLength(1)
    expect(await exec(scope, currentHealth, { serviceId: service.id })).toBe("unhealthy")
    expect(await exec(scope, healthHistory, { serviceId: service.id, from: 0, to: fakeClock.now() })).toHaveLength(1)
    expect(await exec(scope, serviceIncidents, { serviceId: service.id })).toEqual([
      expect.objectContaining({ serviceId: service.id, recoveredAt: null }),
    ])
    await scope.dispose()
  })

  test("OI3: a root exec chain shares one requestId and a second root exec gets a fresh one", async () => {
    const fakeClock = new FakeClock()
    const records: ObservabilityRecord[] = []
    let nextId = 0
    const extension = observability(records, {
      now: () => fakeClock.now(),
      nextRequestId: () => `req-${++nextId}`,
    })
    const scope = createScope({ extensions: [extension], presets: [preset(clock, fakeClock)] })

    const service = await exec(scope, registerService, {
      name: "api",
      type: "http",
      endpoint: "https://api.test",
      checkInterval: 60,
      timeout: 1000,
      criticality: "medium",
    })
    await exec(scope, runCheck, { serviceId: service.id })

    const execs = records.filter((record) => record.kind === "exec")
    expect(execs.map((record) => [record.name, record.requestId])).toEqual([
      ["register-service", "req-1"],
      ["detect-transition", "req-2"],
      ["run-check", "req-2"],
    ])
    await scope.dispose()
  })

  test("OI-SC3: force unhealthy executor opens incident within one interval tick", async () => {
    const fakeClock = new FakeClock()
    const scope = createScope({
      presets: [
        preset(clock, fakeClock),
        preset(checkExecutors, {
          http: async () => ({ status: "unhealthy", responseTime: 5, error: "down" }),
          tcp: async () => ({ status: "healthy", responseTime: 1, error: null }),
          custom: async () => ({ status: "healthy", responseTime: 1, error: null }),
        }),
      ],
    })

    await scope.resolve(scheduler)
    const service = await exec(scope, registerService, {
      name: "api",
      type: "http",
      endpoint: "https://api.test",
      checkInterval: 60,
      timeout: 1000,
      criticality: "critical",
    })

    await fakeClock.advance(60_000)
    expect(await exec(scope, activeIncidents, undefined)).toEqual([
      expect.objectContaining({ serviceId: service.id, recoveredAt: null }),
    ])
    await scope.dispose()
  })

  test("OI-SC4: observability extension recorded latency for every exec", async () => {
    const fakeClock = new FakeClock()
    const records: ObservabilityRecord[] = []
    const extension = observability(records, { now: () => fakeClock.now(), nextRequestId: () => "req-1" })
    const scope = createScope({
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

    await scope.resolve(scheduler)
    await exec(scope, registerService, {
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
    await scope.dispose()
  })

  test("OI-SC4b: observability extension records failed executions before rethrowing", async () => {
    const fakeClock = new FakeClock()
    const records: ObservabilityRecord[] = []
    const extension = observability(records, { now: () => fakeClock.now(), nextRequestId: () => "req-1" })
    const scope = createScope({
      extensions: [extension],
      presets: [preset(clock, fakeClock)],
    })

    await expect(exec(scope, runCheck, { serviceId: "missing" })).rejects.toThrow("service not found: missing")

    expect(records.filter((record) => record.kind === "exec")).toEqual([
      expect.objectContaining({ name: "run-check", ok: false }),
    ])
    await scope.dispose()
  })
})
