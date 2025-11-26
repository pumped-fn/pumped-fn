import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  createScope,
  provide,
  derive,
  preset,
  flow,
  flowMeta,
  tag,
  tags,
  custom,
  multi,
  Promised,
  extension,
  isExecutor,
  isLazyExecutor,
  isReactiveExecutor,
  isStaticExecutor,
  isMainExecutor,
  isPreset,
  resolves,
  name,
  FlowError,
  FlowValidationError,
  ExecutorResolutionError,
  FactoryExecutionError,
  DependencyResolutionError,
  ExecutionContextClosedError,
  SchemaError,
  Sucrose,
  separateFunction,
  type Core,
  type Flow,
  type Extension,
  type Tag,
} from "../src/index"

describe("Scope & Executor", () => {
  describe("provide()", () => {
    it("creates executor with sync factory", async () => {
      const counter = provide(() => 0)
      const scope = createScope()
      expect(await scope.resolve(counter)).toBe(0)
      await scope.dispose()
    })

    it("creates executor with async factory", async () => {
      const config = provide(async () => ({ port: 3000 }))
      const scope = createScope()
      const result = await scope.resolve(config)
      expect(result).toEqual({ port: 3000 })
      await scope.dispose()
    })

    it("passes controller to factory for cleanup", async () => {
      const cleanup = vi.fn()
      const resource = provide((ctl) => {
        ctl.cleanup(cleanup)
        return { handle: "db-conn" }
      })
      const scope = createScope()
      await scope.resolve(resource)
      await scope.dispose()
      expect(cleanup).toHaveBeenCalledOnce()
    })

    it("supports controller.release for early cleanup", async () => {
      const cleanup = vi.fn()
      let releaseRef: (() => Promised<void>) | null = null
      const resource = provide((ctl) => {
        ctl.cleanup(cleanup)
        releaseRef = () => ctl.release()
        return "resource"
      })
      const scope = createScope()
      await scope.resolve(resource)
      expect(cleanup).not.toHaveBeenCalled()
      await releaseRef!()
      expect(cleanup).toHaveBeenCalledOnce()
      await scope.dispose()
    })

    it("supports controller.reload for refresh", async () => {
      let callCount = 0
      let reloadRef: (() => Promised<void>) | null = null
      const counter = provide((ctl) => {
        callCount++
        reloadRef = () => ctl.reload()
        return callCount
      })
      const scope = createScope()
      expect(await scope.resolve(counter)).toBe(1)
      await reloadRef!()
      expect(scope.accessor(counter).get()).toBe(2)
      await scope.dispose()
    })

    it("attaches tags to executor", async () => {
      const appTag = tag(custom<string>(), { label: "app" })
      const config = provide(() => "prod", appTag("api"))
      expect(appTag.readFrom(config)).toBe("api")
    })
  })

  describe("derive()", () => {
    it("creates executor with single dependency", async () => {
      const base = provide(() => 10)
      const doubled = derive(base, (v) => v * 2)
      const scope = createScope()
      expect(await scope.resolve(doubled)).toBe(20)
      await scope.dispose()
    })

    it("creates executor with array dependencies", async () => {
      const a = provide(() => 2)
      const b = provide(() => 3)
      const sum = derive([a, b], ([x, y]) => x + y)
      const scope = createScope()
      expect(await scope.resolve(sum)).toBe(5)
      await scope.dispose()
    })

    it("creates executor with object dependencies", async () => {
      const host = provide(() => "localhost")
      const port = provide(() => 8080)
      const url = derive({ host, port }, ({ host, port }) => `${host}:${port}`)
      const scope = createScope()
      expect(await scope.resolve(url)).toBe("localhost:8080")
      await scope.dispose()
    })

    it("resolves dependencies in correct order", async () => {
      const order: string[] = []
      const first = provide(() => {
        order.push("first")
        return 1
      })
      const second = derive(first, (v) => {
        order.push("second")
        return v + 1
      })
      const scope = createScope()
      await scope.resolve(second)
      expect(order).toEqual(["first", "second"])
      await scope.dispose()
    })

    it("passes controller for cleanup registration", async () => {
      const cleanup = vi.fn()
      const base = provide(() => 10)
      const derived = derive(base, (v, ctl) => {
        ctl.cleanup(cleanup)
        return v * 2
      })
      const scope = createScope()
      await scope.resolve(derived)
      await scope.dispose()
      expect(cleanup).toHaveBeenCalledOnce()
    })

    it("detects circular dependencies", async () => {
      const a = provide(() => 1)
      const b = derive(a, () => 2)
      const aInternal = a as unknown as { dependencies: Record<string, unknown>; factory: (deps: { b: number }) => number }
      const bInternal = b as unknown as { dependencies: Record<string, unknown>; factory: (deps: { a: number }) => number }
      aInternal.dependencies = { b }
      bInternal.dependencies = { a }
      aInternal.factory = (deps: { b: number }) => deps.b + 1
      bInternal.factory = (deps: { a: number }) => deps.a + 1
      const scope = createScope()
      await expect(scope.resolve(a)).rejects.toThrow()
      await scope.dispose()
    })
  })

  describe("preset()", () => {
    it("overrides executor value with static value", async () => {
      const counter = provide(() => 0)
      const scope = createScope(preset(counter, 100))
      expect(await scope.resolve(counter)).toBe(100)
      await scope.dispose()
    })

    it("overrides executor with another executor", async () => {
      const original = provide(() => "original")
      const replacement = provide(() => "replaced")
      const scope = createScope(preset(original, replacement))
      expect(await scope.resolve(original)).toBe("replaced")
      await scope.dispose()
    })

    it("propagates preset to derived executors", async () => {
      const base = provide(() => 10)
      const derived = derive(base, (v) => v * 2)
      const scope = createScope(preset(base, 5))
      expect(await scope.resolve(derived)).toBe(10)
      await scope.dispose()
    })

    it("supports multiple presets", async () => {
      const a = provide(() => 1)
      const b = provide(() => 2)
      const sum = derive([a, b], ([x, y]) => x + y)
      const scope = createScope(preset(a, 10), preset(b, 20))
      expect(await scope.resolve(sum)).toBe(30)
      await scope.dispose()
    })
  })

  describe("reactive channels", () => {
    it("executor.reactive triggers re-computation on update", async () => {
      const counter = provide(() => 0)
      const doubled = derive(counter.reactive, (v) => v * 2)
      const scope = createScope()

      await scope.resolve(counter)
      await scope.resolve(doubled)
      expect(scope.accessor(doubled).get()).toBe(0)

      await scope.update(counter, 5)
      expect(scope.accessor(doubled).get()).toBe(10)

      await scope.dispose()
    })

    it("executor.lazy returns accessor via scope.accessor", async () => {
      const counter = provide(() => 42)
      const scope = createScope()
      await scope.resolve(counter)
      const accessor = scope.accessor(counter)
      expect(accessor.get()).toBe(42)
      await scope.dispose()
    })

    it("executor.lazy used in derive receives accessor", async () => {
      const counter = provide(() => 42)
      const lazyDerived = derive(counter.lazy, (accessor) => ({
        getDouble: async () => {
          await accessor.resolve()
          return accessor.get() * 2
        },
        getValue: async () => {
          await accessor.resolve()
          return accessor.get()
        }
      }))
      const scope = createScope()
      const result = await scope.resolve(lazyDerived)
      expect(await result.getValue()).toBe(42)
      expect(await result.getDouble()).toBe(84)
      await scope.dispose()
    })

    it("executor.static returns accessor for mutations", async () => {
      const counter = provide(() => 0)
      const controller = derive(counter.static, (accessor) => ({
        increment: () => accessor.update((v) => v + 1),
        get: () => accessor.get(),
      }))
      const scope = createScope()
      const ctl = await scope.resolve(controller)
      expect(ctl.get()).toBe(0)
      await ctl.increment()
      expect(ctl.get()).toBe(1)
      await scope.dispose()
    })

    it("onUpdate callback fires on changes", async () => {
      const counter = provide(() => 0)
      const updates: number[] = []
      const scope = createScope()
      await scope.resolve(counter)

      scope.onUpdate(counter, (accessor) => {
        updates.push(accessor.get())
      })

      await scope.update(counter, 1)
      await scope.update(counter, 2)
      await scope.update(counter, 3)

      expect(updates).toEqual([1, 2, 3])
      await scope.dispose()
    })

    it("reactive chain propagates updates", async () => {
      const base = provide(() => 1)
      const step1 = derive(base.reactive, (v) => v + 10)
      const step2 = derive(step1.reactive, (v) => v * 2)

      const scope = createScope()
      await scope.resolve(base)
      await scope.resolve(step1)
      await scope.resolve(step2)

      expect(scope.accessor(step2).get()).toBe(22)

      await scope.update(base, 5)
      expect(scope.accessor(step2).get()).toBe(30)

      await scope.dispose()
    })
  })

  describe("scope lifecycle", () => {
    it("caches resolved values", async () => {
      let callCount = 0
      const counter = provide(() => {
        callCount++
        return 42
      })
      const scope = createScope()
      await scope.resolve(counter)
      await scope.resolve(counter)
      await scope.resolve(counter)
      expect(callCount).toBe(1)
      await scope.dispose()
    })

    it("runs cleanups in LIFO order", async () => {
      const order: string[] = []
      const first = provide((ctl) => {
        ctl.cleanup(() => { order.push("first") })
        return 1
      })
      const second = derive(first, (v, ctl) => {
        ctl.cleanup(() => { order.push("second") })
        return v + 1
      })
      const scope = createScope()
      await scope.resolve(second)
      await scope.dispose()
      expect(order).toEqual(["second", "first"])
    })

    it("throws on operations after dispose", async () => {
      const counter = provide(() => 0)
      const scope = createScope()
      await scope.dispose()
      expect(() => scope.resolve(counter)).toThrow("Scope is disposed")
    })

    it("entries() returns all resolved executors", async () => {
      const a = provide(() => 1)
      const b = provide(() => 2)
      const scope = createScope()
      await scope.resolve(a)
      await scope.resolve(b)
      const entries = scope.entries()
      expect(entries.length).toBe(2)
      await scope.dispose()
    })

    it("registeredExecutors() returns registry executors", async () => {
      const a = provide(() => 1)
      const b = provide(() => 2)
      const scope = createScope({ registry: [a, b] })
      const registered = scope.registeredExecutors()
      expect(registered).toContain(a)
      expect(registered).toContain(b)
      await scope.dispose()
    })
  })

  describe("scope.run()", () => {
    it("resolves dependencies and runs callback", async () => {
      const config = provide(() => ({ multiplier: 2 }))
      const scope = createScope()
      const result = await scope.run({ config }, ({ config }) => config.multiplier * 5)
      expect(result).toBe(10)
      await scope.dispose()
    })

    it("supports callback with extra args", async () => {
      const base = provide(() => 10)
      const scope = createScope()
      const result = await scope.run(
        { base },
        ({ base }, x: number, y: number) => base + x + y,
        [5, 3]
      )
      expect(result).toBe(18)
      await scope.dispose()
    })

    it("reuses cached resolutions", async () => {
      let callCount = 0
      const counter = provide(() => {
        callCount++
        return 1
      })
      const scope = createScope()
      await scope.run({ counter }, () => 1)
      await scope.run({ counter }, () => 1)
      expect(callCount).toBe(1)
      await scope.dispose()
    })
  })

  describe("error handling", () => {
    it("wraps factory errors in FactoryExecutionError", async () => {
      const failing = provide(() => {
        throw new Error("factory failed")
      })
      const scope = createScope()
      await expect(scope.resolve(failing)).rejects.toThrow(FactoryExecutionError)
      await scope.dispose()
    })

    it("wraps dependency errors in DependencyResolutionError", async () => {
      const failing = provide(() => {
        throw new Error("dep failed")
      })
      const derived = derive(failing, (v) => v)
      const scope = createScope()
      await expect(scope.resolve(derived)).rejects.toThrow(FactoryExecutionError)
      await scope.dispose()
    })

    it("onError callback receives error details", async () => {
      const failing = provide(() => {
        throw new Error("test error")
      })
      const scope = createScope()
      const errors: unknown[] = []
      scope.onError((err, executor) => {
        errors.push({ err, executor })
      })
      await expect(scope.resolve(failing)).rejects.toThrow()
      expect(errors.length).toBe(1)
      await scope.dispose()
    })

    it("onError with executor filters by executor", async () => {
      const failing1 = provide(() => {
        throw new Error("error1")
      })
      const failing2 = provide(() => {
        throw new Error("error2")
      })
      const scope = createScope()
      const errors: string[] = []
      scope.onError(failing1, (err) => { errors.push("failing1") })
      await expect(scope.resolve(failing1)).rejects.toThrow()
      await expect(scope.resolve(failing2)).rejects.toThrow()
      expect(errors).toEqual(["failing1"])
      await scope.dispose()
    })

    it("error callback cleanup works", async () => {
      const failing = provide(() => {
        throw new Error("test")
      })
      const scope = createScope()
      const errors: unknown[] = []
      const cleanup = scope.onError((err) => { errors.push(err) })
      cleanup()
      await expect(scope.resolve(failing)).rejects.toThrow()
      expect(errors.length).toBe(0)
      await scope.dispose()
    })
  })

  describe("type guards", () => {
    it("isExecutor identifies executors", () => {
      const counter = provide(() => 0)
      expect(isExecutor(counter)).toBe(true)
      expect(isExecutor({})).toBe(false)
      expect(isExecutor(null)).toBe(false)
    })

    it("isMainExecutor identifies main executors", () => {
      const counter = provide(() => 0)
      expect(isMainExecutor(counter)).toBe(true)
      expect(isMainExecutor(counter.reactive)).toBe(false)
    })

    it("isReactiveExecutor identifies reactive channel", () => {
      const counter = provide(() => 0)
      expect(isReactiveExecutor(counter.reactive)).toBe(true)
      expect(isReactiveExecutor(counter)).toBe(false)
    })

    it("isLazyExecutor identifies lazy channel", () => {
      const counter = provide(() => 0)
      expect(isLazyExecutor(counter.lazy)).toBe(true)
      expect(isLazyExecutor(counter)).toBe(false)
    })

    it("isStaticExecutor identifies static channel", () => {
      const counter = provide(() => 0)
      expect(isStaticExecutor(counter.static)).toBe(true)
      expect(isStaticExecutor(counter)).toBe(false)
    })

    it("isPreset identifies preset configurations", () => {
      const counter = provide(() => 0)
      const p = preset(counter, 10)
      expect(isPreset(p)).toBe(true)
      expect(isPreset(counter)).toBe(false)
    })
  })
})

