import { describe, it, expect, vi } from "vitest"
import { createScope } from "../src/scope"
import { flow } from "../src/flow"
import { custom } from "../src/ssch"
import { Promised } from "../src/promises"
import { tag } from "../src/tag"

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

describe("ExecutionContext tag store alignment", () => {
  it("reads tag defaults solely through extractFrom", async () => {
    const flagTag = tag(custom<boolean>(), { default: true })
    const scope = createScope({ tags: [flagTag(true)] })
    const ctx = scope.createExecution()
    expect(flagTag.extractFrom(ctx.tagStore)).toBe(true)
    expect(ctx.get(flagTag)).toBe(true)
  })

  it("seeds execution tags into store for readFrom/get", async () => {
    const configTag = tag(custom<string>(), { label: "config" })
    const scope = createScope()
    const ctx = scope.createExecution({ tags: [configTag("a")] })
    expect(ctx.tagStore.get(configTag.key)).toBe("a")
    expect(configTag.readFrom(ctx.tagStore)).toBe("a")
  })

  it("throws when tag missing even if scope tags absent", async () => {
    const missingTag = tag(custom<string>(), { label: "missing" })
    const scope = createScope()
    const ctx = scope.createExecution()
    expect(() => ctx.get(missingTag)).toThrow()
  })

  it("execution tags override scope tags with same key", async () => {
    const envTag = tag(custom<string>(), { label: "env" })
    const scope = createScope({ tags: [envTag("production")] })
    const ctx = scope.createExecution({ tags: [envTag("development")] })
    expect(ctx.get(envTag)).toBe("development")
    expect(envTag.extractFrom(ctx.tagStore)).toBe("development")
  })

  it("seeds both scope and execution tags without conflict when keys differ", async () => {
    const scopeTag = tag(custom<string>(), { label: "scope" })
    const execTag = tag(custom<string>(), { label: "exec" })
    const scope = createScope({ tags: [scopeTag("from-scope")] })
    const ctx = scope.createExecution({ tags: [execTag("from-exec")] })
    expect(ctx.get(scopeTag)).toBe("from-scope")
    expect(ctx.get(execTag)).toBe("from-exec")
  })

  it("should clean up contextResolvedValue on resolution error", async () => {
    const errorTag = tag(custom<string>())
    const scope = createScope()

    const failingFlow = flow([errorTag], () => {
      throw new Error("Resolution failed")
    })

    const ctx = scope.createExecution({ tags: [errorTag("value")] })

    await expect(ctx.exec(failingFlow, undefined)).rejects.toThrow("Resolution failed")

    const workingFlow = flow([errorTag], ([value]) => value)
    const result = await ctx.exec(workingFlow, undefined)
    expect(result).toBe("value")
  })

  it("should not re-apply scope tags to child contexts", async () => {
    const value = tag(custom<string>())
    const scope = createScope({ tags: [value("scope")] })

    const parentCtx = scope.createExecution({ tags: [value("parent")] })

    const innerFlow = flow([value], ([v], ctx) => v)
    const nestedFlow = flow([], async (_deps, ctx) => {
      return await ctx.exec({ flow: innerFlow, input: undefined, tags: [value("child")] })
    })

    const result = await parentCtx.exec(nestedFlow, undefined)
    expect(result).toBe("child")
  })
})
