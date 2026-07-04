import { describe, expect, expectTypeOf, it } from "vitest"
import { atom, createScope, preset } from "../src/index"
import type { Lite } from "../src/index"

type Pending<T> = {
  resolve(result: IteratorResult<T, undefined>): void
  reject(error: unknown): void
}

it("types resolveStream and drain", async () => {
  const scope = createScope()
  const feed = atom({
    factory: async function* () {
      yield 1
    },
  })
  expectTypeOf(scope.resolveStream(feed)).toEqualTypeOf<AsyncIterable<number>>()
  expectTypeOf(scope.drain(feed, { take: 0 })).toEqualTypeOf<Promise<number[]>>()
  expectTypeOf<Lite.Atom<number>>().not.toExtend<Parameters<Lite.Scope["resolveStream"]>[0]>()
  await scope.dispose()
})

function createQueue<T>() {
  const values: T[] = []
  let pending: Pending<T> | undefined
  let error: unknown
  let failed = false
  let closed = false
  let returned = 0
  const done: IteratorReturnResult<undefined> = { done: true, value: undefined }
  const iterator: AsyncIterator<T, undefined> = {
    next() {
      if (values.length > 0) return Promise.resolve({ done: false, value: values.shift()! })
      if (failed) return Promise.reject(error)
      if (closed) return Promise.resolve(done)
      return new Promise((resolve, reject) => {
        pending = { resolve, reject }
      })
    },
    return() {
      returned++
      closed = true
      const current = pending
      pending = undefined
      current?.resolve(done)
      return Promise.resolve(done)
    },
  }
  const iterable: AsyncIterable<T> = {
    [Symbol.asyncIterator]() {
      return iterator
    },
  }
  return {
    iterable,
    push(value: T) {
      if (closed || failed) return
      if (!pending) {
        values.push(value)
        return
      }
      pending.resolve({ done: false, value })
      pending = undefined
    },
    fail(errorValue: unknown) {
      failed = true
      error = errorValue
      const current = pending
      pending = undefined
      current?.reject(errorValue)
    },
    close() {
      closed = true
      const current = pending
      pending = undefined
      current?.resolve(done)
    },
    returns() {
      return returned
    },
  }
}

