import { describe, expect, it } from "vitest"
import { createScope, tag } from "../src"

describe("ExecutionContext tags", () => {
  it("separates raw data from typed families while preserving compatibility shims", async () => {
    const model = tag<string>({ label: "context-tags-model" })
    const legacy = tag<string>({ label: "context-tags-legacy" })
    const scope = createScope()
    const ctx = scope.createContext({ tags: [model("first"), model("second")] })

    expect(ctx.tags.get(model)).toBe("first")
    expect(ctx.tags.getMany(model)).toEqual(["first", "second"])
    expect(ctx.data.getTag(model)).toBe("first")
    expect(ctx.data.get(model.key)).toBe("first")

    ctx.tags.set(model("third"))
    expect(ctx.tags.getMany(model)).toEqual(["third"])
    expect(ctx.data.getTag(model)).toBe("third")

    ctx.data.setTag(model, "fourth")
    expect(ctx.tags.getMany(model)).toEqual(["fourth"])

    ctx.data.set(model.key, "fifth")
    expect(ctx.tags.getMany(model)).toEqual(["fifth"])

    ctx.data.set(legacy.key, "raw")
    expect(ctx.data.getTag(legacy)).toBe("raw")
    expect(ctx.tags.get(legacy)).toBeUndefined()

    ctx.tags.set(legacy("tagged"))
    expect(ctx.data.get(legacy.key)).toBe("tagged")
    expect(ctx.tags.get(legacy)).toBe("tagged")

    await ctx.close()
    await scope.dispose()
  })

  it("replaces every touched family once and preserves nested input order", async () => {
    const model = tag<string>({ label: "context-tags-set-model" })
    const tenant = tag<string>({ label: "context-tags-set-tenant" })
    const scope = createScope()
    const ctx = scope.createContext({ tags: tenant("old") })
    const snapshots: string[][] = []

    ctx.tags.watch(model, (values) => {
      snapshots.push([...values, `tenant:${ctx.tags.get(tenant)}`])
    })

    ctx.tags.set([model("first"), [tenant("acme"), model("second")]])

    expect(ctx.tags.get(model)).toBe("first")
    expect(ctx.tags.getMany(model)).toEqual(["first", "second"])
    expect(ctx.tags.getMany(tenant)).toEqual(["acme"])
    expect(snapshots).toEqual([["first", "second", "tenant:acme"]])

    ctx.tags.set(model("third"))
    expect(ctx.tags.getMany(model)).toEqual(["third"])
    expect(ctx.tags.getMany(tenant)).toEqual(["acme"])

    const copy = ctx.tags.getMany(model) as string[]
    copy.push("outside")
    expect(ctx.tags.getMany(model)).toEqual(["third"])

    await ctx.close()
    await scope.dispose()
  })

  it("keeps local reads separate from child-to-parent reads and ignores defaults", async () => {
    const role = tag<string>({ label: "context-tags-role" })
    const region = tag<string>({ label: "context-tags-region" })
    const fallback = tag<string>({ label: "context-tags-fallback", default: "default" })
    const scope = createScope()
    const parent = scope.createContext({ tags: [role("parent-one"), role("parent-two"), region("global")] })
    const child = scope.createContext({ parent, tags: role("child") })

    expect(child.tags.getMany(role)).toEqual(["child"])
    expect(child.tags.get(region)).toBeUndefined()
    expect(child.tags.seek(region)).toBe("global")
    expect(child.tags.seekMany(role)).toEqual(["child", "parent-one", "parent-two"])
    expect(child.tags.get(fallback)).toBeUndefined()
    expect(child.tags.seek(fallback)).toBeUndefined()

    parent.tags.set([role("parent-three"), role("parent-four")])
    expect(child.tags.seekMany(role)).toEqual(["child", "parent-three", "parent-four"])

    await child.close()
    await parent.close()
    await scope.dispose()
  })

  it("keeps presence separate from an undefined value", async () => {
    const value = tag<string | undefined>({ label: "context-tags-presence" })
    const scope = createScope()
    const ctx = scope.createContext()

    expect(ctx.tags.has(value)).toBe(false)
    ctx.tags.set(value(undefined))
    expect(ctx.tags.has(value)).toBe(true)
    expect(ctx.tags.get(value)).toBeUndefined()
    expect(ctx.tags.getMany(value)).toEqual([undefined])
    expect(ctx.tags.delete(value)).toBe(true)
    expect(ctx.tags.delete(value)).toBe(false)
    expect(ctx.tags.has(value)).toBe(false)

    await ctx.close()
    await scope.dispose()
  })

  it("watches one local family with initial delivery and equality suppression", async () => {
    const account = tag<{ id: string; version: number }>({
      label: "context-tags-watch-account",
      eq: (a, b) => a.id === b.id,
    })
    const other = tag<string>({ label: "context-tags-watch-other" })
    const scope = createScope()
    const parent = scope.createContext({ tags: account({ id: "parent", version: 1 }) })
    const child = scope.createContext({ parent, tags: account({ id: "child", version: 1 }) })
    const events: Array<readonly { id: string; version: number }[]> = []
    const stop = child.tags.watch(account, (values) => events.push(values), { initial: true })

    child.tags.set([account({ id: "child", version: 2 }), other("ignored")])
    parent.tags.set(account({ id: "parent-next", version: 2 }))
    child.tags.set([account({ id: "next", version: 1 }), account({ id: "last", version: 1 })])
    stop()
    child.tags.set(account({ id: "stopped", version: 1 }))

    expect(events).toEqual([
      [{ id: "child", version: 1 }],
      [{ id: "next", version: 1 }, { id: "last", version: 1 }],
    ])

    await child.close()
    await parent.close()
    await scope.dispose()
  })

  it("keeps stale watcher disposers idempotent", async () => {
    const marker = tag<number>({ label: "context-tags-idempotent-stop" })
    const scope = createScope()
    const ctx = scope.createContext()
    const first: number[][] = []
    const second: number[][] = []
    const stopFirst = ctx.tags.watch(marker, (values) => first.push([...values]))

    stopFirst()
    ctx.tags.watch(marker, (values) => second.push([...values]))
    stopFirst()
    ctx.tags.set(marker(1))

    expect(first).toEqual([])
    expect(second).toEqual([[1]])

    await ctx.close()
    await scope.dispose()
  })

  it("gives each watcher its own family snapshot", async () => {
    const marker = tag<number>({ label: "context-tags-listener-copy" })
    const scope = createScope()
    const ctx = scope.createContext()
    const second: number[][] = []

    ctx.tags.watch(marker, (values) => (values as number[]).push(999))
    ctx.tags.watch(marker, (values) => second.push([...values]))
    ctx.tags.set(marker(1))

    expect(second).toEqual([[1]])
    expect(ctx.tags.getMany(marker)).toEqual([1])

    await ctx.close()
    await scope.dispose()
  })

  it("queues reentrant writes and aggregates listener failures after committing", async () => {
    const marker = tag<number>({ label: "context-tags-reentrant" })
    const scope = createScope()
    const ctx = scope.createContext()
    const first = new Error("first listener")
    const second = new Error("second listener")
    const events: string[] = []

    ctx.tags.watch(marker, (values) => {
      events.push(`a:${values.join(",")}`)
      if (values[0] === 1) {
        ctx.tags.set(marker(2))
        throw first
      }
    })
    ctx.tags.watch(marker, (values) => {
      events.push(`b:${values.join(",")}`)
      if (values[0] === 1) throw second
    })

    let failure: unknown
    try {
      ctx.tags.set(marker(1))
    } catch (error) {
      failure = error
    }

    expect(failure).toBeInstanceOf(AggregateError)
    expect((failure as AggregateError).errors).toEqual([first, second])
    expect(events).toEqual(["a:1", "b:1", "a:2", "b:2"])
    expect(ctx.tags.get(marker)).toBe(2)

    await ctx.close()
    await scope.dispose()
  })

  it("queues writes made during initial delivery", async () => {
    const marker = tag<number>({ label: "context-tags-initial-reentrant" })
    const scope = createScope()
    const ctx = scope.createContext({ tags: marker(1) })
    const events: number[] = []
    let depth = 0
    let maxDepth = 0

    ctx.tags.watch(marker, (values) => {
      depth++
      maxDepth = Math.max(maxDepth, depth)
      events.push(values[0]!)
      if (values[0] === 1) ctx.tags.set(marker(2))
      depth--
    }, { initial: true })

    expect(events).toEqual([1, 2])
    expect(maxDepth).toBe(1)

    await ctx.close()
    await scope.dispose()
  })

  it("removes an initial watcher when its queued notification fails", async () => {
    const source = tag<number>({ label: "context-tags-initial-failure-source" })
    const target = tag<number>({ label: "context-tags-initial-failure-target" })
    const scope = createScope()
    const ctx = scope.createContext()

    ctx.tags.watch(source, () => { throw new Error("source failed") })

    expect(() => ctx.tags.watch(target, (values) => {
      ctx.tags.set(source(values[0] ?? -1))
    }, { initial: true })).toThrow("source failed")

    expect(() => ctx.tags.set(target(2))).not.toThrow()

    await ctx.close()
    await scope.dispose()
  })

  it("stops an unbounded reentrant notification loop", async () => {
    const marker = tag<number>({ label: "context-tags-infinite" })
    const scope = createScope()
    const ctx = scope.createContext()

    ctx.tags.watch(marker, (values) => ctx.tags.set(marker(values[0]! + 1)))

    expect(() => ctx.tags.set(marker(0))).toThrow("Context tag notification did not settle")

    await ctx.close()
    await scope.dispose()
  })

  it("stops a reentrant loop that grows its own watcher set", async () => {
    const marker = tag<number>({ label: "context-tags-infinite-fanout" })
    const scope = createScope()
    const ctx = scope.createContext()
    const grow = (): ((values: readonly number[]) => void) => (values) => {
      ctx.tags.watch(marker, grow())
      ctx.tags.set(marker(values[0]! + 1))
    }

    ctx.tags.watch(marker, grow())

    expect(() => ctx.tags.set(marker(0))).toThrow("Context tag notification did not settle")

    await scope.dispose()
  })

  it("gives each watch call its own subscription for a shared listener", async () => {
    const marker = tag<number>({ label: "context-tags-shared-listener" })
    const scope = createScope()
    const ctx = scope.createContext()
    const seen: number[][] = []
    const listener = (values: readonly number[]) => seen.push([...values])

    const stopFirst = ctx.tags.watch(marker, listener)
    ctx.tags.watch(marker, listener)
    stopFirst()
    ctx.tags.set(marker(1))

    expect(seen).toEqual([[1]])

    await ctx.close()
    await scope.dispose()
  })

  it("keeps watchers through close cleanup and drops them after settlement", async () => {
    const marker = tag<string>({ label: "context-tags-close" })
    const scope = createScope()
    const ctx = scope.createContext()
    const events: string[][] = []

    ctx.tags.watch(marker, (values) => events.push([...values]))
    ctx.onClose(() => ctx.tags.set(marker("closing")))

    await ctx.close()
    ctx.data.setTag(marker, "late")

    expect(events).toEqual([["closing"]])
    expect(() => ctx.tags.set(marker("closed"))).toThrow("ExecutionContext is closed")
    expect(() => ctx.tags.delete(marker)).toThrow("ExecutionContext is closed")
    expect(() => ctx.tags.watch(marker, () => {})).toThrow("ExecutionContext is closed")
    await scope.dispose()
  })

  it("keeps unopened tag storage closed after context close", async () => {
    const marker = tag<string>({ label: "context-tags-lazy-close" })
    const scope = createScope()
    const ctx = scope.createContext()

    await ctx.close()

    expect(() => ctx.tags.set(marker("closed"))).toThrow("ExecutionContext is closed")
    expect(() => ctx.tags.delete(marker)).toThrow("ExecutionContext is closed")
    expect(() => ctx.tags.watch(marker, () => {})).toThrow("ExecutionContext is closed")
    await scope.dispose()
  })

  it("allows unopened tag storage during close cleanup and finalizes it afterward", async () => {
    const marker = tag<string>({ label: "context-tags-lazy-close-cleanup" })
    const scope = createScope()
    const ctx = scope.createContext()

    ctx.onClose(() => ctx.tags.set(marker("closing")))

    await ctx.close()

    expect(ctx.tags.get(marker)).toBe("closing")
    expect(() => ctx.tags.set(marker("closed"))).toThrow("ExecutionContext is closed")
    await scope.dispose()
  })

  it("surfaces watcher failures from compatibility tag mutations after committing", async () => {
    const marker = tag<string>({ label: "context-tags-compat-failure" })
    const scope = createScope()
    const ctx = scope.createContext()

    ctx.tags.watch(marker, () => { throw new Error("watch failed") })

    expect(() => ctx.data.setTag(marker, "set")).toThrow("watch failed")
    expect(ctx.tags.get(marker)).toBe("set")
    expect(() => ctx.data.set(marker.key, "raw-set")).toThrow("watch failed")
    expect(ctx.tags.get(marker)).toBe("raw-set")
    expect(() => ctx.data.deleteTag(marker)).toThrow("watch failed")
    expect(ctx.tags.has(marker)).toBe(false)

    await ctx.close()
    await scope.dispose()
  })

  it("removes a failed initial watcher registration", async () => {
    const marker = tag<string>({ label: "context-tags-initial-failure" })
    const scope = createScope()
    const ctx = scope.createContext({ tags: marker("initial") })
    let calls = 0

    expect(() => ctx.tags.watch(marker, () => {
      calls++
      throw new Error("initial failed")
    }, { initial: true })).toThrow("initial failed")

    expect(() => ctx.tags.set(marker("next"))).not.toThrow()
    expect(calls).toBe(1)

    await ctx.close()
    await scope.dispose()
  })
})
