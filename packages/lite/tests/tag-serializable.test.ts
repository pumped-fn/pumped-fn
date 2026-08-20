import { getEventListeners } from "node:events"
import { runInNewContext } from "node:vm"
import { describe, expect, it } from "vitest"
import { assertSerializable, atom, controller, createScope, flow, tag, tags, type Lite } from "../src"

function flipValue(
  tagged: Lite.Tagged<Lite.JsonValue>,
  first: Lite.JsonValue,
  later: Lite.JsonValue,
): Lite.Tagged<Lite.JsonValue> {
  let reads = 0
  return {
    ...tagged,
    get value() {
      return reads++ === 0 ? first : later
    },
  } as Lite.Tagged<Lite.JsonValue>
}

type Snapshot = {
  readonly id: string
  readonly revision: number
  readonly active: boolean
  readonly labels: readonly string[]
  readonly parent: { readonly id: string } | null
}

describe("serializable tags", () => {
  it("marks valid plain JSON values and defaults as serializable", () => {
    const fallback: Snapshot = {
      id: "fallback",
      revision: 0,
      active: false,
      labels: [],
      parent: null,
    }
    const state = tag<Snapshot>({
      label: "serializable-valid",
      serializable: true,
      default: fallback,
    })
    const shared = { id: "root" }
    const value: Snapshot = {
      id: "current",
      revision: 2,
      active: true,
      labels: ["one", "two"],
      parent: shared,
    }
    const tagged = state(value)
    const plain = tag<Date>({ label: "serializable-unmarked" })(new Date(0))

    expect(state.serializable).toBe(true)
    expect(tagged.tag.serializable).toBe(true)
    expect(tagged.value).toBe(value)
    expect(state.get([])).toBe(fallback)
    expect(plain.tag.serializable).toBe(false)

    const record = Object.assign(Object.create(null), { left: shared, right: shared }) as Lite.JsonValue
    expect(() => tag<Lite.JsonValue>({ label: "serializable-null-prototype", serializable: true })(record)).not.toThrow()
  })

  it("checks the final value after parsing", () => {
    const parsed = tag<Lite.JsonValue>({
      label: "serializable-parsed",
      serializable: true,
      parse: (raw: unknown) => raw === "bad"
        ? new Date(0) as unknown as Lite.JsonValue
        : { value: raw as string },
    })

    expect(parsed("ok").value).toEqual({ value: "ok" })
    expect(() => parsed("bad")).toThrow("Non-plain object at $")
  })

  it("rejects an invalid default when the tag is declared", () => {
    expect(() => tag<Lite.JsonValue>({
      label: "serializable-invalid-default",
      serializable: true,
      default: new Date(0) as unknown as Lite.JsonValue,
    })).toThrow("Non-plain object at $")
  })

  it.each([
    ["undefined", { nested: { value: undefined } }, "Non-serializable undefined at $.nested.value"],
    ["function", { nested: { value: () => 1 } }, "Non-serializable function at $.nested.value"],
    ["symbol", { nested: { value: Symbol("value") } }, "Non-serializable symbol at $.nested.value"],
    ["bigint", { nested: { value: 1n } }, "Non-serializable bigint at $.nested.value"],
    ["NaN", { nested: { value: Number.NaN } }, "Non-finite number at $.nested.value"],
    ["infinity", { nested: { value: Number.POSITIVE_INFINITY } }, "Non-finite number at $.nested.value"],
    ["Date", { nested: { value: new Date(0) } }, "Non-plain object at $.nested.value"],
    ["Map", { nested: { value: new Map() } }, "Non-plain object at $.nested.value"],
  ])("rejects runtime %s values with their path", (_name, value, message) => {
    const state = tag<Lite.JsonValue>({ label: `serializable-runtime-${_name}`, serializable: true })

    expect(() => state(value as Lite.JsonValue)).toThrow(message)
  })

  it("rejects symbol keys and sparse arrays", () => {
    const state = tag<Lite.JsonValue>({ label: "serializable-runtime-shapes", serializable: true })
    const symbolKey = { value: true, [Symbol("hidden")]: "hidden" }
    const sparse = new Array(1)

    expect(() => state(symbolKey as Lite.JsonValue)).toThrow("Symbol key at $")
    expect(() => state(sparse as Lite.JsonValue)).toThrow("Non-serializable undefined at $[0]")
  })

  it("rejects hidden fields, accessors, and extra array keys without invoking getters", () => {
    const state = tag<Lite.JsonValue>({ label: "serializable-runtime-properties", serializable: true })
    const hidden = { visible: true }
    Object.defineProperty(hidden, "hidden", { value: undefined })
    let reads = 0
    const accessor = Object.defineProperty({}, "value", {
      enumerable: true,
      get: () => {
        reads++
        return "value"
      },
    })
    const extended = [1] as unknown[] & { extra?: unknown }
    extended.extra = undefined

    expect(() => state(hidden as Lite.JsonValue)).toThrow("Non-enumerable property at $.hidden")
    expect(() => state(accessor as Lite.JsonValue)).toThrow("Accessor property at $.value")
    expect(reads).toBe(0)
    expect(() => state(extended as Lite.JsonValue)).toThrow("Non-index array key at $.extra")
  })

  it("rejects array subclasses but accepts cross-realm arrays", () => {
    class InvalidArray extends Array<number> {
      toJSON(): bigint {
        return 1n
      }
    }

    expect(() => assertSerializable(new InvalidArray(1))).toThrow("Non-plain array at $")
    expect(() => assertSerializable(runInNewContext("[1, 2]"))).not.toThrow()
  })

  it("rejects circular values at the point where the cycle closes", () => {
    const state = tag<Lite.JsonValue>({ label: "serializable-runtime-cycle", serializable: true })
    const circular: Record<string, unknown> = { value: true }
    circular["self"] = circular

    expect(() => state(circular as Lite.JsonValue)).toThrow("Circular value at $.self")
  })

  it("rejects a forged tagged batch before committing or notifying", async () => {
    const state = tag<{ readonly count: number }>({ label: "serializable-forged-state", serializable: true })
    const owner = tag<{ readonly id: string }>({ label: "serializable-forged-owner", serializable: true })
    const scope = createScope()
    const ctx = scope.createContext({ tags: [state({ count: 1 }), owner({ id: "old" })] })
    const events: Array<readonly { readonly count: number }[]> = []
    ctx.tags.watch(state, (values) => events.push(values))
    const forged = {
      ...state({ count: 2 }),
      value: { count: 2, invalid: new Date(0) },
    } as unknown as Lite.Tagged<{ readonly count: number }, true>
    const localControl = Object.assign(
      ((value: { readonly count: number }) => state(value)),
      state,
      { serializable: false as const },
    )
    const forgedControl = { ...forged, tag: localControl }

    expect(() => ctx.tags.set([owner({ id: "new" }), forged])).toThrow("Non-plain object at $.invalid")
    expect(ctx.tags.get(state)).toEqual({ count: 1 })
    expect(ctx.tags.get(owner)).toEqual({ id: "old" })
    expect(events).toEqual([])

    expect(() => ctx.tags.set(forgedControl)).toThrow("Non-plain object at $.invalid")
    expect(ctx.tags.get(state)).toEqual({ count: 1 })
    expect(events).toEqual([])

    await ctx.close()
    await scope.dispose()
  })

  it("uses the first family control for every value during context creation", async () => {
    const state = tag<{ readonly count: number }>({ label: "serializable-seed-control", serializable: true })
    const valid = state({ count: 1 })
    const localControl = Object.assign(
      ((value: { readonly count: number }) => state(value)),
      state,
      { serializable: false as const },
    )
    const forged = {
      ...valid,
      value: { count: 2, invalid: new Date(0) },
      tag: localControl,
    } as unknown as Lite.Tagged<{ readonly count: number }, false>
    const scope = createScope()

    expect(() => scope.createContext({ tags: [forged, valid] })).toThrow("Non-plain object at $.invalid")

    await scope.dispose()
  })

  it("uses the registered control for a forged first write", async () => {
    const state = tag<{ readonly count: number }>({ label: "serializable-first-control", serializable: true })
    const valid = state({ count: 1 })
    const localControl = Object.assign(
      ((value: { readonly count: number }) => state(value)),
      state,
      { serializable: false as const },
    )
    const forged = {
      ...valid,
      value: { count: 2, invalid: new Date(0) },
      tag: localControl,
    } as unknown as Lite.Tagged<{ readonly count: number }, false>
    const scope = createScope()
    const ctx = scope.createContext()

    expect(() => ctx.tags.set(forged)).toThrow("Non-plain object at $.invalid")
    expect(ctx.tags.get(state)).toBeUndefined()
    expect(() => createScope({ tags: forged })).toThrow("Non-plain object at $.invalid")

    await ctx.close()
    await scope.dispose()
  })

  it("rejects compatibility writes before committing or notifying", async () => {
    const state = tag<{ readonly count: number }>({ label: "serializable-compat-state", serializable: true })
    const scope = createScope()
    const ctx = scope.createContext({ tags: state({ count: 1 }) })
    const events: Array<readonly { readonly count: number }[]> = []
    ctx.tags.watch(state, (values) => events.push(values))
    const invalid = { count: 2, nested: new Date(0) } as never

    expect(() => ctx.data.setTag(state, invalid)).toThrow("Non-plain object at $.nested")
    expect(ctx.tags.get(state)).toEqual({ count: 1 })
    expect(events).toEqual([])

    expect(() => ctx.data.set(state.key, invalid)).toThrow("Non-plain object at $.nested")
    expect(ctx.tags.get(state)).toEqual({ count: 1 })
    expect(events).toEqual([])

    await ctx.close()
    await scope.dispose()
  })

  it("accepts cross-realm plain objects and rejects class and custom prototypes", () => {
    class Box {
      value = 1
    }
    const objectCtorProto = Object.create(null)
    objectCtorProto.constructor = Object
    let constructorReads = 0
    const accessorProto = Object.create(null)
    Object.defineProperty(accessorProto, "constructor", {
      enumerable: true,
      get: () => {
        constructorReads++
        return Object
      },
    })

    expect(() => assertSerializable(runInNewContext("({ a: 1 })"))).not.toThrow()
    expect(() => assertSerializable(runInNewContext("Object.create(null)"))).not.toThrow()
    expect(() => assertSerializable(runInNewContext("new Date(0)"))).toThrow("Non-plain object at $")
    expect(() => assertSerializable(new Box())).toThrow("Non-plain object at $")
    expect(() => assertSerializable(Object.create({ custom: true }))).toThrow("Non-plain object at $")
    expect(() => assertSerializable(Object.create(objectCtorProto))).toThrow("Non-plain object at $")
    expect(() => assertSerializable(Object.create(accessorProto))).toThrow("Non-plain object at $")
    expect(constructorReads).toBe(0)
  })

  it("consumes one snapped holder value across get, find, collect, and context writes", async () => {
    const state = tag<Lite.JsonValue>({ label: "serializable-value-accessor", serializable: true })
    const valid = { id: "ok" }
    const later = { id: "ok", bad: new Date(0) } as unknown as Lite.JsonValue
    const base = state(valid)

    expect(state.get(flipValue(base, valid, later))).toEqual(valid)
    expect(state.find(flipValue(base, valid, later))).toEqual(valid)
    expect(state.collect(flipValue(base, valid, later))).toEqual([valid])

    const scope = createScope()
    const ctx = scope.createContext({ tags: [flipValue(base, valid, later)] })
    expect(ctx.tags.get(state)).toEqual(valid)
    expect(ctx.tags.get(state)).toEqual(valid)

    ctx.tags.set(flipValue(base, valid, later))
    expect(ctx.tags.get(state)).toEqual(valid)

    await ctx.close()
    await scope.dispose()
  })

  it("rejects a tag-getter that swaps to a local control after isTagged", async () => {
    const state = tag<Lite.JsonValue>({ label: "serializable-tag-accessor", serializable: true })
    const local = tag<Lite.JsonValue>({ label: "serializable-tag-accessor-local" })
    const valid = { id: "ok" }
    const later = { id: "ok", bad: new Date(0) } as unknown as Lite.JsonValue
    const base = state(valid)
    let tagReads = 0
    let valueReads = 0
    const forged = {
      ...base,
      get tag() {
        return tagReads++ === 0 ? state : local
      },
      get key() {
        return state.key
      },
      get value() {
        return valueReads++ === 0 ? valid : later
      },
    } as unknown as Lite.Tagged<Lite.JsonValue>

    expect(() => state.get(forged)).toThrow("tags must contain only tagged values and arrays")
    expect(state.find([])).toBeUndefined()

    const sameKeyControl = Object.assign(
      ((value: Lite.JsonValue) => state(value)),
      state,
      { serializable: false as const },
    )
    let controlReads = 0
    const forgedControl = {
      ...base,
      get tag() {
        return controlReads++ === 0 ? state : sameKeyControl
      },
      get value() {
        return valid
      },
    } as unknown as Lite.Tagged<Lite.JsonValue>
    const scope = createScope()
    const ctx = scope.createContext({ tags: [state(valid)] })

    expect(state.get(forgedControl)).toEqual(valid)
    expect(() => ctx.tags.set({
      ...base,
      get tag() {
        return local
      },
      get key() {
        return state.key
      },
      get value() {
        return later
      },
    } as unknown as Lite.Tagged<Lite.JsonValue>)).toThrow("tags must contain only tagged values and arrays")
    expect(ctx.tags.get(state)).toEqual(valid)

    await ctx.close()
    await scope.dispose()
  })

  it("does not leave a parent stuck after a mutated serializable flow tag rejects exec", async () => {
    const payload: Record<string, unknown> = { count: 1 }
    const state = tag<Lite.JsonValue>({ label: "serializable-exec-lifecycle", serializable: true })
    const work = flow({
      tags: [state(payload as Lite.JsonValue)],
      factory: () => "ok",
    })
    const later = flow({ factory: () => "later" })
    const scope = createScope()
    const parent = scope.createContext()
    const signal = new AbortController()
    payload["invalid"] = new Date(0)

    await expect(parent.exec({ flow: work, signal: signal.signal })).rejects.toThrow("Non-plain object at $.invalid")
    expect(getEventListeners(signal.signal, "abort")).toEqual([])
    await expect(parent.exec({ flow: later })).resolves.toBe("later")
    await parent.close()
    await expect(parent.exec({ flow: later })).rejects.toThrow("ExecutionContext is closed")
    await scope.dispose()
  })

  it("does not leave a parent stuck after a mutated serializable flow tag rejects execStream", async () => {
    const payload: Record<string, unknown> = { count: 1 }
    const state = tag<Lite.JsonValue>({ label: "serializable-stream-lifecycle", serializable: true })
    const work = flow({
      tags: [state(payload as Lite.JsonValue)],
      factory: async function* () {
        yield "late"
        return "ok"
      },
    })
    const later = flow({
      factory: async function* () {
        yield "later"
        return "done"
      },
    })
    const scope = createScope()
    const parent = scope.createContext()
    const signal = new AbortController()
    payload["invalid"] = new Date(0)

    const rejected = parent.execStream({ flow: work, signal: signal.signal })
    await expect(rejected[Symbol.asyncIterator]().next()).rejects.toThrow("Non-plain object at $.invalid")
    expect(getEventListeners(signal.signal, "abort")).toEqual([])
    const values: string[] = []
    for await (const value of parent.execStream({ flow: later })) values.push(value)
    expect(values).toEqual(["later"])
    await parent.close()
    expect(() => parent.execStream({ flow: later })[Symbol.asyncIterator]()).toThrow("ExecutionContext is closed")
    await scope.dispose()
  })

  it("does not attach a signal listener when inherited serializable scope tags reject", async () => {
    const payload: Record<string, unknown> = { count: 1 }
    const state = tag<Lite.JsonValue>({ label: "serializable-context-lifecycle", serializable: true })
    const scope = createScope({ tags: state(payload as Lite.JsonValue) })
    const signal = new AbortController()
    payload["invalid"] = new Date(0)

    expect(() => scope.createContext({ signal: signal.signal })).toThrow("Non-plain object at $.invalid")
    expect(getEventListeners(signal.signal, "abort")).toEqual([])
    await scope.dispose()
  })

  it("does not leave a parent context after createContext tag checks reject", async () => {
    const state = tag<Lite.JsonValue>({ label: "serializable-context-parent", serializable: true })
    const later = flow({ factory: () => "later" })
    const scope = createScope()
    const parent = scope.createContext()
    const signal = new AbortController()
    const valid = { id: "ok" }
    const invalid = { id: "ok", bad: new Date(0) } as unknown as Lite.JsonValue

    expect(() => scope.createContext({
      parent,
      signal: signal.signal,
      tags: [flipValue(state(valid), invalid, invalid)],
    })).toThrow("Non-plain object at $.bad")
    expect(getEventListeners(signal.signal, "abort")).toEqual([])
    await expect(parent.exec({ flow: later })).resolves.toBe("later")
    await parent.close()
    await scope.dispose()
  })

  it("rejects synchronous atom tag failures through the Promise API", async () => {
    const payload: Record<string, unknown> = { count: 1 }
    const state = tag<Lite.JsonValue>({ label: "serializable-atom-promise", serializable: true })
    const read = atom({
      deps: { state: tags.required(state) },
      factory: (_ctx, { state }) => state,
    })
    const scope = createScope({ tags: state(payload as Lite.JsonValue) })
    const events: string[] = []
    const ctrl = scope.controller(read)
    ctrl.on("*", () => events.push(ctrl.state))
    payload["invalid"] = new Date(0)
    let result: Promise<Lite.JsonValue> | undefined

    expect(() => {
      result = scope.resolve(read)
    }).not.toThrow()
    await expect(result).rejects.toThrow("Non-plain object at $.invalid")
    expect(ctrl.state).toBe("failed")
    expect(events).toEqual(["resolving", "failed"])

    await scope.dispose()
  })

  it("does not duplicate watches when sync tag resolution falls back", async () => {
    const payload: Record<string, unknown> = { count: 1 }
    const state = tag<Lite.JsonValue>({ label: "serializable-atom-watch-lifecycle", serializable: true })
    const source = atom({ factory: () => 1 })
    let eqCalls = 0
    const read = atom({
      deps: {
        source: controller(source, {
          resolve: true,
          watch: true,
          eq: () => {
            eqCalls++
            return true
          },
        }),
        state: tags.required(state),
      },
      factory: (_ctx, { state }) => state,
    })
    const scope = createScope({ tags: state(payload as Lite.JsonValue) })
    payload["invalid"] = new Date(0)

    await expect(scope.resolve(read)).rejects.toThrow("Non-plain object at $.invalid")
    scope.controller(source).set(2)
    await scope.flush()

    expect(eqCalls).toBe(1)

    await scope.dispose()
  })

  it("surfaces synchronous atom tag failures through changes and resolveStream", async () => {
    const payload: Record<string, unknown> = { count: 1 }
    const state = tag<Lite.JsonValue>({ label: "serializable-atom-streams", serializable: true })
    const changed = atom({
      deps: { state: tags.required(state) },
      factory: (_ctx, { state }) => state,
    })
    const streamed = atom({
      deps: { state: tags.required(state) },
      factory: (_ctx, { state }) => (async function* () {
        yield state
      })(),
    })
    const scope = createScope({ tags: state(payload as Lite.JsonValue) })
    payload["invalid"] = new Date(0)
    let changes: AsyncIterable<Lite.JsonValue> | undefined
    let stream: AsyncIterable<Lite.JsonValue> | undefined

    expect(() => {
      changes = scope.changes(changed)
    }).not.toThrow()
    await expect(changes![Symbol.asyncIterator]().next()).rejects.toThrow("Non-plain object at $.invalid")
    expect(() => {
      stream = scope.resolveStream(streamed)
    }).not.toThrow()
    await expect(stream![Symbol.asyncIterator]().next()).rejects.toThrow("Non-plain object at $.invalid")

    await scope.dispose()
  })

  it("cleans a prepared context when repeated tag validation rejects", async () => {
    let checks = 0
    const state = tag<Lite.JsonValue>({ label: "serializable-prepare-lifecycle", serializable: true })
    const value = new Proxy({ count: 1 } as Record<string, unknown>, {
      getOwnPropertyDescriptor(target, key) {
        const descriptor = Reflect.getOwnPropertyDescriptor(target, key)
        if (++checks === 2) target["invalid"] = new Date(0)
        return descriptor
      },
    }) as Lite.JsonValue
    const signal = new AbortController()
    const child = flow({ factory: () => "child" })
    const parent = flow({
      deps: { child: controller(child) },
      factory: (_ctx, { child }) => {
        expect(() => child.prepare({
          signal: signal.signal,
          tags: state(value),
        })).toThrow("Non-plain object at $.invalid")
        expect(getEventListeners(signal.signal, "abort")).toEqual([])
        return "handled"
      },
    })
    const scope = createScope()
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: parent })).resolves.toBe("handled")
    expect(getEventListeners(signal.signal, "abort")).toEqual([])

    await ctx.close()
    await scope.dispose()
  })

  it("does not validate a mutated flow tag that an exec tag overrides", async () => {
    const payload: Record<string, unknown> = { source: "flow" }
    const state = tag<Lite.JsonValue>({ label: "serializable-overridden-flow", serializable: true })
    const work = flow({
      tags: [state(payload as Lite.JsonValue)],
      factory: (ctx) => ctx.tags.get(state),
    })
    const streamed = flow({
      tags: [state(payload as Lite.JsonValue)],
      factory: async function* (ctx) {
        yield ctx.tags.get(state)
        return ctx.tags.get(state)
      },
    })
    payload["bad"] = new Date(0)
    const scope = createScope()
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: work, tags: [state({ source: "call" })] })).resolves.toEqual({ source: "call" })
    const values: unknown[] = []
    for await (const value of ctx.execStream({ flow: streamed, tags: [state({ source: "stream" })] })) {
      values.push(value)
    }
    expect(values).toEqual([{ source: "stream" }])

    await ctx.close()
    await scope.dispose()
  })

  it("rechecks serializable replacements after eq and before commit", async () => {
    const state = tag<{ count: number }>({
      label: "serializable-eq-mutate",
      serializable: true,
      eq: (_old, next) => {
        ;(next as { count: number; bad?: Date }).bad = new Date(0)
        return false
      },
    })
    const scope = createScope()
    const ctx = scope.createContext({ tags: [state({ count: 1 })] })
    const events: Array<readonly { count: number }[]> = []
    ctx.tags.watch(state, (values) => events.push(values))

    expect(() => ctx.tags.set(state({ count: 2 }))).toThrow("Non-plain object at $.bad")
    expect(ctx.tags.get(state)).toEqual({ count: 1 })
    expect(events).toEqual([])

    await ctx.close()
    await scope.dispose()
  })

  it("keeps a batch atomic when eq mutates a shared replacement", async () => {
    const shared = { id: "next" }
    const left = tag<Lite.JsonValue>({
      label: "serializable-eq-left",
      serializable: true,
      eq: (_old, next) => {
        ;(next as unknown as { id: string; bad?: Date }).bad = new Date(0)
        return false
      },
    })
    const right = tag<Lite.JsonValue>({
      label: "serializable-eq-right",
      serializable: true,
    })
    const scope = createScope()
    const ctx = scope.createContext({ tags: [left({ id: "old-left" }), right({ id: "old-right" })] })
    const events: string[] = []
    ctx.tags.watch(left, () => events.push("left"))
    ctx.tags.watch(right, () => events.push("right"))

    expect(() => ctx.tags.set([left(shared), right(shared)])).toThrow("Non-plain object at $.bad")
    expect(ctx.tags.get(left)).toEqual({ id: "old-left" })
    expect(ctx.tags.get(right)).toEqual({ id: "old-right" })
    expect(events).toEqual([])

    await ctx.close()
    await scope.dispose()
  })
})
