import assert from "node:assert/strict"

function deferred() {
  let resolve
  let reject
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}

class AggregationRuntime {
  #active = new Map()
  #status = "active"
  #deactivation

  constructor() {
    this.durable = Object.freeze({ status: "open", version: 0 })
    this.commits = []
    this.trace = []
  }

  admit(id) {
    assert.equal(this.#status, "active")
    const controller = new AbortController()
    const settlement = deferred()
    const entry = { id, controller, settlement }
    this.#active.set(id, entry)
    controller.signal.addEventListener("abort", () => {
      this.trace.push(`abort:${id}`)
    }, { once: true })
    return { signal: controller.signal, settled: settlement.promise }
  }

  reject(id, error) {
    const entry = this.#active.get(id)
    assert.ok(entry)
    this.#active.delete(id)
    this.trace.push(`reject:${id}`)
    entry.settlement.reject(error)
  }

  settle(id, status) {
    const entry = this.#active.get(id)
    assert.ok(entry)
    this.#active.delete(id)
    this.trace.push(`settle:${id}:${status}`)
    entry.settlement.resolve({ status })
  }

  deactivate() {
    if (this.#deactivation) return this.#deactivation
    this.#status = "deactivating"
    const active = [...this.#active.values()]
    const reason = new DOMException("Session deactivated", "AbortError")
    for (const entry of active) entry.controller.abort(reason)
    this.#deactivation = Promise.allSettled(active.map((entry) => entry.settlement.promise))
      .then((results) => {
        const failures = results
          .filter((result) => result.status === "rejected")
          .map((result) => result.reason)
        if (failures.length === 1) throw failures[0]
        if (failures.length > 1) throw new AggregateError(failures, "session deactivation settlement failed")
      })
      .then(
        () => { this.#status = "deactivated" },
        (error) => {
          this.#status = "deactivated"
          throw error
        },
      )
    return this.#deactivation
  }

  get status() {
    return this.#status
  }
}

const runtime = new AggregationRuntime()
const durableBefore = structuredClone(runtime.durable)
const left = runtime.admit("left")
const right = runtime.admit("right")
const normal = runtime.admit("normal")
let settled = false
const outcome = runtime.deactivate().then(
  () => {
    settled = true
    return { ok: true }
  },
  (error) => {
    settled = true
    return { ok: false, error }
  },
)

assert.deepEqual(runtime.trace, ["abort:left", "abort:right", "abort:normal"])
for (const active of [left, right, normal]) {
  assert.equal(active.signal.aborted, true)
  assert.equal(active.signal.reason.name, "AbortError")
  assert.equal(active.signal.reason.message, "Session deactivated")
}

const leftFailure = new Error("left settlement failed")
const rightFailure = new Error("right settlement failed")
runtime.reject("right", rightFailure)
runtime.reject("left", leftFailure)
await Promise.resolve()
assert.equal(settled, false)
runtime.settle("normal", "cancelled")

const result = await outcome
assert.equal(result.ok, false)
assert.ok(result.error instanceof AggregateError)
assert.equal(result.error.message, "session deactivation settlement failed")
assert.deepEqual(result.error.errors, [leftFailure, rightFailure])
assert.equal(runtime.status, "deactivated")
assert.deepEqual(runtime.durable, durableBefore)
assert.equal(runtime.commits.length, 0)

process.stdout.write(`${JSON.stringify({
  probe: "dkr-1-cleanup-contract-v3-errors",
  pass: true,
  addedCaseCount: 1,
  rejectedSettlementCount: 2,
  snapshottedAttemptCount: 3,
  abortAllBeforeSettlement: true,
  awaitedAllBeforeReject: true,
  resultType: result.error.constructor.name,
  aggregateErrors: result.error.errors.map((error) => error.message),
  snapshotOrder: ["left", "right", "normal"],
  rejectionOrder: ["right", "left"],
  trace: runtime.trace,
  commitCount: runtime.commits.length,
  durableStatusMutationCount: Number(runtime.durable.status !== durableBefore.status),
  durableVersionMutationCount: Number(runtime.durable.version !== durableBefore.version),
}, null, 2)}\n`)
