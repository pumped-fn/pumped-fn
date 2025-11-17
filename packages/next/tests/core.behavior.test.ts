import { describe, expect, vi } from "vitest"
import {
  createScope,
  custom,
  derive,
  flow,
  flowMeta,
  preset,
  provide,
  Promised,
  tag,
} from "../src"
import { createExecutor } from "../src/executor"
import { createAbortWithTimeout } from "../src/internal/abort-utils"
import { scenario } from "./scenario"

describe("core behavior", () => {
  scenario("executor graph operations", async () => {
    const cycleScope = createScope()
    const executorA = createExecutor(() => 1, undefined, [])
    const executorB = createExecutor(() => 1, undefined, [])
    ;(executorA as any).dependencies = { b: executorB }
    ;(executorB as any).dependencies = { a: executorA }
    ;(executorA as any).factory = (deps: { b: number }) => deps.b + 1
    ;(executorB as any).factory = (deps: { a: number }) => deps.a + 1
    await expect(cycleScope.resolve(executorA)).rejects.toThrow()
    await cycleScope.dispose()

    const orderScope = createScope()
    const executionOrder: string[] = []
    const baseExecutor = provide(() => {
      executionOrder.push("base")
      return 1
    })
    const dependentExecutor = derive(
      { base: baseExecutor },
      (deps: { base: number }) => {
        executionOrder.push("dependent")
        return deps.base + 1
      },
    )
    const result = await orderScope.resolve(dependentExecutor)
    expect(result).toBe(2)
    expect(executionOrder).toEqual(["base", "dependent"])
    await orderScope.dispose()

    const mixScope = createScope()
    const mixExecution: string[] = []
    const syncDependency = provide(() => {
      mixExecution.push("sync1")
      return 1
    })
    const asyncDependency = provide(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1))
      mixExecution.push("async")
      return 2
    })
    const mixExecutor = derive(
      { sync: syncDependency, async: asyncDependency },
      (deps: { sync: number; async: number }) => {
        mixExecution.push("sync2")
        return deps.sync + deps.async
      },
    )
    const mixResult = await mixScope.resolve(mixExecutor)
    expect(mixResult).toBe(3)
    expect(mixExecution).toEqual(["sync1", "async", "sync2"])
    await mixScope.dispose()

    const scope = createScope()
    const dependencyA = provide(() => "a")
    const dependencyB = provide(() => "b")
    const dependencyC = provide(() => "c")
    const executorWithDependencies = derive(
      { depA: dependencyA, depB: dependencyB, depC: dependencyC },
      (deps) => deps,
    )
    expect(executorWithDependencies.dependencies).toEqual({
      depA: dependencyA,
      depB: dependencyB,
      depC: dependencyC,
    })
    const executorWithoutDependencies = derive({}, () => ({}))
    expect(executorWithoutDependencies.dependencies).toEqual({})
    await scope.dispose()
  })

  scenario("scope execution orchestration", async () => {
    const config = provide(() => ({ multiplier: 3 }))
    const multiplyFlow = flow(config, (deps, _ctx, input: number) => input * deps.multiplier)
    const scope = createScope()
    const result = await scope.exec({ flow: multiplyFlow, input: 5 })
    expect(result).toBe(15)

    const configExecutor = provide(() => ({ value: 10 }))
    const flowWithConfig = flow(
      configExecutor,
      (deps, _ctx, input: number) => input + deps.value,
    )
    const presetScope = createScope({
      initialValues: [preset(configExecutor, { value: 20 })],
    })
    const presetResult = await presetScope.exec({ flow: flowWithConfig, input: 5 })
    expect(presetResult).toBe(25)

    const simpleFlow = flow((_ctx, input: number) => input * 2)
    const execution = scope.exec({ flow: simpleFlow, input: 5 })
    const execResult = await execution.result
    expect(execResult).toBe(10)
    expect(execution.id).toBeDefined()

    const failingFlow = flow(() => {
      throw new Error("Test error")
    })
    const failingExecution = scope.exec({ flow: failingFlow, input: 5 })
    await expect(failingExecution.result).rejects.toThrow("Test error")

    const noInputFlow = flow(() => "no input needed")
    const noInputResult = await scope.exec({ flow: noInputFlow })
    expect(noInputResult).toBe("no input needed")

    const doubleFlow = flow((_ctx, input: number) => input * 2)
    const doubleResult = await scope.exec({ flow: doubleFlow, input: 5 })
    expect(doubleResult).toBe(10)

    const dependentFlow = flow(async (ctx, n: number) => {
      const childFlow = flow((_ctx, input: number) => input * 2)
      const child = await ctx.exec({ flow: childFlow, input: n })
      return child + 10
    })
    const dependentResult = await flow.execute(dependentFlow, 5)
    expect(dependentResult).toBe(20)

    await scope.dispose()
    await presetScope.dispose()
  })

  scenario("ctx.exec variants, validation, and journaling", async () => {
    for (const [label, factory, input, expected] of [
      [
        "no deps",
        () => flow((ctx, n: number) => n * 2),
        5,
        10,
      ],
      [
        "array deps",
        () => {
          const dep = provide(() => 10)
          return flow([dep], ([d], ctx, n: number) => d + n)
        },
        5,
        15,
      ],
      [
        "object deps",
        () => {
          const dep = provide(() => 10)
          return flow({ a: dep }, ({ a }, ctx, n: number) => a + n)
        },
        5,
        15,
      ],
      [
        "with config",
        () =>
          flow(
            {
              input: custom<number>(),
              output: custom<number>(),
            },
            (ctx, n) => n * 2,
          ),
        5,
        10,
      ],
    ] as const) {
      const result = await flow.execute(factory(), input)
      expect(result).toBe(expected)
    }

    const ctxVariantsParent = flow(async (ctx, n: number) => {
      const childFlow = flow((_ctx, value: number) => value * 2)
      const entries = [
        await ctx.exec(childFlow, 5),
        await ctx.exec({ flow: childFlow, input: 5, key: "step1" }),
        await ctx.exec({ fn: () => 10 }),
        await ctx.exec({ fn: () => 10, key: "calc" }),
      ]
      expect(entries).toEqual([10, 10, 10, 10])
      return entries.reduce((acc, value) => acc + value, 0)
    })
    const ctxVariantsResult = await flow.execute(ctxVariantsParent, 1)
    expect(ctxVariantsResult).toBe(40)

    for (const opts of [{ key: "step" }, {}]) {
      let inputValidated = false
      let outputValidated = false
      const childFlow = flow(
        {
          input: custom<number>((value) => {
            inputValidated = true
            if (typeof value !== "number") {
              return {
                success: false,
                issues: [{ message: "Expected number" }],
              }
            }
            return value
          }),
          output: custom<number>((value) => {
            outputValidated = true
            if (typeof value !== "number") {
              return {
                success: false,
                issues: [{ message: "Expected number" }],
              }
            }
            return value
          }),
        },
        (ctx, n) => n * 2,
      )

      const parent = flow(async (ctx) =>
        ctx.exec({ ...opts, flow: childFlow, input: 5 }),
      )

      const value = await flow.execute(parent, undefined)
      expect(value).toBe(10)
      expect(inputValidated).toBe(true)
      expect(outputValidated).toBe(true)
    }

    for (const opts of [{ key: "step" }, {}]) {
      const rejectInput = flow(
        {
          input: custom<number>((value) => {
            if (typeof value !== "number") {
              return {
                success: false,
                issues: [{ message: "Expected number" }],
              }
            }
            return value
          }),
          output: custom<number>(),
        },
        (ctx, n) => n * 2,
      )
      const parent = flow(async (ctx) =>
        ctx.exec({ ...opts, flow: rejectInput, input: "invalid" as any }),
      )
      await expect(flow.execute(parent, undefined)).rejects.toThrow(
        "Expected number",
      )
    }

    for (const opts of [{ key: "step" }, {}]) {
      const rejectOutput = flow(
        {
          input: custom<number>(),
          output: custom<number>((value) => {
            if (typeof value !== "number") {
              return {
                success: false,
                issues: [{ message: "Expected number output" }],
              }
            }
            return value
          }),
        },
        () => "invalid" as any,
      )
      const parent = flow(async (ctx) =>
        ctx.exec({ ...opts, flow: rejectOutput, input: 5 }),
      )
      await expect(flow.execute(parent, undefined)).rejects.toThrow(
        "Expected number output",
      )
    }

    let callCount = 0
    const journaledFlow = flow(async (ctx, n: number) => {
      const childFlow = flow((_ctx, value: number) => {
        callCount += 1
        return value * 2
      })
      const r1 = await ctx.exec({ flow: childFlow, input: n, key: "calc" })
      const r2 = await ctx.exec({ flow: childFlow, input: n, key: "calc" })
      expect(r1).toBe(10)
      expect(r2).toBe(10)
      return r1 + r2
    })
    const journaledResult = await flow.execute(journaledFlow, 5)
    expect(journaledResult).toBe(20)
    expect(callCount).toBe(1)

    const keyFlow = flow(async (ctx, n: number) =>
      ctx.exec({ flow: flow((_ctx, value: number) => value * 2), input: n, key: "mykey" }),
    )
    const scoped = createScope()
    const keyResult = await flow.execute(keyFlow, 5, { scope: scoped })
    expect(keyResult).toBe(10)
    await scoped.dispose()

    let errorCalls = 0
    const errorFlow = flow(async (ctx) => {
      for (let i = 0; i < 2; i++) {
        try {
          await ctx.exec({
            fn: () => {
              errorCalls++
              throw new Error("test")
            },
            key: "fail",
          })
        } catch {}
      }
      return errorCalls
    })
    const errorResult = await flow.execute(errorFlow, undefined)
    expect(errorResult).toBe(1)

    let resetCalls = 0
    const resetFlow = flow(async (ctx, n: number) => {
      const childFlow = flow((_ctx, value: number) => {
        resetCalls += 1
        return value * 2
      })
      const r1 = await ctx.exec({ flow: childFlow, input: n, key: "calc" })
      expect(r1).toBe(10)
      ctx.resetJournal("calc")
      const r2 = await ctx.exec({ flow: childFlow, input: n, key: "calc" })
      expect(r2).toBe(10)
      return resetCalls
    })
    const resetResult = await flow.execute(resetFlow, 5)
    expect(resetResult).toBe(2)

    const parallelChild = flow((_ctx, n: number) => n * 2)
    const parallelFlow = flow(async (ctx, n: number) => {
      const p1 = ctx.exec(parallelChild, n)
      const p2 = ctx.exec(parallelChild, n + 1)
      const result = await ctx.parallel([p1, p2])
      expect(result.stats.total).toBe(2)
      expect(result.stats.succeeded).toBe(2)
      expect(result.stats.failed).toBe(0)
      expect(result.results).toEqual([10, 12])
      return result
    })
    const parallelResult = await flow.execute(parallelFlow, 5)
    expect(parallelResult.results).toEqual([10, 12])

    const successFlow = flow((_ctx, n: number) => n * 2)
    const failFlow = flow(() => {
      throw new Error("fail")
    })
    const settledParent = flow(async (ctx, n: number) => {
      const p1 = ctx.exec(successFlow, n)
      const p2 = ctx.exec(failFlow, n)
      const settled = await ctx.parallelSettled([p1, p2])
      expect(settled.stats.total).toBe(2)
      expect(settled.stats.succeeded).toBe(1)
      expect(settled.stats.failed).toBe(1)
      return settled
    })
    const settledResult = await flow.execute(settledParent, 5)
    expect(settledResult.stats.failed).toBe(1)
  })

  scenario("timeouts, abort utils, and cleanup", async () => {
    for (const runner of [
      async (ctx: any) => {
        const slowFlow = flow(async () => {
          await new Promise((resolve) => setTimeout(resolve, 100))
          return "done"
        })
        await ctx.exec({ flow: slowFlow, input: undefined, timeout: 10 })
      },
      async (ctx: any) => {
        await ctx.exec({
          fn: async () => {
            await new Promise((resolve) => setTimeout(resolve, 100))
            return "done"
          },
          timeout: 10,
        })
      },
    ]) {
      const parent = flow(runner)
      await expect(flow.execute(parent, undefined)).rejects.toThrow()
    }

    const childFlow = flow(async (_ctx) => {
      await new Promise((resolve) => setTimeout(resolve, 200))
      return "done"
    })
    const timeoutFlow = flow(async (ctx) =>
      ctx.exec({ flow: childFlow, input: undefined, timeout: 50 }),
    )
    const scope = createScope()
    const execution = scope.exec({ flow: timeoutFlow, input: undefined })
    await expect(execution.result.toPromise()).rejects.toThrow()

    vi.useFakeTimers()
    const successfulInner = flow(async (_ctx, input: number) => input * 2)
    const successfulOuter = flow(async (ctx, input: number) =>
      ctx.exec({ flow: successfulInner, input, timeout: 5000 }),
    )
    const timerCountBefore = vi.getTimerCount()
    await flow.execute(successfulOuter, 42)
    expect(vi.getTimerCount()).toBe(timerCountBefore)

    const failingInner = flow(async () => {
      throw new Error("Flow failed")
    })
    const failingOuter = flow(async (ctx, input: number) => {
      try {
        await ctx.exec({ flow: failingInner, input, timeout: 5000 })
      } catch {
        return -1
      }
      return 0
    })
    await flow.execute(failingOuter, 42)
    expect(vi.getTimerCount()).toBe(timerCountBefore)

    const journaledInner = flow(async (_ctx, input: number) => input * 2)
    const journaledOuter = flow(async (ctx, input: number) =>
      ctx.exec({ key: "test-key", flow: journaledInner, input, timeout: 5000 }),
    )
    await flow.execute(journaledOuter, 42)
    expect(vi.getTimerCount()).toBe(timerCountBefore)

    const fnOuter = flow(async (ctx, input: number) =>
      ctx.exec({ fn: (x: number) => x * 3, params: [input], timeout: 5000 }),
    )
    await flow.execute(fnOuter, 42)
    expect(vi.getTimerCount()).toBe(timerCountBefore)

    const nonJournaled = flow(async (ctx, input: number) =>
      ctx.exec({ fn: (x: number) => x * 3, params: [input], timeout: 5000 }),
    )
    await flow.execute(nonJournaled, 42)
    expect(vi.getTimerCount()).toBe(timerCountBefore)
    vi.useRealTimers()

    vi.useFakeTimers()
    const noTimeout = createAbortWithTimeout()
    expect(noTimeout.controller).toBeInstanceOf(AbortController)
    expect(noTimeout.timeoutId).toBeNull()
    const withTimeout = createAbortWithTimeout(1000)
    expect(withTimeout.timeoutId).not.toBeNull()
    expect(withTimeout.controller.signal.aborted).toBe(false)
    vi.advanceTimersByTime(1000)
    expect(withTimeout.controller.signal.aborted).toBe(true)
    const parentController = new AbortController()
    const linked = createAbortWithTimeout(undefined, parentController.signal)
    parentController.abort(new Error("parent aborted"))
    expect(linked.controller.signal.aborted).toBe(true)
    const linkedTimeout = createAbortWithTimeout(1000, parentController.signal)
    parentController.abort(new Error("parent aborted"))
    expect(linkedTimeout.controller.signal.aborted).toBe(true)
    vi.useRealTimers()
  })

  scenario("execution context lifecycle", async () => {
    const scope = createScope()
    const ctx = scope.createExecution({ name: "test-ctx" })
    expect(ctx.id).toBeDefined()
    expect(ctx.details.name).toBe("test-ctx")
    expect(ctx.details.startedAt).toBeGreaterThan(0)
    expect(ctx.parent).toBeUndefined()

    const parentCtx = scope.createExecution({ name: "parent" })
    let childCtx: any
    const result = await parentCtx.exec("child", (c) => {
      childCtx = c
      expect(c.parent).toBe(parentCtx)
      expect(c.details.name).toBe("child")
      return "result"
    })
    expect(childCtx.parent).toBe(parentCtx)
    expect(result).toBe("result")

    const requestIdTag = tag(custom<string>(), { label: "requestId" })
    const tagCtx = scope.createExecution({ name: "parent" })
    tagCtx.set(requestIdTag, "req-123")
    await tagCtx.exec("child", (child) => {
      expect(child.get(requestIdTag)).toBe("req-123")
    })

    const nameTag = tag(custom<string>(), { label: "name" })
    const inheritCtx = scope.createExecution({ name: "parent" })
    inheritCtx.set(nameTag, "parent-name")
    await inheritCtx.exec("child", (child) => {
      child.set(nameTag, "child-name")
      expect(child.get(nameTag)).toBe("child-name")
      expect(inheritCtx.get(nameTag)).toBe("parent-name")
    })

    const ended = scope.createExecution({ name: "test" })
    expect(ended.details.completedAt).toBeUndefined()
    ended.end()
    expect(ended.details.completedAt).toBeDefined()

    const errorCtx = scope.createExecution({ name: "parent" })
    let failingChild: any
    try {
      await errorCtx.exec("failing", (c) => {
        failingChild = c
        throw new Error("test error")
      })
    } catch {}
    expect(failingChild.details.error).toBeInstanceOf(Error)
    expect((failingChild.details.error as Error).message).toBe("test error")
    expect(failingChild.details.completedAt).toBeDefined()

    const abortCtx = scope.createExecution({ name: "test" })
    expect(abortCtx.signal.aborted).toBe(false)
    expect(() => abortCtx.throwIfAborted()).not.toThrow()
    await scope.dispose()
  })

  scenario("execution tracking and registry management", async () => {
    const { scope: trackingScope, cleanup } = (() => {
      const scope = createScope()
      return {
        scope,
        cleanup: async () => {
          await scope.dispose()
        },
      }
    })()

    const executionIds = new Set<string>()
    const trackingTag = tag(custom<{ executionId: string }>(), {
      label: "execution.tracking",
    })
    const idFlow = flow(
      {
        name: "test-flow",
        input: custom<number>(),
        output: custom<number>(),
      },
      (ctx, input) => {
        const tracking = ctx.find(trackingTag)
        if (tracking) {
          executionIds.add(tracking.executionId)
        }
        return input * 2
      },
    )
    await trackingScope.exec({
      flow: idFlow,
      input: 1,
      tags: [trackingTag({ executionId: crypto.randomUUID() })],
    })
    await trackingScope.exec({
      flow: idFlow,
      input: 2,
      tags: [trackingTag({ executionId: crypto.randomUUID() })],
    })
    await trackingScope.exec({
      flow: idFlow,
      input: 3,
      tags: [trackingTag({ executionId: crypto.randomUUID() })],
    })
    expect(executionIds.size).toBe(3)

    const statusChanges: string[] = []
    const statusTag = tag(custom<{ status: string }>(), {
      label: "execution.status",
    })
    const statusFlow = flow(
      {
        name: "status-flow",
        input: custom<void>(),
        output: custom<string>(),
      },
      async (ctx) => {
        const status = ctx.find(statusTag)
        if (status) {
          statusChanges.push(status.status)
        }
        ctx.set(statusTag, { status: "running" })
        await new Promise((resolve) => setTimeout(resolve, 10))
        ctx.set(statusTag, { status: "completed" })
        return "done"
      },
    )
    await trackingScope.exec({
      flow: statusFlow,
      input: undefined,
      tags: [statusTag({ status: "pending" })],
    })
    expect(statusChanges).toContain("pending")

    const abortController = new AbortController()
    const abortTag = tag(custom<AbortSignal>(), { label: "execution.abort" })
    const longRunning = flow(
      {
        name: "long-flow",
        input: custom<void>(),
        output: custom<string>(),
      },
      async (ctx) => {
        const signal = ctx.find(abortTag)
        for (let i = 0; i < 5; i++) {
          if (signal?.aborted) {
            throw new Error("Execution aborted")
          }
          await new Promise((resolve) => setTimeout(resolve, 10))
        }
        return "completed"
      },
    )
    const executionPromise = trackingScope.exec({
      flow: longRunning,
      input: undefined,
      tags: [abortTag(abortController.signal)],
    })
    setTimeout(() => abortController.abort(), 30)
    await expect(executionPromise).rejects.toThrow("Execution aborted")

    const timeoutTag = tag(custom<number>(), { label: "execution.timeout" })
    let timedOut = false
    const slowFlow = flow(
      {
        name: "slow-flow",
        input: custom<void>(),
        output: custom<string>(),
      },
      async (ctx) => {
        const timeout = ctx.find(timeoutTag)
        const start = Date.now()
        try {
          await new Promise((resolve) => setTimeout(resolve, 200))
          return "completed"
        } finally {
          if (timeout && Date.now() - start >= timeout) {
            timedOut = true
          }
        }
      },
    )
    const slowExecution = trackingScope.exec({
      flow: slowFlow,
      input: undefined,
      tags: [timeoutTag(50)],
    })
    await Promise.race([
      slowExecution,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Execution timeout")), 50),
      ),
    ]).catch((err) => {
      expect(err.message).toBe("Execution timeout")
    })
    await slowExecution
    expect(timedOut).toBe(true)

    const fnFlow = flow(
      {
        name: "function-exec",
        input: custom<number>(),
        output: custom<number>(),
      },
      async (ctx, input) => {
        const step1 = await ctx.exec({
          key: "step1",
          fn: () => input * 2,
        })
        const step2 = await ctx.exec({
          key: "step2",
          fn: (value: number) => value + 10,
          params: [step1],
        })
        return step2
      },
    )
    const fnResult = await trackingScope.exec({ flow: fnFlow, input: 5 })
    expect(fnResult).toBe(20)

    const errorFlow = flow(
      {
        name: "error-flow",
        input: custom<void>(),
        output: custom<string>(),
      },
      () => {
        throw new Error("Child flow error")
      },
    )
    const parentErrorFlow = flow(
      {
        name: "parent-error-flow",
        input: custom<void>(),
        output: custom<string>(),
      },
      async (ctx) => {
        try {
          await ctx.exec({ flow: errorFlow, input: undefined })
          return "unexpected"
        } catch (error) {
          return `caught: ${(error as Error).message}`
        }
      },
    )
    const errorResult = await trackingScope.exec({
      flow: parentErrorFlow,
      input: undefined,
    })
    expect(errorResult).toBe("caught: Child flow error")

    const abortCheck = flow(
      {
        name: "check-aborted",
        input: custom<void>(),
        output: custom<string>(),
      },
      async (ctx) => {
        const signal = ctx.find(abortTag)
        await new Promise((resolve) => setTimeout(resolve, 20))
        if (signal?.aborted) {
          throw new Error("Operation aborted")
        }
        return "completed"
      },
    )
    abortController.abort()
    await expect(
      trackingScope.exec({
        flow: abortCheck,
        input: undefined,
        tags: [abortTag(abortController.signal)],
      }),
    ).rejects.toThrow("Operation aborted")

    const statusChangesCapture: string[] = []
    const callbackTag = tag(custom<(status: string) => void>(), {
      label: "execution.callback",
    })
    const trackedFlow = flow(
      {
        name: "tracked-flow",
        input: custom<number>(),
        output: custom<number>(),
      },
      async (ctx, input) => {
        const callback = ctx.find(callbackTag)
        callback?.("started")
        await new Promise((resolve) => setTimeout(resolve, 10))
        callback?.("processing")
        await new Promise((resolve) => setTimeout(resolve, 10))
        callback?.("completed")
        return input * 2
      },
    )
    await trackingScope.exec({
      flow: trackedFlow,
      input: 5,
      tags: [callbackTag((status) => statusChangesCapture.push(status))],
    })
    expect(statusChangesCapture).toEqual(["started", "processing", "completed"])

    const capturedContext: Array<{ flowName?: string; depth: number }> = []
    const contextTag = tag(
      custom<(context: { flowName?: string; depth: number }) => void>(),
      {
        label: "execution.context",
      },
    )
    const contextFlow = flow(
      {
        name: "context-flow",
        input: custom<void>(),
        output: custom<string>(),
      },
      (ctx) => {
        const callback = ctx.find(contextTag)
        const depth = ctx.find(flowMeta.depth)
        callback?.({
          flowName: ctx.find(flowMeta.flowName),
          depth: depth ?? 0,
        })
        return "done"
      },
    )
    await trackingScope.exec({
      flow: contextFlow,
      input: undefined,
      tags: [contextTag((context) => capturedContext.push(context))],
    })
    expect(capturedContext.length).toBeGreaterThan(0)

    const registryTag = tag(custom<Set<string>>(), {
      label: "execution.registry",
    })
    const registryFlow = flow(
      {
        name: "registry-flow",
        input: custom<string>(),
        output: custom<string>(),
      },
      (ctx, input) => {
        const registry = ctx.find(registryTag)
        const executionId = crypto.randomUUID()
        registry?.add(executionId)
        return input
      },
    )
    const registry = new Set<string>()
    await trackingScope.exec({
      flow: registryFlow,
      input: "test1",
      tags: [registryTag(registry)],
    })
    await trackingScope.exec({
      flow: registryFlow,
      input: "test2",
      tags: [registryTag(registry)],
    })
    expect(registry.size).toBe(2)

    const tempScope = createScope()
    const cleanupTag = tag(custom<Map<string, boolean>>(), {
      label: "execution.cleanup",
    })
    const registeredFlow = flow(
      {
        name: "registered-flow",
        input: custom<void>(),
        output: custom<void>(),
      },
      (ctx) => {
        const reg = ctx.find(cleanupTag)
        reg?.set(crypto.randomUUID(), true)
      },
    )
    const cleanupRegistry = new Map<string, boolean>()
    await tempScope.exec({
      flow: registeredFlow,
      tags: [cleanupTag(cleanupRegistry)],
    })
    expect(cleanupRegistry.size).toBeGreaterThan(0)
    await tempScope.dispose()

    const idTag = tag(custom<string>(), { label: "execution.id" })
    const concurrentFlow = flow(
      {
        name: "concurrent-flow",
        input: custom<number>(),
        output: custom<number>(),
      },
      async (ctx, input) => {
        const id = ctx.find(idTag) || crypto.randomUUID()
        executionIds.add(id)
        await new Promise((resolve) => setTimeout(resolve, Math.random() * 20))
        return input * 2
      },
    )
    const executions = await Promise.all([
      trackingScope.exec({ flow: concurrentFlow, input: 1, tags: [idTag(crypto.randomUUID())] }),
      trackingScope.exec({ flow: concurrentFlow, input: 2, tags: [idTag(crypto.randomUUID())] }),
      trackingScope.exec({ flow: concurrentFlow, input: 3, tags: [idTag(crypto.randomUUID())] }),
    ])
    expect(executions).toEqual([2, 4, 6])

    await cleanup()
  })

  scenario("Promised settled helpers", async () => {
    const createSuccessFlow = (multiplier = 1) => flow((_ctx, x: number) => x * multiplier)
    const createFailureFlow = (message = "fail") =>
      flow(() => {
        throw new Error(message)
      })

    const fulfilledMain = flow(async (ctx, input: number) =>
      ctx
        .parallelSettled([
          ctx.exec(createSuccessFlow(2), input),
          ctx.exec(createSuccessFlow(3), input),
          ctx.exec(createSuccessFlow(4), input),
        ])
        .fulfilled(),
    )
    const fulfilled = await flow.execute(fulfilledMain, 5)
    expect(fulfilled).toEqual([10, 15, 20])

    const rejectedMain = flow(async (ctx) =>
      ctx
        .parallelSettled([
          ctx.exec(createFailureFlow("error1"), undefined),
          ctx.exec(createFailureFlow("error2"), undefined),
        ])
        .rejected(),
    )
    const rejected = await flow.execute(rejectedMain, undefined)
    expect(rejected).toHaveLength(2)
    expect((rejected[0] as Error).message).toBe("error1")

    const partitionMain = flow(async (ctx, input: number) =>
      ctx
        .parallelSettled([
          ctx.exec(createSuccessFlow(2), input),
          ctx.exec(createFailureFlow(), undefined),
          ctx.exec(createSuccessFlow(2), input),
        ])
        .partition(),
    )
    const partition = await flow.execute(partitionMain, 5)
    expect(partition.fulfilled).toEqual([10, 10])
    expect(partition.rejected).toHaveLength(1)

    const firstFulfilledMain = flow(async (ctx, input: number) =>
      ctx
        .parallelSettled([
          ctx.exec(createFailureFlow(), undefined),
          ctx.exec(createSuccessFlow(), input),
          ctx.exec(createSuccessFlow(), input * 2),
        ])
        .firstFulfilled(),
    )
    const firstFulfilled = await flow.execute(firstFulfilledMain, 5)
    expect(firstFulfilled).toBe(5)

    const firstRejectedMain = flow(async (ctx) =>
      ctx
        .parallelSettled([
          ctx.exec(createFailureFlow("first"), undefined),
          ctx.exec(createFailureFlow("second"), undefined),
        ])
        .firstRejected(),
    )
    const firstRejected = await flow.execute(firstRejectedMain, undefined)
    expect((firstRejected as Error).message).toBe("first")

    const findFulfilledMain = flow(async (ctx) =>
      ctx
        .parallelSettled([
          ctx.exec(createSuccessFlow(), 1),
          ctx.exec(createSuccessFlow(), 5),
          ctx.exec(createSuccessFlow(), 10),
        ])
        .findFulfilled((value: number) => value > 3),
    )
    const found = await flow.execute(findFulfilledMain, undefined)
    expect(found).toBe(5)

    const mapFulfilledMain = flow(async (ctx) =>
      ctx
        .parallelSettled([
          ctx.exec(createSuccessFlow(), 1),
          ctx.exec(createFailureFlow(), undefined),
          ctx.exec(createSuccessFlow(), 3),
        ])
        .mapFulfilled((value: number) => value * 10),
    )
    const mapped = await flow.execute(mapFulfilledMain, undefined)
    expect(mapped).toEqual([10, 30])

    const assertMain = flow(async (ctx, input: number) =>
      ctx
        .parallelSettled([
          ctx.exec(createSuccessFlow(2), input),
          ctx.exec(createSuccessFlow(2), input * 2),
        ])
        .assertAllFulfilled(),
    )
    const asserted = await flow.execute(assertMain, 5)
    expect(asserted).toEqual([10, 20])

    const assertFail = flow(async (ctx, input: number) =>
      ctx
        .parallelSettled([
          ctx.exec(createSuccessFlow(), input),
          ctx.exec(createFailureFlow("operation failed"), undefined),
        ])
        .assertAllFulfilled(),
    )
    await expect(flow.execute(assertFail, 5)).rejects.toThrow(
      "1 of 2 operations failed",
    )

    const customFail = flow(async (ctx, input: number) =>
      ctx
        .parallelSettled([
          ctx.exec(createSuccessFlow(), input),
          ctx.exec(createFailureFlow("op failed"), undefined),
          ctx.exec(createFailureFlow("op failed"), undefined),
        ])
        .assertAllFulfilled((reasons, fulfilledCount, totalCount) =>
          new Error(
            `Custom: ${reasons.length} failed, ${fulfilledCount} succeeded out of ${totalCount} total`,
          ),
        ),
    )
    await expect(flow.execute(customFail, 5)).rejects.toThrow(
      "Custom: 2 failed, 1 succeeded out of 3 total",
    )

    const staticPromises = flow(async (_ctx, input: number) => {
      const promise1 = flow.execute(createSuccessFlow(2), input)
      const promise2 = flow.execute(createFailureFlow(), undefined)
      const promise3 = flow.execute(createSuccessFlow(3), input)
      return Promised.allSettled([promise1, promise2, promise3]).partition()
    })
    const staticResult = await flow.execute(staticPromises, 5)
    expect(staticResult.fulfilled).toEqual([10, 15])

    const chained = flow(async (ctx) =>
      ctx
        .parallelSettled([
          ctx.exec(createSuccessFlow(), 1),
          ctx.exec(createFailureFlow(), undefined),
          ctx.exec(createSuccessFlow(), 5),
          ctx.exec(createSuccessFlow(), 10),
        ])
        .fulfilled()
        .map((values: number[]) => values.filter((value) => value > 3))
        .map((values: number[]) => values.reduce((sum, value) => sum + value, 0)),
    )
    const chainedResult = await flow.execute(chained, undefined)
    expect(chainedResult).toBe(15)

    const empty = flow(async (ctx) => ctx.parallelSettled([]).fulfilled())
    const emptyResult = await flow.execute(empty, undefined)
    expect(emptyResult).toEqual([])
  })

  scenario("reactive concurrency control", async () => {
    const nameTag = tag(custom<string>(), { label: "name" })
    const counter = provide(() => 0, nameTag("counter"))
    const scope = createScope()
    await scope.resolve(counter)
    expect(scope.accessor(counter).get()).toBe(0)
    await Promise.all([
      scope.update(counter, (x) => x + 1),
      scope.update(counter, (x) => x + 1),
      scope.update(counter, (x) => x + 1),
    ])
    expect(scope.accessor(counter).get()).toBe(3)

    const account = provide(() => ({ balance: 100 }), nameTag("account"))
    await scope.resolve(account)
    const withdraw = (amount: number) =>
      scope.update(account, (current) => ({
        balance: current.balance - amount,
      }))
    await Promise.all([withdraw(10), withdraw(20), withdraw(30)])
    expect(scope.accessor(account).get().balance).toBe(40)

    const source = provide(() => 0, nameTag("source"))
    const derived = derive(source.reactive, (x) => x * 2, nameTag("derived"))
    await scope.resolve(source)
    await scope.resolve(derived)
    const updates: number[] = []
    scope.onUpdate(derived, (accessor) => {
      updates.push(accessor.get())
    })
    await Promise.all([
      scope.update(source, 1),
      scope.update(source, 2),
      scope.update(source, 3),
    ])
    expect(scope.accessor(derived).get()).toBe(6)
    expect(updates).toEqual([2, 4, 6])

    const base = provide(() => 0, nameTag("base"))
    const step1 = derive(base.reactive, (x) => x + 1, nameTag("step1"))
    const step2 = derive(step1.reactive, (x) => x + 1, nameTag("step2"))
    await scope.resolve(base)
    await scope.resolve(step1)
    await scope.resolve(step2)
    await Promise.all([
      scope.update(base, (x) => x + 1),
      scope.update(base, (x) => x + 1),
      scope.update(base, (x) => x + 1),
    ])
    expect(scope.accessor(base).get()).toBe(3)
    expect(scope.accessor(step1).get()).toBe(4)
    expect(scope.accessor(step2).get()).toBe(5)

    const lostUpdateCounter = provide(() => 0, nameTag("counterWithDelay"))
    await scope.resolve(lostUpdateCounter)
    const readAndIncrement = () => {
      const current = scope.accessor(lostUpdateCounter).get()
      return scope.update(lostUpdateCounter, current + 1)
    }
    await Promise.all([
      readAndIncrement(),
      readAndIncrement(),
      readAndIncrement(),
      readAndIncrement(),
      readAndIncrement(),
    ])
    expect(scope.accessor(lostUpdateCounter).get()).toBe(1)

    const state = provide(() => ({ counter: 0, sum: 0 }), nameTag("state"))
    await scope.resolve(state)
    const operations = Array.from({ length: 4 }, () =>
      scope.update(state, (s) => ({
        ...s,
        counter: s.counter + 1,
        sum: s.sum + s.counter,
      })),
    )
    await Promise.all(operations)
    const finalState = scope.accessor(state).get()
    expect(finalState.counter).toBe(4)
    expect(finalState.sum).toBe(6)

    await scope.dispose()
  })

  scenario("immediate executor values", async () => {
    const executor = provide(() => 42)
    const scope = createScope(preset(executor, 100))
    const result = await scope.resolve(executor)
    expect(result).toBe(100)

    const base = provide(() => 10)
    const derived = derive(base, (val) => val * 2)
    const derivedScope = createScope(preset(base, 5))
    const derivedResult = await derivedScope.resolve(derived)
    expect(derivedResult).toBe(10)

    const exec1 = provide(() => 1)
    const exec2 = provide(() => 2)
    const exec3 = provide(() => 3)
    const multiScope = createScope(
      preset(exec1, 10),
      preset(exec2, 20),
      preset(exec3, 30),
    )
    const [r1, r2, r3] = await Promise.all([
      multiScope.resolve(exec1),
      multiScope.resolve(exec2),
      multiScope.resolve(exec3),
    ])
    expect([r1, r2, r3]).toEqual([10, 20, 30])

    const counter = provide(() => 0)
    const fn = vi.fn((count: number) => count + 1)
    const plus = derive(counter, (count) => fn(count))
    const eagerScope = createScope({ initialValues: [preset(counter, 2)] })
    const plusResult = await eagerScope.resolve(plus)
    expect(plusResult).toBe(3)
    expect(fn).toHaveBeenCalledWith(2)

    const cacheScope = createScope(preset(executor, 100))
    const first = await cacheScope.resolve(executor)
    const second = await cacheScope.resolve(executor)
    expect(first).toBe(100)
    expect(second).toBe(100)

    const promised = cacheScope.resolve(executor)
    const mappedValue = await promised.map((x) => x * 2)
    expect(mappedValue).toBe(200)

    await scope.dispose()
    await derivedScope.dispose()
    await multiScope.dispose()
    await eagerScope.dispose()
    await cacheScope.dispose()
  })
})
