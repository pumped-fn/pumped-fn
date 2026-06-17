import { createScope, preset } from "@pumped-fn/lite"
import { describe, expect, test } from "vitest"
import { checkExecutors } from "../src/checker"
import { clock } from "../src/infra/clock"
import { registerService } from "../src/registry"
import { scheduler } from "../src/scheduler"
import { exec, FakeClock } from "./fakes"

describe("effect-managed", () => {
  test("E-SC2: fake clock 1h gives exact per-service tick count without drift", async () => {
    const fakeClock = new FakeClock()
    const counts = new Map<string, number>()
    const scope = createScope({
      presets: [
        preset(clock, fakeClock),
        preset(checkExecutors, {
          http: async (_ctx, service) => {
            counts.set(service.id, (counts.get(service.id) ?? 0) + 1)
            return { status: "healthy", responseTime: 1, error: null }
          },
          tcp: async () => ({ status: "healthy", responseTime: 1, error: null }),
          custom: async () => ({ status: "healthy", responseTime: 1, error: null }),
        }),
      ],
    })

    await scope.resolve(scheduler)
    const fast = await exec(scope, registerService, {
      name: "fast",
      type: "http",
      endpoint: "https://fast.test",
      checkInterval: 60,
      timeout: 1000,
      criticality: "medium",
    })
    const slow = await exec(scope, registerService, {
      name: "slow",
      type: "http",
      endpoint: "https://slow.test",
      checkInterval: 300,
      timeout: 1000,
      criticality: "medium",
    })

    await fakeClock.advance(3_600_000)
    expect(counts.get(fast.id)).toBe(60)
    expect(counts.get(slow.id)).toBe(12)
    expect((await scope.resolve(scheduler)).pending()).toBe(0)
    await scope.dispose()
  })

  test("E1: scheduled check failure closes its context and leaves scheduler alive", async () => {
    const fakeClock = new FakeClock()
    const scope = createScope({
      presets: [
        preset(clock, fakeClock),
        preset(checkExecutors, {
          http: async () => {
            throw new Error("check exploded")
          },
          tcp: async () => ({ status: "healthy", responseTime: 1, error: null }),
          custom: async () => ({ status: "healthy", responseTime: 1, error: null }),
        }),
      ],
    })

    await scope.resolve(scheduler)
    await exec(scope, registerService, {
      name: "failing",
      type: "http",
      endpoint: "https://failing.test",
      checkInterval: 60,
      timeout: 1000,
      criticality: "medium",
    })

    await fakeClock.advance(60_000)
    expect((await scope.resolve(scheduler)).pending()).toBe(0)
    await scope.dispose()
  })

  test("E2: service registry mutation uses one watch-driven scheduler resync", async () => {
    const fakeClock = new FakeClock()
    const scope = createScope({ presets: [preset(clock, fakeClock)] })

    await scope.resolve(scheduler)
    expect(fakeClock.createdTimers()).toBe(0)
    await exec(scope, registerService, {
      name: "api",
      type: "http",
      endpoint: "https://api.test",
      checkInterval: 60,
      timeout: 1000,
      criticality: "medium",
    })

    expect(fakeClock.createdTimers()).toBe(1)
    await scope.dispose()
  })
})
