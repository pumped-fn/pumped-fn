import assert from "node:assert/strict"
import { pathToFileURL } from "node:url"
import {
  controller,
  createScope,
  flow,
  resource,
  tag,
  tags,
} from "../../../../../pkg/core/lite/dist/index.mjs"

const executionSignal = tag({ label: "probe.execution.signal" })

function deferred() {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function abortable(signal, value) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason)
      return
    }
    const abort = () => reject(signal.reason)
    signal.addEventListener("abort", abort, { once: true })
    value.then(
      (result) => {
        signal.removeEventListener("abort", abort)
        resolve(result)
      },
      reject,
    )
  })
}

async function collect(stream) {
  const values = []
  for await (const value of stream) values.push(value)
  return values
}

async function baselineSurface() {
  const scope = createScope()
  const ctx = scope.createContext()
  const result = {
    publicSignalPresent: "signal" in ctx,
    publicCancelPresent: "cancel" in ctx,
  }
  await ctx.close()
  await scope.dispose()
  return result
}

function structured(ctx) {
  const owner = new AbortController()
  const pending = new Set()
  const streams = new Set()

  const track = (promise) => {
    pending.add(promise)
    promise.then(
      () => pending.delete(promise),
      () => pending.delete(promise),
    )
    return promise
  }

  const signalFor = (signal) => signal ? AbortSignal.any([owner.signal, signal]) : owner.signal

  return {
    get signal() {
      return owner.signal
    },
    exec(options) {
      return track(ctx.exec({
        ...options,
        tags: [...(options.tags ?? []), executionSignal(signalFor(options.signal))],
      }))
    },
    execStream(options) {
      const source = ctx.execStream({
        ...options,
        tags: [...(options.tags ?? []), executionSignal(signalFor(options.signal))],
      })
      let iterator
      let tracked = false
      const active = {
        async stop() {
          await iterator?.return?.()
        },
      }
      return {
        get result() {
          return source.result
        },
        [Symbol.asyncIterator]() {
          iterator = source[Symbol.asyncIterator]()
          streams.add(active)
          return {
            next(value) {
              const step = iterator.next(value)
              if (!tracked) {
                tracked = true
                track(source.result)
              }
              return step.then((result) => {
                if (result.done) streams.delete(active)
                return result
              })
            },
            async return(value) {
              streams.delete(active)
              return iterator.return?.(value) ?? { done: true, value }
            },
            async throw(error) {
              streams.delete(active)
              if (iterator.throw) return iterator.throw(error)
              throw error
            },
          }
        },
      }
    },
    async close() {
      const reason = new DOMException("Execution context closed", "AbortError")
      owner.abort(reason)
      await Promise.allSettled([...streams].map((stream) => stream.stop()))
      await Promise.allSettled([...pending])
      await ctx.close({ ok: false, error: reason, aborted: true })
    },
  }
}

async function baselineScalarClose() {
  const events = []
  const started = deferred()
  const release = deferred()
  let settled = false
  const parent = resource({
    name: "probe.baseline.parent",
    factory: (ctx) => {
      ctx.cleanup(() => events.push("parent-resource-cleanup"))
      return "parent"
    },
  })
  const child = flow({
    name: "probe.baseline.scalar-child",
    factory: async (ctx) => {
      ctx.onClose(() => events.push("child-close"))
      started.resolve()
      await release.promise
      settled = true
      return "done"
    },
  })
  const scope = createScope()
  const ctx = scope.createContext()
  await ctx.resolve(parent)
  const pending = ctx.exec({ flow: child })
  await started.promise
  await ctx.close()
  const atClose = {
    childSettled: settled,
    childClosed: events.includes("child-close"),
    parentResourceCleaned: events.includes("parent-resource-cleanup"),
  }
  release.resolve()
  assert.equal(await pending, "done")
  await scope.dispose()
  assert.deepEqual(atClose, {
    childSettled: false,
    childClosed: false,
    parentResourceCleaned: true,
  })
  return { atClose, events }
}

