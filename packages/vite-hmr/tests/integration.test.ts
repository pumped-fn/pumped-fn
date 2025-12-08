import { describe, it, expect } from "vitest"
import { createScope, atom } from "@pumped-fn/lite"
import { transformAtoms } from "../src/transform"

describe("integration: HMR preserves scope cache", () => {
  it("demonstrates atom reference stability enables scope cache hits", async () => {
    const atomA = atom({ factory: () => ({ value: "original" }) })

    const scope = createScope()
    const value1 = await scope.resolve(atomA)

    const sameReference = atomA
    const value2 = await scope.resolve(sameReference)

    expect(value2).toBe(value1)
    expect(value2.value).toBe("original")
  })

  it("demonstrates new atom reference causes scope cache miss", async () => {
    const atomA = atom({ factory: () => ({ value: "original", ts: Date.now() }) })
    const atomB = atom({ factory: () => ({ value: "new", ts: Date.now() }) })

    const scope = createScope()
    const value1 = await scope.resolve(atomA)

    const value2 = await scope.resolve(atomB)

    expect(value2).not.toBe(value1)
  })

  it("transform generates consistent keys for same source location", () => {
    const code = `import { atom } from '@pumped-fn/lite'
const configAtom = atom({ factory: () => ({}) })`

    const result1 = transformAtoms(code, "src/atoms.ts")
    const result2 = transformAtoms(code, "src/atoms.ts")

    const keyPattern = /src\/atoms\.ts:2:\d+/
    expect(result1?.code).toMatch(keyPattern)
    expect(result2?.code).toMatch(keyPattern)

    const key1 = result1?.code.match(/'(src\/atoms\.ts:\d+:\d+)'/)?.[1]
    const key2 = result2?.code.match(/'(src\/atoms\.ts:\d+:\d+)'/)?.[1]
    expect(key1).toBe(key2)
  })

  it("end-to-end: simulated HMR flow with registry pattern", () => {
    const registry = new Map<string, unknown>()
    const key = "test/file.ts:5:10"

    const simulatedRegister = <T>(k: string, newAtom: T): T => {
      if (registry.has(k)) {
        return registry.get(k) as T
      }
      registry.set(k, newAtom)
      return newAtom
    }

    const atom1 = atom({ factory: () => "first" })
    const registered1 = simulatedRegister(key, atom1)

    const atom2 = atom({ factory: () => "second" })
    const registered2 = simulatedRegister(key, atom2)

    expect(registered1).toBe(atom1)
    expect(registered2).toBe(atom1)
    expect(registered2).not.toBe(atom2)
  })
})
