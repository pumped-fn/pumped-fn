import { describe, it, expect } from "vitest"
import { atom, isAtom, controller, isControllerDep } from "../src/atom"

describe("Atom", () => {
  it("preserves config and identifies via type guards", () => {
    const simpleAtom = atom({ factory: () => 42 })
    const configAtom = atom({ factory: () => ({ port: 3000 }) })
    const withDeps = atom({
      deps: { cfg: configAtom },
      factory: (ctx, { cfg }) => cfg.port,
    })

    expect(isAtom(simpleAtom)).toBe(true)
    expect(simpleAtom.deps).toBeUndefined()

    expect(isAtom(withDeps)).toBe(true)
    expect(withDeps.deps).toHaveProperty("cfg")
  })

  it("controller() wraps atom as controller dep", () => {
    const myAtom = atom({ factory: () => 42 })
    const ctrlDep = controller(myAtom)

    expect(isControllerDep(ctrlDep)).toBe(true)
    expect(ctrlDep.atom).toBe(myAtom)
  })
})