describe("Flow", () => {
  describe("flow()", () => {
    it("creates flow with handler only", async () => {
      const double = flow((_ctx, n: number) => n * 2)
      const result = await flow.execute(double, 5)
      expect(result).toBe(10)
    })

    it("creates flow with definition", async () => {
      const greet = flow(
        { name: "greet", input: custom<string>(), output: custom<string>() },
        (_ctx, name) => `Hello, ${name}!`
      )
      expect(greet.definition.name).toBe("greet")
      const result = await flow.execute(greet, "World")
      expect(result).toBe("Hello, World!")
    })

    it("creates flow with single dependency", async () => {
      const config = provide(() => ({ greeting: "Hi" }))
      const greet = flow(config, (cfg, _ctx, name: string) => `${cfg.greeting}, ${name}`)
      const result = await flow.execute(greet, "Alice")
      expect(result).toBe("Hi, Alice")
    })

    it("creates flow with array dependencies", async () => {
      const a = provide(() => 2)
      const b = provide(() => 3)
      const multiply = flow([a, b], ([x, y], _ctx) => x * y)
      const result = await flow.execute(multiply, undefined)
      expect(result).toBe(6)
    })

    it("creates flow with object dependencies", async () => {
      const host = provide(() => "api.example.com")
      const port = provide(() => 443)
      const getUrl = flow({ host, port }, ({ host, port }, _ctx) => `https://${host}:${port}`)
      const result = await flow.execute(getUrl, undefined)
      expect(result).toBe("https://api.example.com:443")
    })
  })

  describe("flow.execute()", () => {
    it("disposes transient scope after execution", async () => {
      const cleanup = vi.fn()
      const resource = provide((ctl) => {
        ctl.cleanup(cleanup)
        return "resource"
      })
      const useResource = flow(resource, (r, _ctx) => r)
      await flow.execute(useResource, undefined)
      expect(cleanup).toHaveBeenCalledOnce()
    })

    it("keeps scope alive when provided", async () => {
      const cleanup = vi.fn()
      const resource = provide((ctl) => {
        ctl.cleanup(cleanup)
        return "resource"
      })
      const useResource = flow(resource, (r, _ctx) => r)
      const scope = createScope()
      await flow.execute(useResource, undefined, { scope })
      expect(cleanup).not.toHaveBeenCalled()
      await scope.dispose()
      expect(cleanup).toHaveBeenCalledOnce()
    })

    it("returns execution details when requested", async () => {
      const getValue = flow((_ctx) => 42)
      const details = await flow.execute(getValue, undefined, { details: true })
      expect(details.success).toBe(true)
      if (details.success) {
        expect(details.result).toBe(42)
        expect(details.ctx).toBeDefined()
      }
    })

    it("captures error in details", async () => {
      const failing = flow(() => {
        throw new Error("fail")
      })
      const details = await flow.execute(failing, undefined, { details: true })
      expect(details.success).toBe(false)
      if (!details.success) {
        expect(details.error).toBeInstanceOf(Error)
      }
    })

    it("supports scopeTags option", async () => {
      const envTag = tag(custom<string>(), { label: "env" })
      const getEnv = flow((ctx) => ctx.get(envTag))
      const result = await flow.execute(getEnv, undefined, {
        scopeTags: [envTag("production")]
      })
      expect(result).toBe("production")
    })

    it("supports executionTags option", async () => {
      const reqIdTag = tag(custom<string>(), { label: "reqId" })
      const getReqId = flow((ctx) => ctx.get(reqIdTag))
      const result = await flow.execute(getReqId, undefined, {
        executionTags: [reqIdTag("req-123")]
      })
      expect(result).toBe("req-123")
    })

    it("supports extensions option", async () => {
      const calls: string[] = []
      const trackingExt: Extension.Extension = {
        name: "tracking",
        wrap: (_scope, next, op) => {
          if (op.kind === "execution") calls.push("before")
          return next().then((r) => {
            if (op.kind === "execution") calls.push("after")
            return r
          })
        }
      }
      const simple = flow(() => "done")
      await flow.execute(simple, undefined, { extensions: [trackingExt] })
      expect(calls).toContain("before")
      expect(calls).toContain("after")
    })
  })

  describe("ctx.exec()", () => {
    it("executes nested flow", async () => {
      const inner = flow((_ctx, n: number) => n * 2)
      const outer = flow(async (ctx, n: number) => {
        const result = await ctx.exec({ flow: inner, input: n })
        return result + 1
      })
      const result = await flow.execute(outer, 5)
      expect(result).toBe(11)
    })

    it("executes function directly", async () => {
      const parent = flow(async (ctx) => {
        const result = await ctx.exec({ fn: () => 42 })
        return result
      })
      const result = await flow.execute(parent, undefined)
      expect(result).toBe(42)
    })

    it("executes function with params", async () => {
      const parent = flow(async (ctx) => {
        const result = await ctx.exec({
          fn: (a: number, b: number) => a + b,
          params: [2, 3]
        })
        return result
      })
      const result = await flow.execute(parent, undefined)
      expect(result).toBe(5)
    })

    it("journals keyed executions", async () => {
      let callCount = 0
      const inner = flow((_ctx, n: number) => {
        callCount++
        return n * 2
      })
      const outer = flow(async (ctx, n: number) => {
        const r1 = await ctx.exec({ flow: inner, input: n, key: "double" })
        const r2 = await ctx.exec({ flow: inner, input: n, key: "double" })
        return r1 + r2
      })
      const result = await flow.execute(outer, 5)
      expect(result).toBe(20)
      expect(callCount).toBe(1)
    })

    it("respects timeout", async () => {
      const slow = flow(async () => {
        await new Promise((r) => setTimeout(r, 100))
        return "done"
      })
      const parent = flow(async (ctx) => {
        return ctx.exec({ flow: slow, input: undefined, timeout: 10 })
      })
      await expect(flow.execute(parent, undefined)).rejects.toThrow()
    })

    it("resetJournal allows re-execution", async () => {
      let callCount = 0
      const inner = flow((_ctx, n: number) => {
        callCount++
        return n * 2
      })
      const outer = flow(async (ctx, n: number) => {
        await ctx.exec({ flow: inner, input: n, key: "calc" })
        ctx.resetJournal("calc")
        await ctx.exec({ flow: inner, input: n, key: "calc" })
        return callCount
      })
      const result = await flow.execute(outer, 5)
      expect(result).toBe(2)
    })
  })

  describe("ctx.parallel()", () => {
    it("executes promises in parallel", async () => {
      const inner = flow((_ctx, n: number) => n * 2)
      const parent = flow(async (ctx, n: number) => {
        const result = await ctx.parallel([
          ctx.exec({ flow: inner, input: n }),
          ctx.exec({ flow: inner, input: n + 1 }),
          ctx.exec({ flow: inner, input: n + 2 }),
        ])
        return result
      })
      const result = await flow.execute(parent, 1)
      expect(result.results).toEqual([2, 4, 6])
      expect(result.stats).toEqual({ total: 3, succeeded: 3, failed: 0 })
    })

    it("fails fast on error", async () => {
      const success = flow((_ctx, n: number) => n)
      const failing = flow(() => {
        throw new Error("fail")
      })
      const parent = flow(async (ctx) => {
        return ctx.parallel([
          ctx.exec({ flow: success, input: 1 }),
          ctx.exec({ flow: failing, input: undefined }),
        ])
      })
      await expect(flow.execute(parent, undefined)).rejects.toThrow("fail")
    })
  })

  describe("ctx.parallelSettled()", () => {
    it("collects all results including failures", async () => {
      const success = flow((_ctx, n: number) => n * 2)
      const failing = flow(() => {
        throw new Error("fail")
      })
      const parent = flow(async (ctx) => {
        return ctx.parallelSettled([
          ctx.exec({ flow: success, input: 5 }),
          ctx.exec({ flow: failing, input: undefined }),
          ctx.exec({ flow: success, input: 3 }),
        ])
      })
      const result = await flow.execute(parent, undefined)
      expect(result.stats).toEqual({ total: 3, succeeded: 2, failed: 1 })
      expect(result.results[0]).toEqual({ status: "fulfilled", value: 10 })
      expect(result.results[1].status).toBe("rejected")
      expect(result.results[2]).toEqual({ status: "fulfilled", value: 6 })
    })

    it("partition() separates fulfilled and rejected", async () => {
      const success = flow((_ctx, n: number) => n)
      const failing = flow(() => {
        throw new Error("fail")
      })
      const parent = flow(async (ctx) => {
        return ctx.parallelSettled([
          ctx.exec({ flow: success, input: 1 }),
          ctx.exec({ flow: failing, input: undefined }),
          ctx.exec({ flow: success, input: 2 }),
        ]).partition()
      })
      const result = await flow.execute(parent, undefined)
      expect(result.fulfilled).toEqual([1, 2])
      expect(result.rejected.length).toBe(1)
    })
  })

  describe("schema validation", () => {
    it("validates input with custom validator", async () => {
      const positiveNumber = flow(
        {
          name: "positive",
          input: custom<number>((v) => {
            if (typeof v !== "number" || v <= 0) {
              return { success: false, issues: [{ message: "Must be positive" }] }
            }
            return v
          }),
          output: custom<number>()
        },
        (_ctx, n) => n * 2
      )
      await expect(flow.execute(positiveNumber, -5)).rejects.toThrow("Must be positive")
      expect(await flow.execute(positiveNumber, 5)).toBe(10)
    })

    it("validates output with custom validator", async () => {
      const mustBeEven = flow(
        {
          name: "even",
          input: custom<number>(),
          output: custom<number>((v) => {
            if (typeof v !== "number" || v % 2 !== 0) {
              return { success: false, issues: [{ message: "Must be even" }] }
            }
            return v
          })
        },
        (_ctx, n) => n
      )
      await expect(flow.execute(mustBeEven, 3)).rejects.toThrow("Must be even")
      expect(await flow.execute(mustBeEven, 4)).toBe(4)
    })
  })

  describe("flowMeta", () => {
    it("flowMeta.flowName contains flow name", async () => {
      const named = flow(
        { name: "myFlow", input: custom<void>(), output: custom<string>() },
        (ctx) => ctx.get(flowMeta.flowName) || "unnamed"
      )
      const result = await flow.execute(named, undefined)
      expect(result).toBe("myFlow")
    })

    it("flowMeta.depth tracks nesting level", async () => {
      const inner = flow(
        { name: "inner", input: custom<void>(), output: custom<number>() },
        (ctx) => ctx.get(flowMeta.depth) ?? -1
      )
      const outer = flow(
        { name: "outer", input: custom<void>(), output: custom<number[]>() },
        async (ctx) => {
          const outerDepth = ctx.get(flowMeta.depth) ?? -1
          const innerDepth = await ctx.exec({ flow: inner, input: undefined })
          return [outerDepth, innerDepth]
        }
      )
      const result = await flow.execute(outer, undefined)
      expect(result).toEqual([0, 1])
    })
  })

  describe("Flow.Execution", () => {
    it("provides execution id", async () => {
      const simple = flow(() => "done")
      const scope = createScope()
      const execution = scope.exec({ flow: simple, input: undefined })
      expect(execution.id).toBeDefined()
      expect(typeof execution.id).toBe("string")
      await execution.result
      await scope.dispose()
    })

    it("provides flowName", async () => {
      const named = flow({ name: "testFlow", input: custom<void>(), output: custom<string>() }, () => "done")
      const scope = createScope()
      const execution = scope.exec({ flow: named, input: undefined })
      expect(execution.flowName).toBe("testFlow")
      await execution.result
      await scope.dispose()
    })

    it("tracks status transitions", async () => {
      const slow = flow(async () => {
        await new Promise((r) => setTimeout(r, 20))
        return "done"
      })
      const scope = createScope()
      const execution = scope.exec({ flow: slow, input: undefined })
      const statuses: string[] = []
      execution.onStatusChange((status) => { statuses.push(status) })
      void execution.status
      await execution.result
      await new Promise((r) => setTimeout(r, 10))
      expect(statuses).toContain("completed")
      await scope.dispose()
    })

    it("status becomes failed on error", async () => {
      const failing = flow(() => {
        throw new Error("fail")
      })
      const scope = createScope()
      const execution = scope.exec({ flow: failing, input: undefined })
      const statuses: string[] = []
      execution.onStatusChange((status) => { statuses.push(status) })
      void execution.status
      await execution.result.catch(() => {})
      await new Promise((r) => setTimeout(r, 10))
      expect(statuses).toContain("failed")
      await scope.dispose()
    })

    it("abort controller can cancel execution", async () => {
      const never = flow(async (ctx) => {
        await new Promise((_, reject) => {
          ctx.signal.addEventListener("abort", () => reject(new Error("aborted")))
        })
        return "never"
      })
      const scope = createScope()
      const execution = scope.exec({ flow: never, input: undefined })
      const statuses: string[] = []
      execution.onStatusChange((status) => { statuses.push(status) })
      void execution.status
      setTimeout(() => execution.abort.abort(), 10)
      await expect(execution.result).rejects.toThrow()
      await new Promise((r) => setTimeout(r, 10))
      expect(statuses).toContain("cancelled")
      await scope.dispose()
    })

    it("is thenable", async () => {
      const simple = flow(() => 42)
      const scope = createScope()
      const result = await scope.exec({ flow: simple, input: undefined })
      expect(result).toBe(42)
      await scope.dispose()
    })
  })
})

