import { describe, it, expect } from "vitest"
import { atom, isAtom, controller, isControllerDep } from "../src/atom"

describe("keepAlive", () => {
  it("preserves keepAlive property for all variants", () => {
    const noKeepAlive = atom({ factory: () => "value" })
    expect(noKeepAlive.keepAlive).toBeUndefined()

    const withKeepAlive = atom({ factory: () => "value", keepAlive: true })
    expect(withKeepAlive.keepAlive).toBe(true)

    const explicitFalse = atom({ factory: () => "value", keepAlive: false })
    expect(explicitFalse.keepAlive).toBe(false)
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
