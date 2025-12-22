import { describe, it, expect } from "vitest"
import { atom, isAtom, controller, isControllerDep } from "../src/atom"

describe("keepAlive", () => {
  it("atom without keepAlive has keepAlive undefined", () => {
    const myAtom = atom({ factory: () => "value" })
    expect(myAtom.keepAlive).toBeUndefined()
  })

  it("atom with keepAlive: true has keepAlive true", () => {
    const myAtom = atom({ factory: () => "value", keepAlive: true })
    expect(myAtom.keepAlive).toBe(true)
  })

  it("atom with keepAlive: false has keepAlive false", () => {
    const myAtom = atom({ factory: () => "value", keepAlive: false })
    expect(myAtom.keepAlive).toBe(false)
  })
})

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
