import { atom, createScope, preset } from "@pumped-fn/lite"
import { describe, expect, test } from "vitest"
import { createMemoryStore, reconnectStore, store, storeDriver } from "../src/infra/store"
import { listServices, registerService } from "../src/registry"
import type { StorePort } from "../src/ports"
import { exec } from "./fakes"

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

    expect(await exec(scope, listServices, undefined)).toEqual([])
    expect(attempts).toBe(2)

    await exec(scope, registerService, { ...serviceInput, name: "kept" })
    await exec(scope, reconnectStore, undefined)

    expect(attempts).toBe(2)
    expect(await exec(scope, listServices, undefined)).toHaveLength(1)
    await exec(scope, registerService, serviceInput)
    expect(await exec(scope, listServices, undefined)).toHaveLength(2)
    await scope.dispose()
  })

  test("OI1: reconnect without a replacement driver atom resets the store", async () => {
    const scope = createScope()
    await exec(scope, registerService, { ...serviceInput, name: "temporary", endpoint: "https://temporary.test" })

    await exec(scope, reconnectStore, undefined)

    expect(await exec(scope, listServices, undefined)).toEqual([])
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

    await expect(exec(scope, listServices, undefined)).rejects.toThrow("driver offline")
    expect(attempts).toBe(2)
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
