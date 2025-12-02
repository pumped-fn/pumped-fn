import { describe, it, expect } from "vitest"
import { createScope } from "../src/scope"
import { atom, controller } from "../src/atom"

describe("invalidation chain", () => {
  it("executes in exactly 3 frames: trigger, chain, settle", async () => {
    const frames: string[][] = []
    let frameIndex = 0

    const track = (label: string) => {
      frames[frameIndex] ??= []
      frames[frameIndex].push(label)
    }

    const advanceFrame = async () => {
      frameIndex++
      frames[frameIndex] ??= []
      await Promise.resolve()
    }

    const atomA = atom({ factory: () => { track("A"); return "a" } })
    const atomB = atom({
      deps: { a: controller(atomA) },
      factory: (ctx, { a }) => {
        a.on("resolved", () => ctx.invalidate())
        track("B")
        return "b"
      },
    })
    const atomC = atom({
      deps: { b: controller(atomB) },
      factory: (ctx, { b }) => {
        b.on("resolved", () => ctx.invalidate())
        track("C")
        return "c"
      },
    })

    const scope = createScope()
    await scope.resolve(atomC)

    frames.length = 0
    frameIndex = 0
    frames[0] = []

    track("trigger")
    scope.controller(atomA).invalidate()

    await advanceFrame()
    await advanceFrame()

    expect(frames).toEqual([
      ["trigger"],
      ["A", "B", "C"],
      [],
    ])
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

    ctrlA.invalidate()

    await expect(
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Timeout - no loop detected")), 100)
        scope.ready.then(() => {
          queueMicrotask(() => queueMicrotask(() => {}))
        })
      })
    ).rejects.toThrow(/loop/i)
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
})
