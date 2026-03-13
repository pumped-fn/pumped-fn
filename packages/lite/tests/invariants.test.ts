import { describe, it, expect, vi } from "vitest"
import { createScope } from "../src/scope"
import { atom, controller } from "../src/atom"
import { flow } from "../src/flow"
import { preset } from "../src/preset"
import { tag, tags } from "../src/tag"
import type { Lite } from "../src/types"

describe("Invariant: Cleanup LIFO during invalidation", () => {
  it("INV-1: cleanups run in reverse registration order on invalidation (not just release)", async () => {
    const order: number[] = []

    const myAtom = atom({
      factory: (ctx) => {
        ctx.cleanup(() => { order.push(1) })
        ctx.cleanup(() => { order.push(2) })
        ctx.cleanup(() => { order.push(3) })
        return "value"
      },
    })

    const scope = createScope()
    await scope.resolve(myAtom)

    scope.controller(myAtom).invalidate()
    await scope.flush()

    expect(order).toEqual([3, 2, 1])

    await scope.dispose()
  })

  it("INV-1b: cleanups from previous resolve are cleared before re-resolve registers new ones", async () => {
    const cleanupLog: string[] = []
    let resolveCount = 0

    const myAtom = atom({
      factory: (ctx) => {
        resolveCount++
        ctx.cleanup(() => { cleanupLog.push(`cleanup-${resolveCount}`) })
        return resolveCount
      },
    })

    const scope = createScope()
    await scope.resolve(myAtom)

    scope.controller(myAtom).invalidate()
    await scope.flush()

    expect(cleanupLog).toEqual(["cleanup-1"])

    scope.controller(myAtom).invalidate()
    await scope.flush()

    expect(cleanupLog).toEqual(["cleanup-1", "cleanup-2"])

    await scope.dispose()
  })
})

describe("Invariant: Extension middleware ordering", () => {
  it("INV-2: resolve extensions wrap in declaration order (first declared = outermost)", async () => {
    const order: string[] = []

    const ext1: Lite.Extension = {
      name: "ext1",
      wrapResolve: async (next) => {
        order.push("ext1-enter")
        const result = await next()
        order.push("ext1-exit")
        return result
      },
    }

    const ext2: Lite.Extension = {
      name: "ext2",
      wrapResolve: async (next) => {
        order.push("ext2-enter")
        const result = await next()
        order.push("ext2-exit")
        return result
      },
    }

    const ext3: Lite.Extension = {
      name: "ext3",
      wrapResolve: async (next) => {
        order.push("ext3-enter")
        const result = await next()
        order.push("ext3-exit")
        return result
      },
    }

    const scope = createScope({ extensions: [ext1, ext2, ext3] })
    await scope.resolve(atom({ factory: () => 42 }))

    expect(order).toEqual([
      "ext1-enter", "ext2-enter", "ext3-enter",
      "ext3-exit", "ext2-exit", "ext1-exit",
    ])
  })

  it("INV-2b: exec extensions wrap in declaration order (first declared = outermost)", async () => {
    const order: string[] = []

    const ext1: Lite.Extension = {
      name: "ext1",
      wrapExec: async (next) => {
        order.push("ext1-enter")
        const result = await next()
        order.push("ext1-exit")
        return result
      },
    }

    const ext2: Lite.Extension = {
      name: "ext2",
      wrapExec: async (next) => {
        order.push("ext2-enter")
        const result = await next()
        order.push("ext2-exit")
        return result
      },
    }

    const scope = createScope({ extensions: [ext1, ext2] })
    const ctx = scope.createContext()
    const myFlow = flow({ factory: () => "result" })
    await ctx.exec({ flow: myFlow })
    await ctx.close()

    expect(order).toEqual([
      "ext1-enter", "ext2-enter",
      "ext2-exit", "ext1-exit",
    ])
  })

  it("INV-2c: extension dispose runs in declaration order (FIFO, not LIFO)", async () => {
    const order: string[] = []

    const scope = createScope({
      extensions: [
        { name: "ext1", dispose: () => { order.push("ext1") } },
        { name: "ext2", dispose: () => { order.push("ext2") } },
        { name: "ext3", dispose: () => { order.push("ext3") } },
      ],
    })

    await scope.dispose()

    expect(order).toEqual(["ext1", "ext2", "ext3"])
  })
})

