import { describe, it, expect, vi } from "vitest"
import { createScope } from "../src/scope"
import { flow } from "../src/flow"
import { custom } from "../src/ssch"
import { Promised } from "../src/promises"

describe("ExecutionContext.exec parity", () => {
  it("supports flow + fn journaling and parallel helpers", async () => {
    const scope = createScope()
    const ctx = scope.createExecution({ name: "root" })
    const inner = flow({
      name: "inner",
      input: custom<number>(),
      output: custom<number>()
    }).handler(async (_ctx, value) => value + 1)
    const first = await ctx.exec({ key: "inner", flow: inner, input: 1 })
    const second = await ctx.exec({ key: "inner", flow: inner, input: 1 })
    expect(first).toBe(2)
    expect(second).toBe(2)
    const fnFirst = await ctx.exec({ key: "fn", fn: async () => "ok" })
    const fnSecond = await ctx.exec({ key: "fn", fn: async () => "ok" })
    expect(fnFirst).toBe("ok")
    expect(fnSecond).toBe("ok")
    const { stats } = await ctx.parallel([
      Promised.create(Promise.resolve(1)),
      Promised.create(Promise.resolve(2))
    ])
    expect(stats).toEqual({ total: 2, succeeded: 2, failed: 0 })
  })

  it("aborts slow executions when timeout elapses", async () => {
    vi.useFakeTimers()
    const scope = createScope()
    const ctx = scope.createExecution({ name: "timeout" })
    const never = flow({
      name: "never",
      input: custom<void>(),
      output: custom<void>()
    }).handler(async () => {
      await new Promise(() => {})
    })
    const pending = ctx.exec({ flow: never, input: undefined, timeout: 5 })
    await vi.advanceTimersByTimeAsync(10)
    await expect(pending).rejects.toThrow("Operation timeout after 5ms")
    vi.useRealTimers()
  })

  it("resets journal entries when pattern matches key", async () => {
    const scope = createScope()
    const ctx = scope.createExecution({ name: "journal" })
    const calls = vi.fn()
    const runner = flow({
      name: "runner",
      input: custom<void>(),
      output: custom<number>()
    }).handler(async () => {
      calls()
      return calls.mock.calls.length
    })
    const first = await ctx.exec({ key: "metrics", flow: runner, input: undefined })
    const second = await ctx.exec({ key: "metrics", flow: runner, input: undefined })
    expect(first).toBe(1)
    expect(second).toBe(1)
    ctx.resetJournal("met")
    const third = await ctx.exec({ key: "metrics", flow: runner, input: undefined })
    expect(third).toBe(2)
  })

  it("propagates handler errors", async () => {
    const scope = createScope()
    const ctx = scope.createExecution({ name: "errors" })
    const boom = new Error("explode")
    const faulty = flow({
      name: "faulty",
      input: custom<void>(),
      output: custom<void>()
    }).handler(async () => {
      throw boom
    })
    await expect(ctx.exec({ flow: faulty, input: undefined })).rejects.toThrow("explode")
  })
})