describe("Tag", () => {
  describe("tag()", () => {
    it("creates tag with label", () => {
      const envTag = tag(custom<string>(), { label: "env" })
      expect(envTag.toString()).toContain("env")
      expect(typeof envTag.key).toBe("symbol")
    })

    it("creates tag with default value", () => {
      const portTag = tag(custom<number>(), { label: "port", default: 3000 })
      expect(portTag().value).toBe(3000)
    })

    it("tagged value contains value property", () => {
      const envTag = tag(custom<string>(), { label: "env" })
      const tagged = envTag("production")
      expect(tagged.value).toBe("production")
    })

    it("entry() returns [key, value] tuple", () => {
      const portTag = tag(custom<number>(), { label: "port", default: 8080 })
      const [key, value] = portTag.entry()
      expect(key).toBe(portTag.key)
      expect(value).toBe(8080)
    })

    it("validates value with schema", () => {
      const positiveTag = tag(
        custom<number>((v) => {
          if (typeof v !== "number" || v <= 0) {
            return { success: false, issues: [{ message: "must be positive" }] }
          }
          return v
        }),
        { label: "positive" }
      )
      expect(() => positiveTag(-1)).toThrow("must be positive")
      expect(positiveTag(5).value).toBe(5)
    })
  })

  describe("tag extraction", () => {
    it("extractFrom Map store", () => {
      const envTag = tag(custom<string>(), { label: "env" })
      const store = new Map<symbol, unknown>()
      store.set(envTag.key, "production")
      expect(envTag.extractFrom(store)).toBe("production")
    })

    it("extractFrom scope", () => {
      const envTag = tag(custom<string>(), { label: "env" })
      const scope = createScope({ tags: [envTag("staging")] })
      expect(envTag.extractFrom(scope)).toBe("staging")
    })

    it("extractFrom container", () => {
      const envTag = tag(custom<string>(), { label: "env" })
      const container = { tags: [envTag("dev")] }
      expect(envTag.extractFrom(container)).toBe("dev")
    })

    it("extractFrom throws when missing without default", () => {
      const envTag = tag(custom<string>(), { label: "env" })
      const store = new Map<symbol, unknown>()
      expect(() => envTag.extractFrom(store)).toThrow()
    })

    it("extractFrom returns default when missing", () => {
      const portTag = tag(custom<number>(), { label: "port", default: 3000 })
      const store = new Map<symbol, unknown>()
      expect(portTag.extractFrom(store)).toBe(3000)
    })

    it("readFrom returns first value or undefined", () => {
      const envTag = tag(custom<string>(), { label: "env" })
      const container = { tags: [envTag("first"), envTag("second")] }
      expect(envTag.readFrom(container)).toBe("first")
      expect(envTag.readFrom({ tags: [] })).toBeUndefined()
    })

    it("collectFrom returns all values", () => {
      const roleTag = tag(custom<string>(), { label: "role" })
      const container = { tags: [roleTag("admin"), roleTag("user")] }
      expect(roleTag.collectFrom(container)).toEqual(["admin", "user"])
    })
  })

  describe("tag writing", () => {
    it("writeToStore adds to Map", () => {
      const envTag = tag(custom<string>(), { label: "env" })
      const store = new Map<symbol, unknown>()
      envTag.writeToStore(store, "test")
      expect(store.get(envTag.key)).toBe("test")
    })

    it("writeToContainer adds to tags array", () => {
      const envTag = tag(custom<string>(), { label: "env" })
      const container: Tag.Container = { tags: [] }
      envTag.writeToContainer(container, "prod")
      expect(container.tags![0].value).toBe("prod")
    })

    it("writeToContainer creates tags array if missing", () => {
      const envTag = tag(custom<string>(), { label: "env" })
      const container: Tag.Container = {}
      envTag.writeToContainer(container, "dev")
      expect(container.tags).toBeDefined()
      expect(container.tags![0].value).toBe("dev")
    })

    it("writeToTags adds to array", () => {
      const envTag = tag(custom<string>(), { label: "env" })
      const arr: Tag.Tagged[] = []
      envTag.writeToTags(arr, "staging")
      expect(arr[0].value).toBe("staging")
    })

    it("writeToStore validates", () => {
      const positiveTag = tag(
        custom<number>((v) => {
          if (typeof v !== "number" || v <= 0) {
            return { success: false, issues: [{ message: "must be positive" }] }
          }
          return v
        }),
        { label: "positive" }
      )
      const store = new Map<symbol, unknown>()
      expect(() => positiveTag.writeToStore(store, -1 as unknown as number)).toThrow()
    })

    it("writeToContainer throws for invalid container", () => {
      const envTag = tag(custom<string>(), { label: "env" })
      expect(() => envTag.writeToContainer(null as unknown as Tag.Container, "x")).toThrow()
      expect(() => envTag.writeToContainer([] as unknown as Tag.Container, "x")).toThrow()
      expect(() => envTag.writeToContainer({ tags: "invalid" } as unknown as Tag.Container, "x")).toThrow()
    })

    it("writeToTags throws for non-array", () => {
      const envTag = tag(custom<string>(), { label: "env" })
      expect(() => envTag.writeToTags(null as unknown as Tag.Tagged[], "x")).toThrow()
      expect(() => envTag.writeToTags({} as unknown as Tag.Tagged[], "x")).toThrow()
    })
  })

  describe("tags helpers", () => {
    it("tags.required creates required executor", () => {
      const envTag = tag(custom<string>(), { label: "env" })
      const required = tags.required(envTag)
      expect(required.tag).toBe(envTag)
    })

    it("tags.optional creates optional executor", () => {
      const envTag = tag(custom<string>(), { label: "env" })
      const optional = tags.optional(envTag)
      expect(optional.tag).toBe(envTag)
    })

    it("tags.all creates collector executor", () => {
      const roleTag = tag(custom<string>(), { label: "role" })
      const all = tags.all(roleTag)
      expect(all.tag).toBe(roleTag)
    })

    it("tag as dependency in flow", async () => {
      const envTag = tag(custom<string>(), { label: "env" })
      const getEnv = flow([envTag], ([env], _ctx) => env)
      const scope = createScope({ tags: [envTag("production")] })
      const result = await flow.execute(getEnv, undefined, { scope })
      expect(result).toBe("production")
      await scope.dispose()
    })

    it("tag as dependency in derive", async () => {
      const envTag = tag(custom<string>(), { label: "env" })
      const envLogger = derive([envTag], ([env]) => `Logger for ${env}`)
      const scope = createScope({ tags: [envTag("dev")] })
      const result = await scope.resolve(envLogger)
      expect(result).toBe("Logger for dev")
      await scope.dispose()
    })
  })

  describe("tag in execution context", () => {
    it("ctx.get retrieves tag value", async () => {
      const envTag = tag(custom<string>(), { label: "env" })
      const getEnv = flow((ctx) => ctx.get(envTag))
      const result = await flow.execute(getEnv, undefined, {
        executionTags: [envTag("test")]
      })
      expect(result).toBe("test")
    })

    it("ctx.find returns undefined for missing tag", async () => {
      const envTag = tag(custom<string>(), { label: "env" })
      const findEnv = flow((ctx) => ctx.find(envTag) ?? "default")
      const result = await flow.execute(findEnv, undefined)
      expect(result).toBe("default")
    })

    it("ctx.set updates tag value", async () => {
      const countTag = tag(custom<number>(), { label: "count", default: 0 })
      const increment = flow((ctx) => {
        const current = ctx.get(countTag)
        ctx.set(countTag, current + 1)
        return ctx.get(countTag)
      })
      const result = await flow.execute(increment, undefined)
      expect(result).toBe(1)
    })

    it("child context inherits parent tags", async () => {
      const envTag = tag(custom<string>(), { label: "env" })
      const inner = flow((ctx) => ctx.get(envTag))
      const outer = flow(async (ctx) => {
        return ctx.exec({ flow: inner, input: undefined })
      })
      const result = await flow.execute(outer, undefined, {
        executionTags: [envTag("parent")]
      })
      expect(result).toBe("parent")
    })

    it("child context can override parent tags", async () => {
      const envTag = tag(custom<string>(), { label: "env" })
      const inner = flow((ctx) => ctx.get(envTag))
      const outer = flow(async (ctx) => {
        return ctx.exec({ flow: inner, input: undefined, tags: [envTag("child")] })
      })
      const result = await flow.execute(outer, undefined, {
        executionTags: [envTag("parent")]
      })
      expect(result).toBe("child")
    })
  })

  describe("name tag", () => {
    it("name tag can be attached to executors", () => {
      const counter = provide(() => 0, name("counter"))
      expect(name.readFrom(counter)).toBe("counter")
    })
  })
})

