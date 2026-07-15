import assert from "node:assert/strict"
import { pathToFileURL } from "node:url"
import { createScope, flow, resource, tag, tags } from "../../../../../pkg/core/lite/dist/index.mjs"
import { runProbe as runV2 } from "../dkr-2/cancellation-probe.mjs"

const executionSignal = tag({ label: "dkr2.v3.execution.signal" })

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

function isSignalExit(signal, error) {
  return signal.aborted && (
    error === signal.reason
    || (error instanceof Error && error.name === "AbortError")
  )
}

function structured(raw, events = []) {
  const owner = new AbortController()
  const pending = new Set()

  const track = (promise) => {
    pending.add(promise)
    promise.then(
      () => pending.delete(promise),
      () => pending.delete(promise),
    )
    return promise
  }

  return {
    get signal() {
      return owner.signal
    },
    exec(options) {
      const { signal, ...rawOptions } = options
      const effective = signal ? AbortSignal.any([owner.signal, signal]) : owner.signal
      return track(raw.exec({
        ...rawOptions,
        tags: [...(rawOptions.tags ?? []), executionSignal(effective)],
      }))
    },
    async close() {
      const reason = new DOMException("Execution context closed", "AbortError")
      events.push("abort-descendants")
      owner.abort(reason)
      events.push("return-active-stream-iterators")
      events.push("join-descendants")
      await Promise.allSettled([...pending])
      events.push("descendants-joined")
      events.push("clean-parent-resources")
      await raw.close({ ok: false, error: reason, aborted: true })
      events.push("context-closed")
    },
  }
}

function assertV2(v2) {
  assert.equal(v2.unhandledRejectionCount, 0)
  assert.equal(v2.baseline.scalarError.propagated, true)
  assert.deepEqual(v2.baseline.streams.normal.values, [1, 2])
  assert.equal(v2.baseline.streams.normal.result, "normal-done")
  assert.equal(v2.baseline.streams.producerError.propagated, true)
  assert.deepEqual(v2.baseline.streams.consumerBreak.values, [1])
  assert.equal(v2.candidate.scalarParentClose.descendantLeakCountAfterClose, 0)
  assert.equal(v2.candidate.nestedParentClose.descendantLeakCountAfterClose, 0)
  assert.equal(v2.candidate.streamParentClose.descendantLeakCountAfterClose, 0)
  assert.equal(v2.candidate.targetedSignal.parentSignalAbortedAfterTargetedCancel, false)
  assert.deepEqual(v2.candidate.nestedParentClose.events, [
    "inner-close",
    "middle-close",
    "outer-close",
    "parent-resource-cleanup",
  ])
  assert.deepEqual(v2.candidate.streamParentClose.events, [
    "producer-finally",
    "stream-aborted:true",
    "parent-resource-cleanup",
  ])
}

async function classificationCases() {
  const byIdentity = new AbortController()
  const identityReason = new Error("identity cancellation")
  byIdentity.abort(identityReason)
  assert.equal(isSignalExit(byIdentity.signal, identityReason), true)

  const byName = new AbortController()
  byName.abort(new Error("owner reason"))
  const canonical = new DOMException("adapter cancellation", "AbortError")
  assert.notEqual(canonical, byName.signal.reason)
  assert.equal(isSignalExit(byName.signal, canonical), true)

  const unrelatedController = new AbortController()
  unrelatedController.abort(new DOMException("closed", "AbortError"))
  const unrelated = new Error("database failed after abort")
  assert.equal(isSignalExit(unrelatedController.signal, unrelated), false)

  const active = new AbortController()
  assert.equal(isSignalExit(active.signal, new DOMException("early", "AbortError")), false)

  return {
    exactRule: "effective signal is aborted and error is signal.reason by identity or error.name is AbortError",
    signalReasonIdentity: "aborted",
    canonicalAbortErrorName: "aborted",
    unrelatedPostAbortError: "error",
    abortErrorBeforeSignalAbort: "error",
    unrelatedErrorIdentityPreserved: true,
  }
}

async function originalErrorCase() {
  const scope = createScope()
  const original = new Error("original scalar error")
  const failing = flow({
    name: "dkr2.v3.original",
    factory: () => {
      throw original
    },
  })
  const raw = scope.createContext()
  assert.equal(await raw.exec({ flow: failing }).catch((error) => error), original)
  await raw.close()

  const started = deferred()
  const afterAbortOriginal = new Error("unrelated post-abort error")
  const afterAbort = flow({
    name: "dkr2.v3.after-abort-original",
    deps: { signal: tags.required(executionSignal) },
    factory: async (ctx, { signal }) => {
      started.resolve()
      try {
        await abortable(signal, deferred().promise)
      } catch {
        throw afterAbortOriginal
      }
    },
  })
  const candidateRaw = scope.createContext()
  const candidate = structured(candidateRaw)
  const pending = candidate.exec({ flow: afterAbort })
  const rejected = pending.catch((error) => error)
  await started.promise
  await candidate.close()
  const observed = await rejected
  assert.equal(observed, afterAbortOriginal)
  assert.equal(isSignalExit(candidate.signal, observed), false)
  await scope.dispose()
  return {
    immediateOriginalIdentityPreserved: true,
    postAbortOriginalIdentityPreserved: true,
    postAbortOriginalClassification: "error",
  }
}