async function baselineScalarError() {
  const events = []
  const tx = resource({
    name: "probe.baseline.error-resource",
    ownership: "current",
    factory: (ctx) => {
      ctx.cleanup(() => events.push("resource-cleanup"))
      return "tx"
    },
  })
  const child = flow({
    name: "probe.baseline.error-child",
    deps: { tx },
    factory: (ctx) => {
      ctx.onClose((result) => events.push(result.ok ? "child-success" : "child-error"))
      throw new Error("expected child failure")
    },
  })
  const parent = flow({
    name: "probe.baseline.error-parent",
    deps: { child: controller(child) },
    factory: (ctx, { child }) => {
      ctx.onClose((result) => events.push(result.ok ? "parent-success" : "parent-error"))
      return child.exec()
    },
  })
  const scope = createScope()
  const ctx = scope.createContext()
  await assert.rejects(ctx.exec({ flow: parent }), /expected child failure/)
  await ctx.close()
  await scope.dispose()
  assert.deepEqual(events, ["child-error", "resource-cleanup", "parent-error"])
  return { propagated: true, events }
}

async function baselineStreams() {
  const normalEvents = []
  const normal = flow({
    name: "probe.stream.normal",
    factory: async function* (ctx) {
      ctx.onClose((result) => normalEvents.push(result.ok ? "close-success" : "close-error"))
      yield 1
      yield 2
      return "normal-done"
    },
  })
  const errorEvents = []
  const error = flow({
    name: "probe.stream.error",
    factory: async function* (ctx) {
      ctx.onClose((result) => errorEvents.push(result.ok ? "close-success" : "close-error"))
      yield 1
      throw new Error("expected stream failure")
    },
  })
  const breakEvents = []
  const broken = flow({
    name: "probe.stream.break",
    factory: async function* (ctx) {
      ctx.onClose((result) => breakEvents.push(result.ok ? "close-success" : `close-aborted:${result.aborted === true}`))
      try {
        yield 1
        yield 2
      } finally {
        breakEvents.push("producer-finally")
      }
    },
  })
  const scope = createScope()
  const ctx = scope.createContext()
  const normalStream = ctx.execStream({ flow: normal })
  const normalValues = await collect(normalStream)
  const normalResult = await normalStream.result

  const errorStream = ctx.execStream({ flow: error })
  const errorIterator = errorStream[Symbol.asyncIterator]()
  assert.deepEqual(await errorIterator.next(), { done: false, value: 1 })
  await assert.rejects(errorIterator.next(), /expected stream failure/)
  await assert.rejects(errorStream.result, /expected stream failure/)

  const breakStream = ctx.execStream({ flow: broken })
  const breakValues = []
  for await (const value of breakStream) {
    breakValues.push(value)
    break
  }
  await assert.rejects(breakStream.result, /Flow stream aborted/)

  await ctx.close()
  await scope.dispose()
  assert.deepEqual(normalValues, [1, 2])
  assert.equal(normalResult, "normal-done")
  assert.deepEqual(normalEvents, ["close-success"])
  assert.deepEqual(errorEvents, ["close-error"])
  assert.deepEqual(breakEvents, ["producer-finally", "close-aborted:true"])
  return {
    normal: { values: normalValues, result: normalResult, events: normalEvents },
    producerError: { propagated: true, events: errorEvents },
    consumerBreak: { values: breakValues, events: breakEvents },
  }
}

async function baselineStreamParentClose() {
  const events = []
  const release = deferred()
  const parent = resource({
    name: "probe.baseline.stream-parent-resource",
    factory: (ctx) => {
      ctx.cleanup(() => events.push("parent-resource-cleanup"))
      return "parent"
    },
  })
  const source = flow({
    name: "probe.baseline.stream-parent-close",
    factory: async function* (ctx) {
      ctx.onClose(() => events.push("stream-close"))
      yield 1
      await release.promise
      yield 2
      return "done"
    },
  })
  const scope = createScope()
  const ctx = scope.createContext()
  await ctx.resolve(parent)
  const stream = ctx.execStream({ flow: source })
  const iterator = stream[Symbol.asyncIterator]()
  assert.deepEqual(await iterator.next(), { done: false, value: 1 })
  await ctx.close()
  const atClose = {
    streamClosed: events.includes("stream-close"),
    parentResourceCleaned: events.includes("parent-resource-cleanup"),
  }
  release.resolve()
  assert.deepEqual(await iterator.next(), { done: false, value: 2 })
  assert.deepEqual(await iterator.next(), { done: true, value: "done" })
  assert.equal(await stream.result, "done")
  await scope.dispose()
  assert.deepEqual(atClose, { streamClosed: false, parentResourceCleaned: true })
  return { atClose, events }
}