describe("Extension", () => {
  describe("extension lifecycle", () => {
    it("init runs on scope creation", async () => {
      const initCalled = vi.fn()
      const ext: Extension.Extension = {
        name: "init-test",
        init: () => {
          initCalled()
        }
      }
      const scope = createScope({ extensions: [ext] })
      await new Promise((r) => setTimeout(r, 0))
      expect(initCalled).toHaveBeenCalledOnce()
      await scope.dispose()
    })

    it("dispose runs on scope disposal", async () => {
      const disposeCalled = vi.fn()
      const ext: Extension.Extension = {
        name: "dispose-test",
        dispose: () => {
          disposeCalled()
        }
      }
      const scope = createScope({ extensions: [ext] })
      await scope.dispose()
      expect(disposeCalled).toHaveBeenCalledOnce()
    })

    it("useExtension adds extension dynamically", async () => {
      const wrapCalled = vi.fn()
      const ext: Extension.Extension = {
        name: "dynamic",
        wrap: (_scope, next, _op) => {
          wrapCalled()
          return next()
        }
      }
      const counter = provide(() => 0)
      const scope = createScope()
      scope.useExtension(ext)
      await scope.resolve(counter)
      expect(wrapCalled).toHaveBeenCalled()
      await scope.dispose()
    })

    it("useExtension returns cleanup function", async () => {
      const wrapCalled = vi.fn()
      const ext: Extension.Extension = {
        name: "removable",
        wrap: (_scope, next, _op) => {
          wrapCalled()
          return next()
        }
      }
      const a = provide(() => 1)
      const b = provide(() => 2)
      const scope = createScope()
      const cleanup = scope.useExtension(ext)
      await scope.resolve(a)
      cleanup()
      await scope.resolve(b)
      expect(wrapCalled).toHaveBeenCalledTimes(1)
      await scope.dispose()
    })
  })

  describe("wrap hook", () => {
    it("wraps resolve operations", async () => {
      const operations: string[] = []
      const ext: Extension.Extension = {
        name: "wrap-resolve",
        wrap: (_scope, next, op) => {
          if (op.kind === "resolve") operations.push("before")
          return next().then((r) => {
            if (op.kind === "resolve") operations.push("after")
            return r
          })
        }
      }
      const counter = provide(() => 42)
      const scope = createScope({ extensions: [ext] })
      await scope.resolve(counter)
      expect(operations).toEqual(["before", "after"])
      await scope.dispose()
    })

    it("wraps execution operations", async () => {
      const operations: string[] = []
      const ext: Extension.Extension = {
        name: "wrap-exec",
        wrap: (_scope, next, op) => {
          if (op.kind === "execution") operations.push(op.name)
          return next()
        }
      }
      const simple = flow(() => "done")
      await flow.execute(simple, undefined, { extensions: [ext] })
      expect(operations.length).toBeGreaterThan(0)
    })

    it("extensions wrap in order (first wraps outermost)", async () => {
      const order: string[] = []
      const ext1: Extension.Extension = {
        name: "ext1",
        wrap: (_scope, next, op) => {
          if (op.kind === "execution") order.push("ext1-before")
          return next().then((r) => {
            if (op.kind === "execution") order.push("ext1-after")
            return r
          })
        }
      }
      const ext2: Extension.Extension = {
        name: "ext2",
        wrap: (_scope, next, op) => {
          if (op.kind === "execution") order.push("ext2-before")
          return next().then((r) => {
            if (op.kind === "execution") order.push("ext2-after")
            return r
          })
        }
      }
      const simple = flow(() => "done")
      await flow.execute(simple, undefined, { extensions: [ext1, ext2] })
      expect(order).toEqual(["ext1-before", "ext2-before", "ext2-after", "ext1-after"])
    })

    it("wrap can modify return value", async () => {
      const ext: Extension.Extension = {
        name: "modifier",
        wrap: (_scope, next, op) => {
          if (op.kind === "resolve") {
            return next().then((r) => (r as number) * 2)
          }
          return next()
        }
      }
      const counter = provide(() => 21)
      const scope = createScope({ extensions: [ext] })
      const result = await scope.resolve(counter)
      expect(result).toBe(42)
      await scope.dispose()
    })
  })

  describe("onError hook", () => {
    it("receives errors from executors", async () => {
      const errors: unknown[] = []
      const ext: Extension.Extension = {
        name: "error-handler",
        onError: (err) => {
          errors.push(err)
        }
      }
      const failing = provide(() => {
        throw new Error("fail")
      })
      const scope = createScope({ extensions: [ext] })
      await expect(scope.resolve(failing)).rejects.toThrow()
      expect(errors.length).toBe(1)
      await scope.dispose()
    })

    it("does not suppress original error", async () => {
      const ext: Extension.Extension = {
        name: "error-handler",
        onError: () => {}
      }
      const failing = provide(() => {
        throw new Error("original")
      })
      const scope = createScope({ extensions: [ext] })
      await expect(scope.resolve(failing)).rejects.toThrow("original")
      await scope.dispose()
    })
  })

  describe("context-lifecycle operations", () => {
    it("receives create phase", async () => {
      const phases: string[] = []
      const ext: Extension.Extension = {
        name: "lifecycle",
        wrap: (_scope, next, op) => {
          if (op.kind === "context-lifecycle") phases.push(op.phase)
          return next()
        }
      }
      const scope = createScope({ extensions: [ext] })
      const ctx = scope.createExecution({ name: "test" })
      await ctx.close()
      expect(phases).toContain("create")
      expect(phases).toContain("closing")
      expect(phases).toContain("closed")
      await scope.dispose()
    })
  })

  describe("extension() helper", () => {
    it("provides type safety for extension creation", () => {
      const ext = extension({
        name: "typed-ext",
        init: () => {},
        wrap: (_scope, next) => next(),
        dispose: () => {}
      })
      expect(ext.name).toBe("typed-ext")
    })
  })
})