describe("Invariant: Controller identity", () => {
  it("INV-3: scope.controller() returns same instance for same atom across calls", async () => {
    const scope = createScope()
    const myAtom = atom({ factory: () => 42 })

    const ctrl1 = scope.controller(myAtom)
    const ctrl2 = scope.controller(myAtom)

    expect(ctrl1).toBe(ctrl2)

    await scope.dispose()
  })

  it("INV-3b: controller from dep resolution is same as scope.controller()", async () => {
    let depCtrl: unknown

    const depAtom = atom({ factory: () => "dep" })
    const mainAtom = atom({
      deps: { dep: controller(depAtom, { resolve: true }) },
      factory: (_ctx, { dep }) => {
        depCtrl = dep
        return dep.get()
      },
    })

    const scope = createScope()
    await scope.resolve(mainAtom)

    expect(depCtrl).toBe(scope.controller(depAtom))

    await scope.dispose()
  })

  it("INV-3c: controller identity is lost after release (new instance on re-resolve)", async () => {
    const scope = createScope()
    const myAtom = atom({ factory: () => 42 })

    await scope.resolve(myAtom)
    const ctrl1 = scope.controller(myAtom)

    await scope.release(myAtom)

    const ctrl2 = scope.controller(myAtom)

    expect(ctrl1).not.toBe(ctrl2)

    await scope.dispose()
  })
})

describe("Invariant: State machine monotonicity", () => {
  it("INV-4: state transitions follow idle->resolving->resolved|failed", async () => {
    const scope = createScope()
    const states: string[] = []

    const myAtom = atom({
      factory: async () => {
        await new Promise(r => setTimeout(r, 10))
        return 42
      },
    })

    const ctrl = scope.controller(myAtom)
    states.push(ctrl.state)

    ctrl.on("*", () => states.push(ctrl.state))

    await ctrl.resolve()

    expect(states).toEqual(["idle", "resolving", "resolved"])

    await scope.dispose()
  })

  it("INV-4b: failed state can transition to resolving on invalidation (recovery)", async () => {
    const scope = createScope()
    let shouldFail = true
    const states: string[] = []

    const myAtom = atom({
      factory: () => {
        if (shouldFail) throw new Error("fail")
        return "ok"
      },
    })

    const ctrl = scope.controller(myAtom)
    ctrl.on("*", () => states.push(ctrl.state))

    await expect(ctrl.resolve()).rejects.toThrow("fail")
    expect(ctrl.state).toBe("failed")

    shouldFail = false
    ctrl.invalidate()
    await scope.flush()

    expect(ctrl.state).toBe("resolved")
    expect(states).toContain("resolving")

    await scope.dispose()
  })
})

describe("Invariant: Concurrent resolution deduplication", () => {
  it("INV-5: parallel resolve() calls for same atom execute factory exactly once", async () => {
    let factoryCount = 0

    const scope = createScope()
    const myAtom = atom({
      factory: async () => {
        factoryCount++
        await new Promise(r => setTimeout(r, 20))
        return factoryCount
      },
    })

    const [a, b, c] = await Promise.all([
      scope.resolve(myAtom),
      scope.resolve(myAtom),
      scope.resolve(myAtom),
    ])

    expect(factoryCount).toBe(1)
    expect(a).toBe(1)
    expect(b).toBe(1)
    expect(c).toBe(1)

    await scope.dispose()
  })

  it("INV-5b: parallel resolution of a diamond dependency graph resolves shared dep once", async () => {
    let sharedCount = 0

    const sharedAtom = atom({
      factory: async () => {
        sharedCount++
        await new Promise(r => setTimeout(r, 20))
        return "shared"
      },
    })

    const leftAtom = atom({
      deps: { shared: sharedAtom },
      factory: (_ctx, { shared }) => `left-${shared}`,
    })

    const rightAtom = atom({
      deps: { shared: sharedAtom },
      factory: (_ctx, { shared }) => `right-${shared}`,
    })

    const scope = createScope()
    const [left, right] = await Promise.all([
      scope.resolve(leftAtom),
      scope.resolve(rightAtom),
    ])

    expect(sharedCount).toBe(1)
    expect(left).toBe("left-shared")
    expect(right).toBe("right-shared")

    await scope.dispose()
  })
})