async function baselineNestedClose() {
  const events = []
  const started = deferred()
  const release = deferred()
  const parent = resource({
    name: "probe.baseline.nested-parent-resource",
    factory: (ctx) => {
      ctx.cleanup(() => events.push("parent-resource-cleanup"))
      return "parent"
    },
  })
  const inner = flow({
    name: "probe.baseline.inner",
    factory: async (ctx) => {
      ctx.onClose(() => events.push("inner-close"))
      started.resolve()
      await release.promise
      return "inner"
    },
  })
  const middle = flow({
    name: "probe.baseline.middle",
    deps: { inner: controller(inner) },
    factory: (ctx, { inner }) => {
      ctx.onClose(() => events.push("middle-close"))
      return inner.exec()
    },
  })
  const outer = flow({
    name: "probe.baseline.outer",
    deps: { middle: controller(middle) },
    factory: (ctx, { middle }) => {
      ctx.onClose(() => events.push("outer-close"))
      return middle.exec()
    },
  })
  const scope = createScope()
  const ctx = scope.createContext()
  await ctx.resolve(parent)
  const pending = ctx.exec({ flow: outer })
  await started.promise
  await ctx.close()
  const descendantLeakCountAtClose = ["inner-close", "middle-close", "outer-close"]
    .filter((value) => !events.includes(value)).length
  release.resolve()
  assert.equal(await pending, "inner")
  await scope.dispose()
  assert.equal(descendantLeakCountAtClose, 3)
  assert.deepEqual(events, ["parent-resource-cleanup", "inner-close", "middle-close", "outer-close"])
  return { descendantLeakCountAtClose, events }
}

async function candidateScalarClose() {
  const events = []
  const started = deferred()
  const never = deferred()
  const parent = resource({
    name: "probe.candidate.parent",
    factory: (ctx) => {
      ctx.cleanup(() => events.push("parent-resource-cleanup"))
      return "parent"
    },
  })
  const child = flow({
    name: "probe.candidate.child",
    deps: { signal: tags.required(executionSignal) },
    factory: async (ctx, { signal }) => {
      ctx.onClose((result) => events.push(result.ok ? "child-success" : `child-aborted:${result.aborted === true}`))
      started.resolve()
      await abortable(signal, never.promise)
    },
  })
  const scope = createScope()
  const raw = scope.createContext()
  await raw.resolve(parent)
  const ctx = structured(raw)
  const pending = ctx.exec({ flow: child })
  await started.promise
  await ctx.close()
  await assert.rejects(pending, /Execution context closed/)
  await scope.dispose()
  assert.deepEqual(events, ["child-aborted:false", "parent-resource-cleanup"])
  return {
    signalAborted: ctx.signal.aborted,
    descendantLeakCountAfterClose: 0,
    events,
  }
}

async function candidateNestedClose() {
  const events = []
  const started = deferred()
  const never = deferred()
  const parent = resource({
    name: "probe.candidate.nested-parent",
    factory: (ctx) => {
      ctx.cleanup(() => events.push("parent-resource-cleanup"))
      return "parent"
    },
  })
  const inner = flow({
    name: "probe.candidate.inner",
    deps: { signal: tags.required(executionSignal) },
    factory: async (ctx, { signal }) => {
      ctx.onClose(() => events.push("inner-close"))
      started.resolve()
      await abortable(signal, never.promise)
    },
  })
  const middle = flow({
    name: "probe.candidate.middle",
    deps: { inner: controller(inner) },
    factory: (ctx, { inner }) => {
      ctx.onClose(() => events.push("middle-close"))
      return inner.exec()
    },
  })
  const outer = flow({
    name: "probe.candidate.outer",
    deps: { middle: controller(middle) },
    factory: (ctx, { middle }) => {
      ctx.onClose(() => events.push("outer-close"))
      return middle.exec()
    },
  })
  const scope = createScope()
  const raw = scope.createContext()
  await raw.resolve(parent)
  const ctx = structured(raw)
  const pending = ctx.exec({ flow: outer })
  await started.promise
  await ctx.close()
  await assert.rejects(pending, /Execution context closed/)
  await scope.dispose()
  assert.deepEqual(events, ["inner-close", "middle-close", "outer-close", "parent-resource-cleanup"])
  return { descendantLeakCountAfterClose: 0, events }
}

