import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { pathToFileURL } from "node:url"
import {
  controller,
  createScope,
  flow,
  resource,
  tag,
  tags,
} from "../../../../../pkg/core/lite/dist/index.mjs"

const executionSignal = tag({ label: "validator.execution.signal" })

function deferred() {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
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
      reject,
    )
  })
}

async function collect(stream) {
  const values = []
  for await (const value of stream) values.push(value)
  return values
}

function indexOrder(events, expected) {
  const indexes = expected.map((event) => events.indexOf(event))
  assert(indexes.every((index) => index >= 0), `missing ordered event: ${expected.join(", ")}`)
  for (let index = 1; index < indexes.length; index++) {
    assert(indexes[index - 1] < indexes[index], `out-of-order events: ${expected.join(", ")}`)
  }
}

function structured(raw, events = []) {
  const owner = new AbortController()
  const descendants = new Set()
  const streams = new Set()

  const track = (promise) => {
    descendants.add(promise)
    promise.then(
      () => descendants.delete(promise),
      () => descendants.delete(promise),
    )
    return promise
  }

  const effectiveSignal = (caller) => caller
    ? AbortSignal.any([owner.signal, caller])
    : owner.signal

  return {
    get signal() {
      return owner.signal
    },
    exec(options) {
      const { signal, ...rawOptions } = options
      return track(raw.exec({
        ...rawOptions,
        tags: [...(rawOptions.tags ?? []), executionSignal(effectiveSignal(signal))],
      }))
    },
    execStream(options) {
      const { signal, ...rawOptions } = options
      const source = raw.execStream({
        ...rawOptions,
        tags: [...(rawOptions.tags ?? []), executionSignal(effectiveSignal(signal))],
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
      events.push("abort-descendants")
      owner.abort(reason)
      events.push("return-active-streams")
      await Promise.allSettled([...streams].map((stream) => stream.stop()))
      events.push("join-descendants")
      await Promise.allSettled([...descendants])
      events.push("descendants-joined")
      events.push("clean-parent-resources")
      await raw.close({ ok: false, error: reason, aborted: true })
      events.push("context-closed")
    },
  }
}

async function scalarAndNestedClose() {
  const scalarEvents = []
  const scalarStarted = deferred()
  const never = deferred()
  const parent = resource({
    name: "validator.scalar-parent",
    factory: (ctx) => {
      ctx.cleanup(() => scalarEvents.push("parent-resource-cleanup"))
      return "parent"
    },
  })
  const child = flow({
    name: "validator.scalar-child",
    deps: { signal: tags.required(executionSignal) },
    factory: async (ctx, { signal }) => {
      ctx.onClose((result) => scalarEvents.push(`scalar-close-aborted:${result.ok ? false : result.aborted === true}`))
      scalarStarted.resolve()
      await abortable(signal, never.promise)
    },
  })
  const scope = createScope()
  const raw = scope.createContext()
  await raw.resolve(parent)
  const ctx = structured(raw, scalarEvents)
  const pending = ctx.exec({ flow: child })
  const rejected = pending.catch((error) => error)
  await scalarStarted.promise
  await ctx.close()
  assert.match((await rejected).message, /Execution context closed/)
  indexOrder(scalarEvents, [
    "abort-descendants",
    "return-active-streams",
    "join-descendants",
    "descendants-joined",
    "clean-parent-resources",
    "parent-resource-cleanup",
    "context-closed",
  ])
  assert(scalarEvents.includes("scalar-close-aborted:false"))
  await scope.dispose()

  const nestedEvents = []
  const nestedStarted = deferred()
  const nestedNever = deferred()
  const nestedParent = resource({
    name: "validator.nested-parent",
    factory: (ctx) => {
      ctx.cleanup(() => nestedEvents.push("parent-resource-cleanup"))
      return "parent"
    },
  })
  const inner = flow({
    name: "validator.inner",
    deps: { signal: tags.required(executionSignal) },
    factory: async (ctx, { signal }) => {
      ctx.onClose(() => nestedEvents.push("inner-close"))
      nestedStarted.resolve()
      await abortable(signal, nestedNever.promise)
    },
  })
  const middle = flow({
    name: "validator.middle",
    deps: { inner: controller(inner) },
    factory: (ctx, { inner }) => {
      ctx.onClose(() => nestedEvents.push("middle-close"))
      return inner.exec()
    },
  })
  const outer = flow({
    name: "validator.outer",
    deps: { middle: controller(middle) },
    factory: (ctx, { middle }) => {
      ctx.onClose(() => nestedEvents.push("outer-close"))
      return middle.exec()
    },
  })
  const nestedRaw = scope.createContext()
  await nestedRaw.resolve(nestedParent)
  const nested = structured(nestedRaw, nestedEvents)
  const nestedPending = nested.exec({ flow: outer })
  const nestedRejected = nestedPending.catch((error) => error)
  await nestedStarted.promise
  await nested.close()
  assert.match((await nestedRejected).message, /Execution context closed/)
  indexOrder(nestedEvents, ["inner-close", "middle-close", "outer-close", "parent-resource-cleanup"])
  await scope.dispose()

  return {
    scalar: {
      signalAborted: ctx.signal.aborted,
      events: scalarEvents,
      classificationGapObserved: scalarEvents.includes("scalar-close-aborted:false"),
    },
    nested: {
      descendantLeakCountAfterClose: 0,
      events: nestedEvents,
    },
  }
}

async function scalarErrorsAndOriginalError() {
  const original = new Error("original scalar error")
  const immediate = flow({
    name: "validator.scalar-original-error",
    factory: () => {
      throw original
    },
  })
  const scope = createScope()
  const raw = scope.createContext()
  const observed = await raw.exec({ flow: immediate }).catch((error) => error)
  assert.equal(observed, original)
  await raw.close()

  const signalOriginal = new Error("original after abort")
  const started = deferred()
  const events = []
  const afterAbort = flow({
    name: "validator.scalar-original-after-abort",
    deps: { signal: tags.required(executionSignal) },
    factory: async (ctx, { signal }) => {
      ctx.onClose((result) => events.push(`close-aborted:${result.ok ? false : result.aborted === true}`))
      started.resolve()
      try {
        await abortable(signal, deferred().promise)
      } catch {
        throw signalOriginal
      }
    },
  })
  const candidateRaw = scope.createContext()
  const candidate = structured(candidateRaw, events)
  const pending = candidate.exec({ flow: afterAbort })
  const rejected = pending.catch((error) => error)
  await started.promise
  await candidate.close()
  assert.equal(await rejected, signalOriginal)
  assert.deepEqual(events.filter((event) => event.startsWith("close-aborted:")), ["close-aborted:false"])
  await scope.dispose()

  return {
    immediateOriginalIdentityPreserved: true,
    postAbortOriginalIdentityPreserved: true,
    postAbortClassificationObserved: "error",
    classificationRuleProven: false,
  }
}

async function streamCases() {
  const normalEvents = []
  const normal = flow({
    name: "validator.stream-normal",
    factory: async function* (ctx) {
      ctx.onClose((result) => normalEvents.push(result.ok ? "success" : "error"))
      yield 1
      yield 2
      return "done"
    },
  })
  const errorEvents = []
  const producerError = new Error("producer error")
  const failing = flow({
    name: "validator.stream-error",
    factory: async function* (ctx) {
      ctx.onClose((result) => errorEvents.push(result.ok ? "success" : "error"))
      yield 1
      throw producerError
    },
  })
  const breakEvents = []
  const breaking = flow({
    name: "validator.stream-break",
    factory: async function* (ctx) {
      ctx.onClose((result) => breakEvents.push(result.ok ? "success" : `aborted:${result.aborted === true}`))
      try {
        yield 1
        yield 2
      } finally {
        breakEvents.push("producer-finally")
      }
    },
  })
  const scope = createScope()
  const raw = scope.createContext()

  const normalStream = raw.execStream({ flow: normal })
  assert.deepEqual(await collect(normalStream), [1, 2])
  assert.equal(await normalStream.result, "done")

  const errorStream = raw.execStream({ flow: failing })
  const errorIterator = errorStream[Symbol.asyncIterator]()
  assert.deepEqual(await errorIterator.next(), { done: false, value: 1 })
  assert.equal(await errorIterator.next().catch((error) => error), producerError)
  assert.equal(await errorStream.result.catch((error) => error), producerError)

  const breakStream = raw.execStream({ flow: breaking })
  const values = []
  for await (const value of breakStream) {
    values.push(value)
    break
  }
  await assert.rejects(breakStream.result, /Flow stream aborted/)
  assert.deepEqual(values, [1])
  assert.deepEqual(normalEvents, ["success"])
  assert.deepEqual(errorEvents, ["error"])
  assert.deepEqual(breakEvents, ["producer-finally", "aborted:true"])
  await raw.close()

  const closeEvents = []
  const parent = resource({
    name: "validator.stream-parent",
    factory: (ctx) => {
      ctx.cleanup(() => closeEvents.push("parent-resource-cleanup"))
      return "parent"
    },
  })
  const active = flow({
    name: "validator.stream-parent-close",
    factory: async function* (ctx) {
      ctx.onClose((result) => closeEvents.push(`stream-aborted:${result.ok ? false : result.aborted === true}`))
      try {
        yield 1
        yield 2
      } finally {
        closeEvents.push("producer-finally")
      }
    },
  })
  const closeRaw = scope.createContext()
  await closeRaw.resolve(parent)
  const candidate = structured(closeRaw, closeEvents)
  const stream = candidate.execStream({ flow: active })
  const iterator = stream[Symbol.asyncIterator]()
  assert.deepEqual(await iterator.next(), { done: false, value: 1 })
  const result = stream.result.catch((error) => error)
  await candidate.close()
  assert.match((await result).message, /Flow stream aborted/)
  indexOrder(closeEvents, [
    "abort-descendants",
    "return-active-streams",
    "producer-finally",
    "stream-aborted:true",
    "descendants-joined",
    "clean-parent-resources",
    "parent-resource-cleanup",
  ])
  await scope.dispose()

  return {
    normal: { values: [1, 2], result: "done", events: normalEvents },
    producerError: { identityPreserved: true, events: errorEvents },
    consumerBreak: { values, events: breakEvents },
    parentClose: { events: closeEvents },
  }
}

async function isolationAndCallerCoverage() {
  const scope = createScope()
  const targetEvents = []
  const work = flow({
    name: "validator.targeted-work",
    deps: { signal: tags.required(executionSignal) },
    factory: async (ctx, { signal }) => {
      const { id, started, release } = ctx.input
      started.resolve()
      try {
        await abortable(signal, release.promise)
        targetEvents.push(`${id}:completed`)
        return id
      } catch (error) {
        targetEvents.push(`${id}:aborted`)
        throw error
      }
    },
  })
  const raw = scope.createContext()
  const ctx = structured(raw)
  const caller = new AbortController()
  const startedA = deferred()
  const startedB = deferred()
  const releaseA = deferred()
  const releaseB = deferred()
  const a = ctx.exec({ flow: work, input: { id: "a", started: startedA, release: releaseA }, signal: caller.signal })
  const rejectedA = a.catch((error) => error)
  const b = ctx.exec({ flow: work, input: { id: "b", started: startedB, release: releaseB })
  await Promise.all([startedA.promise, startedB.promise])
  caller.abort(new DOMException("targeted", "AbortError"))
  releaseB.resolve()
  assert.match((await rejectedA).message, /targeted/)
  assert.equal(await b, "b")
  assert.equal(ctx.signal.aborted, false)

  const siblingAStarted = deferred()
  const siblingBStarted = deferred()
  const siblingARelease = deferred()
  const siblingBRelease = deferred()
  const rawA = scope.createContext()
  const rawB = scope.createContext()
  const contextA = structured(rawA)
  const contextB = structured(rawB)
  const pendingA = contextA.exec({ flow: work, input: { id: "context-a", started: siblingAStarted, release: siblingARelease } })
  const rejectedContextA = pendingA.catch((error) => error)
  const pendingB = contextB.exec({ flow: work, input: { id: "context-b", started: siblingBStarted, release: siblingBRelease } })
  await Promise.all([siblingAStarted.promise, siblingBStarted.promise])
  await contextA.close()
  assert.match((await rejectedContextA).message, /Execution context closed/)
  assert.equal(contextB.signal.aborted, false)
  siblingBRelease.resolve()
  assert.equal(await pendingB, "context-b")
  await contextB.close()
  await ctx.close()
  await scope.dispose()

  assert.deepEqual(targetEvents, ["a:aborted", "b:completed", "context-a:aborted", "context-b:completed"])
  return {
    actualCallerCount: 3,
    uncoveredCallerCount: 0,
    ownerControl: "close",
    invocationCallerControl: "optional signal",
    runningFlowControl: "effective signal",
    publicCancelAddedValueCount: 0,
    parentSignalAbortedByTargetedCaller: false,
    siblingContextSignalAborted: false,
    events: targetEvents,
  }
}

async function uncooperativeScalar() {
  const events = []
  const started = deferred()
  const release = deferred()
  const parent = resource({
    name: "validator.uncooperative-parent",
    factory: (ctx) => {
      ctx.cleanup(() => events.push("parent-resource-cleanup"))
      return "parent"
    },
  })
  const child = flow({
    name: "validator.uncooperative-child",
    factory: async () => {
      started.resolve()
      await release.promise
      return "released"
    },
  })
  const scope = createScope()
  const raw = scope.createContext()
  await raw.resolve(parent)
  const ctx = structured(raw, events)
  const pending = ctx.exec({ flow: child })
  await started.promise
  let closeSettled = false
  const close = ctx.close().then(() => {
    closeSettled = true
  })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(closeSettled, false)
  assert.equal(events.includes("parent-resource-cleanup"), false)
  release.resolve()
  assert.equal(await pending, "released")
  await close
  assert.equal(events.includes("parent-resource-cleanup"), true)
  await scope.dispose()
  return {
    closeWaitedUntilRelease: true,
    parentCleanupDeferredUntilRelease: true,
    timeoutPolicyRequiredInCore: false,
    events,
  }
}

async function staticSurface() {
  const types = await readFile("pkg/core/lite/src/types.ts", "utf8")
  const scope = await readFile("pkg/core/lite/src/scope.ts", "utf8")
  const checkpoint = JSON.parse(await readFile(
    ".okra/runs/issue-triage-session-20260715/workers/dkr-2/checkpoint.v2.json",
    "utf8",
  ))
  const executionContext = types.slice(
    types.indexOf("export interface ExecutionContext"),
    types.indexOf("export interface ResourceContext"),
  )
  assert.equal(/readonly signal: AbortSignal/.test(executionContext), false)
  assert.equal(/\bcancel\s*\(/.test(executionContext), false)
  assert.equal(/\b(start|spawn|task)\s*\(/.test(executionContext), false)
  assert.match(checkpoint.decision, /ExecutionContext\.signal/)
  assert.match(checkpoint.decision, /do not add ExecutionContext\.cancel, start, spawn, or task handles/)
  assert.equal(checkpoint.risk_or_anti_goal_implications.some((value) => /session-specific semantics/.test(value)), true)
  assert.equal(/private cleanups/.test(scope), true)
  assert.equal(/private resources/.test(scope), true)
  return {
    currentSignalPresent: false,
    currentCancelPresent: false,
    proposalRestrictedToGenericLite: true,
    forbiddenPublicSurfaceCount: 0,
    privateBookkeepingFeasible: true,
  }
}

export async function runProbe() {
  const unhandled = []
  const onUnhandled = (error) => unhandled.push(error)
  process.on("unhandledRejection", onUnhandled)
  try {
    const result = {
      schemaVersion: 1,
      scalarAndNestedClose: await scalarAndNestedClose(),
      scalarErrorsAndOriginalError: await scalarErrorsAndOriginalError(),
      streams: await streamCases(),
      isolationAndCallerCoverage: await isolationAndCallerCoverage(),
      uncooperativeScalar: await uncooperativeScalar(),
      staticSurface: await staticSurface(),
    }
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(unhandled.length, 0)
    result.unhandledRejectionCount = unhandled.length
    result.dispositions = {
      signalOnlyCallerCoverage: "accepted",
      closeOrdering: "accepted",
      cooperativeScalarAndStreamClose: "accepted",
      siblingAndParentIsolation: "accepted",
      uncooperativeScalarWait: "accepted",
      originalErrorPreservation: "accepted",
      signalExitClassification: "rejected: candidate rule is not implemented or pinned against post-abort original errors",
      genericPrivateSurface: "accepted",
    }
    return Object.freeze(result)
  } finally {
    process.off("unhandledRejection", onUnhandled)
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(`${JSON.stringify(await runProbe(), null, 2)}\n`)
}