describe("Invariant: Invalidation queue deduplication", () => {
  it("INV-6: multiple synchronous invalidate() calls produce exactly one re-resolution", async () => {
    let factoryCount = 0

    const myAtom = atom({ factory: () => ++factoryCount })

    const scope = createScope()
    await scope.resolve(myAtom)
    expect(factoryCount).toBe(1)

    const ctrl = scope.controller(myAtom)
    ctrl.invalidate()
    ctrl.invalidate()
    ctrl.invalidate()
    ctrl.invalidate()
    ctrl.invalidate()

    await scope.flush()
    expect(factoryCount).toBe(2)

    await scope.dispose()
  })
})

describe("Invariant: Disposed scope rejects all operations", () => {
  it("INV-7: resolve() throws after dispose", async () => {
    const scope = createScope()
    await scope.dispose()

    const myAtom = atom({ factory: () => 42 })
    await expect(scope.resolve(myAtom)).rejects.toThrow("disposed")
  })

  it("INV-7b: controller() throws after dispose", async () => {
    const scope = createScope()
    await scope.dispose()

    const myAtom = atom({ factory: () => 42 })
    expect(() => scope.controller(myAtom)).toThrow("disposed")
  })

  it("INV-7c: createContext() throws after dispose", async () => {
    const scope = createScope()
    await scope.dispose()

    expect(() => scope.createContext()).toThrow("disposed")
  })
})

describe("Invariant: Cleanup error isolation", () => {
  it("INV-8: a throwing cleanup does not prevent subsequent cleanups from running", async () => {
    const order: string[] = []

    const myAtom = atom({
      factory: (ctx) => {
        ctx.cleanup(() => { order.push("first") })
        ctx.cleanup(() => { throw new Error("cleanup boom") })
        ctx.cleanup(() => { order.push("third") })
        return "value"
      },
    })

    const scope = createScope()
    await scope.resolve(myAtom)
    await scope.release(myAtom)

    expect(order).toEqual(["third", "first"])
  })

  it("INV-8b: a throwing cleanup during invalidation does not block re-resolution", async () => {
    let resolveCount = 0

    const myAtom = atom({
      factory: (ctx) => {
        resolveCount++
        ctx.cleanup(() => { throw new Error("cleanup fail") })
        return resolveCount
      },
    })

    const scope = createScope()
    await scope.resolve(myAtom)
    expect(resolveCount).toBe(1)

    scope.controller(myAtom).invalidate()
    await scope.flush()

    expect(resolveCount).toBe(2)
    expect(scope.controller(myAtom).get()).toBe(2)

    await scope.dispose()
  })
})

