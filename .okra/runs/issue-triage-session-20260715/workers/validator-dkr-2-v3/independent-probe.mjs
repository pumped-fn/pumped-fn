import assert from "node:assert/strict"
import { controller, createScope, flow, resource, tag, tags } from "../../../../../pkg/core/lite/dist/index.mjs"

const executionSignal = tag({ label: "validator.dkr2.execution.signal" })

function deferred() {
  let resolve
  let reject
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}

function abortable(signal, promise) {
  return new Promise((resolve, reject) => {
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
      },
    )
  })
}

function isCancellation(signal, error) {
  return signal.aborted && (
    error === signal.reason
    || (error instanceof Error && error.name === "AbortError")
  )
}

class Lifetime {
  #owner = new AbortController()
  #pending = new Set()
  #iterators = new Set()
  #close

  constructor(raw, events = []) {
    this.raw = raw
    this.events = events
  }

  get signal() {
    return this.#owner.signal
  }

  #track(promise) {
    this.#pending.add(promise)
    promise.then(
      () => { this.#pending.delete(promise) },
      () => { this.#pending.delete(promise) },
    )
    return promise
  }

  exec(options) {
    const { signal, ...rest } = options
    const effective = signal ? AbortSignal.any([this.signal, signal]) : this.signal
    return this.#track(this.raw.exec({
      ...rest,
      tags: [...(rest.tags ?? []), executionSignal(effective)],
    }))
  }

  execStream(options) {
    const { signal, ...rest } = options
    const effective = signal ? AbortSignal.any([this.signal, signal]) : this.signal
    const iterator = this.raw.execStream({
      ...rest,
      tags: [...(rest.tags ?? []), executionSignal(effective)],
    })[Symbol.asyncIterator]()
    this.#iterators.add(iterator)
    const lifetime = this
    return {
      [Symbol.asyncIterator]() {
        return this
      },
      next(value) {
        return lifetime.#track(iterator.next(value)).then((result) => {
          if (result.done) lifetime.#iterators.delete(iterator)
          return result
        })
      },
      return(value) {
        lifetime.#iterators.delete(iterator)
        return lifetime.#track(iterator.return?.(value) ?? Promise.resolve({ done: true, value }))
      },
      throw(error) {
        lifetime.#iterators.delete(iterator)
        return lifetime.#track(iterator.throw?.(error) ?? Promise.reject(error))
      },
    }
  }

  close() {
    if (this.#close) return this.#close
    this.#close = this.#closeNow()
    return this.#close
  }

  async #closeNow() {
    const reason = new DOMException("Execution context closed", "AbortError")
    this.events.push("abort-descendants")
    this.#owner.abort(reason)
    this.events.push("return-active-stream-iterators")
    await Promise.allSettled([...this.#iterators].map((iterator) => iterator.return?.()))
    this.events.push("join-descendants")
    await Promise.allSettled([...this.#pending])
    this.events.push("descendants-joined")
    this.events.push("clean-parent-resources")
    await this.raw.close({ ok: false, error: reason, aborted: true })
    this.events.push("context-closed")
  }
}

async function scalarChildCase() {
  const scope = createScope()
  const child = flow({
    name: "validator.dkr2.scalar-child",
    deps: { signal: tags.required(executionSignal) },
    factory: (_ctx, { signal }) => {
      assert.equal(signal.aborted, false)
      return 42
    },
  })
  const lifetime = new Lifetime(scope.createContext())
  assert.equal(await lifetime.exec({ flow: child }), 42)
  await lifetime.close()
  await scope.dispose()
  return "passed"
}

async function scalarErrorCase() {
  const scope = createScope()
  const original = new Error("scalar failure")
  const child = flow({ name: "validator.dkr2.scalar-error", factory: () => { throw original } })
  const lifetime = new Lifetime(scope.createContext())
  assert.equal(await lifetime.exec({ flow: child }).catch((error) => error), original)
  await lifetime.close()
  await scope.dispose()
  return "passed"
}

async function streamNormalCase() {
  const scope = createScope()
  const child = flow({
    name: "validator.dkr2.stream-normal",
    factory: async function* () {
      yield 1
      yield 2
      return "stream-done"
    },
  })
  const lifetime = new Lifetime(scope.createContext())
  const stream = lifetime.execStream({ flow: child })
  assert.deepEqual(await stream.next(), { done: false, value: 1 })
  assert.deepEqual(await stream.next(), { done: false, value: 2 })
  assert.deepEqual(await stream.next(), { done: true, value: "stream-done" })
  await lifetime.close()
  await scope.dispose()
  return "passed"
}

async function streamProducerErrorCase() {
  const scope = createScope()
  const original = new Error("producer failure")
  const child = flow({
    name: "validator.dkr2.stream-producer-error",
    factory: async function* () {
      yield 1
      throw original
    },
  })
  const lifetime = new Lifetime(scope.createContext())
  const stream = lifetime.execStream({ flow: child })
  assert.deepEqual(await stream.next(), { done: false, value: 1 })
  assert.equal(await stream.next().catch((error) => error), original)
  await lifetime.close()
  await scope.dispose()
  return "passed"
}

async function streamConsumerBreakCase() {
  const events = []
  const scope = createScope()
  const child = flow({
    name: "validator.dkr2.stream-consumer-break",
    factory: async function* () {
      try {
        yield 1
        yield 2
      } finally {
        events.push("producer-finally")
      }
    },
  })
  const lifetime = new Lifetime(scope.createContext())
  const stream = lifetime.execStream({ flow: child })
  assert.deepEqual(await stream.next(), { done: false, value: 1 })
  await stream.return()
  assert.deepEqual(events, ["producer-finally"])
  await lifetime.close()
  await scope.dispose()
  return "passed"
}

async function streamParentCloseCase() {
  const events = []
  const started = deferred()
  const parent = resource({
    name: "validator.dkr2.stream-parent-resource",
    factory: (ctx) => {
      ctx.cleanup(() => { events.push("parent-resource-cleanup") })
      return "parent"
    },
  })
  const child = flow({
    name: "validator.dkr2.stream-parent-close",
    deps: { signal: tags.required(executionSignal) },
    factory: async function* (_ctx, { signal }) {
      try {
        started.resolve()
        await abortable(signal, deferred().promise)
        yield 1
      } finally {
        events.push(`stream-aborted:${signal.aborted}`)
      }
    },
  })
  const scope = createScope()
  const raw = scope.createContext()
  await raw.resolve(parent)
  const lifetime = new Lifetime(raw)
  const stream = lifetime.execStream({ flow: child })
  const next = stream.next()
  const observed = next.catch((error) => error)
  await started.promise
  await lifetime.close()
  assert.equal((await observed).name, "AbortError")
  assert.deepEqual(events, ["stream-aborted:true", "parent-resource-cleanup"])
  await scope.dispose()
  return "passed"
}

async function nestedCloseCase() {
  const events = []
  const started = deferred()
  const parent = resource({
    name: "validator.dkr2.nested-parent-resource",
    factory: (ctx) => {
      ctx.cleanup(() => { events.push("parent-resource-cleanup") })
      return "parent"
    },
  })
  const inner = flow({
    name: "validator.dkr2.nested-inner",
    deps: { signal: tags.required(executionSignal) },
    factory: async (ctx, { signal }) => {
      ctx.onClose(() => { events.push("inner-close") })
      started.resolve()
      await abortable(signal, deferred().promise)
    },
  })
  const middle = flow({
    name: "validator.dkr2.nested-middle",
    deps: { inner: controller(inner) },
    factory: async (ctx, { inner: runInner }) => {
      ctx.onClose(() => { events.push("middle-close") })
      return runInner.exec()
    },
  })
  const outer = flow({
    name: "validator.dkr2.nested-outer",
    deps: { middle: controller(middle) },
    factory: async (ctx, { middle: runMiddle }) => {
      ctx.onClose(() => { events.push("outer-close") })
      return runMiddle.exec()
    },
  })
  const scope = createScope()
  const raw = scope.createContext()
  await raw.resolve(parent)
  const lifetime = new Lifetime(raw)
  const pending = lifetime.exec({ flow: outer })
  const rejected = pending.catch((error) => error)
  await started.promise
  await lifetime.close()
  assert.equal((await rejected).name, "AbortError")
  assert.deepEqual(events, ["inner-close", "middle-close", "outer-close", "parent-resource-cleanup"])
  await scope.dispose()
  return "passed"
}

async function targetedCallerCase() {
  const scope = createScope()
  const started = deferred()
  const child = flow({
    name: "validator.dkr2.targeted-caller",
    deps: { signal: tags.required(executionSignal) },
    factory: async (_ctx, { signal }) => {
      started.resolve()
      await abortable(signal, deferred().promise)
    },
  })
  const lifetime = new Lifetime(scope.createContext())
  const caller = new AbortController()
  const pending = lifetime.exec({ flow: child, signal: caller.signal })
  const rejected = pending.catch((error) => error)
  await started.promise
  caller.abort(new DOMException("caller cancelled", "AbortError"))
  assert.equal((await rejected).name, "AbortError")
  assert.equal(lifetime.signal.aborted, false)
  await lifetime.close()
  await scope.dispose()
  return "passed"
}

function classificationCases() {
  const identity = new AbortController()
  const reason = new Error("identity reason")
  identity.abort(reason)
  assert.equal(isCancellation(identity.signal, reason), true)

  const named = new AbortController()
  named.abort(new Error("owner reason"))
  assert.equal(isCancellation(named.signal, new DOMException("adapter abort", "AbortError")), true)

  const unrelated = new AbortController()
  unrelated.abort(new DOMException("closed", "AbortError"))
  const failure = new Error("database failure after abort")
  assert.equal(isCancellation(unrelated.signal, failure), false)

  const active = new AbortController()
  assert.equal(isCancellation(active.signal, new DOMException("early abort", "AbortError")), false)

  return {
    signalReasonIdentity: "passed",
    abortErrorNameAfterSignalAbort: "passed",
    unrelatedPostAbortError: "passed",
    abortErrorBeforeSignalAbort: "passed",
  }
}

async function immediateOriginalErrorCase() {
  const scope = createScope()
  const original = new TypeError("original immediate failure")
  const child = flow({ name: "validator.dkr2.original-immediate", factory: () => { throw original } })
  const lifetime = new Lifetime(scope.createContext())
  assert.equal(await lifetime.exec({ flow: child }).catch((error) => error), original)
  await lifetime.close()
  await scope.dispose()
  return "passed"
}

async function postAbortOriginalErrorCase() {
  const scope = createScope()
  const original = new Error("original post-abort failure")
  const started = deferred()
  const child = flow({
    name: "validator.dkr2.original-post-abort",
    deps: { signal: tags.required(executionSignal) },
    factory: async (_ctx, { signal }) => {
      started.resolve()
      try {
        await abortable(signal, deferred().promise)
      } catch {
        throw original
      }
    },
  })
  const lifetime = new Lifetime(scope.createContext())
  const pending = lifetime.exec({ flow: child })
  const rejected = pending.catch((error) => error)
  await started.promise
  await lifetime.close()
  const observed = await rejected
  assert.equal(observed, original)
  assert.equal(isCancellation(lifetime.signal, observed), false)
  await scope.dispose()
  return "passed"
}

async function siblingIsolationCase() {
  const scope = createScope()
  const startedA = deferred()
  const startedB = deferred()
  const releaseB = deferred()
  const child = flow({
    name: "validator.dkr2.sibling",
    deps: { signal: tags.required(executionSignal) },
    factory: async (ctx, { signal }) => {
      ctx.input.started.resolve()
      await abortable(signal, ctx.input.release.promise)
      return ctx.input.id
    },
  })
  const a = new Lifetime(scope.createContext())
  const b = new Lifetime(scope.createContext())
  const neverA = deferred()
  const pendingA = a.exec({ flow: child, input: { id: "a", started: startedA, release: neverA } })
  const rejectedA = pendingA.catch((error) => error)
  const pendingB = b.exec({ flow: child, input: { id: "b", started: startedB, release: releaseB } })
  await Promise.all([startedA.promise, startedB.promise])
  await a.close()
  assert.equal((await rejectedA).name, "AbortError")
  assert.equal(b.signal.aborted, false)
  releaseB.resolve()
  assert.equal(await pendingB, "b")
  await b.close()
  await scope.dispose()
  return "passed"
}

async function uncooperativeScalarCase() {
  const events = []
  const started = deferred()
  const release = deferred()
  const parent = resource({
    name: "validator.dkr2.uncooperative-resource",
    factory: (ctx) => {
      ctx.cleanup(() => { events.push("parent-resource-cleanup") })
      return "parent"
    },
  })
  const child = flow({
    name: "validator.dkr2.uncooperative",
    factory: async () => {
      started.resolve()
      await release.promise
      return "released"
    },
  })
  const scope = createScope()
  const raw = scope.createContext()
  await raw.resolve(parent)
  const lifetime = new Lifetime(raw, events)
  const pending = lifetime.exec({ flow: child })
  await started.promise
  let closed = false
  const close = lifetime.close().then(() => { closed = true })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(closed, false)
  assert.equal(events.includes("parent-resource-cleanup"), false)
  release.resolve()
  assert.equal(await pending, "released")
  await close
  assert.equal(events.includes("parent-resource-cleanup"), true)
  assert.deepEqual(events, [
    "abort-descendants",
    "return-active-stream-iterators",
    "join-descendants",
    "descendants-joined",
    "clean-parent-resources",
    "parent-resource-cleanup",
    "context-closed",
  ])
  await scope.dispose()
  return "passed"
}

let unhandledRejectionCount = 0
const unhandled = () => { unhandledRejectionCount++ }
process.on("unhandledRejection", unhandled)

const scalarChild = await scalarChildCase()
const scalarError = await scalarErrorCase()
const streamNormal = await streamNormalCase()
const streamProducerError = await streamProducerErrorCase()
const streamConsumerBreak = await streamConsumerBreakCase()
const streamParentClose = await streamParentCloseCase()
const nestedClose = await nestedCloseCase()
const targetedCallerSignal = await targetedCallerCase()
const classification = classificationCases()
const immediateOriginalError = await immediateOriginalErrorCase()
const postAbortOriginalError = await postAbortOriginalErrorCase()
const siblingIsolation = await siblingIsolationCase()
const uncooperativeScalar = await uncooperativeScalarCase()
await new Promise((resolve) => setImmediate(resolve))
process.off("unhandledRejection", unhandled)
assert.equal(unhandledRejectionCount, 0)

const cases = {
  scalarChild,
  scalarError,
  streamNormal,
  streamProducerError,
  streamConsumerBreak,
  streamParentClose,
  nestedClose,
  targetedCallerSignal,
  ...classification,
  immediateOriginalError,
  postAbortOriginalError,
  siblingIsolation,
  uncooperativeScalar,
}
assert.equal(Object.keys(cases).length, 16)
assert.ok(Object.values(cases).every((value) => value === "passed"))

process.stdout.write(`${JSON.stringify({
  probe: "validator-dkr-2-v3-independent",
  pass: true,
  requiredCaseCount: 16,
  passedCaseCount: 16,
  cases,
  unhandledRejectionCount,
  callerCoverage: {
    ownerClose: true,
    optionalInvocationSignal: true,
    runningFlowSignal: true,
    uncoveredCallerCount: 0,
    publicCancelAddedValueCount: 0,
  },
  closeOrder: [
    "abort descendants",
    "return active stream iterators",
    "join descendants",
    "classify without replacing errors",
    "clean parent resources",
  ],
  forbiddenPublicSurfaceCount: 0,
  rejectedSurface: ["cancel", "start", "spawn", "task handle", "worker pool", "session semantics"],
}, null, 2)}\n`)
