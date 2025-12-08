import { describe, it, expect, vi } from "vitest"
import { service, isService } from "../src/service"
import { isAtom, atom } from "../src/atom"
import { tag } from "../src/tag"
import { createScope } from "../src/scope"
import type { Lite } from "../src/types"

describe("Service", () => {
  it("creates service and identifies via type guard", () => {
    const dbService = service({
      factory: () => ({
        query: (_ctx: Lite.ExecutionContext, sql: string) => `result: ${sql}`,
      }),
    })

    expect(isService(dbService)).toBe(true)
    expect(isService({})).toBe(false)
    expect(isService(null)).toBe(false)
    expect(isService(undefined)).toBe(false)
  })

  it("service is also an atom (has atomSymbol)", () => {
    const dbService = service({
      factory: () => ({
        query: (_ctx: Lite.ExecutionContext, sql: string) => `result: ${sql}`,
      }),
    })

    expect(isAtom(dbService)).toBe(true)
    expect(isService(dbService)).toBe(true)
  })

  it("resolves service without casting", async () => {
    const dbService = service({
      factory: () => ({
        query: (_ctx: Lite.ExecutionContext, sql: string) => `result: ${sql}`,
      }),
    })

    const scope = createScope()
    await scope.ready

    const db = await scope.resolve(dbService)

    expect(db.query).toBeDefined()
    expect(typeof db.query).toBe("function")

    await scope.dispose()
  })

  it("resolves service with deps and calls via ctx.exec", async () => {
    const configAtom = atom({ factory: () => ({ prefix: "DB" }) })

    const dbService = service({
      deps: { config: configAtom },
      factory: (_ctx, { config }) => ({
        query: (_execCtx: Lite.ExecutionContext, sql: string) => `[${config.prefix}] ${sql}`,
      }),
    })

    const scope = createScope()
    await scope.ready

    const db = await scope.resolve(dbService)

    const ctx = scope.createContext()
    const result = await ctx.exec({ fn: db.query, params: [ctx, "SELECT 1"] })

    expect(result).toBe("[DB] SELECT 1")

    await ctx.close()
    await scope.dispose()
  })

  it("binds methods to preserve this context", async () => {
    const counterService = service({
      factory: () => {
        let count = 0
        return {
          increment(_ctx: Lite.ExecutionContext) {
            count++
            return count
          },
          getCount(_ctx: Lite.ExecutionContext) {
            return count
          },
        }
      },
    })

    const scope = createScope()
    await scope.ready

    const counter = await scope.resolve(counterService)

    const ctx = scope.createContext()

    const incrementFn = counter.increment
    const result1 = await ctx.exec({ fn: incrementFn, params: [ctx] })
    expect(result1).toBe(1)

    const result2 = await ctx.exec({ fn: counter.increment, params: [ctx] })
    expect(result2).toBe(2)

    const getCountFn = counter.getCount
    const count = await ctx.exec({ fn: getCountFn, params: [ctx] })
    expect(count).toBe(2)

    await ctx.close()
    await scope.dispose()
  })

  it("supports service with tags", async () => {
    const infraTag = tag<string>({ label: "infra" })

    const loggerService = service({
      factory: () => ({
        info: (_ctx: Lite.ExecutionContext, msg: string) => `[INFO] ${msg}`,
        error: (_ctx: Lite.ExecutionContext, msg: string) => `[ERROR] ${msg}`,
      }),
      tags: [infraTag("logging")],
    })

    expect(loggerService.tags).toBeDefined()
    expect(loggerService.tags?.length).toBe(1)
    expect(infraTag.find(loggerService)).toBe("logging")
  })

  it("service is singleton per scope", async () => {
    let factoryCallCount = 0

    const counterService = service({
      factory: () => {
        factoryCallCount++
        return {
          getValue: (_ctx: Lite.ExecutionContext) => factoryCallCount,
        }
      },
    })

    const scope = createScope()
    await scope.ready

    const first = await scope.resolve(counterService)
    const second = await scope.resolve(counterService)

    expect(first).toBe(second)
    expect(factoryCallCount).toBe(1)

    await scope.dispose()
  })

  it("service methods work with multiple invocations", async () => {
    const mathService = service({
      factory: () => ({
        add: (_ctx: Lite.ExecutionContext, a: number, b: number) => a + b,
        multiply: (_ctx: Lite.ExecutionContext, a: number, b: number) => a * b,
        divide: (_ctx: Lite.ExecutionContext, a: number, b: number) => {
          if (b === 0) throw new Error("Division by zero")
          return a / b
        },
      }),
    })

    const scope = createScope()
    await scope.ready

    const math = await scope.resolve(mathService)
    const ctx = scope.createContext()

    const sum = await ctx.exec({ fn: math.add, params: [ctx, 2, 3] })
    expect(sum).toBe(5)

    const product = await ctx.exec({ fn: math.multiply, params: [ctx, 4, 5] })
    expect(product).toBe(20)

    const quotient = await ctx.exec({ fn: math.divide, params: [ctx, 10, 2] })
    expect(quotient).toBe(5)

    await ctx.close()
    await scope.dispose()
  })

  it("service methods propagate errors", async () => {
    const errorService = service({
      factory: () => ({
        fail: (_ctx: Lite.ExecutionContext, msg: string) => {
          throw new Error(msg)
        },
      }),
    })

    const scope = createScope()
    await scope.ready

    const svc = await scope.resolve(errorService)
    const ctx = scope.createContext()

    await expect(
      ctx.exec({ fn: svc.fail, params: [ctx, "expected error"] })
    ).rejects.toThrow("expected error")

    await ctx.close()
    await scope.dispose()
  })

  it("service methods wrapped by extensions", async () => {
    const execCalls: string[] = []

    const loggingExtension: Lite.Extension = {
      name: "logging",
      wrapExec: async (next, target) => {
        execCalls.push(typeof target === "function" ? "fn" : "flow")
        return next()
      },
    }

    const echoService = service({
      factory: () => ({
        echo: (_ctx: Lite.ExecutionContext, msg: string) => msg,
      }),
    })

    const scope = createScope({ extensions: [loggingExtension] })
    await scope.ready

    const echo = await scope.resolve(echoService)
    const ctx = scope.createContext()

    await ctx.exec({ fn: echo.echo, params: [ctx, "hello"] })

    expect(execCalls).toContain("fn")

    await ctx.close()
    await scope.dispose()
  })

  it("async service factory works", async () => {
    const asyncService = service({
      factory: async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        return {
          getValue: (_ctx: Lite.ExecutionContext) => 42,
        }
      },
    })

    const scope = createScope()
    await scope.ready

    const svc = await scope.resolve(asyncService)
    const ctx = scope.createContext()

    const value = await ctx.exec({ fn: svc.getValue, params: [ctx] })
    expect(value).toBe(42)

    await ctx.close()
    await scope.dispose()
  })
})
