import { describe, expect, expectTypeOf, it } from "vitest"
import { createScope, flow, FlowFault, preset, resource, typed } from "../src/index"
import type { Lite } from "../src/index"

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = []
  for await (const value of iterable) values.push(value)
  return values
}

describe("ctx.execStream()", () => {
  it("types generator flow streams", async () => {
    const read = flow({
      parse: typed<{ id: string }>(),
      factory: async function* (ctx) {
        yield ctx.input.id.length
        return { id: ctx.input.id }
      },
    })
    const scope = createScope()
    const ctx = scope.createContext()
    const stream = ctx.execStream({ flow: read, input: { id: "abc" } })
    const execResult = ctx.exec({ flow: read, input: { id: "abc" } })

    expectTypeOf(stream).toEqualTypeOf<Lite.FlowStream<number, { id: string }>>()
    expect(await collect(stream)).toEqual([3])
    expectTypeOf(stream.result).toEqualTypeOf<Promise<{ id: string }>>()
    expectTypeOf(execResult).toEqualTypeOf<Promise<{ id: string }>>()
    await expect(stream.result).resolves.toEqual({ id: "abc" })
    await expect(execResult).resolves.toEqual({ id: "abc" })

    await ctx.close()
    await scope.dispose()
  })

  it("F1 rolls back current resources and marks aborted close on consumer break", async () => {
    const events: string[] = []
    const closes: Lite.CloseResult[] = []
    const tx = resource({
      ownership: "current",
      factory: (ctx) => {
        ctx.onClose((result) => {
          closes.push(result)
          events.push(result.ok ? "commit" : `rollback:${result.aborted === true}`)
        })
        ctx.cleanup(() => {
          events.push("release")
        })
        return "tx"
      },
    })
    const read = flow({
      deps: { tx },
      factory: async function* (_ctx, { tx }) {
        events.push(`use:${tx}`)
        try {
          yield "first"
          yield "second"
          return "done"
        } finally {
          events.push("finally")
        }
      },
    })
    const scope = createScope()
    const ctx = scope.createContext()
    const stream = ctx.execStream({ flow: read })
    const seen: string[] = []

    for await (const value of stream) {
      seen.push(value)
      break
    }

    await expect(stream.result).rejects.toThrow("Flow stream aborted")
    expect(seen).toEqual(["first"])
    expect(events).toEqual(["use:tx", "finally", "rollback:true", "release"])
    expect(closes).toHaveLength(1)
    expect(closes[0]).toMatchObject({ ok: false, aborted: true })
    await ctx.close()
    await scope.dispose()
  })

  it("F2 throws synchronously when result is read before iteration and exec drains to output", async () => {
    const read = flow({
      factory: async function* () {
        yield 1
        yield 2
        return "done"
      },
    })
    const scope = createScope()
    const ctx = scope.createContext()
    const stream = ctx.execStream({ flow: read })

    expect(() => stream.result).toThrow("use exec() to drain")
    expect(await ctx.exec({ flow: read })).toBe("done")
    expect(await collect(stream)).toEqual([1, 2])
    await expect(stream.result).resolves.toBe("done")
    await ctx.close()
    await scope.dispose()
  })

  it("F3 rejects non-generator factories that resolve to async iterables", async () => {
    async function* values() {
      yield 1
    }
    const read = flow({
      factory: async () => values(),
    })
    const scope = createScope()
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: read })).rejects.toThrow("use an async generator flow for yields or an iterable atom")
    await ctx.close()
    await scope.dispose()
  })

  it("F4 rejects a second async iterator for one stream invocation", async () => {
    const read = flow({
      factory: async function* () {
        yield 1
        return "done"
      },
    })
    const scope = createScope()
    const ctx = scope.createContext()
    const stream = ctx.execStream({ flow: read })

    stream[Symbol.asyncIterator]()
    expect(() => stream[Symbol.asyncIterator]()).toThrow("consumed only once")
    await ctx.close()
    await scope.dispose()
  })

  it("F5 pulls directly without advancing past a yield before the consumer asks", async () => {
    const steps: string[] = []
    const read = flow({
      factory: async function* () {
        steps.push("start")
        yield 1
        steps.push("after-first")
        yield 2
        steps.push("after-second")
        return "done"
      },
    })
    const scope = createScope()
    const ctx = scope.createContext()
    const iterator = ctx.execStream({ flow: read })[Symbol.asyncIterator]()

    expect(steps).toEqual([])
    expect(await iterator.next()).toEqual({ done: false, value: 1 })
    await Promise.resolve()
    expect(steps).toEqual(["start"])
    expect(await iterator.next()).toEqual({ done: false, value: 2 })
    await Promise.resolve()
    expect(steps).toEqual(["start", "after-first"])
    expect(await iterator.next()).toEqual({ done: true, value: "done" })
    expect(steps).toEqual(["start", "after-first", "after-second"])
    await ctx.close()
    await scope.dispose()
  })

  it("rejects next and result with FlowFault when a generator fails through ctx.fail", async () => {
    const read = flow({
      name: "faulty-stream",
      faults: typed<{ kind: "boom" }>(),
      factory: async function* (ctx) {
        yield 1
        ctx.fail({ kind: "boom" })
      },
    })
    const scope = createScope()
    const ctx = scope.createContext()
    const stream = ctx.execStream({ flow: read })
    const iterator = stream[Symbol.asyncIterator]()

    expect(await iterator.next()).toEqual({ done: false, value: 1 })
    const result = stream.result
    await expect(iterator.next()).rejects.toBeInstanceOf(FlowFault)
    await expect(result).rejects.toMatchObject({
      fault: { kind: "boom" },
      flow: "faulty-stream",
    })
    await ctx.close()
    await scope.dispose()
  })

  it("F8 substitutes streaming flows through createScope presets", async () => {
    const read = flow({
      parse: typed<{ id: string }>(),
      factory: async function* (ctx) {
        yield `real:${ctx.input.id}`
        return "real"
      },
    })
    const scope = createScope({
      presets: [
        preset(read, async function* (ctx) {
          yield `fake:${ctx.input.id}`
          return "fake"
        }),
      ],
    })
    const ctx = scope.createContext()
    const stream = ctx.execStream({ flow: read, input: { id: "a" } })

    expect(await collect(stream)).toEqual(["fake:a"])
    await expect(stream.result).resolves.toBe("fake")
    expect(await ctx.exec({ flow: read, input: { id: "b" } })).toBe("fake")
    await ctx.close()
    await scope.dispose()
  })
})
