import { describe, expect, it } from "vitest"
import { atom, createScope, flow, resource, typed, type Lite } from "@pumped-fn/lite"
import { observability, type Observability } from "../src"

describe("observability extension — typed faults", () => {
  it("includes the fault payload in the emitted error event when a FlowFault is thrown", async () => {
    const sink = observability.memory()
    const withFault = flow({
      name: "withFault",
      faults: typed<{ kind: "conflict"; id: string }>(),
      factory: (ctx) => ctx.fail({ kind: "conflict", id: "p1" }),
    })
    const scope = createScope({
      extensions: [observability.extension()],
      tags: [observability.runtime({ sinks: [sink] })],
    })
    await scope.ready

    const ctx = scope.createContext()
    await expect(ctx.exec({ flow: withFault })).rejects.toMatchObject({ fault: { kind: "conflict", id: "p1" } })

    const errorEvent = sink.events().find((event) => event.phase === "error")
    expect(errorEvent?.error?.fault).toEqual({ kind: "conflict", id: "p1" })
  })
})

function clock(values: readonly number[]): () => number {
  let index = 0
  return () => values[index++] ?? values[values.length - 1]!
}

describe("observability extension", () => {
  it("emits flow lifecycle events through runtime tag sinks", async () => {
    const sink = observability.memory()
    const observed: Observability.Event[] = []
    const unsubscribe = sink.subscribe((event) => observed.push(event))
    const run = flow({
      name: "run",
      parse: typed<{ secret: string }>(),
      factory: (ctx) => ({ value: ctx.input.secret }),
    })
    const scope = createScope({
      extensions: [observability.extension()],
      tags: [
        observability.runtime({
          sinks: [sink],
          input: true,
          output: true,
          now: clock([10, 12, 16, 20]),
          id: (() => {
            const ids = ["ctx-1", "flow-1"]
            return () => ids.shift() ?? "extra"
          })(),
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
        id: "ctx-1",
        phase: "start",
        kind: "context",
        name: "context",
        at: 10,
      },
      {
        id: "flow-1",
        parentId: "ctx-1",
        phase: "start",
        kind: "flow",
        name: "run",
        at: 12,
        input: "[redacted]",
      },
      {
        id: "flow-1",
        parentId: "ctx-1",
        phase: "success",
        kind: "flow",
        name: "run",
        at: 16,
        startedAt: 12,
        durationMs: 4,
        output: "[redacted]",
      },
      {
        id: "ctx-1",
        phase: "success",
        kind: "context",
        name: "context",
        at: 20,
        startedAt: 10,
        durationMs: 10,
      },
    ])
    expect(observed).toHaveLength(4)
    expect(sink.size()).toBe(4)
    const snapshot = sink.events()
    expect(snapshot).toHaveLength(4)
    unsubscribe()
    sink.clear()
    sink.close?.()
    expect(sink.events()).toEqual([])
    expect(snapshot).toHaveLength(4)
    expect(sink.size()).toBe(0)
  })

  it("uses root runtime tags for atoms resolved during earlier extension init", async () => {
    const sink = observability.memory()
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
      extensions: [eager, observability.extension()],
      tags: [
        observability.runtime({
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
    const sink = observability.memory()
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
        return [await ctx.resolve(tx), await ctx.exec({ name: "helper", fn: function helper() { return "fn" }, params: [] })]
      },
    })
    const scope = createScope({
      extensions: [observability.extension()],
      tags: [
        observability.runtime({
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
      ["context", "context", "start"],
      ["flow", "load", "start"],
      ["resource", "tx", "start"],
      ["resource", "tx", "success"],
      ["function", "helper", "start"],
      ["function", "helper", "success"],
      ["flow", "load", "success"],
      ["context", "context", "success"],
    ])
  })

  it("records target errors and explicit sink failure policy", async () => {
    const sink = observability.memory()
    const captured: unknown[] = []
    const bad: Observability.Sink = {
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
      extensions: [observability.extension()],
      tags: [
        observability.runtime({
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

    expect(sink.events().find((event) => event.kind === "flow" && event.phase === "error")).toMatchObject({
      phase: "error",
      kind: "flow",
      name: "fail",
      error: { message: "boom" },
    })
    expect(sink.events().at(-1)).toMatchObject({
      phase: "error",
      kind: "context",
      error: { message: "boom" },
    })
    expect(captured).toHaveLength(5)

    const strict = createScope({
      extensions: [observability.extension()],
      tags: [
        observability.runtime({
          sinks: [bad],
          failure: "throw",
        }),
      ],
    })
    await strict.ready
    expect(() => strict.createContext()).toThrow("sink failed")

    const filtered = createScope({
      extensions: [observability.extension()],
      tags: [
        observability.runtime({
          sinks: [bad],
          failure: "throw",
          only: ["flow"],
        }),
      ],
    })
    await filtered.ready
    const strictCtx = filtered.createContext()
    await expect(strictCtx.exec({ flow: flow({ name: "strict", factory: () => "ok" }) })).rejects.toThrow("sink failed")
  })

  it("supports custom error description and the no-sink path", async () => {
    const sink = observability.memory()
    const fail = flow({
      factory: () => {
        throw new Error("custom")
      },
    })
    const scope = createScope({
      extensions: [observability.extension()],
      tags: [
        observability.runtime({
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

    const empty = createScope({ extensions: [observability.extension()] })
    await empty.ready
    const emptyCtx = empty.createContext()
    await expect(emptyCtx.exec({ flow: flow({ factory: () => "ok" }) })).resolves.toBe("ok")
    await emptyCtx.close()
  })

  it("uses default redaction and Error serialization", async () => {
    const sink = observability.memory()
    const fail = flow({
      name: "fail",
      factory: () => {
        throw new Error("default")
      },
    })
    const scope = createScope({
      extensions: [observability.extension()],
      tags: [
        observability.runtime({
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

    expect(sink.events().find((event) => event.kind === "flow")?.input).toBe("raw")
    expect(sink.events().at(-1)?.error).toMatchObject({
      name: "Error",
      message: "default",
    })
  })

  it("filters targets and emitted events", async () => {
    const sink = observability.memory()
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
      extensions: [observability.extension()],
      tags: [
        observability.runtime({
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
    const root = observability.memory()
    const local = observability.memory()
    const item = resource({
      ownership: "current",
      factory: () => "item",
    })
    const run = flow({
      name: "run",
      factory: async (ctx) => ctx.resolve(item),
    })
    const scope = createScope({
      extensions: [observability.extension()],
      tags: [observability.runtime({ sinks: [root] })],
    })
    await scope.ready

    const ctx = scope.createContext({
      tags: [observability.runtime({ sinks: [local], now: clock([1, 2, 3, 4]), id: () => `local-${local.events().length + 1}` })],
    })
    await expect(ctx.exec({ flow: run })).resolves.toBe("item")
    await ctx.close()

    expect(root.events()).toEqual([])
    expect(local.events().map((event) => [event.kind, event.name, event.phase])).toEqual([
      ["context", "context", "start"],
      ["flow", "run", "start"],
      ["resource", "<anonymous>", "start"],
      ["resource", "<anonymous>", "success"],
      ["flow", "run", "success"],
      ["context", "context", "success"],
    ])
  })

  it("emits a context span for root contexts that parents traced work", async () => {
    const sink = observability.memory()
    let n = 0
    const work = flow({ name: "work", factory: () => "done" })
    const scope = createScope({
      extensions: [observability.extension()],
      tags: [observability.runtime({ sinks: [sink], now: clock([1, 2, 3, 4]), id: () => `id-${++n}` })],
    })
    await scope.ready

    const ctx = scope.createContext()
    await ctx.exec({ flow: work })
    await ctx.close()

    const events = sink.events()
    const contextStarts = events.filter((event) => event.kind === "context" && event.phase === "start")
    const flowStart = events.find((event) => event.kind === "flow" && event.phase === "start")
    const contextEnd = events.find((event) => event.kind === "context" && event.phase === "success")
    expect(contextStarts).toHaveLength(1)
    expect(flowStart?.parentId).toBe(contextStarts[0]!.id)
    expect(contextEnd?.id).toBe(contextStarts[0]!.id)
    expect(contextEnd?.durationMs).toBe(3)
    await scope.dispose()
  })

  it("emits a context error event with the close outcome", async () => {
    const sink = observability.memory()
    const scope = createScope({
      extensions: [observability.extension()],
      tags: [observability.runtime({ sinks: [sink] })],
    })
    await scope.ready

    const ctx = scope.createContext()
    await ctx.close({ ok: false, error: new Error("request failed") })

    const terminal = sink.events().find((event) => event.kind === "context" && event.phase === "error")
    expect(terminal?.error?.message).toBe("request failed")
    await scope.dispose()
  })

  it("omits context events when the only filter excludes them", async () => {
    const sink = observability.memory()
    const scope = createScope({
      extensions: [observability.extension()],
      tags: [observability.runtime({ sinks: [sink], only: ["flow"] })],
    })
    await scope.ready

    const ctx = scope.createContext()
    await ctx.close()

    expect(sink.events().filter((event) => event.kind === "context")).toHaveLength(0)
    await scope.dispose()
  })

  it("closes per-context sinks at context close without traced work", async () => {
    const calls: string[] = []
    const lifecycle: Observability.Sink = {
      name: "lifecycle",
      emit() {},
      flush() {
        calls.push("flush")
      },
      close() {
        calls.push("close")
      },
    }
    const scope = createScope({ extensions: [observability.extension()] })
    const ctx = scope.createContext({ tags: observability.runtime({ sinks: [lifecycle] }) })

    await ctx.close()
    expect(calls).toEqual(["flush", "close"])
    await scope.dispose()
  })

  it("flushes and closes context runtime sinks only when the owner context closes", async () => {
    const calls: string[] = []
    const sink: Observability.Sink = {
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
      extensions: [observability.extension()],
    })
    await scope.ready
    const ctx = scope.createContext({
      tags: [observability.runtime({ sinks: [sink] })],
    })

    await ctx.exec({ flow: run })
    expect(calls).toEqual([])
    await ctx.close()

    expect(calls).toEqual(["flush", "close"])
  })

  it("flushes and closes root sinks on scope dispose", async () => {
    const calls: string[] = []
    const sink: Observability.Sink = {
      emit() {},
      flush() {
        calls.push("flush")
      },
      close() {
        calls.push("close")
      },
    }
    const scope = createScope({
      extensions: [observability.extension()],
      tags: [observability.runtime({ sinks: [sink] })],
    })
    await scope.ready
    await scope.dispose()

    expect(calls).toEqual(["flush", "close"])
  })

  it("reports root sink flush failures", async () => {
    const captured: unknown[] = []
    const sink: Observability.Sink = {
      emit() {},
      flush() {
        throw new Error("flush failed")
      },
    }
    const scope = createScope({
      extensions: [observability.extension()],
      tags: [
        observability.runtime({
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

describe("parent linking", () => {
  it("nested exec spans carry the parent span id (fn-exec under a flow)", async () => {
    const sink = observability.memory()
    const outer = flow({
      name: "outer",
      factory: async (ctx): Promise<string> => {
        return ctx.exec({ name: "inner", params: [], fn: () => Promise.resolve("v") })
      },
    })
    const scope = createScope({
      extensions: [observability.extension()],
      tags: [observability.runtime({ sinks: [sink] })],
    })
    const ctx = scope.createContext()

    await ctx.exec({ flow: outer })

    const starts = sink.events().filter((event) => event.phase === "start")
    const contextStart = starts.find((event) => event.kind === "context")
    const outerStart = starts.find((event) => event.name === "outer")
    const innerStart = starts.find((event) => event.name === "inner")
    expect(contextStart).toBeDefined()
    expect(outerStart).toBeDefined()
    expect(innerStart).toBeDefined()
    expect(outerStart!.parentId).toBe(contextStart!.id)
    expect(innerStart!.parentId).toBe(outerStart!.id)

    await scope.dispose()
  })
})
