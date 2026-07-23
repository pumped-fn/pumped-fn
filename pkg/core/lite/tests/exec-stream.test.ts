import { describe, expect, expectTypeOf, it } from "vitest"
import { controller, createScope, flow, FlowFault, isStreamingExec, preset, resource, tag, tags, typed } from "../src/index"
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

  it("runs a stream in an owned scope boundary", async () => {
    const events: string[] = []
    const tenant = tag<string>({ label: "tenant" })
    const lease = resource({
      deps: { tenant: tags.required(tenant) },
      factory: (ctx, { tenant }) => {
        ctx.cleanup((target) => { target.push("close") }, events)
        return tenant
      },
    })
    const read = flow({
      deps: { lease },
      factory: async function* (_ctx, { lease }) {
        yield lease
        return "done"
      },
    })
    const scope = createScope()
    const stream = scope.runStream({ flow: read, tags: [tenant("lease")] })

    expectTypeOf(stream).toEqualTypeOf<Lite.FlowStream<string, string>>()
    expect(await collect(stream)).toEqual(["lease"])
    await expect(stream.result).resolves.toBe("done")
    expect(events).toEqual(["close"])
    await scope.dispose()
  })

  it("aborts and closes an owned scope stream on consumer break", async () => {
    const events: string[] = []
    const closes: Lite.CloseResult[] = []
    const lease = resource({
      factory: (ctx) => {
        ctx.onClose((result, target) => { target.push(result) }, closes)
        ctx.cleanup((target) => { target.push("close") }, events)
        return "lease"
      },
    })
    const read = flow({
      deps: { lease },
      factory: async function* (_ctx, { lease }) {
        yield lease
        yield "second"
        return "done"
      },
    })
    const scope = createScope()
    const stream = scope.runStream({ flow: read })

    expect(() => stream.result).toThrow("use exec() to drain")
    for await (const value of stream) {
      expect(value).toBe("lease")
      break
    }

    await expect(stream.result).rejects.toThrow("Flow stream aborted")
    expect(closes[0]).toMatchObject({ ok: false, aborted: true })
    expect(events).toEqual(["close"])
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

  it("settles abort cleanup failures and makes returned streams terminal", async () => {
    let starts = 0
    const closes: Lite.CloseResult[] = []
    const read = flow({
      factory: async function* (ctx) {
        starts++
        ctx.onClose((result) => {
          closes.push(result)
        })
        try {
          yield "first"
          yield "second"
          return "done"
        } finally {
          throw new Error("finally failed")
        }
      },
    })
    const scope = createScope()
    const ctx = scope.createContext()
    const unopened = ctx.execStream({ flow: read })[Symbol.asyncIterator]()

    expect(await unopened.return?.()).toEqual({ done: true, value: undefined })
    expect(await unopened.next()).toEqual({ done: true, value: undefined })
    expect(starts).toBe(0)

    const stream = ctx.execStream({ flow: read })
    const iterator = stream[Symbol.asyncIterator]()
    expect(await iterator.next()).toEqual({ done: false, value: "first" })
    expect(await iterator.return?.()).toEqual({ done: true, value: undefined })
    expect(await iterator.next()).toEqual({ done: true, value: undefined })
    await expect(stream.result).rejects.toThrow("Flow stream aborted")
    expect(starts).toBe(1)
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
    async function* values(): AsyncGenerator<number, void, unknown> {
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

  it("passes the real flow target and exposes streaming detection to extensions", async () => {
    const read = flow({
      factory: () => "real",
    })
    const seen: boolean[] = []
    const scope = createScope({
      presets: [
        preset(read, async function* () {
          return "done"
        }),
      ],
      extensions: [
        {
          name: "identity",
          async wrapExec(next, target, ctx) {
            seen.push(target === read && isStreamingExec(target, ctx))
            return next()
          },
        },
      ],
    })
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: read })).resolves.toBe("done")
    const stream = ctx.execStream({ flow: read })
    expect(await collect(stream)).toEqual([])
    await expect(stream.result).resolves.toBe("done")
    expect(seen).toEqual([true, true])
    await ctx.close()
    await scope.dispose()
  })

  it("composes child streams through flow handles and aborts the child on parent break", async () => {
    const events: string[] = []
    const child = flow({
      factory: async function* (ctx) {
        ctx.onClose((result) => {
          events.push(result.ok ? "child:closed" : `child:aborted:${result.aborted === true}`)
        })
        try {
          yield "child:first"
          yield "child:second"
          return "child:done"
        } finally {
          events.push("child:finally")
        }
      },
    })
    const parent = flow({
      deps: { child: controller(child) },
      factory: async function* (_ctx, { child }) {
        const stream = child.execStream()
        yield "parent:start"
        yield* stream
        return `parent:${await stream.result}`
      },
    })
    const scope = createScope()
    const completed = scope.createContext()
    const completedStream = completed.execStream({ flow: parent })

    expect(await collect(completedStream)).toEqual(["parent:start", "child:first", "child:second"])
    await expect(completedStream.result).resolves.toBe("parent:child:done")
    await completed.close()
    events.length = 0

    const aborted = scope.createContext()
    const abortedStream = aborted.execStream({ flow: parent })
    const seen: string[] = []

    for await (const value of abortedStream) {
      seen.push(value)
      if (value === "child:first") break
    }

    await expect(abortedStream.result).rejects.toThrow("Flow stream aborted")
    expect(seen).toEqual(["parent:start", "child:first"])
    expect(events).toEqual(["child:finally", "child:aborted:true"])
    await aborted.close()
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

  it("classifies direct AsyncGenerator values without accepting scalar async iterables", async () => {
    async function* values(): AsyncGenerator<number, string, unknown> {
      yield 1
      yield 2
      return "done"
    }
    const read = flow({
      factory: () => values(),
    })
    const custom = flow({
      factory: () => ({
        [Symbol.asyncIterator]: () => ({
          next: async () => ({ done: true as const, value: undefined }),
        }),
      }),
    })
    const scalar = flow({
      factory: () => 1,
    })
    const scope = createScope()
    const ctx = scope.createContext()
    const stream = ctx.execStream({ flow: read })

    expectTypeOf(stream).toEqualTypeOf<Lite.FlowStream<number, string>>()
    expect(await collect(stream)).toEqual([1, 2])
    await expect(stream.result).resolves.toBe("done")
    await expect(ctx.exec({ flow: read })).resolves.toBe("done")
    await expect(ctx.exec({ flow: custom })).rejects.toThrow("use an async generator flow for yields or an iterable atom")
    const rejected = ctx.execStream({ flow: scalar })
    await expect(rejected[Symbol.asyncIterator]().next()).rejects.toThrow("requires an async generator flow")
    await expect(rejected.result).rejects.toThrow("requires an async generator flow")
    await ctx.close()
    await scope.dispose()
  })
})

describe("exec sync start", () => {
  it("starts a parseless flow factory synchronously", async () => {
    const scope = createScope()
    const ctx = scope.createContext()
    let started = false
    const job = flow({
      factory: async () => {
        started = true
        return 1
      },
    })

    const pending = ctx.exec({ flow: job })

    expect(started).toBe(true)
    expect(await pending).toBe(1)
    await ctx.close()
    await scope.dispose()
  })

  it("starts a sync-parse flow factory synchronously", async () => {
    const scope = createScope()
    const ctx = scope.createContext()
    let started = false
    const job = flow({
      parse: (raw) => raw as number,
      factory: async (ctx) => {
        started = true
        return ctx.input + 1
      },
    })

    const pending = ctx.exec({ flow: job, rawInput: 1 })

    expect(started).toBe(true)
    expect(await pending).toBe(2)
    await ctx.close()
    await scope.dispose()
  })
})
