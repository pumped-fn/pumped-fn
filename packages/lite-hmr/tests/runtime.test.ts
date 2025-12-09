import { describe, it, expect } from "vitest"
import { atom } from "@pumped-fn/lite"
import { __hmr_register } from "../src/runtime"

describe("__hmr_register", () => {
  it("returns atom as-is when import.meta.hot is undefined (production mode)", () => {
    const testAtom = atom({ factory: () => "value" })

    const result = __hmr_register("key", testAtom)

    expect(result).toBe(testAtom)
  })

  it("is callable with different atoms and different keys", () => {
    const atom1 = atom({ factory: () => "first" })
    const atom2 = atom({ factory: () => "second" })

    const result1 = __hmr_register("key-1", atom1)
    const result2 = __hmr_register("key-2", atom2)

    expect(result1).toBe(atom1)
    expect(result2).toBe(atom2)
  })

  it("is callable multiple times with same key (production gracefully returns new atom)", () => {
    const atom1 = atom({ factory: () => "first" })
    const atom2 = atom({ factory: () => "second" })

    const result1 = __hmr_register("same-key", atom1)
    const result2 = __hmr_register("same-key", atom2)

    expect(result1).toBe(atom1)
    expect(result2).toBe(atom2)
  })
})
