import { describe, expect, it } from "vitest"
import { atom, createScope, preset } from "../src/index"

async function take<T>(iterable: AsyncIterable<T>, count: number): Promise<T[]> {
  const values: T[] = []
  for await (const value of iterable) {
    values.push(value)
    if (values.length === count) break
  }
  return values
}

describe("scope.changes()", () => {
  it("conflates atom values to the latest unconsumed value", async () => {
    const scope = createScope()
    const count = atom({ factory: () => 0 })
    const ctrl = await scope.controller(count, { resolve: true })

    const values: number[] = []
    for await (const value of scope.changes(count)) {
      values.push(value)
      if (values.length === 2) break
      ctrl.set(1)
      ctrl.set(2)
      ctrl.set(3)
    }

    expect(values).toEqual([0, 3])
    await scope.dispose()
  })

  it("settles concurrent atom value reads in order", async () => {
    const scope = createScope()
    const count = atom({ factory: () => 0 })
    await scope.resolve(count)

    const iterator = scope.changes(count)[Symbol.asyncIterator]()
    expect(await iterator.next()).toEqual({ done: false, value: 0 })

    const first = iterator.next()
    const second = iterator.next()
    const ctrl = scope.controller(count)

    ctrl.set(1)
    ctrl.set(2)

    expect(await first).toEqual({ done: false, value: 1 })
    expect(await second).toEqual({ done: false, value: 2 })
    await scope.dispose()
  })

  it("yields the current atom value first when already resolved", async () => {
    const scope = createScope()
    const count = atom({ factory: () => 42 })
    await scope.resolve(count)

    expect(await take(scope.changes(count), 1)).toEqual([42])
    await scope.dispose()
  })

  it("yields the current selected value first", async () => {
    const scope = createScope()
    const user = atom({ factory: () => ({ id: "u1", name: "Ada" }) })
    await scope.resolve(user)

    const name = scope.select(user, (value) => value.name)

    expect(await take(scope.changes(name), 1)).toEqual(["Ada"])
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

    await expect(take(scope.changes(failing), 1)).rejects.toBe(error)
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

    expect(await take(scope.changes(failing, { states: true }), 1)).toEqual([{ state: "failed", error }])
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

    for await (const value of scope.changes(count)) {
      expect(value).toBe(1)
      break
    }

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

    const values: number[] = []
    for await (const value of scope.changes(target)) {
      values.push(value)
      if (values.length === 2) break
      scope.controller(replacement).set(11)
    }

    expect(values).toEqual([10, 11])
    await scope.dispose()
  })
})