describe("Invariant: set() bypasses factory and cleanups", () => {
  it("INV-9: set() does not run factory", async () => {
    let factoryCount = 0

    const myAtom = atom({
      factory: () => {
        factoryCount++
        return "factory-value"
      },
    })

    const scope = createScope()
    await scope.resolve(myAtom)
    expect(factoryCount).toBe(1)

    scope.controller(myAtom).set("direct-value")
    await scope.flush()

    expect(factoryCount).toBe(1)
    expect(scope.controller(myAtom).get()).toBe("direct-value")

    await scope.dispose()
  })

  it("INV-9b: set() does not run cleanups (preserves cleanup chain for next invalidation)", async () => {
    const cleanupOrder: string[] = []

    const myAtom = atom({
      factory: (ctx) => {
        ctx.cleanup(() => { cleanupOrder.push("cleanup") })
        return "initial"
      },
    })

    const scope = createScope()
    await scope.resolve(myAtom)

    scope.controller(myAtom).set("replaced")
    await scope.flush()
    expect(cleanupOrder).toEqual([])

    scope.controller(myAtom).invalidate()
    await scope.flush()

    expect(cleanupOrder).toEqual(["cleanup"])

    await scope.dispose()
  })

  it("INV-9c: last set() wins when multiple set() called synchronously", async () => {
    const myAtom = atom({ factory: () => "initial" })

    const scope = createScope()
    await scope.resolve(myAtom)

    const ctrl = scope.controller(myAtom)
    ctrl.set("first")
    ctrl.set("second")
    ctrl.set("third")

    await scope.flush()
    expect(ctrl.get()).toBe("third")

    await scope.dispose()
  })
})

describe("Invariant: update() applies transform atomically", () => {
  it("INV-10: update() reads the previous value and transforms it", async () => {
    const myAtom = atom({ factory: () => 0 })

    const scope = createScope()
    await scope.resolve(myAtom)

    scope.controller(myAtom).update(n => n + 10)
    await scope.flush()
    expect(scope.controller(myAtom).get()).toBe(10)

    scope.controller(myAtom).update(n => n * 3)
    await scope.flush()
    expect(scope.controller(myAtom).get()).toBe(30)

    await scope.dispose()
  })

  it("INV-10b: last update() wins when multiple update() called synchronously", async () => {
    const myAtom = atom({ factory: () => 10 })

    const scope = createScope()
    await scope.resolve(myAtom)

    const ctrl = scope.controller(myAtom)
    ctrl.update(n => n + 1)
    ctrl.update(n => n * 100)

    await scope.flush()

    expect(ctrl.get()).toBe(1000)

    await scope.dispose()
  })
})

describe("Invariant: Circular dependency detection", () => {
  it("INV-11: direct circular dependency throws synchronously within resolve", async () => {
    const scope = createScope()

    const atomA: Lite.Atom<string> = atom({
      deps: { b: undefined as unknown as Lite.Atom<string> },
      factory: (_, { b }) => `a:${b}`,
    })

    const atomB = atom({
      deps: { a: atomA },
      factory: (_, { a }) => `b:${a}`,
    })

    Object.assign(atomA.deps!, { b: atomB })

    await expect(scope.resolve(atomA)).rejects.toThrow("Circular")
  })
})

describe("Invariant: Infinite invalidation loop detection", () => {
  it("INV-12: mutually invalidating atoms are caught and throw", async () => {
    function factoryA() { return "a" }
    function factoryB() { return "b" }

    const atomA = atom({ factory: factoryA })
    const atomB = atom({ factory: factoryB })

    const scope = createScope()
    await scope.resolve(atomA)
    await scope.resolve(atomB)

    scope.controller(atomA).on("resolved", () => scope.controller(atomB).invalidate())
    scope.controller(atomB).on("resolved", () => scope.controller(atomA).invalidate())

    scope.controller(atomA).invalidate()

    await expect(scope.flush()).rejects.toThrow(/Infinite invalidation loop/)
  })
})

