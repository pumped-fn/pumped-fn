import { describe, it, expect } from "vitest"
import { createScope, atom } from "@pumped-fn/lite"
import { __hmr_register } from "../src/runtime"
import { transformAtoms } from "../src/transform"
import type { HotModule } from "../src/types"

describe("integration: HMR preserves scope cache", () => {
  it("demonstrates atom reference stability enables scope cache hits", async () => {
    const original = atom({ factory: () => ({ value: "original" }) })

    const scope = createScope()
    const value1 = await scope.resolve(original)

    const sameReference = original
    const value2 = await scope.resolve(sameReference)

    expect(value2).toBe(value1)
    expect(value2.value).toBe("original")
  })

  it("demonstrates new atom reference causes scope cache miss", async () => {
    const original = atom({ factory: () => ({ value: "original", ts: Date.now() }) })
    const next = atom({ factory: () => ({ value: "new", ts: Date.now() }) })

    const scope = createScope()
    const value1 = await scope.resolve(original)

    const value2 = await scope.resolve(next)

    expect(value2).not.toBe(value1)
  })

  it("transform generates consistent keys for same source handle", () => {
    const code = `import { atom } from '@pumped-fn/lite'
const config = atom({ factory: () => ({}) })`

    const result1 = transformAtoms(code, "src/atoms.ts")
    const result2 = transformAtoms(code, "src/atoms.ts")

    const keyPattern = /src\/atoms\.ts:config/
    expect(result1?.code).toMatch(keyPattern)
    expect(result2?.code).toMatch(keyPattern)

    const key1 = result1?.code.match(/"(src\/atoms\.ts:config)"/)?.[1]
    const key2 = result2?.code.match(/"(src\/atoms\.ts:config)"/)?.[1]
    expect(key1).toBe(key2)
  })

  it("end-to-end: HMR keeps identity and refreshes future resolves", async () => {
    const hot = hotModule()
    const first = __hmr_register("test/file.ts:value", atom({ factory: () => "first" }), hot)
    const second = __hmr_register("test/file.ts:value", atom({ factory: () => "second" }), hot)

    const scope = createScope()

    expect(second).toBe(first)
    expect(await scope.resolve(first)).toBe("second")
  })

  it("end-to-end: resolved scope cache remains under normal Lite invalidation", async () => {
    const hot = hotModule()
    const first = __hmr_register("test/file.ts:value", atom({ factory: () => "first" }), hot)
    const scope = createScope()

    expect(await scope.resolve(first)).toBe("first")

    const second = __hmr_register("test/file.ts:value", atom({ factory: () => "second" }), hot)

    expect(second).toBe(first)
    expect(await scope.resolve(first)).toBe("first")
    scope.invalidate(first)
    await Promise.resolve()
    expect(await scope.resolve(first)).toBe("second")
  })
})

function hotModule(): HotModule {
  return {
    data: {},
    accept: () => undefined,
    dispose: () => undefined,
  }
}
