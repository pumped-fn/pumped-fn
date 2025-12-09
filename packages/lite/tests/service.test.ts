import { describe, it, expect } from "vitest"
import { service } from "../src/service"
import { isAtom, atom } from "../src/atom"
import { createScope } from "../src/scope"
import type { Lite } from "../src/types"

describe("Service", () => {
  it("is an Atom (isAtom returns true)", () => {
    const dbService = service({
      factory: () => ({
        query: (_ctx: Lite.ExecutionContext, sql: string) => `result: ${sql}`,
      }),
    })

    expect(isAtom(dbService)).toBe(true)
  })

  it("resolves like atom and methods work via ctx.exec", async () => {
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
    const result = await ctx.exec({ fn: db.query, params: ["SELECT 1"] })

    expect(result).toBe("[DB] SELECT 1")

    await ctx.close()
    await scope.dispose()
  })

  it("methods work when destructured (closure pattern)", async () => {
    const counterService = service({
      factory: () => {
        let count = 0
        return {
          increment: (_ctx: Lite.ExecutionContext) => ++count,
          getCount: (_ctx: Lite.ExecutionContext) => count,
        }
      },
    })

    const scope = createScope()
    await scope.ready

    const counter = await scope.resolve(counterService)
    const ctx = scope.createContext()

    const incrementFn = counter.increment
    await ctx.exec({ fn: incrementFn, params: [] })
    await ctx.exec({ fn: counter.increment, params: [] })

    const getCountFn = counter.getCount
    const count = await ctx.exec({ fn: getCountFn, params: [] })
    expect(count).toBe(2)

    await ctx.close()
    await scope.dispose()
  })
})
