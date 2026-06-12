import { atom, createScope, preset } from "@pumped-fn/lite"
import { describe, expect, test } from "vitest"
import { createApp } from "../src/app"
import { createMemoryStore, store, storeDriver } from "../src/infra/store"
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
    const app = createApp({ presets: [preset(storeDriver, flakyDriver)] })

    expect(await app.api.listServices()).toEqual([])
    expect(attempts).toBe(2)

    await app.api.registerService({ ...serviceInput, name: "kept" })
    await app.api.reconnectStore()

    expect(attempts).toBe(2)
    expect(await app.api.listServices()).toHaveLength(1)
    await app.api.registerService(serviceInput)
    expect(await app.api.listServices()).toHaveLength(2)
    await app.scope.dispose()
  })

  test("OI1: reconnect without a replacement driver atom resets the store", async () => {
    const app = createApp()
    await app.api.registerService({ ...serviceInput, name: "temporary", endpoint: "https://temporary.test" })

    await app.api.reconnectStore()

    expect(await app.api.listServices()).toEqual([])
    await app.scope.dispose()
  })

  test("OI2: a driver failing both attempts propagates the failure to the caller", async () => {
    let attempts = 0
    const deadDriver = atom<StorePort>({
      factory: () => {
        attempts++
        throw new Error("driver offline")
      },
    })
    const app = createApp({ presets: [preset(storeDriver, deadDriver)] })

    await expect(app.api.listServices()).rejects.toThrow("driver offline")
    expect(attempts).toBe(2)
    await app.scope.dispose()
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
