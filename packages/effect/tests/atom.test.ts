import { describe, it, expect } from "vitest"
import { atom, isAtom, lazy, isLazy } from "../src/atom"

describe("Atom", () => {
  describe("atom()", () => {
    it("creates an atom without deps", () => {
      const myAtom = atom({
        factory: () => 42,
      })

      expect(isAtom(myAtom)).toBe(true)
      expect(myAtom.deps).toBeUndefined()
    })

    it("creates an atom with deps", () => {
      const configAtom = atom({ factory: () => ({ port: 3000 }) })
      const serverAtom = atom({
        deps: { cfg: configAtom },
        factory: (ctx, { cfg }) => ({ server: true, port: cfg.port }),
      })

      expect(isAtom(serverAtom)).toBe(true)
      expect(serverAtom.deps).toEqual({ cfg: configAtom })
    })

    it("creates an atom with tags", () => {
      const myAtom = atom({
        factory: () => 42,
        tags: [],
      })

      expect(myAtom.tags).toEqual([])
    })
  })

  describe("lazy()", () => {
    it("wraps an atom as lazy", () => {
      const myAtom = atom({ factory: () => 42 })
      const lazyAtom = lazy(myAtom)

      expect(isLazy(lazyAtom)).toBe(true)
      expect(lazyAtom.atom).toBe(myAtom)
    })
  })
})
