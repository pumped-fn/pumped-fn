import { describe, expect, it } from "vitest"
import { atom, createScope, preset } from "../src/index"

describe("scope.changes()", () => {
  it("conflates atom values to the latest unconsumed value", async () => {
    const scope = createScope()
    const count = atom({ factory: () => 0 })
    await scope.resolve(count)

    const iterator = scope.changes(count)[Symbol.asyncIterator]()
    expect(await iterator.next()).toEqual({ done: false, value: 0 })

    const ctrl = scope.controller(count)
    ctrl.set(1)
    ctrl.set(2)
    ctrl.set(3)

    expect(await iterator.next()).toEqual({ done: false, value: 3 })
    await scope.dispose()
  })

  it("yields the current atom value first when already resolved", async () => {
    const scope = createScope()
    const count = atom({ factory: () => 42 })
    await scope.resolve(count)

    expect(await scope.changes(count)[Symbol.asyncIterator]().next()).toEqual({ done: false, value: 42 })
    await scope.dispose()
  })

  it("yields the current selected value first", async () => {
    const scope = createScope()
    const user = atom({ factory: () => ({ id: "u1", name: "Ada" }) })
    await scope.resolve(user)

    const name = scope.select(user, (value) => value.name)
    const iterator = scope.changes(name)[Symbol.asyncIterator]()

    expect(await iterator.next()).toEqual({ done: false, value: "Ada" })
    await scope.dispose()
  })

  it("rejects the next atom value when resolution fails", async () => {
    const scope = createScope()
    const error = new Error("boom")
    const failing = atom<number>({
      factory: () => {
        throw error
      },
    })

    const iterator = scope.changes(failing)[Symbol.asyncIterator]()

    await expect(iterator.next()).rejects.toBe(error)
    await scope.dispose()
  })

  it("delivers failed states as data and conflates state transitions", async () => {
    const scope = createScope()
    const error = new Error("boom")
    const failing = atom<number>({
      factory: () => {
        throw error
      },
    })

    const iterator = scope.changes(failing, { states: true })[Symbol.asyncIterator]()

    expect(await iterator.next()).toEqual({ done: false, value: { state: "failed", error } })
    await scope.dispose()
  })

  it("ends pending context-bound atom iteration when the context closes", async () => {
    const scope = createScope()
    const count = atom({ factory: () => 1 })
    const ctx = scope.createContext()
    const iterator = ctx.changes(count)[Symbol.asyncIterator]()

    expect(await iterator.next()).toEqual({ done: false, value: 1 })
    const pending = iterator.next()
    await ctx.close()

    expect((await pending).done).toBe(true)
    await scope.dispose()
  })

  it("ends pending atom iteration when the scope disposes", async () => {
    const scope = createScope()
    const count = atom({ factory: () => 1 })
    const iterator = scope.changes(count)[Symbol.asyncIterator]()

    expect(await iterator.next()).toEqual({ done: false, value: 1 })
    const pending = iterator.next()
    await scope.dispose()

    expect((await pending).done).toBe(true)
  })

  it("leaves the atom alive when the consumer abandons iteration", async () => {
    const scope = createScope()
    let cleanups = 0
    const count = atom({
      factory: (ctx) => {
        ctx.cleanup(() => {
          cleanups++
        })
        return 1
      },
    })
    await scope.resolve(count)

    const iterator = scope.changes(count)[Symbol.asyncIterator]()
    expect(await iterator.next()).toEqual({ done: false, value: 1 })
    await iterator.return?.()

    const ctrl = scope.controller(count)
    ctrl.set(2)

    expect(ctrl.get()).toBe(2)
    expect(cleanups).toBe(0)
    await scope.dispose()
  })

  it("observes preset atom substitutions", async () => {
    const target = atom({ factory: () => 1 })
    const replacement = atom({ factory: () => 10 })
    const scope = createScope({
      presets: [preset(target, replacement)],
    })

    const iterator = scope.changes(target)[Symbol.asyncIterator]()
    expect(await iterator.next()).toEqual({ done: false, value: 10 })

    scope.controller(replacement).set(11)

    expect(await iterator.next()).toEqual({ done: false, value: 11 })
    await scope.dispose()
  })
})
