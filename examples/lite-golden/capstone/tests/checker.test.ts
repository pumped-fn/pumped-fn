import { createScope, preset } from "@pumped-fn/lite"
import { describe, expect, test } from "vitest"
import { currentHealth, healthHistory, runCheck } from "../src/checker"
import type { HealthCheck, Service } from "../src/domain"
import { createMemoryStore, storeDriver } from "../src/infra/store"
import { listServices, registerService, type RegisterServiceInput } from "../src/registry"

function serviceInput(name: string, type: Service["type"], endpoint: string): RegisterServiceInput {
  return {
    name,
    type,
    endpoint,
    checkInterval: 60,
    timeout: 1000,
    criticality: "medium",
  }
}

function seedCheck(id: string, status: HealthCheck["status"], timestamp: number): HealthCheck {
  return {
    id,
    serviceId: "service",
    status,
    responseTime: status === "healthy" ? 10 : null,
    error: status === "healthy" ? null : "down",
    timestamp,
  }
}

describe("inside-out", () => {
  test("IO1: default tcp and custom executors are usable through checker and registry flows", async () => {
    const scope = createScope()
    const registerCtx = scope.createContext()
    const tcp = await registerCtx.exec({ flow: registerService, input: serviceInput("tcp", "tcp", "localhost:443") })
    const http = await registerCtx.exec({ flow: registerService, input: serviceInput("http", "http", "https://example.test") })
    const custom = await registerCtx.exec({ flow: registerService, input: serviceInput("custom", "custom", "script:check") })
    await registerCtx.close({ ok: true })

    for (const service of [http, tcp, custom]) {
      const checkCtx = scope.createContext()
      expect(await checkCtx.exec({ flow: runCheck, input: { serviceId: service.id } })).toMatchObject({
        serviceId: service.id,
        status: "healthy",
      })
      await checkCtx.close({ ok: true })
    }

    const listCtx = scope.createContext()
    expect((await listCtx.exec({ flow: listServices, input: undefined })).map((service) => service.status))
      .toEqual(["healthy", "healthy", "healthy"])
    await listCtx.close({ ok: true })
    await scope.dispose()
  })

  test("IO2: checking a missing service reports a domain error", async () => {
    const scope = createScope()
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: runCheck, input: { serviceId: "missing" } })).rejects.toThrow("service not found: missing")
    await ctx.close({ ok: false, error: new Error("missing") })
    await scope.dispose()
  })

  test("IO3: healthHistory returns only the checks inside the requested range", async () => {
    const store = createMemoryStore()
    store.checks.append(seedCheck("c1", "healthy", 1_000))
    store.checks.append(seedCheck("c2", "unhealthy", 2_000))
    store.checks.append(seedCheck("c3", "healthy", 3_000))
    const scope = createScope({ presets: [preset(storeDriver, store)] })
    const ctx = scope.createContext()

    const history = await ctx.exec({ flow: healthHistory, input: { serviceId: "service", from: 1_500, to: 2_500 } })

    expect(history.map((check) => check.id)).toEqual(["c2"])
    await ctx.close({ ok: true })
    await scope.dispose()
  })

  test("IO4: currentHealth reports the latest check status and unknown when none exists", async () => {
    const store = createMemoryStore()
    store.checks.append(seedCheck("c1", "healthy", 1_000))
    store.checks.append(seedCheck("c2", "unhealthy", 2_000))
    const scope = createScope({ presets: [preset(storeDriver, store)] })
    const ctx = scope.createContext()

    expect(await ctx.exec({ flow: currentHealth, input: { serviceId: "service" } })).toBe("unhealthy")
    expect(await ctx.exec({ flow: currentHealth, input: { serviceId: "unchecked" } })).toBe("unknown")
    await ctx.close({ ok: true })
    await scope.dispose()
  })
})