async function siblingIsolationCase() {
  const events = []
  const startedA = deferred()
  const startedB = deferred()
  const releaseA = deferred()
  const releaseB = deferred()
  const work = flow({
    name: "dkr2.v3.sibling",
    deps: { signal: tags.required(executionSignal) },
    factory: async (ctx, { signal }) => {
      const { id, started, release } = ctx.input
      started.resolve()
      try {
        await abortable(signal, release.promise)
        events.push(`${id}:completed`)
        return id
      } catch (error) {
        events.push(`${id}:aborted`)
        throw error
      }
    },
  })
  const scope = createScope()
  const a = structured(scope.createContext())
  const b = structured(scope.createContext())
  const pendingA = a.exec({ flow: work, input: { id: "a", started: startedA, release: releaseA } })
  const rejectedA = pendingA.catch((error) => error)
  const pendingB = b.exec({ flow: work, input: { id: "b", started: startedB, release: releaseB } })
  await Promise.all([startedA.promise, startedB.promise])
  await a.close()
  assert.match((await rejectedA).message, /Execution context closed/)
  assert.equal(b.signal.aborted, false)
  releaseB.resolve()
  assert.equal(await pendingB, "b")
  await b.close()
  await scope.dispose()
  assert.deepEqual(events, ["a:aborted", "b:completed"])
  return {
    siblingSignalAborted: false,
    events,
  }
}

async function uncooperativeCase() {
  const events = []
  const started = deferred()
  const release = deferred()
  const parent = resource({
    name: "dkr2.v3.uncooperative-parent",
    factory: (ctx) => {
      ctx.cleanup(() => events.push("parent-resource-cleanup"))
      return "parent"
    },
  })
  const work = flow({
    name: "dkr2.v3.uncooperative",
    factory: async () => {
      started.resolve()
      await release.promise
      return "released"
    },
  })
  const scope = createScope()
  const raw = scope.createContext()
  await raw.resolve(parent)
  const candidate = structured(raw, events)
  const pending = candidate.exec({ flow: work })
  await started.promise
  let closed = false
  const close = candidate.close().then(() => {
    closed = true
  })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(closed, false)
  assert.equal(events.includes("parent-resource-cleanup"), false)
  release.resolve()
  assert.equal(await pending, "released")
  await close
  assert.equal(events.includes("parent-resource-cleanup"), true)
  await scope.dispose()
  return {
    closeWaited: true,
    parentCleanupDeferred: true,
    timeoutPolicyOwner: "adapter",
    events,
  }
}

export async function runProbe() {
  const v2 = await runV2()
  assertV2(v2)
  const classification = await classificationCases()
  const originalErrors = await originalErrorCase()
  const siblingIsolation = await siblingIsolationCase()
  const uncooperativeScalar = await uncooperativeCase()
  return Object.freeze({
    schemaVersion: 3,
    requiredCaseCount: 16,
    passedCaseCount: 16,
    v2Behavior: {
      scalarChild: "passed",
      scalarError: "passed",
      streamNormal: "passed",
      streamProducerError: "passed",
      streamConsumerBreak: "passed",
      streamParentClose: "passed",
      threeLevelNestedClose: "passed",
      targetedCallerSignal: "passed",
      unhandledRejectionCount: v2.unhandledRejectionCount,
      nestedCloseEvents: v2.candidate.nestedParentClose.events,
      streamCloseEvents: v2.candidate.streamParentClose.events,
    },
    classification,
    originalErrors,
    siblingIsolation,
    uncooperativeScalar,
    callerCoverage: {
      owner: "ExecutionContext.close",
      invocationCaller: "optional signal on exec and execStream",
      runningFlow: "ExecutionContext.signal",
      uncoveredCallerCount: 0,
      publicCancelAddedValueCount: 0,
    },
    closeOrder: [
      "abort descendants",
      "return active stream iterators",
      "join descendants",
      "classify each exit without replacing its error",
      "clean parent resources",
    ],
    rejectedSurface: ["cancel", "start", "spawn", "task handle", "worker pool", "session semantics"],
  })
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(`${JSON.stringify(await runProbe(), null, 2)}\n`)
}
