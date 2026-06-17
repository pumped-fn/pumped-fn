import { atom, createScope, preset } from "@pumped-fn/lite"
import { describe, expect, test } from "vitest"
import { createMemoryStore, reconnectStore, store, storeDriver } from "../src/infra/store"
import { listServices, registerService } from "../src/registry"
import type { StorePort } from "../src/ports"

const serviceInput = {
  name: "recovered",
  type: "http" as const,
  endpoint: "https://recovered.test",
  checkInterval: 60,
  timeout: 1000,
  criticality: "medium" as const,
}

describe("outside-in", () => {
  test("OI-SC6: preset flaky driver retries the transient failure and survives reconnect untouched", async () => {
    let attempts = 0
    const flakyDriver = atom({
      factory: () => {
        attempts++
        if (attempts === 1) throw new Error("driver offline")
        return createMemoryStore()
      },
    })
    const scope = createScope({ presets: [preset(storeDriver, flakyDriver)] })
    const ctx = scope.createContext()

    expect(await ctx.exec({ flow: listServices })).toEqual([])
    expect(attempts).toBe(2)

    await ctx.exec({ flow: registerService, input: { ...serviceInput, name: "kept" } })
    await ctx.exec({ flow: reconnectStore })

    expect(attempts).toBe(2)
    expect(await ctx.exec({ flow: listServices })).toHaveLength(1)
    await ctx.exec({ flow: registerService, input: serviceInput })
    expect(await ctx.exec({ flow: listServices })).toHaveLength(2)
    await ctx.close()
    await scope.dispose()
  })

  test("OI1: reconnect without a replacement driver atom resets the store", async () => {
    const scope = createScope()
    const ctx = scope.createContext()
    await ctx.exec({
      flow: registerService,
      input: { ...serviceInput, name: "temporary", endpoint: "https://temporary.test" },
    })

    await ctx.exec({ flow: reconnectStore })

    expect(await ctx.exec({ flow: listServices })).toEqual([])
    await ctx.close()
    await scope.dispose()
  })

  test("OI2: a driver failing both attempts propagates the failure to the caller", async () => {
    let attempts = 0
    const deadDriver = atom({
      factory: (): StorePort => {
        attempts++
        throw new Error("driver offline")
      },
    })
    const scope = createScope({ presets: [preset(storeDriver, deadDriver)] })
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: listServices })).rejects.toThrow("driver offline")
    expect(attempts).toBe(2)
    await ctx.close()
    await scope.dispose()
  })
})

describe("effect-managed", () => {
  test("E1: keepAlive store survives idle GC without the scheduler pinning it", async () => {
    const scope = createScope({ gc: { graceMs: 1 } })
    const port = await scope.resolve(store)
    port.services.upsert({
      id: "service-1",
      name: "api",
      type: "http",
      endpoint: "https://api.test",
      checkInterval: 60,
      timeout: 1000,
      criticality: "medium",
      createdAt: 0,
      updatedAt: 0,
    })

    await new Promise((resolve) => setTimeout(resolve, 10))
    await scope.flush()

    expect((await scope.resolve(store)).services.list()).toHaveLength(1)
    await scope.dispose()
  })

  test("E2: closing a missing incident reports a domain error", () => {
    expect(() => createMemoryStore().incidents.close("missing", 0)).toThrow("incident not found: missing")
  })
})
