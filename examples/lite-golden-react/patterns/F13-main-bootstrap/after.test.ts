import { describe, expect, test } from "vitest"
import { createScope } from "@pumped-fn/lite"
import { bootCount, increment } from "./after"

describe("inside-out", () => {
  test("IO1: bootstrap state is graph-owned, not component-owned", async () => {
    const scope = createScope()
    const ctx = scope.createContext()

    expect(await ctx.resolve(bootCount)).toBe(0)
    expect(await ctx.exec({ flow: increment, input: undefined })).toBe(1)
    expect(await ctx.resolve(bootCount)).toBe(1)

    await ctx.close({ ok: true })
    await scope.dispose()
  })
})
