import { atom, createScope, preset } from "@pumped-fn/lite"
import { describe, expect, test, vi } from "vitest"
import { createApp } from "../src/app"
import { checkExecutors } from "../src/checker"
import { clock } from "../src/infra/clock"
import type { ClockPort } from "../src/ports"
import { scheduler } from "../src/scheduler"
import { FakeClock } from "./fakes"

describe("effect-managed", () => {
  test("E-SC7: dispose tears down LIFO, clears timers, and waits for the in-flight check", async () => {
    const fakeClock = new FakeClock()
    const order: string[] = []
    const recordingClock = atom<ClockPort>({
      factory: (ctx) => {
        ctx.cleanup(() => {
          order.push("clock")
        })
        return {
          now: () => fakeClock.now(),
          every: (ms, fn) => {
            const cancel = fakeClock.every(ms, fn)
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
    const app = createApp({
      presets: [
        preset(clock, recordingClock),
        preset(checkExecutors, {
          http: async (_ctx, service) => {
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

    await app.api.startScheduler()
    const service = await app.api.registerService({
      name: "api",
      type: "http",
      endpoint: "https://api.test",
      checkInterval: 60,
      timeout: 1000,
      criticality: "high",
    })

    await fakeClock.advance(60_000)
    expect((await app.scope.resolve(scheduler)).pending()).toBe(1)
    const dispose = app.scope.dispose()
    await Promise.resolve()
    expect(fakeClock.liveTimers()).toBe(0)
    expect(completed).toEqual([])
    releaseCheck()
    await dispose
    expect(completed).toEqual([service.id])
    expect(fakeClock.cancelledTimers()).toBe(1)
    expect(order).toEqual(["scheduler:cancel", "clock"])
  })

  test("E1: real clock atom ticks intervals, cancels them, and clears the rest on dispose", async () => {
    vi.useFakeTimers()
    const scope = createScope()
    const port = await scope.resolve(clock)
    const ticks: string[] = []

    const cancel = port.every(1_000, () => ticks.push("a"))
    port.every(1_000, () => ticks.push("b"))
    vi.advanceTimersByTime(2_000)
    expect(ticks).toEqual(["a", "b", "a", "b"])
    expect(port.now()).toBe(Date.now())

    cancel()
    vi.advanceTimersByTime(1_000)
    expect(ticks).toEqual(["a", "b", "a", "b", "b"])

    await scope.dispose()
    vi.advanceTimersByTime(5_000)
    expect(ticks).toEqual(["a", "b", "a", "b", "b"])
    vi.useRealTimers()
  })
})