async function candidateTargetedSignal() {
  const events = []
  const releaseA = deferred()
  const releaseB = deferred()
  const startedA = deferred()
  const startedB = deferred()
  const work = flow({
    name: "probe.candidate.targeted",
    deps: { signal: tags.required(executionSignal) },
    factory: async (ctx, { signal }) => {
      const value = ctx.input.id
      ctx.input.started.resolve()
      try {
        await abortable(signal, ctx.input.release.promise)
        events.push(`${value}:completed`)
        return value
      } catch (error) {
        events.push(`${value}:aborted`)
        throw error
      }
    },
  })
  const scope = createScope()
  const raw = scope.createContext()
  const ctx = structured(raw)
  const target = new AbortController()
  const a = ctx.exec({ flow: work, input: { id: "a", release: releaseA, started: startedA }, signal: target.signal })
  const b = ctx.exec({ flow: work, input: { id: "b", release: releaseB, started: startedB } })
  await Promise.all([startedA.promise, startedB.promise])
  target.abort(new DOMException("targeted", "AbortError"))
  releaseB.resolve()
  await assert.rejects(a, /targeted/)
  assert.equal(await b, "b")
  assert.equal(ctx.signal.aborted, false)
  await ctx.close()
  await scope.dispose()
  assert.deepEqual(events, ["a:aborted", "b:completed"])
  return { parentSignalAbortedAfterTargetedCancel: false, events }
}

async function candidateStreamClose() {
  const events = []
  const source = flow({
    name: "probe.candidate.stream",
    factory: async function* (ctx) {
      ctx.onClose((result) => events.push(result.ok ? "stream-success" : `stream-aborted:${result.aborted === true}`))
      try {
        yield 1
        yield 2
      } finally {
        events.push("producer-finally")
      }
    },
  })
  const parent = resource({
    name: "probe.candidate.stream-parent",
    factory: (ctx) => {
      ctx.cleanup(() => events.push("parent-resource-cleanup"))
      return "parent"
    },
  })
  const scope = createScope()
  const raw = scope.createContext()
  await raw.resolve(parent)
  const ctx = structured(raw)
  const stream = ctx.execStream({ flow: source })
  const iterator = stream[Symbol.asyncIterator]()
  assert.deepEqual(await iterator.next(), { done: false, value: 1 })
  const result = stream.result
  await ctx.close()
  await assert.rejects(result, /Flow stream aborted/)
  await scope.dispose()
  assert.deepEqual(events, ["producer-finally", "stream-aborted:true", "parent-resource-cleanup"])
  return { descendantLeakCountAfterClose: 0, events }
}

export async function runProbe() {
  const unhandled = []
  const onUnhandled = (error) => unhandled.push(error)
  process.on("unhandledRejection", onUnhandled)
  try {
    const surface = await baselineSurface()
    const baseline = {
      ...surface,
      scalarParentClose: await baselineScalarClose(),
      scalarError: await baselineScalarError(),
      streams: await baselineStreams(),
      streamParentClose: await baselineStreamParentClose(),
      nestedParentClose: await baselineNestedClose(),
    }
    const candidate = {
      scalarParentClose: await candidateScalarClose(),
      nestedParentClose: await candidateNestedClose(),
      targetedSignal: await candidateTargetedSignal(),
      streamParentClose: await candidateStreamClose(),
      publicCancelRequired: false,
      scalarCloseAbortClassificationRequired: true,
      callerControl: {
        rootOwner: "close the explicit context",
        invocationCaller: "abort the signal supplied to exec",
        runningFlow: "observe ctx.signal and return or throw",
      },
    }
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(unhandled.length, 0)
    return Object.freeze({
      schemaVersion: 1,
      baseline,
      candidate,
      unhandledRejectionCount: unhandled.length,
      decisionInputs: {
        signalOnlyContract: [
          "ExecutionContext.signal",
          "exec and execStream accept an optional caller signal",
          "close aborts descendants, settles active streams, joins descendants, then cleans parent resources",
          "signal-driven scalar and stream exits close as aborted",
        ],
        publicCancelAddedValueCount: 0,
        rejectedSurface: ["start", "spawn", "worker pool", "session semantics", "task handle"],
      },
    })
  } finally {
    process.off("unhandledRejection", onUnhandled)
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(`${JSON.stringify(await runProbe(), null, 2)}\n`)
}
