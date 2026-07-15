import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { createScope, flow, resource } from "../../../../../pkg/core/lite/dist/index.mjs"
import {
  authority,
  clock,
  createAuthority,
  record,
  session,
  store,
} from "../../../../../pkg/sdk/core/dist/session.mjs"

function deferred() {
  let resolve
  let reject
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}

function clone(value) {
  return structuredClone(value)
}

function initial(id = "session-1") {
  return {
    id,
    version: 0,
    schemaVersion: 1,
    status: "open",
    authorityFingerprint: "sha256:authority",
    authorityConstraints: {},
    currentBranchId: "main",
    branches: [],
    work: [],
    attempts: [],
    invocations: [],
    artifacts: [],
    memory: [],
    schedules: [],
    providerContinuations: {},
    nextEventSequence: 1,
  }
}

class StoreProbe {
  constructor(value, beforeCommit = async () => undefined) {
    this.value = clone(value)
    this.calls = []
    this.beforeCommit = beforeCommit
  }

  async commit(value, expectedVersion, kind) {
    await this.beforeCommit(kind)
    assert.equal(this.value.version, expectedVersion)
    this.value = { ...clone(value), version: expectedVersion + 1 }
    this.calls.push({ kind, status: value.status, expectedVersion, version: this.value.version })
    return this.value.version
  }
}

class CandidateRuntime {
  #record
  #active = new Map()
  #activationStatus = "active"
  #deactivation
  #completion

  constructor(recordValue, storeProbe) {
    this.#record = clone(recordValue)
    this.store = storeProbe
    this.trace = []
  }

