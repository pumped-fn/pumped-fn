import { describe, expect, expectTypeOf, it } from "vitest"
import { atom, controller, createScope, flow, preset, resource, tag, tags, typed } from "../src/index"
import type { Lite } from "../src/index"

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}

function abortable<T>(signal: AbortSignal, promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason)
      return
    }
    const abort = () => reject(signal.reason)
    signal.addEventListener("abort", abort, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener("abort", abort)
        resolve(value)
      },
      (error) => {
        signal.removeEventListener("abort", abort)
        reject(error)
      }
    )
  })
}

describe("ExecutionContext structured lifetime", () => {
  it("runs one owned boundary or keeps a managed boundary open side by side", async () => {
    const tenant = tag<string>({ label: "tenant" })
    const events: string[] = []
    const lease = resource({
      deps: { tenant: tags.required(tenant) },
      factory: (ctx, { tenant }) => {
        ctx.cleanup((target, value) => { target.push(`close:${value}`) }, events, tenant)
        return tenant
      },
    })
    const read = flow({
      deps: { lease },
      factory: (_ctx, { lease }) => lease,
    })
    const scope = createScope()

    const oneShot = scope.run({ flow: read, tags: [tenant("one-shot")] })
    expectTypeOf(oneShot).toEqualTypeOf<Promise<string>>()
    await expect(oneShot).resolves.toBe("one-shot")
    expect(events).toEqual(["close:one-shot"])

    const ctx = scope.createContext({ tags: [tenant("managed")] })
    await expect(ctx.exec({ flow: read })).resolves.toBe("managed")
    await expect(ctx.exec({ flow: read })).resolves.toBe("managed")
    expect(events).toEqual(["close:one-shot"])

    await ctx.close()
    expect(events).toEqual(["close:one-shot", "close:managed"])
    await scope.dispose()
  })

  it("runs one named operation with declared deps and explicit params", async () => {
    const factor = tag<number>({ label: "factor" })
    const events: string[] = []
    const targets: Lite.ExecTarget[] = []
    const inputs: unknown[] = []
    const lease = resource({
      factory: (ctx) => {
        events.push("open")
        ctx.cleanup((target) => { target.push("close") }, events)
        return 2
      },
    })
    const scope = createScope({
      extensions: [{
        name: "operation-target",
        wrapExec: async (next, target, ctx) => {
          targets.push(target)
          inputs.push(ctx.input)
          return next()
        },
      }],
    })

    const multiply = ({ lease, factor }: { lease: number; factor: number }, value: number) => lease * factor * value
    const output = scope.run({
      name: "multiply-once",
      deps: { lease, factor: tags.required(factor) },
      params: [4],
      tags: [factor(3)],
      fn: multiply,
    })

    expectTypeOf(output).toEqualTypeOf<Promise<number>>()
    await expect(output).resolves.toBe(24)
    expect(targets).toEqual([multiply])
    expect(inputs).toEqual([[4]])
    expect(events).toEqual(["open", "close"])
    await scope.dispose()
  })

  it("shares inline dependency execution across owned and managed boundaries", async () => {
    const tenant = tag<string>({ label: "inline-tenant" })
    const closes: string[] = []
    const lease = resource({
      deps: { tenant: tags.required(tenant) },
      factory: (ctx, { tenant }) => {
        ctx.cleanup((target, value) => { target.push(value) }, closes, tenant)
        return tenant
      },
    })
    const scope = createScope()

    const owned = scope.run({
      name: "owned-inline",
      deps: { lease },
      params: ["owned"],
      tags: [tenant("owned")],
      fn: ({ lease }, value) => `${lease}:${value}`,
    })
    expectTypeOf(owned).toEqualTypeOf<Promise<string>>()
    await expect(owned).resolves.toBe("owned:owned")
    expect(closes).toEqual(["owned"])

    const ctx = scope.createContext({ tags: [tenant("managed")] })
    const managed = ctx.exec({
      name: "managed-inline",
      deps: { lease },
      params: [2],
      fn: ({ lease }, value) => `${lease}:${value}`,
    })
    expectTypeOf(managed).toEqualTypeOf<Promise<string>>()
    await expect(managed).resolves.toBe("managed:2")
    expect(closes).toEqual(["owned"])

    await ctx.close()
    expect(closes).toEqual(["owned", "managed"])
    await scope.dispose()
  })

  it("rejects streaming results from an inline scalar operation", async () => {
    expectTypeOf<Lite.ExecDepsOptions<
      Record<string, never>,
      [boolean],
      string | AsyncIterable<string>
    >>().toEqualTypeOf<never>()
    expectTypeOf<Lite.ExecDepsOptions<
      Record<string, never>,
      [],
      AsyncIterator<string>
    >>().toEqualTypeOf<never>()
    expectTypeOf<Lite.ExecDepsOptions<
      Record<string, never>,
      [],
      AsyncGenerator<string, string>
    >>().toEqualTypeOf<never>()
    expectTypeOf<Lite.ExecDepsOptions<
      Record<string, never>,
      [],
      Generator<string>
    >>().toEqualTypeOf<never>()
    expectTypeOf<Lite.ExecDepsOptions<
      Record<string, never>,
      [],
      { next: () => number }
    >>().toEqualTypeOf<never>()
    const scope = createScope()

    await expect(Reflect.apply(scope.run, scope, [{
      name: "stream-once",
      deps: {},
      params: [],
      fn: () => ({
        async *[Symbol.asyncIterator]() {
          yield "value"
        },
      }),
    }])).rejects.toThrow("Flow returned an async iterable or iterator from a non-generator factory")
    await expect(Reflect.apply(scope.run, scope, [{
      name: "iterator-once",
      deps: {},
      params: [],
      fn: () => ({
        next: async () => ({ done: true, value: undefined }),
      }),
    }])).rejects.toThrow("Flow returned an async iterable or iterator from a non-generator factory")
    await expect(Reflect.apply(scope.run, scope, [{
      name: "function-stream-once",
      params: [],
      fn: async function* () {
        yield "value"
        return "done"
      },
    }])).rejects.toThrow("Flow returned an async iterable or iterator from a non-generator factory")
    await expect(Reflect.apply(scope.run, scope, [{
      name: "sync-generator-once",
      deps: {},
      params: [],
      fn: function* () {
        yield "value"
      },
    }])).rejects.toThrow("Flow returned an async iterable or iterator from a non-generator factory")
    await expect(Reflect.apply(scope.run, scope, [{
      name: "function-sync-generator-once",
      params: [],
      fn: function* () {
        yield "value"
      },
    }])).rejects.toThrow("Flow returned an async iterable or iterator from a non-generator factory")
    await expect(Reflect.apply(scope.run, scope, [{
      name: "next-bearing-once",
      deps: {},
      params: [],
      fn: () => ({ next: () => 1 }),
    }])).rejects.toThrow("Flow returned an async iterable or iterator from a non-generator factory")
    await scope.dispose()
  })

  it("fails inline operation activation before calling the function", async () => {
    const required = tag<string>({ label: "operation-required" })
    let called = false
    const scope = createScope()

    await expect(scope.run({
      name: "requires-binding",
      deps: { required: tags.required(required) },
      params: [{ mark: () => { called = true } }],
      fn: (_deps, state) => {
        state.mark()
        return "unreachable"
      },
    })).rejects.toThrow('Tag "operation-required" not found while activating "requires-binding"')
    expect(called).toBe(false)
    await scope.dispose()
  })

  it("keeps inline activation and caller cancellation inside the extension pipeline", async () => {
    const closes: Lite.CloseResult[] = []
    const never = deferred<string>()
    const signal = resource({
      ownership: "current",
      factory: (ctx) => {
        ctx.onClose((result, target) => { target.push(result) }, closes)
        return ctx.signal
      },
    })
    const abort = atom({ factory: () => abortable })
    const targets: Lite.ExecTarget[] = []
    const scope = createScope({
      extensions: [{
        name: "inline-observer",
        wrapExec: async (next, target) => {
          targets.push(target)
          return next()
        },
      }],
    })
    const ctx = scope.createContext()
    const caller = new AbortController()
    const wait = (
      { signal, abort }: { signal: AbortSignal; abort: typeof abortable },
      pending: Promise<string>
    ) => abort(signal, pending)
    const running = ctx.exec({
      name: "inline-wait",
      deps: { signal, abort },
      params: [never.promise],
      signal: caller.signal,
      fn: wait,
    })
    const reason = new Error("caller stopped")

    caller.abort(reason)
    await expect(running).rejects.toBe(reason)
    expect(targets).toEqual([wait])
    expect(closes).toEqual([{ ok: false, error: reason, aborted: true }])

    await ctx.close()
    await scope.dispose()
  })

  it("closes scope.run failures with the failed result", async () => {
    const closes: Lite.CloseResult[] = []
    const lease = resource({
      factory: (ctx) => {
        ctx.onClose((result, target) => { target.push(result) }, closes)
        return "lease"
      },
    })
    const fail = flow({
      deps: { lease },
      factory: () => { throw new Error("failed") },
    })
    const scope = createScope()

    await expect(scope.run({ flow: fail })).rejects.toThrow("failed")
    expect(closes).toEqual([{ ok: false, error: expect.any(Error) }])
    await scope.dispose()
  })

  it("seeds scope.run tags once and keeps them above flow defaults", async () => {
    const value = tag<string>({ label: "value" })
    const read = flow({
      tags: [value("flow")],
      deps: { values: tags.all(value) },
      factory: (_ctx, { values }) => values,
    })
    const scope = createScope()

    await expect(scope.run({ flow: read, tags: [value("run")] })).resolves.toEqual(["run"])
    await scope.dispose()
  })

  it("joins caller cancellation to the scope.run owner boundary", async () => {
    const started = deferred()
    const lease = resource({
      factory: (ctx) => new Promise<string>((_resolve, reject) => {
        const abort = () => reject(ctx.signal.reason)
        ctx.signal.addEventListener("abort", abort, { once: true })
        ctx.cleanup((signal, listener) => signal.removeEventListener("abort", listener), ctx.signal, abort)
        started.resolve()
      }),
    })
    const read = flow({
      deps: { lease },
      factory: (_ctx, { lease }) => lease,
    })
    const scope = createScope()
    const caller = new AbortController()
    const pending = scope.run({ flow: read, signal: caller.signal })
    const error = new Error("cancelled")

    await started.promise
    caller.abort(error)

    await expect(pending).rejects.toBe(error)
    await scope.dispose()
  })

  it("passes inferred resource cleanup dependencies", async () => {
    const events: string[] = []
    const backend = resource({
      ownership: "current",
      factory: (ctx) => {
        ctx.cleanup((target, value) => { target.push(value) }, events, "released")
        return "ready"
      },
    })
    const run = flow({
      deps: { backend },
      factory: (_ctx, { backend }) => backend,
    })
    const scope = createScope()
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: run })).resolves.toBe("ready")
    expect(events).toEqual(["released"])

    await ctx.close()
    await scope.dispose()
  })

  it("passes only explicit parameters to lifecycle callbacks", async () => {
    const cleanupArgs: unknown[][] = []
    const closeArgs: unknown[][] = []
    const token = { id: "lease" }
    const backend = resource({
      ownership: "current",
      factory: (ctx) => {
        ctx.cleanup((...args) => { cleanupArgs.push(args) }, token)
        return "ready"
      },
    })
    const run = flow({
      deps: { backend },
      factory: (ctx, { backend }) => {
        ctx.onClose((...args) => { closeArgs.push(args) }, token)
        return backend
      },
    })
    const scope = createScope()
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: run })).resolves.toBe("ready")
    await ctx.close()

    expect(cleanupArgs).toEqual([[token]])
    expect(closeArgs).toEqual([[{ ok: true }, token]])
    await scope.dispose()
  })

  it("exposes the effective signal and isolates targeted caller cancellation", async () => {
    const startedA = deferred()
    const startedB = deferred()
    const releaseB = deferred()
    const never = deferred()
    const closes: Lite.CloseResult[] = []
    const run = flow({
      parse: typed<{ id: string; started: typeof startedA; release: typeof never }>(),
      factory: async (ctx) => {
        const input = ctx.input
        ctx.onClose((result) => {
          if (input.id === "a") closes.push(result)
        })
        input.started.resolve()
        await abortable(ctx.signal, input.release.promise)
        return input.id
      },
    })
    const scope = createScope()
    const a = scope.createContext()
    const b = scope.createContext()
    const caller = new AbortController()

    expectTypeOf(a.signal).toEqualTypeOf<AbortSignal>()
    const pendingA = a.exec({
      flow: run,
      input: { id: "a", started: startedA, release: never },
      signal: caller.signal,
    })
    const rejectedA = pendingA.catch((error) => error)
    const pendingB = b.exec({
      flow: run,
      input: { id: "b", started: startedB, release: releaseB },
    })

    await Promise.all([startedA.promise, startedB.promise])
    const reason = new Error("caller stopped")
    caller.abort(reason)

    expect(await rejectedA).toBe(reason)
    expect(closes).toEqual([{ ok: false, error: reason, aborted: true }])
    expect(a.signal.aborted).toBe(false)
    expect(b.signal.aborted).toBe(false)
    releaseB.resolve()
    await expect(pendingB).resolves.toBe("b")

    await Promise.all([a.close(), b.close()])
    await scope.dispose()
  })

  it("replays a signal-free parent close through descendants before signal access", async () => {
    const scope = createScope()
    const parent = scope.createContext()
    const child = scope.createContext({ parent })
    const grandchild = scope.createContext({ parent: child })

    await parent.close()

    expect(grandchild.signal.aborted).toBe(true)
    expect(grandchild.signal.reason).toMatchObject({
      name: "AbortError",
      message: "Execution context closed",
    })
    expect(child.signal.reason).toBe(parent.signal.reason)
    expect(grandchild.signal.reason).toBe(parent.signal.reason)
    await scope.dispose()
  })

  it("composes an explicit caller signal after a signal-free parent", async () => {
    const scope = createScope()
    const parent = scope.createContext()
    const caller = new AbortController()
    const child = scope.createContext({ parent, signal: caller.signal })
    const signal = child.signal

    await parent.close()

    expect(signal.aborted).toBe(true)
    expect(signal.reason).toMatchObject({
      name: "AbortError",
      message: "Execution context closed",
    })
    const reason = signal.reason
    caller.abort(new Error("caller too late"))
    expect(signal.reason).toBe(reason)
    await scope.dispose()
  })

  it("aborts nested descendants before joining and cleans parent resources last", async () => {
    const events: string[] = []
    const started = deferred()
    const never = deferred()
    const parent = resource({
      factory: (ctx) => {
        ctx.cleanup(() => {
          events.push("parent-resource-cleanup")
        })
        return "parent"
      },
    })
    const inner = flow({
      factory: async (ctx) => {
        ctx.onClose((result) => {
          events.push(`inner:${!result.ok && result.aborted === true}`)
        })
        started.resolve()
        await abortable(ctx.signal, never.promise)
      },
    })
    const middle = flow({
      factory: async (ctx) => {
        ctx.onClose((result) => {
          events.push(`middle:${!result.ok && result.aborted === true}`)
        })
        return ctx.exec({ flow: inner })
      },
    })
    const outer = flow({
      factory: async (ctx) => {
        ctx.onClose((result) => {
          events.push(`outer:${!result.ok && result.aborted === true}`)
        })
        return ctx.exec({ flow: middle })
      },
    })
    const scope = createScope()
    const ctx = scope.createContext()
    await ctx.resolve(parent)
    const pending = ctx.exec({ flow: outer })
    const rejected = pending.catch((error) => error)

    await started.promise
    await ctx.close()

    expect((await rejected).name).toBe("AbortError")
    expect(events).toEqual([
      "inner:true",
      "middle:true",
      "outer:true",
      "parent-resource-cleanup",
    ])
    await scope.dispose()
  })

  it("returns active stream iterators before parent resource cleanup", async () => {
    const events: string[] = []
    const started = deferred()
    const never = deferred()
    const parent = resource({
      factory: (ctx) => {
        ctx.cleanup(() => {
          events.push("parent-resource-cleanup")
        })
        return "parent"
      },
    })
    const read = flow({
      factory: async function* (ctx) {
        ctx.onClose((result) => {
          events.push(`stream-close:${!result.ok && result.aborted === true}`)
        })
        try {
          started.resolve()
          await abortable(ctx.signal, never.promise)
          yield 1
        } finally {
          events.push("producer-finally")
        }
      },
    })
    const scope = createScope()
    const ctx = scope.createContext()
    await ctx.resolve(parent)
    const stream = ctx.execStream({ flow: read })
    const next = stream[Symbol.asyncIterator]().next()
    const rejectedNext = next.catch((error) => error)

    await started.promise
    await ctx.close()

    expect((await rejectedNext).name).toBe("AbortError")
    await expect(stream.result).rejects.toMatchObject({ name: "AbortError" })
    expect(events).toEqual([
      "producer-finally",
      "stream-close:true",
      "parent-resource-cleanup",
    ])
    await scope.dispose()
  })

  it("waits for uncooperative work before cleaning parent resources", async () => {
    const events: string[] = []
    const started = deferred()
    const release = deferred()
    const parent = resource({
      factory: (ctx) => {
        ctx.cleanup(() => {
          events.push("parent-resource-cleanup")
        })
        return "parent"
      },
    })
    const run = flow({
      factory: async (ctx) => {
        ctx.signal.addEventListener("abort", () => {
          events.push("child-aborted")
        }, { once: true })
        started.resolve()
        await release.promise
        events.push("child-finished")
      },
    })
    const scope = createScope()
    const ctx = scope.createContext()
    await ctx.resolve(parent)
    const pending = ctx.exec({ flow: run })
    let closed = false

    const closing = ctx.close().then(() => {
      closed = true
    })
    await started.promise
    await Promise.resolve()

    expect(closed).toBe(false)
    expect(events).toEqual(["child-aborted"])
    release.resolve()
    await Promise.all([pending, closing])
    expect(events).toEqual(["child-aborted", "child-finished", "parent-resource-cleanup"])
    await scope.dispose()
  })

  it("owns default resources at the nearest execution boundary", async () => {
    const events: string[] = []
    const backend = resource({
      factory: (ctx) => {
        events.push("resolve")
        ctx.cleanup(() => {
          events.push("cleanup")
        })
        return "ready"
      },
    })
    const inner = flow({
      deps: { backend },
      factory: (_ctx, { backend }) => backend,
    })
    const middle = flow({
      factory: (ctx) => ctx.exec({ flow: inner }),
    })
    const outer = flow({
      factory: async (ctx) => [
        await ctx.exec({ flow: middle }),
        await ctx.exec({ flow: middle }),
      ],
    })
    const scope = createScope()
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: outer })).resolves.toEqual(["ready", "ready"])
    expect(events).toEqual(["resolve"])

    await ctx.close()
    expect(events).toEqual(["resolve", "cleanup"])
    await scope.dispose()
  })

  it("waits for direct resource resolution before cleanup", async () => {
    const events: string[] = []
    const started = deferred()
    const release = deferred()
    const backend = resource({
      factory: async (ctx) => {
        started.resolve()
        await release.promise
        ctx.cleanup(() => {
          events.push("cleanup")
        })
        return "ready"
      },
    })
    const scope = createScope()
    const ctx = scope.createContext()
    const resolving = ctx.resolve(backend)
    await started.promise
    let closed = false
    const closing = ctx.close().then(() => {
      closed = true
    })

    await Promise.resolve()
    expect(closed).toBe(false)
    release.resolve()
    await expect(resolving).resolves.toBe("ready")
    await closing
    expect(events).toEqual(["cleanup"])
    await scope.dispose()
  })

  it("classifies cancellation without replacing unrelated errors", async () => {
    const scope = createScope()

    const identityStarted = deferred()
    const identityNever = deferred()
    const identityCloses: Lite.CloseResult[] = []
    const identity = flow({
      factory: async (ctx) => {
        ctx.onClose((result) => {
          identityCloses.push(result)
        })
        identityStarted.resolve()
        await abortable(ctx.signal, identityNever.promise)
      },
    })
    const identityCtx = scope.createContext()
    const identityCaller = new AbortController()
    const identityPending = identityCtx.exec({ flow: identity, signal: identityCaller.signal })
    const identityRejected = identityPending.catch((error) => error)
    await identityStarted.promise
    const reason = new Error("identity")
    identityCaller.abort(reason)
    expect(await identityRejected).toBe(reason)
    expect(identityCloses[0]).toEqual({ ok: false, error: reason, aborted: true })

    const namedStarted = deferred()
    const namedNever = deferred()
    const namedCloses: Lite.CloseResult[] = []
    const named = flow({
      factory: async (ctx) => {
        ctx.onClose((result) => {
          namedCloses.push(result)
        })
        namedStarted.resolve()
        try {
          await abortable(ctx.signal, namedNever.promise)
        } catch {
          throw new DOMException("adapter stopped", "AbortError")
        }
      },
    })
    const namedCtx = scope.createContext()
    const namedCaller = new AbortController()
    const namedPending = namedCtx.exec({ flow: named, signal: namedCaller.signal })
    const namedRejected = namedPending.catch((error) => error)
    await namedStarted.promise
    namedCaller.abort(new Error("owner stopped"))
    const namedError = await namedRejected
    expect(namedError.name).toBe("AbortError")
    expect(namedCloses[0]).toEqual({ ok: false, error: namedError, aborted: true })

    const unrelatedStarted = deferred()
    const unrelatedNever = deferred()
    const unrelatedCloses: Lite.CloseResult[] = []
    const unrelatedError = new Error("database failed")
    const unrelated = flow({
      factory: async (ctx) => {
        ctx.onClose((result) => {
          unrelatedCloses.push(result)
        })
        unrelatedStarted.resolve()
        try {
          await abortable(ctx.signal, unrelatedNever.promise)
        } catch {
          throw unrelatedError
        }
      },
    })
    const unrelatedCtx = scope.createContext()
    const unrelatedCaller = new AbortController()
    const unrelatedPending = unrelatedCtx.exec({ flow: unrelated, signal: unrelatedCaller.signal })
    const unrelatedRejected = unrelatedPending.catch((error) => error)
    await unrelatedStarted.promise
    unrelatedCaller.abort(new DOMException("closed", "AbortError"))
    expect(await unrelatedRejected).toBe(unrelatedError)
    expect(unrelatedCloses[0]).toEqual({ ok: false, error: unrelatedError })

    const earlyCloses: Lite.CloseResult[] = []
    const earlyError = new DOMException("too early", "AbortError")
    const early = flow({
      factory: (ctx) => {
        ctx.onClose((result) => {
          earlyCloses.push(result)
        })
        throw earlyError
      },
    })
    const earlyCtx = scope.createContext()
    expect(await earlyCtx.exec({ flow: early }).catch((error) => error)).toBe(earlyError)
    expect(earlyCloses[0]).toEqual({ ok: false, error: earlyError })

    await Promise.all([
      identityCtx.close(),
      namedCtx.close(),
      unrelatedCtx.close(),
      earlyCtx.close(),
    ])
    await scope.dispose()
  })
})