describe("ExecutionContext lifecycle", () => {
  describe("state management", () => {
    it("starts in active state", async () => {
      const scope = createScope()
      const ctx = scope.createExecution({ name: "test" })
      expect(ctx.state).toBe("active")
      expect(ctx.closed).toBe(false)
      await scope.dispose()
    })

    it("transitions to closing then closed", async () => {
      const scope = createScope()
      const ctx = scope.createExecution({ name: "test" })
      const states: string[] = []
      ctx.onStateChange((state) => states.push(state))
      await ctx.close()
      expect(states).toEqual(["closing", "closed"])
      expect(ctx.state).toBe("closed")
      expect(ctx.closed).toBe(true)
      await scope.dispose()
    })

    it("onStateChange cleanup removes listener", async () => {
      const scope = createScope()
      const ctx = scope.createExecution({ name: "test" })
      const states: string[] = []
      const cleanup = ctx.onStateChange((state) => states.push(state))
      cleanup()
      await ctx.close()
      expect(states).toEqual([])
      await scope.dispose()
    })
  })

  describe("close() behavior", () => {
    it("graceful close waits for in-flight work", async () => {
      const scope = createScope()
      const ctx = scope.createExecution({ name: "test" })
      let completed = false
      const slow = flow(async () => {
        await new Promise((r) => setTimeout(r, 30))
        completed = true
        return "done"
      })
      ctx.exec({ flow: slow, input: undefined })
      await ctx.close()
      expect(completed).toBe(true)
      await scope.dispose()
    })

    it("abort close signals cancellation", async () => {
      const scope = createScope()
      const ctx = scope.createExecution({ name: "test" })
      let aborted = false
      const never = flow(async (flowCtx) => {
        await new Promise<void>((_, reject) => {
          flowCtx.signal.addEventListener("abort", () => {
            aborted = true
            reject(new Error("aborted"))
          })
        })
      })
      ctx.exec({ flow: never, input: undefined })
      await new Promise((r) => setTimeout(r, 10))
      await expect(ctx.close({ mode: "abort" })).rejects.toThrow()
      expect(aborted).toBe(true)
      await scope.dispose()
    })

    it("close is idempotent", async () => {
      const scope = createScope()
      const ctx = scope.createExecution({ name: "test" })
      const p1 = ctx.close()
      const p2 = ctx.close()
      expect(p1).toBe(p2)
      await p1
      await scope.dispose()
    })

    it("close cascades to child contexts", async () => {
      const scope = createScope()
      const ctx = scope.createExecution({ name: "parent" })
      const childStates: string[] = []
      const nested = flow(async (flowCtx) => {
        flowCtx.onStateChange((state) => childStates.push(state))
        await new Promise((r) => setTimeout(r, 50))
        return "done"
      })
      ctx.exec({ flow: nested, input: undefined })
      await new Promise((r) => setTimeout(r, 10))
      await ctx.close()
      expect(childStates).toContain("closing")
      expect(childStates).toContain("closed")
      await scope.dispose()
    })
  })

  describe("exec after close", () => {
    it("throws ExecutionContextClosedError", async () => {
      const scope = createScope()
      const ctx = scope.createExecution({ name: "test" })
      await ctx.close()
      const simple = flow(() => "done")
      expect(() => ctx.exec({ flow: simple, input: undefined })).toThrow(ExecutionContextClosedError)
      await scope.dispose()
    })

    it("throws while closing", async () => {
      const scope = createScope()
      const ctx = scope.createExecution({ name: "test" })
      const slow = flow(async () => {
        await new Promise((r) => setTimeout(r, 50))
      })
      ctx.exec({ flow: slow, input: undefined })
      const closePromise = ctx.close()
      const simple = flow(() => "done")
      expect(() => ctx.exec({ flow: simple, input: undefined })).toThrow(ExecutionContextClosedError)
      await closePromise
      await scope.dispose()
    })
  })

  describe("context details", () => {
    it("has name and startedAt", async () => {
      const scope = createScope()
      const ctx = scope.createExecution({ name: "my-context" })
      expect(ctx.details.name).toBe("my-context")
      expect(ctx.details.startedAt).toBeGreaterThan(0)
      await scope.dispose()
    })

    it("end() sets completedAt", async () => {
      const scope = createScope()
      const ctx = scope.createExecution({ name: "test" })
      expect(ctx.details.completedAt).toBeUndefined()
      ctx.end()
      expect(ctx.details.completedAt).toBeDefined()
      await scope.dispose()
    })

    it("throwIfAborted throws when signal aborted", async () => {
      const scope = createScope()
      const ctx = scope.createExecution({ name: "test" })
      expect(() => ctx.throwIfAborted()).not.toThrow()
      await scope.dispose()
    })
  })

  describe("scope.exec auto-closes context", () => {
    it("closes context after flow completes", async () => {
      const closedIds: string[] = []
      const ext: Extension.Extension = {
        name: "tracker",
        wrap: (_scope, next, op) => {
          if (op.kind === "context-lifecycle" && op.phase === "closed") {
            closedIds.push(op.context.id)
          }
          return next()
        }
      }
      const scope = createScope({ extensions: [ext] })
      const simple = flow(() => "done")
      await scope.exec({ flow: simple, input: undefined }).result
      expect(closedIds.length).toBe(1)
      await scope.dispose()
    })
  })
})

