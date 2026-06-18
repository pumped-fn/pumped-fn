import { atom, createScope, preset } from "@pumped-fn/lite"
import { describe, expect, test } from "vitest"
import { checkExecutors } from "../src/checker"
import { clock } from "../src/infra/clock"
import type { ClockPort } from "../src/ports"
import { registerService } from "../src/registry"
import { scheduler } from "../src/scheduler"
import { FakeClock } from "./fakes"

describe("effect-managed", () => {
  test("E-SC7: dispose tears down LIFO, clears timers, and waits for the in-flight check", async () => {
    const fakeClock = new FakeClock()
    const order: string[] = []
    const recordingClock = atom({
      factory: (ctx): ClockPort => {
        ctx.cleanup(() => {
          order.push("clock")
        })
        return {
          now: () => fakeClock.now(),
          every: (ms, fn) => {
            const cancel = fakeClock.every(ms, () => { void fn() })
            return () => {
              order.push("scheduler:cancel")
              cancel()
            }
          },
        }
      },
    })
    const completed: string[] = []
    let releaseCheck = (): void => {}
    let resolveExecutorStarted!: () => void
    const executorStarted = new Promise<void>((resolve) => { resolveExecutorStarted = resolve })
    const scope = createScope({
      presets: [
        preset(clock, recordingClock),
        preset(checkExecutors, {
          http: async (_ctx, service) => {
            resolveExecutorStarted()
            await new Promise<void>((resolve) => {
              releaseCheck = resolve
            })
            completed.push(service.id)
            return { status: "healthy", responseTime: 10, error: null }
          },
          tcp: async () => ({ status: "healthy", responseTime: 1, error: null }),
          custom: async () => ({ status: "healthy", responseTime: 1, error: null }),
        }),
      ],
    })

    await scope.resolve(scheduler)
    const ctx = scope.createContext()
    const service = await ctx.exec({
      flow: registerService,
      input: {
        name: "api",
        type: "http",
        endpoint: "https://api.test",
        checkInterval: 60,
        timeout: 1000,
        criticality: "high",
      },
    })
    await scope.flush()

    await fakeClock.advance(60_000)
    await executorStarted
    expect((await scope.resolve(scheduler)).pending()).toBe(1)
    await ctx.close()
    const dispose = scope.dispose()
    await Promise.resolve()
    expect(fakeClock.liveTimers()).toBe(0)
    expect(completed).toEqual([])
    releaseCheck()
    await dispose
    expect(completed).toEqual([service.id])
    expect(fakeClock.cancelledTimers()).toBe(1)
    expect(order).toEqual(["scheduler:cancel", "clock"])
  })
})
