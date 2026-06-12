import { createScope, ParseError, preset } from "@pumped-fn/lite"
import { describe, expect, test } from "vitest"
import { createMemoryStore, storeDriver } from "../src/infra/store"
import { deregisterService, getService, listServices, registerService, updateService } from "../src/registry"
import { checkDefaults } from "../src/tags"

describe("inside-out", () => {
  test("IO1: registry flows update, deregister, and parse raw input without the app shell", async () => {
    const scope = createScope()
    const ctx = scope.createContext()
    const rawRegistered = await ctx.exec({
      flow: registerService,
      rawInput: {
        name: "raw",
        type: "tcp",
        endpoint: "localhost:443",
        criticality: "medium",
      },
    })
    expect(rawRegistered.checkInterval).toBe(60)
    expect(rawRegistered.timeout).toBe(1000)
    const service = await ctx.exec({
      flow: registerService,
      input: {
        name: "api",
        type: "http",
        endpoint: "https://api.test",
        checkInterval: 60,
        timeout: 1000,
        criticality: "low",
      },
    })

    const updated = await ctx.exec({ flow: updateService, input: { id: service.id, patch: { criticality: "critical" } } })
    expect(updated.criticality).toBe("critical")
    expect(await ctx.exec({ flow: deregisterService, input: { id: service.id } })).toBe(true)
    expect(await ctx.exec({ flow: deregisterService, input: { id: rawRegistered.id } })).toBe(true)
    expect(await ctx.exec({ flow: listServices, input: undefined })).toEqual([])
    await ctx.close({ ok: true })

    const badCtx = scope.createContext()
    await expect(badCtx.exec({
      flow: registerService,
      rawInput: "invalid",
    })).rejects.toMatchObject({
      name: "ParseError",
      phase: "flow-input",
      label: "register-service",
    } satisfies Partial<ParseError>)
    await badCtx.close({ ok: false, error: new Error("parse failed") })
    expect(() => checkDefaults({ checkInterval: 5, timeout: 10 })).not.toThrow()
    expect(() => checkDefaults("invalid" as never)).toThrow(ParseError)
    await scope.dispose()
  })

  test("IO2: updating a missing service reports a domain error", async () => {
    const scope = createScope()
    const ctx = scope.createContext()

    await expect(ctx.exec({
      flow: updateService,
      input: { id: "missing", patch: { criticality: "critical" } },
    })).rejects.toThrow("service not found: missing")
    await ctx.close({ ok: false, error: new Error("missing") })
    await scope.dispose()
  })

  test("IO3: getService returns the service detail with its recent check history", async () => {
    const store = createMemoryStore()
    store.services.upsert({
      id: "service-1",
      name: "api",
      type: "http",
      endpoint: "https://api.test",
      checkInterval: 60,
      timeout: 1000,
      criticality: "high",
      createdAt: 0,
      updatedAt: 0,
    })
    for (let i = 1; i <= 12; i++) {
      store.checks.append({
        id: `c${i}`,
        serviceId: "service-1",
        status: "healthy",
        responseTime: i,
        error: null,
        timestamp: i,
      })
    }
    const scope = createScope({ presets: [preset(storeDriver, store)] })
    const ctx = scope.createContext()

    const detail = await ctx.exec({ flow: getService, input: { id: "service-1" } })

    expect(detail.service.name).toBe("api")
    expect(detail.recentChecks.map((check) => check.id)).toEqual(
      ["c3", "c4", "c5", "c6", "c7", "c8", "c9", "c10", "c11", "c12"],
    )
    await ctx.close({ ok: true })
    await scope.dispose()
  })

  test("IO4: getService for a missing id reports a domain error", async () => {
    const scope = createScope()
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: getService, input: { id: "missing" } })).rejects.toThrow("service not found: missing")
    await ctx.close({ ok: false, error: new Error("missing") })
    await scope.dispose()
  })
})