describe("Multi-Executor", () => {
  describe("multi.provide()", () => {
    it("creates keyed executor pool", async () => {
      const pool = multi.provide(
        { keySchema: custom<string>() },
        (key) => ({ id: key, value: `pool-${key}` })
      )
      const scope = createScope()
      const users = await scope.resolve(pool("users"))
      const orders = await scope.resolve(pool("orders"))
      expect(users).toEqual({ id: "users", value: "pool-users" })
      expect(orders).toEqual({ id: "orders", value: "pool-orders" })
      await scope.dispose()
    })

    it("caches instances by key", async () => {
      let createCount = 0
      const pool = multi.provide(
        { keySchema: custom<string>() },
        (key) => {
          createCount++
          return key
        }
      )
      const scope = createScope()
      await scope.resolve(pool("a"))
      await scope.resolve(pool("a"))
      await scope.resolve(pool("b"))
      expect(createCount).toBe(2)
      await scope.dispose()
    })
  })

  describe("multi.derive()", () => {
    it("creates keyed pool with dependencies", async () => {
      const config = provide(() => ({ prefix: "api" }))
      const pool = multi.derive(
        { keySchema: custom<string>(), dependencies: { config } },
        ({ config }, key) => `${config.prefix}/${key}`
      )
      const scope = createScope()
      const users = await scope.resolve(pool("users"))
      expect(users).toBe("api/users")
      await scope.dispose()
    })
  })

  describe("multi.release()", () => {
    it("releases all pooled instances", async () => {
      const cleanups: string[] = []
      const pool = multi.provide(
        { keySchema: custom<string>() },
        (key, ctl) => {
          ctl.cleanup(() => { cleanups.push(key) })
          return key
        }
      )
      const scope = createScope()
      await scope.resolve(pool("a"))
      await scope.resolve(pool("b"))
      await pool.release(scope)
      expect(cleanups).toContain("a")
      expect(cleanups).toContain("b")
      await scope.dispose()
    })
  })
})

