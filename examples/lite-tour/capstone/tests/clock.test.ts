import { createScope } from "@pumped-fn/lite"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { clock } from "../src/infra/clock"

describe("inside-out", () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  test("IO1: every() fires at the given interval and the returned unsub stops it", async () => {
    const scope = createScope()
    const port = await scope.resolve(clock)
    const ticks: string[] = []

    const cancel = port.every(1_000, () => ticks.push("a"))
    port.every(1_000, () => ticks.push("b"))
    vi.advanceTimersByTime(2_000)
    expect(ticks).toEqual(["a", "b", "a", "b"])

    cancel()
    vi.advanceTimersByTime(1_000)
    expect(ticks).toEqual(["a", "b", "a", "b", "b"])
    await scope.dispose()
  })

  test("IO2: now() reflects the current fake-timer time", async () => {
    const scope = createScope()
    const port = await scope.resolve(clock)

    const before = Date.now()
    vi.advanceTimersByTime(5_000)
    const after = Date.now()
    expect(port.now()).toBe(after)
    expect(port.now()).toBeGreaterThan(before)
    await scope.dispose()
  })
})

describe("effect-managed", () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  test("E1: atom ctx.cleanup clears all remaining interval handles on scope dispose", async () => {
    const scope = createScope()
    const port = await scope.resolve(clock)
    const ticks: string[] = []

    port.every(1_000, () => ticks.push("a"))
    port.every(1_000, () => ticks.push("b"))
    vi.advanceTimersByTime(1_000)
    expect(ticks).toEqual(["a", "b"])

    await scope.dispose()
    vi.advanceTimersByTime(5_000)
    expect(ticks).toEqual(["a", "b"])
  })
})
