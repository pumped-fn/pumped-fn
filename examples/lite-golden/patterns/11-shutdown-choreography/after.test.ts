import { createScope } from "@pumped-fn/lite"
import { describe, expect, test } from "vitest"
import {
  gracefulDrain,
  pool,
  server,
  shutdownEvents,
  throwingCleanup,
} from "./after"

describe("outside-in", () => {
  test("OI1: graceful drain: in-flight ctx completes + closes before dispose (flush -> dispose sequencing)", async () => {
    const events: string[] = []
    const scope = createScope({
      tags: [shutdownEvents(events)],
    })
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: gracefulDrain })).resolves.toBe("server:main")
    await scope.flush()
    await scope.dispose()

    expect(events).toEqual([
      "config:open",
      "pool:open",
      "server:open",
      "request:start",
      "request:end",
      "request:close",
      "server:close",
      "pool:close",
      "config:close",
    ])
  })
})

describe("effect-managed", () => {
  test("E1: resolve chain config->pool->server; dispose -> cleanup order exactly [server, pool, config] (order array)", async () => {
    const events: string[] = []
    const scope = createScope({
      tags: [shutdownEvents(events)],
    })

    await scope.resolve(server)
    await scope.dispose()

    expect(events).toEqual([
      "config:open",
      "pool:open",
      "server:open",
      "server:close",
      "pool:close",
      "config:close",
    ])
  })

  test("E2: dispose with partially-resolved graph (one atom never resolved) -> resolved atoms cleaned, no throw", async () => {
    const events: string[] = []
    const scope = createScope({
      tags: [shutdownEvents(events)],
    })

    await scope.resolve(pool)
    await expect(scope.dispose()).resolves.toBeUndefined()

    expect(events).toEqual([
      "config:open",
      "pool:open",
      "pool:close",
      "config:close",
    ])
  })

  test("E3: double dispose() runs cleanups once (extension-free scope, pinned against lite source) [S11]", async () => {
    const events: string[] = []
    const scope = createScope({
      tags: [shutdownEvents(events)],
    })

    await scope.resolve(server)
    await scope.dispose()
    await expect(scope.dispose()).resolves.toBeUndefined()

    expect(events).toEqual([
      "config:open",
      "pool:open",
      "server:open",
      "server:close",
      "pool:close",
      "config:close",
    ])
  })

  test("E4: cleanup that throws does not stop later cleanups [S11]", async () => {
    const events: string[] = []
    const scope = createScope({
      tags: [shutdownEvents(events)],
    })

    await scope.resolve(throwingCleanup)
    await expect(scope.dispose()).resolves.toBeUndefined()

    expect(events).toEqual(["throwing:open", "throwing:throw", "throwing:survivor"])
  })
})