async function tick(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

describe("scope.resolveStream()", () => {
  it("fans out two consumers without element theft", async () => {
    const queue = createQueue<number>()
    const source = atom({ factory: () => queue.iterable })
    const scope = createScope()
    await scope.resolve(source)

    const left = scope.resolveStream(source)[Symbol.asyncIterator]()
    const right = scope.resolveStream(source)[Symbol.asyncIterator]()
    const leftFirst = left.next()
    const rightFirst = right.next()

    queue.push(1)

    expect(await leftFirst).toEqual({ done: false, value: 1 })
    expect(await rightFirst).toEqual({ done: false, value: 1 })

    const leftSecond = left.next()
    const rightSecond = right.next()

    queue.push(2)

    expect(await leftSecond).toEqual({ done: false, value: 2 })
    expect(await rightSecond).toEqual({ done: false, value: 2 })
    await scope.dispose()
  })

  it("drops to the latest value for a view that does not consume", async () => {
    const queue = createQueue<number>()
    const source = atom({ factory: () => queue.iterable })
    const scope = createScope()
    await scope.resolve(source)

    const idle = scope.resolveStream(source)[Symbol.asyncIterator]()
    const active = scope.resolveStream(source)[Symbol.asyncIterator]()

    let pending = active.next()
    queue.push(1)
    expect(await pending).toEqual({ done: false, value: 1 })

    pending = active.next()
    queue.push(2)
    expect(await pending).toEqual({ done: false, value: 2 })

    pending = active.next()
    queue.push(3)
    expect(await pending).toEqual({ done: false, value: 3 })
    expect(await idle.next()).toEqual({ done: false, value: 3 })
    await scope.dispose()
  })

  it("keeps the producer and sibling views alive when one view is abandoned", async () => {
    const queue = createQueue<number>()
    const source = atom({ factory: () => queue.iterable })
    const scope = createScope()
    await scope.resolve(source)

    const abandoned = scope.resolveStream(source)[Symbol.asyncIterator]()
    const sibling = scope.resolveStream(source)[Symbol.asyncIterator]()

    await abandoned.return?.()
    expect(queue.returns()).toBe(0)

    const pending = sibling.next()
    queue.push(1)

    expect(await pending).toEqual({ done: false, value: 1 })
    expect(queue.returns()).toBe(0)
    await scope.dispose()
  })

  it("closes only the context-owned view when ctx.resolveStream context closes", async () => {
    const queue = createQueue<number>()
    const source = atom({ factory: () => queue.iterable })
    const scope = createScope()
    await scope.resolve(source)

    const ctx = scope.createContext()
    const contextIterator = ctx.resolveStream(source)[Symbol.asyncIterator]()
    const scopeIterator = scope.resolveStream(source)[Symbol.asyncIterator]()
    const closed = contextIterator.next()

    await ctx.close()

    expect(await closed).toEqual({ done: true, value: undefined })

    const pending = scopeIterator.next()
    queue.push(1)

    expect(await pending).toEqual({ done: false, value: 1 })
    await scope.dispose()
  })

  it("returns the driven iterator and runs cleanup when the scope disposes", async () => {
    const queue = createQueue<number>()
    let cleanups = 0
    const source = atom({
      factory: (ctx) => {
        ctx.cleanup(() => {
          cleanups++
        })
        return queue.iterable
      },
    })
    const scope = createScope()
    await scope.resolve(source)

    const iterator = scope.resolveStream(source)[Symbol.asyncIterator]()
    const pending = iterator.next()
    queue.push(1)

    expect(await pending).toEqual({ done: false, value: 1 })
    await scope.dispose()

    expect(queue.returns()).toBe(1)
    expect(cleanups).toBe(1)
  })

  it("disposes and closes stream views when producer return rejects", async () => {
    const error = new Error("return failed")
    let returned = false
    const source = atom({
      factory: async function* () {
        try {
          yield 1
        } finally {
          returned = true
          throw error
        }
      },
    })
    const scope = createScope()
    await scope.resolve(source)

    const iterator = scope.resolveStream(source)[Symbol.asyncIterator]()

    await expect(scope.dispose()).resolves.toBeUndefined()

    expect(returned).toBe(true)
    expect(await iterator.next()).toEqual({ done: true, value: undefined })
  })

  it("re-drives a newly resolved iterable into the same views after invalidation", async () => {
    const first = createQueue<number>()
    const second = createQueue<number>()
    let current = first
    const source = atom({ factory: () => current.iterable })
    const scope = createScope()
    await scope.resolve(source)

    const iterator = scope.resolveStream(source)[Symbol.asyncIterator]()
    let pending = iterator.next()
    first.push(1)

    expect(await pending).toEqual({ done: false, value: 1 })

    current = second
    scope.controller(source).invalidate()
    await scope.flush()

    expect(first.returns()).toBe(1)

    pending = iterator.next()
    second.push(2)

    expect(await pending).toEqual({ done: false, value: 2 })
    await scope.dispose()
  })

  it("keeps redriven views alive when a stale iterator return rejects", async () => {
    let rejectReturn!: (error: unknown) => void
    const second = createQueue<number>()
    const first: AsyncIterable<number> = {
      [Symbol.asyncIterator]() {
        return {
          next: () => new Promise<IteratorResult<number, undefined>>(() => {}),
          return: () => new Promise<IteratorResult<number, undefined>>((_, reject) => {
            rejectReturn = reject
          }),
        }
      },
    }
    const source = atom({ factory: () => first })
    const scope = createScope()
    await scope.resolve(source)

    const iterator = scope.resolveStream(source)[Symbol.asyncIterator]()
    let pending = iterator.next()

    scope.controller(source).set(second.iterable)
    second.push(2)

    expect(await pending).toEqual({ done: false, value: 2 })

    pending = iterator.next()
    rejectReturn(new Error("return failed"))
    await tick()
    second.push(3)

    expect(await pending).toEqual({ done: false, value: 3 })
    await scope.dispose()
  })

  it("drains a fresh stream view up to take", async () => {
    const queue = createQueue<number>()
    const source = atom({ factory: () => queue.iterable })
    const scope = createScope()
    await scope.resolve(source)

    const drained = scope.drain(source, { take: 2 })

    await tick()
    queue.push(1)
    await tick()
    queue.push(2)

    expect(await drained).toEqual([1, 2])
    expect(queue.returns()).toBe(0)
    await scope.dispose()
  })

  it("returns an empty drain without starting a producer when take is zero", async () => {
    let starts = 0
    const source = atom({
      factory: () => {
        starts++
        return createQueue<number>().iterable
      },
    })
    const scope = createScope()

    expect(await scope.drain(source, { take: 0 })).toEqual([])
    expect(starts).toBe(0)
    await scope.dispose()
  })

  it("drains until producer completion without take", async () => {
    const queue = createQueue<number>()
    const source = atom({ factory: () => queue.iterable })
    const scope = createScope()
    await scope.resolve(source)

    const drained = scope.drain(source)

    await tick()
    queue.push(1)
    await tick()
    queue.push(2)
    await tick()
    queue.close()

    expect(await drained).toEqual([1, 2])
    await scope.dispose()
  })

  it("observes preset atom substitutions through resolveStream and drain", async () => {
    const real = createQueue<number>()
    const fake = createQueue<number>()
    const source = atom({ factory: () => real.iterable })
    const replacement = atom({ factory: () => fake.iterable })
    const scope = createScope({
      presets: [preset(source, replacement)],
    })

    const iterator = scope.resolveStream(source)[Symbol.asyncIterator]()
    const drained = scope.drain(source, { take: 2 })
    const first = iterator.next()

    fake.push(10)
    await tick()
    fake.push(11)

    expect(await first).toEqual({ done: false, value: 10 })
    expect(await drained).toEqual([10, 11])
    expect(real.returns()).toBe(0)
    await scope.dispose()
  })

  it("fails all views when the producer errors", async () => {
    const queue = createQueue<number>()
    const source = atom({ factory: () => queue.iterable })
    const scope = createScope()
    await scope.resolve(source)

    const left = scope.resolveStream(source)[Symbol.asyncIterator]()
    const right = scope.resolveStream(source)[Symbol.asyncIterator]()
    const error = new Error("boom")
    const leftNext = left.next()
    const rightNext = right.next()

    queue.fail(error)

    await expect(leftNext).rejects.toBe(error)
    await expect(rightNext).rejects.toBe(error)
    await scope.dispose()
  })

  it("ends all views when the producer completes", async () => {
    const queue = createQueue<number>()
    const source = atom({ factory: () => queue.iterable })
    const scope = createScope()
    await scope.resolve(source)

    const left = scope.resolveStream(source)[Symbol.asyncIterator]()
    const right = scope.resolveStream(source)[Symbol.asyncIterator]()
    const leftNext = left.next()
    const rightNext = right.next()

    queue.close()

    expect(await leftNext).toEqual({ done: true, value: undefined })
    expect(await rightNext).toEqual({ done: true, value: undefined })
    await scope.dispose()
  })
})
