import { describe, it, expect } from "vitest"
import { atom, isAtom, controller, isControllerDep } from "../src/atom"

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

  })

  describe("controller()", () => {
    it("wraps an atom as controller dep", () => {
      const myAtom = atom({ factory: () => 42 })
      const ctrlDep = controller(myAtom)

      expect(isControllerDep(ctrlDep)).toBe(true)
      expect(ctrlDep.atom).toBe(myAtom)
    })
  })
})
