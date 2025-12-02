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

    await new Promise(r => setTimeout(r, 50))

    expect(events).toEqual(["A", "B", "C"])
  })

  it("throws on infinite loop", async () => {
    const atomA = atom({
      factory: () => "a",
    })
    const atomB = atom({
      factory: () => "b",
    })

    const scope = createScope()

    const ctrlA = scope.controller(atomA)
    const ctrlB = scope.controller(atomB)

    await scope.resolve(atomA)
    await scope.resolve(atomB)

    ctrlA.on("resolved", () => ctrlB.invalidate())
    ctrlB.on("resolved", () => ctrlA.invalidate())

    let loopError: Error | null = null

    const unhandledRejectionHandler = (event: PromiseRejectionEvent) => {
      if (event.reason?.message?.includes("loop")) {
        loopError = event.reason
        event.preventDefault()
      }
    }

    if (typeof window !== "undefined") {
      window.addEventListener("unhandledrejection", unhandledRejectionHandler)
    }

    const originalHandler = process.listeners("unhandledRejection")[0] as ((reason: unknown) => void) | undefined
    process.removeAllListeners("unhandledRejection")
    process.on("unhandledRejection", (reason) => {
      if ((reason as Error)?.message?.includes("loop")) {
        loopError = reason as Error
      }
    })

    try {
      ctrlA.invalidate()
      await new Promise(r => setTimeout(r, 100))
    } finally {
      process.removeAllListeners("unhandledRejection")
      if (originalHandler) {
        process.on("unhandledRejection", originalHandler)
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("unhandledrejection", unhandledRejectionHandler)
      }
    }

    expect(loopError).not.toBeNull()
    expect(loopError?.message).toMatch(/loop/i)
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

    await new Promise((r) => setTimeout(r, 50))

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
