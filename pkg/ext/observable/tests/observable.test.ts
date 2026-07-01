import { describe, expect, it } from "vitest"
import { atom, createScope, flow, resource, typed, type Lite } from "@pumped-fn/lite"
import { observable, type Observable } from "../src"

function clock(values: readonly number[]): () => number {
  let index = 0
  return () => values[index++] ?? values[values.length - 1]!
}

describe("observable extension", () => {
  it("emits flow lifecycle events through runtime tag sinks", async () => {
    const sink = observable.memory()
    const observed: Observable.Event[] = []
    const unsubscribe = sink.subscribe((event) => observed.push(event))
    const run = flow({
      name: "run",
      parse: typed<{ secret: string }>(),
      factory: (ctx) => ({ value: ctx.input.secret }),
    })
    const scope = createScope({
      extensions: [observable.extension()],
      tags: [
        observable.runtime({
          sinks: [sink],
          input: true,
          output: true,
          now: clock([10, 16]),
          id: () => "flow-1",
          redact: () => "[redacted]",
        }),
      ],
    })
    await scope.ready

    const ctx = scope.createContext()
    const output = await ctx.exec({ flow: run, input: { secret: "token" } })
    await ctx.close()

    expect(output).toEqual({ value: "token" })
    expect(sink.events()).toEqual([
      {
        id: "flow-1",
        phase: "start",
        kind: "flow",
        name: "run",
        at: 10,
        input: "[redacted]",
      },
      {
        id: "flow-1",
        phase: "success",
        kind: "flow",
        name: "run",
        at: 16,
        startedAt: 10,
        durationMs: 6,
        output: "[redacted]",
      },
    ])
    expect(observed).toHaveLength(2)
    expect(sink.size()).toBe(2)
    const snapshot = sink.events()
    expect(snapshot).toHaveLength(2)
    unsubscribe()
    sink.clear()
    sink.close?.()
    expect(sink.events()).toEqual([])
    expect(snapshot).toHaveLength(2)
    expect(sink.size()).toBe(0)
  })

  it("uses root runtime tags for atoms resolved during earlier extension init", async () => {
    const sink = observable.memory()
    const value = atom({
      factory: function eager() {
        return "ready"
      },
    })
    const eager: Lite.Extension = {
      name: "eager",
      init: (scope) => scope.resolve(value),
    }
    const scope = createScope({
      extensions: [eager, observable.extension()],
      tags: [
        observable.runtime({
          sinks: [sink],
          only: ["atom"],
          now: clock([1, 2]),
          id: () => "eager-1",
        }),
      ],
    })

    await scope.ready
    await scope.dispose()

    expect(sink.events().map((event) => [event.kind, event.name, event.phase])).toEqual([
      ["atom", "eager", "start"],
      ["atom", "eager", "success"],
    ])
  })

  it("emits atom, resource, and function lifecycle events", async () => {
    const sink = observable.memory()
    const value = atom({
      factory: function value() {
        return 42
      },
    })
    const anonymous = atom({
      factory: () => "anonymous",
    })
    const tx = resource({
      name: "tx",
      ownership: "current",
      factory: () => "tx",
    })
    const load = flow({
      name: "load",
      factory: async (ctx) => {
        return [await ctx.resolve(tx), await ctx.exec({ fn: function helper() { return "fn" }, params: [] })]
      },
    })
    const scope = createScope({
      extensions: [observable.extension()],
      tags: [
        observable.runtime({
          sinks: [sink],
          now: clock([1, 2, 3, 4, 5, 6, 7, 8]),
          id: () => `event-${sink.events().length + 1}`,
        }),
      ],
    })
    await scope.ready

    await scope.resolve(value)
    await scope.resolve(anonymous)
    const ctx = scope.createContext()
    expect(await ctx.exec({ flow: load })).toEqual(["tx", "fn"])
    await ctx.close()

    expect(sink.events().map((event) => [event.kind, event.name, event.phase])).toEqual([
      ["atom", "value", "start"],
      ["atom", "value", "success"],
      ["atom", "<anonymous>", "start"],
      ["atom", "<anonymous>", "success"],
      ["flow", "load", "start"],
      ["resource", "tx", "start"],
      ["resource", "tx", "success"],
      ["function", "helper", "start"],
      ["function", "helper", "success"],
      ["flow", "load", "success"],
    ])
  })

  it("records target errors and explicit sink failure policy", async () => {
    const sink = observable.memory()
    const captured: unknown[] = []
    const bad: Observable.Sink = {
      name: "bad",
      emit() {
        throw new Error("sink failed")
      },
      close() {
        throw new Error("close failed")
      },
    }
    const fail = flow({
      name: "fail",
      factory: () => {
        throw "boom"
      },
    })
    const scope = createScope({
      extensions: [observable.extension()],
      tags: [
        observable.runtime({
          sinks: [sink, bad],
          now: clock([20, 25]),
          id: () => "error-1",
          onError: (error) => captured.push(error),
        }),
      ],
    })
    await scope.ready

    const ctx = scope.createContext()
    await expect(ctx.exec({ flow: fail })).rejects.toBe("boom")
    await ctx.close({ ok: false, error: "boom" })
    await scope.dispose()

    expect(sink.events().at(-1)).toMatchObject({
      id: "error-1",
      phase: "error",
      kind: "flow",
      name: "fail",
      error: { message: "boom" },
    })
    expect(captured).toHaveLength(3)

    const strict = createScope({
      extensions: [observable.extension()],
      tags: [
        observable.runtime({
          sinks: [bad],
          failure: "throw",
        }),
      ],
    })
    await strict.ready
    const strictCtx = strict.createContext()
    await expect(strictCtx.exec({ flow: flow({ name: "strict", factory: () => "ok" }) })).rejects.toThrow("sink failed")
  })

  it("supports custom error description and the no-sink path", async () => {
    const sink = observable.memory()
    const fail = flow({
      factory: () => {
        throw new Error("custom")
      },
    })
    const scope = createScope({
      extensions: [observable.extension()],
      tags: [
        observable.runtime({
          sinks: [sink],
          now: clock([1, 2]),
          id: () => "custom",
          mapError: () => ({ message: "redacted" }),
        }),
      ],
    })
    await scope.ready
    const ctx = scope.createContext()
    await expect(ctx.exec({ flow: fail })).rejects.toThrow("custom")
    await ctx.close({ ok: false, error: new Error("custom") })

    expect(sink.events().at(-1)?.error).toEqual({ message: "redacted" })

    const empty = createScope({ extensions: [observable.extension()] })
    await empty.ready
    const emptyCtx = empty.createContext()
    await expect(emptyCtx.exec({ flow: flow({ factory: () => "ok" }) })).resolves.toBe("ok")
    await emptyCtx.close()
  })

  it("uses default redaction and Error serialization", async () => {
    const sink = observable.memory()
    const fail = flow({
      name: "fail",
      factory: () => {
        throw new Error("default")
      },
    })
    const scope = createScope({
      extensions: [observable.extension()],
      tags: [
        observable.runtime({
          sinks: [sink],
          input: true,
          now: clock([1, 2]),
          id: () => "default-error",
        }),
      ],
    })
    await scope.ready

    const ctx = scope.createContext()
    await expect(ctx.exec({ flow: fail, input: "raw" })).rejects.toThrow("default")
    await ctx.close({ ok: false, error: new Error("default") })

    expect(sink.events()[0]?.input).toBe("raw")
    expect(sink.events().at(-1)?.error).toMatchObject({
      name: "Error",
      message: "default",
    })
  })

  it("filters targets and emitted events", async () => {
    const sink = observable.memory()
    const value = atom({
      factory: function value() {
        return 1
      },
    })
    const run = flow({
      name: "run",
      factory: () => "ok",
    })
    const scope = createScope({
      extensions: [observable.extension()],
      tags: [
        observable.runtime({
          sinks: [sink],
          only: ["flow"],
          filter: (event) => event.phase === "success",
          now: clock([1, 2]),
          id: () => "filtered",
        }),
      ],
    })
    await scope.ready

    await scope.resolve(value)
    const ctx = scope.createContext()
    await ctx.exec({ flow: run })
    await ctx.close()

    expect(sink.events()).toEqual([
      {
        id: "filtered",
        phase: "success",
        kind: "flow",
        name: "run",
        at: 2,
        startedAt: 1,
        durationMs: 1,
      },
    ])
  })

  it("uses execution runtime tags for resource events", async () => {
    const root = observable.memory()
    const local = observable.memory()
    const item = resource({
      ownership: "current",
      factory: () => "item",
    })
    const run = flow({
      name: "run",
      factory: async (ctx) => ctx.resolve(item),
    })
    const scope = createScope({
      extensions: [observable.extension()],
      tags: [observable.runtime({ sinks: [root] })],
    })
    await scope.ready

    const ctx = scope.createContext({
      tags: [observable.runtime({ sinks: [local], now: clock([1, 2, 3, 4]), id: () => `local-${local.events().length + 1}` })],
    })
    await expect(ctx.exec({ flow: run })).resolves.toBe("item")
    await ctx.close()

    expect(root.events()).toEqual([])
    expect(local.events().map((event) => [event.kind, event.name, event.phase])).toEqual([
      ["flow", "run", "start"],
      ["resource", "<anonymous>", "start"],
      ["resource", "<anonymous>", "success"],
      ["flow", "run", "success"],
    ])
  })

  it("flushes and closes context runtime sinks only when the owner context closes", async () => {
    const calls: string[] = []
    const sink: Observable.Sink = {
      emit() {},
      flush() {
        calls.push("flush")
      },
      close() {
        calls.push("close")
      },
    }
    const run = flow({
      name: "run",
      factory: () => "ok",
    })
    const scope = createScope({
      extensions: [observable.extension()],
    })
    await scope.ready
    const ctx = scope.createContext({
      tags: [observable.runtime({ sinks: [sink] })],
    })

    await ctx.exec({ flow: run })
    expect(calls).toEqual([])
    await ctx.close()

    expect(calls).toEqual(["flush", "close"])
  })

  it("flushes and closes root sinks on scope dispose", async () => {
    const calls: string[] = []
    const sink: Observable.Sink = {
      emit() {},
      flush() {
        calls.push("flush")
      },
      close() {
        calls.push("close")
      },
    }
    const scope = createScope({
      extensions: [observable.extension()],
      tags: [observable.runtime({ sinks: [sink] })],
    })
    await scope.ready
    await scope.dispose()

    expect(calls).toEqual(["flush", "close"])
  })

  it("reports root sink flush failures", async () => {
    const captured: unknown[] = []
    const sink: Observable.Sink = {
      emit() {},
      flush() {
        throw new Error("flush failed")
      },
    }
    const scope = createScope({
      extensions: [observable.extension()],
      tags: [
        observable.runtime({
          sinks: [sink],
          onError: (error) => captured.push(error),
        }),
      ],
    })
    await scope.ready
    await scope.dispose()

    expect(captured).toHaveLength(1)
  })
})
