import { describe, it, expect } from "vitest"
import { service, isService } from "../src/service"
import { isAtom, atom } from "../src/atom"
import { createScope } from "../src/scope"
import type { Lite } from "../src/types"

describe("Service", () => {
  it("identifies via type guards (isService and isAtom)", () => {
    const dbService = service({
      factory: () => ({
        query: (_ctx: Lite.ExecutionContext, sql: string) => `result: ${sql}`,
      }),
    })

    expect(isService(dbService)).toBe(true)
    expect(isAtom(dbService)).toBe(true)
    expect(isService({})).toBe(false)
    expect(isService(null)).toBe(false)
  })

  it("resolves with deps and invokes methods via ctx.exec", async () => {
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

  it("binds methods to preserve closure state when destructured", async () => {
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
    await ctx.exec({ fn: incrementFn, params: [ctx] })
    await ctx.exec({ fn: counter.increment, params: [ctx] })

    const getCountFn = counter.getCount
    const count = await ctx.exec({ fn: getCountFn, params: [ctx] })
    expect(count).toBe(2)

    await ctx.close()
    await scope.dispose()
  })

  it("methods are wrapped by extensions via ctx.exec", async () => {
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
})