describe("Invariant: Watch cleans up on re-resolve", () => {
  it("INV-13: watch listener is cleaned and re-registered on each resolve cycle (no accumulation)", async () => {
    let derivedFactoryCount = 0

    const sourceAtom = atom({ factory: () => 1 })
    const derivedAtom = atom({
      deps: { src: controller(sourceAtom, { resolve: true, watch: true }) },
      factory: (_ctx, { src }) => {
        derivedFactoryCount++
        return src.get()
      },
    })

    const scope = createScope()
    await scope.resolve(derivedAtom)
    expect(derivedFactoryCount).toBe(1)

    scope.controller(sourceAtom).set(2)
    await scope.flush()
    expect(derivedFactoryCount).toBe(2)

    scope.controller(sourceAtom).set(3)
    await scope.flush()
    expect(derivedFactoryCount).toBe(3)

    scope.controller(sourceAtom).set(4)
    await scope.flush()
    expect(derivedFactoryCount).toBe(4)

    scope.controller(sourceAtom).set(5)
    await scope.flush()
    expect(derivedFactoryCount).toBe(5)

    await scope.dispose()
  })
})

describe("Invariant: Listener notification uses copy-on-iterate", () => {
  it("INV-14: unsubscribing inside a listener callback does not skip other listeners", async () => {
    const scope = createScope()
    const myAtom = atom({ factory: () => "value" })
    await scope.resolve(myAtom)

    const ctrl = scope.controller(myAtom)
    const called: string[] = []

    let unsub1: () => void
    unsub1 = ctrl.on("resolved", () => {
      called.push("listener-1")
      unsub1()
    })

    ctrl.on("resolved", () => {
      called.push("listener-2")
    })

    ctrl.on("resolved", () => {
      called.push("listener-3")
    })

    ctrl.invalidate()
    await scope.flush()

    expect(called).toEqual(["listener-1", "listener-2", "listener-3"])

    await scope.dispose()
  })

  it("INV-14b: adding a listener inside a listener callback does not fire it in the same cycle", async () => {
    const scope = createScope()
    const myAtom = atom({ factory: () => "value" })
    await scope.resolve(myAtom)

    const ctrl = scope.controller(myAtom)
    const called: string[] = []

    ctrl.on("resolved", () => {
      called.push("original")
      ctrl.on("resolved", () => {
        called.push("added-dynamically")
      })
    })

    ctrl.invalidate()
    await scope.flush()

    expect(called).toEqual(["original"])

    ctrl.invalidate()
    await scope.flush()

    expect(called).toEqual(["original", "original", "added-dynamically"])

    await scope.dispose()
  })
})

describe("Invariant: Stale value accessible during resolving", () => {
  it("INV-15: controller.get() returns previous value while state is resolving", async () => {
    const scope = createScope()
    let resolveCount = 0

    const myAtom = atom({
      factory: async () => {
        resolveCount++
        await new Promise(r => setTimeout(r, 30))
        return `v${resolveCount}`
      },
    })

    const ctrl = scope.controller(myAtom)
    await ctrl.resolve()
    expect(ctrl.get()).toBe("v1")

    ctrl.invalidate()

    await new Promise(r => setTimeout(r, 5))
    expect(ctrl.state).toBe("resolving")
    expect(ctrl.get()).toBe("v1")

    await scope.flush()
    expect(ctrl.get()).toBe("v2")

    await scope.dispose()
  })
})

describe("Invariant: Pending invalidation during resolving", () => {
  it("INV-16: invalidation during resolving state is deferred until resolution completes", async () => {
    const scope = createScope()
    let resolveCount = 0
    const events: string[] = []

    const myAtom = atom({
      factory: async () => {
        resolveCount++
        events.push(`factory-start-${resolveCount}`)
        await new Promise(r => setTimeout(r, 30))
        events.push(`factory-end-${resolveCount}`)
        return resolveCount
      },
    })

    const ctrl = scope.controller(myAtom)
    const firstResolve = ctrl.resolve()

    await new Promise(r => setTimeout(r, 5))
    expect(ctrl.state).toBe("resolving")

    ctrl.invalidate()
    events.push("invalidate-called")

    const firstResult = await firstResolve
    expect(firstResult).toBe(1)

    await scope.flush()
    expect(resolveCount).toBe(2)

    expect(events.indexOf("invalidate-called")).toBeLessThan(events.indexOf("factory-end-1"))

    await scope.dispose()
  })
})

