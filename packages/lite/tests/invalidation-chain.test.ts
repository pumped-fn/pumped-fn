import { describe, it, expect } from "vitest"
import { createScope } from "../src/scope"
import { atom, controller } from "../src/atom"

describe("invalidation chain", () => {
  it("executes chain sequentially in order A -> B -> C", async () => {
    const events: string[] = []

    const atomA = atom({ factory: () => { events.push("A"); return "a" } })
    const atomB = atom({
      deps: { a: controller(atomA) },
      factory: (ctx, { a }) => {
        a.on("resolved", () => ctx.invalidate())
        events.push("B")
        return "b"
      },
    })
    const atomC = atom({
      deps: { b: controller(atomB) },
      factory: (ctx, { b }) => {
        b.on("resolved", () => ctx.invalidate())
        events.push("C")
        return "c"
      },
    })

    const scope = createScope()
    await scope.resolve(atomA)
    await scope.resolve(atomB)
    await scope.resolve(atomC)

    events.length = 0

    scope.controller(atomA).invalidate()

    await scope.flush()

    expect(events).toEqual(["A", "B", "C"])
  })

  it("throws on infinite loop", async () => {
    function factoryA() { return "a" }
    function factoryB() { return "b" }

    const atomA = atom({ factory: factoryA })
    const atomB = atom({ factory: factoryB })

    const scope = createScope()

    const ctrlA = scope.controller(atomA)
    const ctrlB = scope.controller(atomB)

    await scope.resolve(atomA)
    await scope.resolve(atomB)

    ctrlA.on("resolved", () => ctrlB.invalidate())
    ctrlB.on("resolved", () => ctrlA.invalidate())

    ctrlA.invalidate()

    await expect(scope.flush()).rejects.toThrow(/Infinite invalidation loop detected/)
  })

  it("allows self-invalidation during factory (deferred)", async () => {
    let count = 0
    const atomA = atom({
      factory: (ctx) => {
        count++
        if (count < 3) ctx.invalidate()
        return count
      },
    })

    const scope = createScope()
    const result = await scope.resolve(atomA)

    expect(result).toBe(1)

    await scope.flush()

    expect(count).toBe(3)
  })

  it("deduplicates concurrent invalidate() calls", async () => {
    let count = 0
    const atomA = atom({ factory: () => ++count })

    const scope = createScope()
    await scope.resolve(atomA)

    count = 0
    const ctrl = scope.controller(atomA)

    ctrl.invalidate()
    ctrl.invalidate()
    ctrl.invalidate()

    await ctrl.resolve()

    expect(count).toBe(1)
  })
})

describe("pendingSet in invalidation chain", () => {
  it("does not run cleanups when set() replaces value (bypasses factory)", async () => {
    let cleanupCalled = false
    const myAtom = atom({
      factory: (ctx) => {
        ctx.cleanup(() => { cleanupCalled = true })
        return "initial"
      },
    })

    const scope = createScope()
    await scope.resolve(myAtom)

    const ctrl = scope.controller(myAtom)
    ctrl.set("replaced")
    await scope.flush()

    expect(cleanupCalled).toBe(false)
  })

  it("does not false-positive infinite loop on pendingSet + re-invalidation", async () => {
    const atomA = atom({ factory: () => "a" })
    const atomB = atom({
      deps: { a: controller(atomA, { resolve: true }) },
      factory: (_ctx, { a }) => `b-${a.get()}`,
    })

    const scope = createScope()
    await scope.resolve(atomA)
    await scope.resolve(atomB)

    const ctrlA = scope.controller(atomA)
    const ctrlB = scope.controller(atomB)

    ctrlA.on("resolved", () => ctrlB.invalidate())

    ctrlA.set("a2")

    await scope.flush()

    expect(ctrlA.get()).toBe("a2")
  })
})