describe("declared flow tree activation", () => {
  it("activates direct and tag-carried subtrees while controller edges remain execution boundaries", async () => {
    const events: string[] = []
    const targets: Lite.ExecTarget[] = []
    let childFactoryCount = 0
    const config = tag<string>({ label: "activation-config" })
    const directState = atom({
      factory: () => {
        events.push("direct-state")
        return 1
      },
    })
    const controlledState = atom({
      factory: () => {
        events.push("controlled-state")
        return 2
      },
    })
    const taggedState = atom({
      factory: () => {
        events.push("tagged-state")
        return 3
      },
    })
    const direct = flow({
      deps: { state: directState, config: tags.required(config) },
      factory: () => {
        childFactoryCount++
        return "direct"
      },
    })
    const controlled = flow({
      deps: { state: controlledState },
      factory: () => {
        childFactoryCount++
        return "controlled"
      },
    })
    const tagged = flow({
      deps: { state: taggedState },
      factory: () => {
        childFactoryCount++
        return "tagged"
      },
    })
    const implementor = tag<typeof tagged>({ label: "activation-implementor" })
    const entry = flow({
      deps: {
        direct,
        controlled: controller(controlled),
        tagged: tags.required(implementor),
      },
      factory: () => "entry",
    })
    const scope = createScope({
      tags: [config("configured"), implementor(tagged)],
      extensions: [{
        name: "activation-targets",
        wrapExec: async (next, target) => {
          targets.push(target)
          return next()
        },
      }],
    })
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: entry })).resolves.toBe("entry")
    expect(new Set(events)).toEqual(new Set(["direct-state", "tagged-state"]))
    expect(scope.controller(controlledState).state).toBe("idle")
    expect(childFactoryCount).toBe(0)
    expect(targets).toEqual([entry])

    await ctx.close()
    await scope.dispose()
  })

  it("uses flow presets as the scope seam for subtree activation", async () => {
    const missing = tag<string>({ label: "preset-original-missing" })
    const originalState = atom({ factory: () => "original" })
    const replacementState = atom({ factory: () => "replacement" })
    let originalFactoryCount = 0
    let replacementFactoryCount = 0
    const original = flow({
      deps: { state: originalState, missing: tags.required(missing) },
      factory: () => {
        originalFactoryCount++
        return "original"
      },
    })
    const replacement = flow({
      deps: { state: replacementState },
      factory: () => {
        replacementFactoryCount++
        return "replacement"
      },
    })
    const entry = flow({
      deps: { child: original },
      factory: () => "entry",
    })
    const scope = createScope({ presets: [preset(original, replacement)] })
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: entry })).resolves.toBe("entry")
    expect(scope.controller(originalState).state).toBe("idle")
    expect(scope.controller(replacementState).state).toBe("resolved")
    expect(originalFactoryCount).toBe(0)
    expect(replacementFactoryCount).toBe(0)

    await ctx.close()
    await scope.dispose()
  })

  it("uses declared controller tags when the child execution activates nested tag-carried flows", async () => {
    let implementorFactoryCount = 0
    const state = atom({ factory: () => "ready" })
    const implementor = flow({
      deps: { state },
      factory: () => {
        implementorFactoryCount++
        return "implemented"
      },
    })
    const role = tag<typeof implementor>({ label: "activation-role" })
    const child = flow({
      deps: { implementor: tags.required(role) },
      factory: () => "child",
    })
    const entry = flow({
      deps: { child: controller(child, { tags: [role(implementor)] }) },
      factory: (_ctx, { child }) => child.exec(),
    })
    const scope = createScope()
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: entry })).resolves.toBe("child")
    expect(scope.controller(state).state).toBe("resolved")
    expect(implementorFactoryCount).toBe(0)

    await ctx.close()
    await scope.dispose()
  })

  it("prepares a controller child in an isolated tagged lifetime", async () => {
    const events: string[] = []
    const config = tag<string>({ label: "prepared-config" })
    let childFactoryCount = 0
    const backend = resource({
      ownership: "current",
      deps: { config: tags.required(config) },
      factory: (ctx, { config }) => {
        events.push(`resolve:${config}`)
        ctx.cleanup(() => {
          events.push(`cleanup:${config}`)
        })
        return config
      },
    })
    const child = flow({
      tags: [config("static")],
      deps: { backend },
      factory: (_ctx, { backend }) => {
        childFactoryCount++
        events.push(`execute:${backend}`)
        return backend
      },
    })
    const entry = flow({
      deps: { child: controller(child) },
      factory: async (_ctx, { child }) => {
        const invocation = child.prepare({ tags: [config("isolated")] })
        await invocation.ready
        const before = { childFactoryCount, events: [...events] }
        return { before, output: await invocation.exec() }
      },
    })
    const scope = createScope()
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: entry })).resolves.toEqual({
      before: { childFactoryCount: 0, events: ["resolve:isolated"] },
      output: "isolated",
    })
    expect(events).toEqual(["resolve:isolated", "execute:isolated", "cleanup:isolated"])
    expect(childFactoryCount).toBe(1)

    await ctx.close()
    await scope.dispose()
  })

  it("rejects controller readiness before execution when a required tag is missing", async () => {
    const missing = tag<string>({ label: "prepared-required" })
    let childFactoryCount = 0
    const backend = resource({
      ownership: "current",
      deps: { missing: tags.required(missing) },
      factory: (_ctx, { missing }) => missing,
    })
    const child = flow({
      deps: { backend },
      factory: () => {
        childFactoryCount++
        return "child"
      },
    })
    const entry = flow({
      deps: { child: controller(child) },
      factory: async (_ctx, { child }) => child.prepare().ready,
    })
    const scope = createScope()
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: entry })).rejects.toThrow('Tag "prepared-required" not found')
    expect(childFactoryCount).toBe(0)

    await ctx.close()
    await scope.dispose()
  })

  it("aborts and cleans a prepared stream when its consumer returns", async () => {
    const events: string[] = []
    const never = deferred()
    let preparedResult!: Promise<void>
    const backend = resource({
      ownership: "current",
      factory: (ctx) => {
        ctx.cleanup(() => {
          events.push("backend-cleanup")
        })
        return "ready"
      },
    })
    const child = flow({
      deps: { backend },
      factory: async function* (ctx, { backend }) {
        try {
          yield backend
          await abortable(ctx.signal, never.promise)
        } finally {
          events.push("producer-finally")
        }
      },
    })
    const entry = flow({
      deps: { child: controller(child) },
      factory: async function* (_ctx, { child }) {
        const invocation = child.prepare()
        await invocation.ready
        const stream = invocation.execStream()
        const iterator = stream[Symbol.asyncIterator]()
        preparedResult = stream.result
        try {
          for (;;) {
            const step = await iterator.next()
            if (step.done) return step.value
            yield step.value
          }
        } finally {
          await iterator.return?.()
        }
      },
    })
    const scope = createScope()
    const ctx = scope.createContext()
    const stream = ctx.execStream({ flow: entry })
    const iterator = stream[Symbol.asyncIterator]()

    await expect(iterator.next()).resolves.toEqual({ done: false, value: "ready" })
    await iterator.return?.()
    await expect(preparedResult).rejects.toMatchObject({ name: "AbortError" })
    expect(events).toEqual(["producer-finally", "backend-cleanup"])

    await ctx.close()
    await scope.dispose()
  })

  it("fails entry activation when a nested required tag is missing", async () => {
    const missing = tag<string>({ label: "nested-required" })
    let entryFactoryCount = 0
    const child = flow({
      deps: { missing: tags.required(missing) },
      factory: () => "child",
    })
    const entry = flow({
      deps: { child },
      factory: () => {
        entryFactoryCount++
        return "entry"
      },
    })
    const scope = createScope()
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: entry })).rejects.toThrow('Tag "nested-required" not found')
    expect(entryFactoryCount).toBe(0)

    await ctx.close()
    await scope.dispose()
  })

  it("rejects circular declared flow trees without executing factories", async () => {
    let factoryCount = 0
    let left!: Lite.Flow<string, void>
    let right!: Lite.Flow<string, void>
    left = flow({
      deps: { right: undefined as unknown as Lite.Flow<string, void> },
      factory: () => {
        factoryCount++
        return "left"
      },
    })
    right = flow({
      deps: { left },
      factory: () => {
        factoryCount++
        return "right"
      },
    })
    Object.assign(left.deps!, { right })
    const scope = createScope()
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: left })).rejects.toThrow("Circular flow dependency detected")
    expect(factoryCount).toBe(0)

    await ctx.close()
    await scope.dispose()
  })
})