describe("Invariant: Scope isolates atom caches", () => {
  it("INV-17: two scopes resolve the same atom definition independently", async () => {
    let factoryCount = 0

    const myAtom = atom({
      factory: () => {
        factoryCount++
        return factoryCount
      },
    })

    const scope1 = createScope()
    const scope2 = createScope()

    const val1 = await scope1.resolve(myAtom)
    const val2 = await scope2.resolve(myAtom)

    expect(val1).toBe(1)
    expect(val2).toBe(2)
    expect(factoryCount).toBe(2)

    scope1.controller(myAtom).set(100)
    await scope1.flush()

    expect(scope1.controller(myAtom).get()).toBe(100)
    expect(scope2.controller(myAtom).get()).toBe(2)

    await scope1.dispose()
    await scope2.dispose()
  })
})

describe("Invariant: ExecutionContext close is idempotent", () => {
  it("INV-18: calling close() multiple times runs cleanup only once", async () => {
    const scope = createScope()
    const ctx = scope.createContext()
    let closeCount = 0

    ctx.onClose(() => { closeCount++ })

    await ctx.close()
    await ctx.close()
    await ctx.close()

    expect(closeCount).toBe(1)
  })
})

describe("Invariant: ExecutionContext cleanup LIFO with result", () => {
  it("INV-19: onClose handlers receive the close result and run in LIFO order", async () => {
    const scope = createScope()
    const ctx = scope.createContext()
    const results: Array<{ idx: number; ok: boolean }> = []

    ctx.onClose((result) => { results.push({ idx: 1, ok: result.ok }) })
    ctx.onClose((result) => { results.push({ idx: 2, ok: result.ok }) })
    ctx.onClose((result) => { results.push({ idx: 3, ok: result.ok }) })

    await ctx.close({ ok: false, error: new Error("test") })

    expect(results).toEqual([
      { idx: 3, ok: false },
      { idx: 2, ok: false },
      { idx: 1, ok: false },
    ])
  })
})

describe("Invariant: Dependents tracking correctness", () => {
  it("INV-20: release removes atom from dependency's dependents set", async () => {
    const scope = createScope() as any

    const depAtom = atom({ factory: () => "dep" })
    const mainAtom = atom({
      deps: { dep: depAtom },
      factory: (_ctx, { dep }) => `main-${dep}`,
    })

    await scope.resolve(mainAtom)

    const depEntry = scope.getEntry(depAtom)
    expect(depEntry.dependents.has(mainAtom)).toBe(true)

    await scope.release(mainAtom)

    const depEntryAfter = scope.getEntry(depAtom)
    expect(depEntryAfter.dependents.has(mainAtom)).toBe(false)

    await scope.dispose()
  })
})

describe("Invariant: Preset value takes priority over factory", () => {
  it("INV-21: atom with preset never runs its factory", async () => {
    let factoryRan = false

    const myAtom = atom({
      factory: () => {
        factoryRan = true
        return "factory-value"
      },
    })

    const scope = createScope({
      presets: [preset(myAtom, "preset-value")],
    })

    const result = await scope.resolve(myAtom)
    expect(result).toBe("preset-value")
    expect(factoryRan).toBe(false)

    await scope.dispose()
  })
})

describe("Invariant: Error in factory puts atom in failed state without corrupting scope", () => {
  it("INV-22: failed atom does not prevent other atoms from resolving", async () => {
    const failAtom = atom({
      factory: () => { throw new Error("boom") },
    })

    const okAtom = atom({ factory: () => "ok" })

    const scope = createScope()

    await expect(scope.resolve(failAtom)).rejects.toThrow("boom")

    const okValue = await scope.resolve(okAtom)
    expect(okValue).toBe("ok")

    await scope.dispose()
  })

  it("INV-22b: failed atom can be retried via invalidation", async () => {
    let attempt = 0

    const myAtom = atom({
      factory: () => {
        attempt++
        if (attempt === 1) throw new Error("first attempt fails")
        return `success-${attempt}`
      },
    })

    const scope = createScope()
    await expect(scope.resolve(myAtom)).rejects.toThrow("first attempt fails")

    const ctrl = scope.controller(myAtom)
    expect(ctrl.state).toBe("failed")

    ctrl.invalidate()
    await scope.flush()

    expect(ctrl.state).toBe("resolved")
    expect(ctrl.get()).toBe("success-2")

    await scope.dispose()
  })
})