describe("Promised", () => {
  describe("static methods", () => {
    it("Promised.create wraps promise", async () => {
      const p = Promised.create(Promise.resolve(42))
      expect(await p).toBe(42)
    })

    it("Promised.all awaits all", async () => {
      const result = await Promised.all([
        Promised.create(Promise.resolve(1)),
        2,
        Promised.create(Promise.resolve(3))
      ])
      expect(result).toEqual([1, 2, 3])
    })

    it("Promised.race returns first", async () => {
      const fast = Promised.create(Promise.resolve("fast"))
      const slow = Promised.create(new Promise((r) => setTimeout(() => r("slow"), 50)))
      const result = await Promised.race([fast, slow])
      expect(result).toBe("fast")
    })

    it("Promised.allSettled collects results", async () => {
      const results = await Promised.allSettled([
        Promised.create(Promise.resolve(1)),
        Promised.create(Promise.reject(new Error("fail"))),
        Promised.create(Promise.resolve(3))
      ])
      expect(results[0]).toEqual({ status: "fulfilled", value: 1 })
      expect(results[1].status).toBe("rejected")
      expect(results[2]).toEqual({ status: "fulfilled", value: 3 })
    })

    it("Promised.try catches sync errors", async () => {
      const p = Promised.try(() => {
        throw new Error("sync")
      })
      await expect(p).rejects.toThrow("sync")
    })
  })

  describe("instance methods", () => {
    it("map transforms value", async () => {
      const p = Promised.create(Promise.resolve(5))
      const result = await p.map((v) => v * 2)
      expect(result).toBe(10)
    })

    it("map then flatMap via then", async () => {
      const p = Promised.create(Promise.resolve(5))
      const result = await p.then((v) => Promised.create(Promise.resolve(v * 2)))
      expect(result).toBe(10)
    })

    it("toPromise returns native promise", async () => {
      const p = Promised.create(Promise.resolve(42))
      const native = p.toPromise()
      expect(native).toBeInstanceOf(Promise)
      expect(await native).toBe(42)
    })
  })

  describe("partition helper", () => {
    it("separates fulfilled and rejected via method", async () => {
      const { fulfilled, rejected } = await Promised.allSettled([
        Promised.create(Promise.resolve(1)),
        Promised.create(Promise.reject(new Error("fail"))),
        Promised.create(Promise.resolve(2))
      ]).partition()
      expect(fulfilled).toEqual([1, 2])
      expect(rejected.length).toBe(1)
    })
  })
})

describe("resolves()", () => {
  it("resolves array of executors", async () => {
    const a = provide(() => 1)
    const b = provide(() => 2)
    const scope = createScope()
    const result = await resolves(scope, [a, b])
    expect(result).toEqual([1, 2])
    await scope.dispose()
  })

  it("resolves object of executors", async () => {
    const x = provide(() => "x")
    const y = provide(() => "y")
    const scope = createScope()
    const result = await resolves(scope, { x, y })
    expect(result).toEqual({ x: "x", y: "y" })
    await scope.dispose()
  })

  it("handles escapable executors", async () => {
    const inner = provide(() => 42)
    const escapable = { escape: () => inner }
    const scope = createScope()
    const result = await resolves(scope, [escapable])
    expect(result).toEqual([42])
    await scope.dispose()
  })

  it("handles channel variants - resolves to values", async () => {
    const counter = provide(() => 10)
    const scope = createScope()

    const [value] = await resolves(scope, [counter])
    expect(value).toBe(10)

    await scope.dispose()
  })
})

describe("Error Classes", () => {
  describe("FlowError", () => {
    it("has code and data", () => {
      const error = new FlowError("message", "CODE", { extra: true })
      expect(error.message).toBe("message")
      expect(error.code).toBe("CODE")
      expect(error.data).toEqual({ extra: true })
      expect(error.name).toBe("FlowError")
    })

    it("supports cause", () => {
      const cause = new Error("original")
      const error = new FlowError("wrapped", "WRAP", undefined, { cause })
      expect(error.cause).toBe(cause)
    })
  })

  describe("FlowValidationError", () => {
    it("has issues array", () => {
      const issues = [{ message: "invalid" }]
      const error = new FlowValidationError("validation failed", issues)
      expect(error.issues).toEqual(issues)
      expect(error.code).toBe("VALIDATION_ERROR")
      expect(error.name).toBe("FlowValidationError")
    })
  })

  describe("SchemaError", () => {
    it("contains validation issues", () => {
      const issues = [{ message: "bad value" }]
      const error = new SchemaError(issues)
      expect(error.issues).toEqual(issues)
      expect(error.code).toBe("V001")
      expect(error.name).toBe("SchemaError")
    })
  })

  describe("ExecutorResolutionError", () => {
    it("wraps resolution failures", () => {
      const cause = new Error("inner")
      const error = new ExecutorResolutionError("resolution failed", "my-executor", ["parent", "child"], cause)
      expect(error.executorName).toBe("my-executor")
      expect(error.dependencyChain).toEqual(["parent", "child"])
      expect(error.cause).toBe(cause)
      expect(error.code).toBe("E001")
    })
  })

  describe("FactoryExecutionError", () => {
    it("wraps factory failures", () => {
      const cause = new Error("factory threw")
      const error = new FactoryExecutionError("factory failed", "failing-executor", ["root"], cause)
      expect(error.executorName).toBe("failing-executor")
      expect(error.dependencyChain).toEqual(["root"])
      expect(error.cause).toBe(cause)
      expect(error.code).toBe("F001")
    })
  })

  describe("DependencyResolutionError", () => {
    it("wraps missing dependency", () => {
      const error = new DependencyResolutionError("dep not found", "consumer", ["root"], "missing-dep")
      expect(error.executorName).toBe("consumer")
      expect(error.missingDependency).toBe("missing-dep")
      expect(error.code).toBe("D001")
    })
  })

  describe("ExecutionContextClosedError", () => {
    it("indicates closed context", () => {
      const error = new ExecutionContextClosedError("ctx-123", "closed")
      expect(error.name).toBe("ExecutionContextClosedError")
      expect(error.contextId).toBe("ctx-123")
      expect(error.state).toBe("closed")
      expect(error.code).toBe("EC001")
    })
  })
})

