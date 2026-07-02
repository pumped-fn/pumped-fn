import { describe, it, expect } from "vitest"
import { atom, createScope, tag } from "@pumped-fn/lite"
import { __hmr_register } from "../src/runtime"
import type { HotModule } from "../src/types"

describe("__hmr_register", () => {
  it("returns atom as-is when import.meta.hot is undefined (production mode)", () => {
    const value = atom({ factory: () => "value" })

    const result = __hmr_register("key", value)

    expect(result).toBe(value)
  })

  it("is callable with different atoms and different keys", () => {
    const first = atom({ factory: () => "first" })
    const second = atom({ factory: () => "second" })

    const result1 = __hmr_register("key-1", first)
    const result2 = __hmr_register("key-2", second)

    expect(result1).toBe(first)
    expect(result2).toBe(second)
  })

  it("is callable multiple times with same key (production gracefully returns new atom)", () => {
    const first = atom({ factory: () => "first" })
    const second = atom({ factory: () => "second" })

    const result1 = __hmr_register("same-key", first)
    const result2 = __hmr_register("same-key", second)

    expect(result1).toBe(first)
    expect(result2).toBe(second)
  })

  it("keeps atom identity while refreshing factory on hot updates", async () => {
    const hot = hotModule()
    const first = __hmr_register("key", atom({ factory: () => "first" }), hot)
    const second = __hmr_register("key", atom({ factory: () => "second" }), hot)

    const scope = createScope()

    expect(second).toBe(first)
    expect(await scope.resolve(first)).toBe("second")
  })

  it("keeps atom identity while refreshing deps on hot updates", async () => {
    const hot = hotModule()
    const firstValue = atom({ factory: () => "first" })
    const secondValue = atom({ factory: () => "second" })
    const first = __hmr_register("key", atom({
      deps: { value: firstValue },
      factory: (_, { value }) => value,
    }), hot)
    const second = __hmr_register("key", atom({
      deps: { value: secondValue },
      factory: (_, { value }) => value,
    }), hot)

    const scope = createScope()

    expect(second).toBe(first)
    expect(await scope.resolve(first)).toBe("second")
  })

  it("retargets tag reverse lookups to the preserved atom", () => {
    const hot = hotModule()
    const oldTag = tag<string>({ label: "old" })
    const newTag = tag<string>({ label: "new" })
    const first = __hmr_register("key", atom({
      tags: [oldTag("value")],
      factory: () => "first",
    }), hot)
    const second = __hmr_register("key", atom({
      tags: [newTag("value")],
      factory: () => "second",
    }), hot)

    expect(second).toBe(first)
    expect(oldTag.atoms()).toEqual([])
    expect(newTag.atoms()).toEqual([first])
  })
})

function hotModule(): HotModule {
  return {
    data: {},
    accept: () => undefined,
    dispose: () => undefined,
  }
}