describe("Invariant: Extension init completes before any resolution", () => {
  it("INV-23: slow extension init blocks resolve until ready", async () => {
    const order: string[] = []

    const slowExt: Lite.Extension = {
      name: "slow",
      init: async () => {
        await new Promise(r => setTimeout(r, 50))
        order.push("init-done")
      },
    }

    const scope = createScope({ extensions: [slowExt] })

    const myAtom = atom({
      factory: () => {
        order.push("factory")
        return 42
      },
    })

    await scope.resolve(myAtom)
    expect(order).toEqual(["init-done", "factory"])

    await scope.dispose()
  })
})

describe("Invariant: flush() drains the full invalidation chain", () => {
  it("INV-24: flush resolves only after all cascading invalidations complete", async () => {
    const events: string[] = []

    const a = atom({ factory: () => { events.push("A"); return 1 } })
    const b = atom({
      deps: { aCtrl: controller(a) },
      factory: (ctx, { aCtrl }) => {
        aCtrl.on("resolved", () => ctx.invalidate())
        events.push("B")
        return 2
      },
    })
    const c = atom({
      deps: { bCtrl: controller(b) },
      factory: (ctx, { bCtrl }) => {
        bCtrl.on("resolved", () => ctx.invalidate())
        events.push("C")
        return 3
      },
    })

    const scope = createScope()
    await scope.resolve(a)
    await scope.resolve(b)
    await scope.resolve(c)

    events.length = 0

    scope.controller(a).invalidate()
    await scope.flush()

    expect(events).toEqual(["A", "B", "C"])

    await scope.dispose()
  })
})

describe("Invariant: set() during resolving is deferred and applied after", () => {
  it("INV-25: set() called while atom is resolving applies value after factory completes", async () => {
    let resolveFactory: () => void

    const myAtom = atom({
      factory: () =>
        new Promise<string>((r) => {
          resolveFactory = () => r("factory-result")
        }),
    })

    const scope = createScope()
    const ctrl = scope.controller(myAtom)

    const resolvePromise = ctrl.resolve()
    await new Promise(r => queueMicrotask(r))

    ctrl.set("set-during-resolving")

    resolveFactory!()
    await resolvePromise

    await scope.flush()

    expect(ctrl.get()).toBe("set-during-resolving")

    await scope.dispose()
  })
})

describe("Invariant: Scope.on() listeners are cleaned up on release", () => {
  it("INV-26: scope.on() listeners for a released atom are removed", async () => {
    const scope = createScope()
    let callCount = 0

    const myAtom = atom({ factory: () => ++callCount })

    scope.on("resolved", myAtom, () => { callCount += 100 })

    await scope.resolve(myAtom)
    expect(callCount).toBe(101)

    await scope.release(myAtom)

    await scope.resolve(myAtom)
    expect(callCount).toBe(102)

    await scope.dispose()
  })
})

