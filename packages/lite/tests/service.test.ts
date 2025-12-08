import { describe, it, expect } from "vitest"
import { service, isService } from "../src/service"
import { atom } from "../src/atom"
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

    const db = await scope.resolve(dbService as unknown as Lite.Atom<{
      query: (ctx: Lite.ExecutionContext, sql: string) => string
    }>)

    const ctx = scope.createContext()
    const result = await ctx.exec({ fn: db.query, params: [ctx, "SELECT 1"] })

    expect(result).toBe("[DB] SELECT 1")

    await ctx.close()
    await scope.dispose()
  })
})