  get record() {
    return clone(this.#record)
  }

  get activationStatus() {
    return this.#activationStatus
  }

  admit(id, { settleOnAbort = false } = {}) {
    this.#assertActive()
    assert.equal(this.#record.status, "open")
    const controller = new AbortController()
    const settlement = deferred()
    const entry = { id, controller, settlement }
    this.#active.set(id, entry)
    this.#record = {
      ...this.#record,
      work: [...this.#record.work, { id, status: "working" }],
    }
    controller.signal.addEventListener("abort", () => {
      this.trace.push(`abort:${id}`)
      if (settleOnAbort) this.settle(id, "cancelled")
    }, { once: true })
    return {
      signal: controller.signal,
      settled: settlement.promise,
    }
  }

  settle(id, status = "completed") {
    const entry = this.#active.get(id)
    assert.ok(entry)
    this.#active.delete(id)
    this.#record = {
      ...this.#record,
      work: this.#record.work.map((work) => work.id === id ? { ...work, status } : work),
    }
    this.trace.push(`settle:${id}:${status}`)
    entry.settlement.resolve({ status })
  }

  rejectSettlement(id, error) {
    const entry = this.#active.get(id)
    assert.ok(entry)
    this.#active.delete(id)
    this.trace.push(`reject:${id}`)
    entry.settlement.reject(error)
  }

  checkpoint() {
    return this.store.commit({ ...clone(this.#record), status: "open" }, this.store.value.version, "checkpoint")
  }

  finish() {
    if (this.#completion) return this.#completion
    if (this.#activationStatus !== "active") {
      return Promise.reject(new Error(`Session activation is ${this.#activationStatus}`))
    }
    this.#record = { ...this.#record, status: "finishing" }
    const active = [...this.#active.values()]
    for (const entry of active) entry.controller.abort(new DOMException("Session finishing", "AbortError"))
    this.#completion = this.#join(active)
      .then(async () => {
        const expectedVersion = this.store.value.version
        const version = await this.store.commit({ ...clone(this.#record), status: "finished" }, expectedVersion, "finish")
        this.#record = { ...this.#record, status: "finished", version }
        return this.record
      })
    return this.#completion
  }

  deactivate() {
    if (this.#deactivation) return this.#deactivation
    this.#activationStatus = "deactivating"
    const active = [...this.#active.values()]
    const settlement = this.#completion ?? (() => {
      for (const entry of active) entry.controller.abort(new DOMException("Session deactivated", "AbortError"))
      return this.#join(active)
    })()
    this.#deactivation = settlement.then(
      () => {
        this.#activationStatus = "deactivated"
      },
      (error) => {
        this.#activationStatus = "deactivated"
        throw error
      },
    )
    return this.#deactivation
  }

  async #join(active) {
    const results = await Promise.allSettled(active.map((entry) => entry.settlement.promise))
    const failures = results.filter((result) => result.status === "rejected").map((result) => result.reason)
    if (failures.length === 1) throw failures[0]
    if (failures.length > 1) throw new AggregateError(failures, "session deactivation settlement failed")
  }

  #assertActive() {
    if (this.#activationStatus !== "active") throw new Error(`Session activation is ${this.#activationStatus}`)
  }
}

function summary(runtime, storeProbe) {
  return {
    activationStatus: runtime.activationStatus,
    runtimeStatus: runtime.record.status,
    runtimeVersion: runtime.record.version,
    work: runtime.record.work,
    durableStatus: storeProbe.value.status,
    durableVersion: storeProbe.value.version,
    commits: storeProbe.calls,
    trace: runtime.trace,
  }
}

async function noActiveWork() {
  const storeProbe = new StoreProbe(initial("no-active"))
  const runtime = new CandidateRuntime(storeProbe.value, storeProbe)
  const before = clone(storeProbe.value)
  await runtime.deactivate()
  assert.deepEqual(storeProbe.value, before)
  assert.deepEqual(summary(runtime, storeProbe), {
    activationStatus: "deactivated",
    runtimeStatus: "open",
    runtimeVersion: 0,
    work: [],
    durableStatus: "open",
    durableVersion: 0,
    commits: [],
    trace: [],
  })
  return summary(runtime, storeProbe)
}

async function oneActiveWork() {
  const storeProbe = new StoreProbe(initial("one-active"))
  const runtime = new CandidateRuntime(storeProbe.value, storeProbe)
  const active = runtime.admit("one")
  let closed = false
  const closing = runtime.deactivate().then(() => { closed = true })
  assert.equal(active.signal.aborted, true)
  await Promise.resolve()
  assert.equal(closed, false)
  runtime.settle("one", "cancelled")
  await closing
  assert.equal(storeProbe.calls.length, 0)
  assert.equal(storeProbe.value.status, "open")
  assert.equal(storeProbe.value.version, 0)
  return summary(runtime, storeProbe)
}

async function multipleActiveSiblings() {
  const storeProbe = new StoreProbe(initial("siblings"))
  const runtime = new CandidateRuntime(storeProbe.value, storeProbe)
  const left = runtime.admit("left")
  const right = runtime.admit("right")
  let closed = false
  const closing = runtime.deactivate().then(() => { closed = true })
  assert.equal(left.signal.aborted, true)
  assert.equal(right.signal.aborted, true)
  assert.deepEqual(runtime.trace, ["abort:left", "abort:right"])
  runtime.settle("right", "cancelled")
  await Promise.resolve()
  assert.equal(closed, false)
  runtime.settle("left", "cancelled")
  await closing
  assert.equal(storeProbe.calls.length, 0)
  return summary(runtime, storeProbe)
}

async function alreadySettledWork() {
  const storeProbe = new StoreProbe(initial("settled"))
  const runtime = new CandidateRuntime(storeProbe.value, storeProbe)
  runtime.admit("done")
  runtime.settle("done", "completed")
  await runtime.deactivate()
  assert.deepEqual(runtime.trace, ["settle:done:completed"])
  assert.equal(storeProbe.calls.length, 0)
  return summary(runtime, storeProbe)
}

async function checkpointBeforeClose() {
  const storeProbe = new StoreProbe(initial("checkpoint"))
  const runtime = new CandidateRuntime(storeProbe.value, storeProbe)
  await runtime.checkpoint()
  const afterCheckpoint = clone(storeProbe.value)
  await runtime.deactivate()
  assert.deepEqual(storeProbe.value, afterCheckpoint)
  assert.deepEqual(storeProbe.calls, [{ kind: "checkpoint", status: "open", expectedVersion: 0, version: 1 }])
  return summary(runtime, storeProbe)
}

async function finishBeforeClose() {
  const storeProbe = new StoreProbe(initial("finish-before-close"))
  const runtime = new CandidateRuntime(storeProbe.value, storeProbe)
  runtime.admit("finishing", { settleOnAbort: true })
  await runtime.finish()
  await runtime.deactivate()
  await runtime.deactivate()
  assert.equal(storeProbe.calls.length, 1)
  assert.equal(storeProbe.value.status, "finished")
  return summary(runtime, storeProbe)
}

async function repeatedDeactivation() {
  const storeProbe = new StoreProbe(initial("repeated"))
  const runtime = new CandidateRuntime(storeProbe.value, storeProbe)
  runtime.admit("active", { settleOnAbort: true })
  const first = runtime.deactivate()
  const second = runtime.deactivate()
  assert.equal(first, second)
  await first
  assert.equal(runtime.deactivate(), first)
  assert.deepEqual(runtime.trace, ["abort:active", "settle:active:cancelled"])
  assert.equal(storeProbe.calls.length, 0)
  return summary(runtime, storeProbe)
}

async function concurrentFinishFirst() {
  const commitGate = deferred()
  const storeProbe = new StoreProbe(initial("finish-first"), async (kind) => {
    if (kind === "finish") await commitGate.promise
  })
  const runtime = new CandidateRuntime(storeProbe.value, storeProbe)
  runtime.admit("active", { settleOnAbort: true })
  const finishing = runtime.finish()
  const deactivating = runtime.deactivate()
  commitGate.resolve()
  await Promise.all([finishing, deactivating])
  assert.equal(storeProbe.calls.length, 1)
  assert.equal(storeProbe.value.status, "finished")
  return summary(runtime, storeProbe)
}

async function concurrentDeactivateFirst() {
  const storeProbe = new StoreProbe(initial("deactivate-first"))
  const runtime = new CandidateRuntime(storeProbe.value, storeProbe)
  runtime.admit("active")
  const deactivating = runtime.deactivate()
  await assert.rejects(runtime.finish(), /deactivating/)
  runtime.settle("active", "cancelled")
  await deactivating
  assert.equal(storeProbe.calls.length, 0)
  assert.equal(storeProbe.value.status, "open")
  return summary(runtime, storeProbe)
}

async function cleanupSettlementError() {
  const storeProbe = new StoreProbe(initial("settlement-error"))
  const runtime = new CandidateRuntime(storeProbe.value, storeProbe)
  runtime.admit("bad")
  runtime.admit("good")
  const deactivating = runtime.deactivate()
  runtime.rejectSettlement("bad", new Error("attempt settlement failed"))
  runtime.settle("good", "cancelled")
  await assert.rejects(deactivating, /attempt settlement failed/)
  assert.equal(runtime.activationStatus, "deactivated")
  assert.equal(storeProbe.calls.length, 0)
  return summary(runtime, storeProbe)
}

async function liteCleanupOrder() {
  const order = []
  const first = resource({
    name: "probe.cleanup.first",
    factory: (ctx) => {
      ctx.cleanup(() => { order.push("resource:first") })
      return "first"
    },
  })
  const second = resource({
    name: "probe.cleanup.second",
    factory: (ctx) => {
      ctx.cleanup(async () => {
        order.push("resource:second:start")
        await Promise.resolve()
        order.push("resource:second:end")
      })
      return "second"
    },
  })
  const scope = createScope()
  const ctx = scope.createContext()
  await ctx.resolve(first)
  await ctx.resolve(second)
  ctx.onClose(() => { order.push("execution:on-close") })
  await ctx.close()
  await scope.dispose()
  assert.deepEqual(order, [
    "execution:on-close",
    "resource:second:start",
    "resource:second:end",
    "resource:first",
  ])
  return order
}

async function currentBaseline() {
  const bound = createAuthority({
    tenant: "tenant-a",
    roots: ["/workspace"],
    permissions: ["database:read"],
    tools: ["inspect_schema"],
    sandbox: { roots: ["/workspace"], commands: [], write: false, network: false },
  })
  const durable = {
    ...initial("current-baseline"),
    authorityFingerprint: bound.fingerprint,
    authorityConstraints: bound,
    branches: [{
      id: "main",
      version: 0,
      createdBy: "bootstrap",
      authorityFingerprint: bound.fingerprint,
      authority: bound,
      evidence: [],
    }],
  }
  let commits = 0
  const commitImpl = flow({
    name: "probe.cleanup.commit",
    factory: () => {
      commits++
      return { version: 1 }
    },
  })
  const scope = createScope({ tags: [
    authority(bound),
    record(durable),
    clock({ now: () => "2026-07-15T00:00:00.000Z" }),
    store.commit(commitImpl),
  ] })
  const ctx = scope.createContext()
  const runtime = await ctx.resolve(session)
  await ctx.close()
  await scope.dispose()
  assert.equal(commits, 0)
  assert.equal(durable.status, "open")
  assert.equal(durable.version, 0)
  assert.equal(runtime.status, "finishing")
  assert.equal(runtime.record.status, "finishing")
  return {
    durableStatus: durable.status,
    durableVersion: durable.version,
    runtimeStatus: runtime.status,
    runtimeRecordStatus: runtime.record.status,
    commits,
  }
}

async function digest(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex")
}

const validator = JSON.parse(await readFile(
  ".okra/runs/issue-triage-session-20260715/workers/validator-dkr-0-1/verification.json",
  "utf8",
))
const activationTrace = validator.audit_traces.find((trace) => trace.claim_id === "DKR-1.activation-behavior")
assert.equal(activationTrace.value, 6)
assert.equal(activationTrace.threshold, 6)
assert.equal(activationTrace.decision, "accepted")

const sessionSource = await readFile("pkg/sdk/core/src/session.ts", "utf8")
assert.match(sessionSource, /ownership: "current"/)
assert.match(sessionSource, /ctx\.cleanup\(\(\) => runtime\.shutdown\(\)\)/)
assert.match(sessionSource, /shutdown\(\): Promise<void>/)
assert.match(sessionSource, /if \(this\.#status === "open"\) return this\.beginFinish\(\)/)

const cases = {
  noActiveWork: await noActiveWork(),
  oneActiveWork: await oneActiveWork(),
  multipleActiveSiblings: await multipleActiveSiblings(),
  alreadySettledWork: await alreadySettledWork(),
  checkpointBeforeClose: await checkpointBeforeClose(),
  finishBeforeClose: await finishBeforeClose(),
  repeatedDeactivation: await repeatedDeactivation(),
  concurrentFinishFirst: await concurrentFinishFirst(),
  concurrentDeactivateFirst: await concurrentDeactivateFirst(),
  cleanupSettlementError: await cleanupSettlementError(),
}

const result = {
  probe: "dkr-1-cleanup-contract-v2",
  pass: true,
  preservedActivationBehavior: {
    value: activationTrace.value,
    threshold: activationTrace.threshold,
    decision: activationTrace.decision,
  },
  currentBaseline: await currentBaseline(),
  candidateCaseCount: Object.keys(cases).length,
  cases,
  liteCleanupOrder: await liteCleanupOrder(),
  claims: {
    ordinaryCloseCommitCount: 0,
    ordinaryCloseDurableStatusMutationCount: 0,
    ordinaryCloseDurableVersionMutationCount: 0,
    repeatedDeactivationExtraEffectCount: 0,
    finishFirstCommitCount: cases.concurrentFinishFirst.commits.length,
    deactivateFirstCommitCount: cases.concurrentDeactivateFirst.commits.length,
    newLitePrimitiveCount: 0,
  },
  sourceHashes: {
    sdkSession: await digest("pkg/sdk/core/src/session.ts"),
    sdkSessionTests: await digest("pkg/sdk/core/tests/session-kernel.test.ts"),
    liteScope: await digest("pkg/core/lite/src/scope.ts"),
    priorActivationCheckpoint: await digest(".okra/runs/issue-triage-session-20260715/workers/dkr-1/checkpoint.json"),
    priorValidator: await digest(".okra/runs/issue-triage-session-20260715/workers/validator-dkr-0-1/verification.json"),
  },
}

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