describe("Invariant: Watch + eq composes correctly with set()", () => {
  it("INV-27: watch with custom eq correctly gates invalidation even through set()", async () => {
    let derivedCount = 0

    const sourceAtom = atom({ factory: () => ({ id: 1, name: "alice" }) })
    const derivedAtom = atom({
      deps: {
        src: controller(sourceAtom, {
          resolve: true,
          watch: true,
          eq: (a: { id: number }, b: { id: number }) => a.id === b.id,
        }),
      },
      factory: (_ctx, { src }) => {
        derivedCount++
        return `user:${src.get().name}`
      },
    })

    const scope = createScope()
    await scope.resolve(derivedAtom)
    expect(derivedCount).toBe(1)

    scope.controller(sourceAtom).set({ id: 1, name: "bob" })
    await scope.flush()
    expect(derivedCount).toBe(1)

    scope.controller(sourceAtom).set({ id: 2, name: "carol" })
    await scope.flush()
    expect(derivedCount).toBe(2)
    expect(scope.controller(derivedAtom).get()).toBe("user:carol")

    await scope.dispose()
  })
})

describe("Invariant: Dispose waits for in-flight invalidation chain", () => {
  it("INV-28: dispose() waits for chainPromise before tearing down", async () => {
    const events: string[] = []

    const myAtom = atom({
      factory: async () => {
        events.push("factory-start")
        await new Promise(r => setTimeout(r, 30))
        events.push("factory-end")
        return "value"
      },
    })

    const scope = createScope()
    await scope.resolve(myAtom)
    events.length = 0

    scope.controller(myAtom).invalidate()

    await scope.dispose()

    expect(events).toContain("factory-start")
  })
})

describe("Invariant: Tags compose through scope and context hierarchy", () => {
  it("INV-29: context tags override scope tags for the same tag", async () => {
    const envTag = tag<string>({ label: "env" })

    const scope = createScope({ tags: [envTag("production")] })

    const myFlow = flow({
      deps: { env: tags.required(envTag) },
      factory: (_ctx, { env }) => env,
    })

    const ctx = scope.createContext({ tags: [envTag("test")] })
    const result = await ctx.exec({ flow: myFlow })

    expect(result).toBe("test")

    await ctx.close()
    await scope.dispose()
  })

  it("INV-29b: exec tags override context tags for the same tag", async () => {
    const envTag = tag<string>({ label: "env" })

    const scope = createScope()

    const myFlow = flow({
      deps: { env: tags.required(envTag) },
      factory: (_ctx, { env }) => env,
    })

    const ctx = scope.createContext({ tags: [envTag("context-level")] })
    const result = await ctx.exec({
      flow: myFlow,
      tags: [envTag("exec-level")],
    })

    expect(result).toBe("exec-level")

    await ctx.close()
    await scope.dispose()
  })
})

describe("Invariant: Select equality gating", () => {
  it("INV-30: select only notifies when selector output changes per eq function", async () => {
    let factoryCount = 0

    const dataAtom = atom({
      factory: () => {
        factoryCount++
        return { id: 1, timestamp: factoryCount }
      },
    })

    const scope = createScope()
    await scope.resolve(dataAtom)

    const handle = scope.select(
      dataAtom,
      (data) => data.id,
    )

    let notifyCount = 0
    handle.subscribe(() => notifyCount++)

    scope.controller(dataAtom).invalidate()
    await scope.flush()

    expect(notifyCount).toBe(0)
    expect(handle.get()).toBe(1)

    await scope.dispose()
  })
})

describe("Invariant: Closed ExecutionContext rejects exec", () => {
  it("INV-31: exec() on a closed context throws", async () => {
    const scope = createScope()
    const ctx = scope.createContext()

    await ctx.close()

    const myFlow = flow({ factory: () => 42 })
    await expect(ctx.exec({ flow: myFlow })).rejects.toThrow("closed")

    await scope.dispose()
  })
})

describe("Invariant: onClose error isolation in ExecutionContext", () => {
  it("INV-32: a throwing onClose handler does not prevent other handlers from running", async () => {
    const scope = createScope()
    const ctx = scope.createContext()
    const called: number[] = []

    ctx.onClose(() => { called.push(1) })
    ctx.onClose(() => { throw new Error("onClose boom") })
    ctx.onClose(() => { called.push(3) })

    await ctx.close()

    expect(called).toEqual([3, 1])

    await scope.dispose()
  })
})