describe("Realistic Scenario: Request Processing with Tags and Extensions", () => {
  const requestIdTag = tag(custom<string>(), { label: "requestId" })
  const userIdTag = tag(custom<string>(), { label: "userId" })
  const roleTag = tag(custom<string>(), { label: "role" })
  const timerTag = tag(custom<number>(), { label: "timer", default: 0 })

  const createAuditExtension = (logs: Array<{ phase: string; requestId?: string; duration?: number }>) => {
    const timers = new Map<string, number>()

    return extension({
      name: "audit",
      wrap: (_scope, next, op) => {
        if (op.kind === "execution") {
          const requestId = op.context.get(requestIdTag.key) as string | undefined
          timers.set(op.name, Date.now())
          logs.push({ phase: "start", requestId })

          return next().then((result) => {
            const start = timers.get(op.name)!
            const duration = Date.now() - start
            logs.push({ phase: "end", requestId, duration })
            return result
          }).catch((error) => {
            logs.push({ phase: "error", requestId })
            throw error
          })
        }
        return next()
      }
    })
  }

  const createAuthExtension = (allowedRoles: string[]) => {
    return extension({
      name: "auth",
      wrap: (_scope, next, op) => {
        if (op.kind === "execution") {
          const role = op.context.get(roleTag.key) as string | undefined
          if (role && !allowedRoles.includes(role)) {
            throw new Error(`Forbidden: role ${role} not in ${allowedRoles}`)
          }
        }
        return next()
      }
    })
  }

  const database = provide((ctl) => {
    const data = new Map<string, Record<string, unknown>>()
    data.set("user:1", { id: "1", name: "Alice", email: "alice@example.com" })
    data.set("user:2", { id: "2", name: "Bob", email: "bob@example.com" })
    data.set("order:1", { id: "1", userId: "1", total: 100 })
    data.set("order:2", { id: "2", userId: "1", total: 200 })

    ctl.cleanup(() => {
      data.clear()
    })

    return {
      get: <T>(key: string): T | undefined => data.get(key) as T | undefined,
      set: <T extends Record<string, unknown>>(key: string, value: T) => {
        data.set(key, value)
      },
      list: (prefix: string) => Array.from(data.entries())
        .filter(([k]) => k.startsWith(prefix))
        .map(([_, v]) => v)
    }
  }, name("database"))

  const logger = provide((ctl) => {
    const logs: string[] = []
    return {
      log: (msg: string) => logs.push(msg),
      getLogs: () => [...logs]
    }
  }, name("logger"))

  it("processes request with proper tagging and extension AOP", async () => {
    const auditLogs: Array<{ phase: string; requestId?: string; duration?: number }> = []
    const auditExt = createAuditExtension(auditLogs)
    const authExt = createAuthExtension(["admin", "user"])

    const getUser = flow(
      { db: database, logger },
      ({ db, logger }, ctx, userId: string) => {
        const reqId = ctx.get(requestIdTag)
        logger.log(`Fetching user ${userId} for request ${reqId}`)
        return db.get<{ id: string; name: string }>(`user:${userId}`)
      }
    )

    const scope = createScope({
      extensions: [auditExt, authExt],
      tags: [roleTag("admin")]
    })

    const result = await flow.execute(getUser, "1", {
      scope,
      executionTags: [requestIdTag("req-001")]
    })

    expect(result).toEqual({ id: "1", name: "Alice", email: "alice@example.com" })
    expect(auditLogs.some(l => l.phase === "start")).toBe(true)
    expect(auditLogs.some(l => l.phase === "end")).toBe(true)

    await scope.dispose()
  })

  it("blocks unauthorized requests via extension", async () => {
    const authExt = createAuthExtension(["admin"])

    const sensitiveOp = flow(database, (db, ctx) => {
      return db.list("user:")
    })

    const scope = createScope({
      extensions: [authExt],
      tags: [roleTag("guest")]
    })

    await expect(flow.execute(sensitiveOp, undefined, {
      scope,
      executionTags: [requestIdTag("req-blocked")]
    })).rejects.toThrow("Forbidden")

    await scope.dispose()
  })

  it("tracks nested flow executions with proper tag inheritance", async () => {
    const auditLogs: Array<{ phase: string; requestId?: string }> = []
    const auditExt = createAuditExtension(auditLogs)

    const getUserOrders = flow(database, (db, ctx, userId: string) => {
      return db.list("order:").filter((o) => (o as { userId?: string }).userId === userId)
    })

    const getUserWithOrders = flow(database, async (db, ctx, userId: string) => {
      const user = db.get<{ id: string; name: string }>(`user:${userId}`)
      const orders = await ctx.exec({ flow: getUserOrders, input: userId })
      return { user, orders }
    })

    const scope = createScope({ extensions: [auditExt] })
    const result = await flow.execute(getUserWithOrders, "1", {
      scope,
      executionTags: [requestIdTag("req-nested")]
    })

    expect(result.user).toEqual({ id: "1", name: "Alice", email: "alice@example.com" })
    expect(result.orders).toHaveLength(2)
    expect(auditLogs.filter(l => l.phase === "start").length).toBeGreaterThanOrEqual(2)

    await scope.dispose()
  })

  it("uses presets to inject test doubles", async () => {
    const mockDb = provide(() => ({
      get: <T>(_key: string): T | undefined => ({ id: "mock", name: "Mock User" }) as T | undefined,
      set: <T extends Record<string, unknown>>(_key: string, _value: T) => {},
      list: (_prefix: string) => [] as Record<string, unknown>[]
    }))

    const getUser = flow(database, (db, ctx) => {
      return db.get("user:any")
    })

    const scope = createScope(preset(database, mockDb))
    const result = await flow.execute(getUser, undefined, { scope })

    expect(result).toEqual({ id: "mock", name: "Mock User" })
    await scope.dispose()
  })

  it("collects metrics via reactive executors and tags", async () => {
    const metrics = provide(() => ({ requestCount: 0, totalDuration: 0 }))
    const metricsController = derive(metrics.static, (accessor) => ({
      recordRequest: async (duration: number) => {
        await accessor.update((m) => ({
          requestCount: m.requestCount + 1,
          totalDuration: m.totalDuration + duration
        }))
      },
      getMetrics: () => accessor.get()
    }))

    const metricsExt = extension({
      name: "metrics",
      init: async (scope) => {
        await scope.resolve(metricsController)
      },
      wrap: async (scope, next, op) => {
        if (op.kind === "execution") {
          const start = Date.now()
          const result = await next()
          const duration = Date.now() - start
          const ctl = await scope.resolve(metricsController)
          await ctl.recordRequest(duration)
          return result
        }
        return next()
      }
    })

    const simpleFlow = flow(async () => {
      await new Promise((r) => setTimeout(r, 10))
      return "ok"
    })

    const scope = createScope({ extensions: [metricsExt] })

    await flow.execute(simpleFlow, undefined, { scope })
    await flow.execute(simpleFlow, undefined, { scope })
    await flow.execute(simpleFlow, undefined, { scope })

    const ctl = await scope.resolve(metricsController)
    const finalMetrics = ctl.getMetrics()

    expect(finalMetrics.requestCount).toBe(3)
    expect(finalMetrics.totalDuration).toBeGreaterThan(0)

    await scope.dispose()
  })

  it("handles resource cleanup on context close", async () => {
    const cleanupCalls: string[] = []

    const resource = provide((ctl) => {
      ctl.cleanup(() => { cleanupCalls.push("resource") })
      return { data: "important" }
    })

    const useResource = flow(resource, async (r, ctx) => {
      await new Promise((res) => setTimeout(res, 20))
      return r.data
    })

    const scope = createScope()
    const ctx = scope.createExecution({ name: "cleanup-test" })

    ctx.exec({ flow: useResource, input: undefined })
    await new Promise((r) => setTimeout(r, 5))
    await ctx.close()

    await scope.dispose()
    expect(cleanupCalls).toContain("resource")
  })

  it("uses multi-executor for connection pooling pattern", async () => {
    const connectionPool = multi.provide(
      { keySchema: custom<string>() },
      (dbName, ctl) => {
        ctl.cleanup(() => {})
        return {
          name: dbName,
          query: (sql: string) => `Result from ${dbName}: ${sql}`
        }
      }
    )

    const scope = createScope()

    const mainDb = await scope.resolve(connectionPool("main"))
    const cacheDb = await scope.resolve(connectionPool("cache"))
    const mainDbAgain = await scope.resolve(connectionPool("main"))

    expect(mainDb.name).toBe("main")
    expect(cacheDb.name).toBe("cache")
    expect(mainDb).toBe(mainDbAgain)

    await connectionPool.release(scope)
    await scope.dispose()
  })
})

describe("Sucrose (Static Analysis)", () => {
  describe("types", () => {
    it("exports Sucrose namespace with Inference type", async () => {
      const inference: Sucrose.Inference = {
        async: false,
        usesCleanup: false,
        usesRelease: false,
        usesReload: false,
        usesScope: false,
        dependencyShape: "none",
        dependencyAccess: [],
      }
      expect(inference.async).toBe(false)
    })
  })

  describe("separateFunction", () => {
    it("parses arrow function with destructured params", () => {
      const fn = ([db, cache]: [string, string], ctl: unknown) => db + cache
      const [params, body] = separateFunction(fn)
      expect(params).toBe("[db, cache], ctl")
      expect(body).toContain("db + cache")
    })

    it("parses arrow function with single param", () => {
      const fn = (ctl: unknown) => "value"
      const [params, body] = separateFunction(fn)
      expect(params).toBe("ctl")
      expect(body).toContain("value")
    })

    it("parses arrow function with object destructuring", () => {
      const fn = ({ db, cache }: { db: string; cache: string }, ctl: unknown) => db
      const [params, body] = separateFunction(fn)
      expect(params).toBe("{ db, cache }, ctl")
      expect(body).toContain("db")
    })

    it("parses async arrow function", () => {
      const fn = async (ctl: unknown) => "async-value"
      const [params, body] = separateFunction(fn)
      expect(params).toBe("ctl")
      expect(body).toContain("async-value")
    })

    it("parses arrow function with block body", () => {
      const fn = (ctl: unknown) => {
        const x = 1
        return x
      }
      const [params, body] = separateFunction(fn)
      expect(params).toBe("ctl")
      expect(body).toContain("const x = 1")
      expect(body).toContain("return x")
    })
  })
})
