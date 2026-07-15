import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"

function deferred() {
  let resolve
  let reject
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}

class Runtime {
  #active = new Map()
  #activation = "active"
  #deactivation
  #completion

  constructor() {
    this.record = { status: "open", version: 0, work: [] }
    this.durable = { status: "open", version: 0 }
    this.commits = []
    this.trace = []
  }

  admit(id, settleOnAbort = false) {
    assert.equal(this.#activation, "active")
    const controller = new AbortController()
    const settlement = deferred()
    this.#active.set(id, { id, controller, settlement })
    this.record.work.push({ id, status: "working" })
    controller.signal.addEventListener("abort", () => {
      this.trace.push(`abort:${id}`)
      if (settleOnAbort) this.settle(id, "cancelled")
    }, { once: true })
    return { signal: controller.signal, settled: settlement.promise }
  }

  settle(id, status = "completed") {
    const entry = this.#active.get(id)
    assert.ok(entry)
    this.#active.delete(id)
    this.record.work = this.record.work.map((work) => work.id === id ? { ...work, status } : work)
    this.trace.push(`settle:${id}:${status}`)
    entry.settlement.resolve({ status })
  }

  reject(id, error) {
    const entry = this.#active.get(id)
    assert.ok(entry)
    this.#active.delete(id)
    this.trace.push(`reject:${id}`)
    entry.settlement.reject(error)
  }

  checkpoint() {
    this.durable = { status: "open", version: this.durable.version + 1 }
    this.commits.push("checkpoint")
  }

  finish() {
    if (this.#completion) return this.#completion
    if (this.#activation !== "active") return Promise.reject(new Error(`activation ${this.#activation}`))
    this.record.status = "finishing"
    const active = [...this.#active.values()]
    for (const entry of active) entry.controller.abort(new DOMException("finishing", "AbortError"))
    this.#completion = this.#join(active).then(() => {
      this.durable = { status: "finished", version: this.durable.version + 1 }
      this.record.status = "finished"
      this.record.version = this.durable.version
      this.commits.push("finish")
    })
    return this.#completion
  }

  deactivate() {
    if (this.#deactivation) return this.#deactivation
    this.#activation = "deactivating"
    const active = [...this.#active.values()]
    const joined = this.#completion ?? (() => {
      for (const entry of active) entry.controller.abort(new DOMException("deactivated", "AbortError"))
      return this.#join(active)
    })()
    this.#deactivation = joined.then(
      () => { this.#activation = "deactivated" },
      (error) => {
        this.#activation = "deactivated"
        throw error
      },
    )
    return this.#deactivation
  }

  async #join(active) {
    const results = await Promise.allSettled(active.map((entry) => entry.settlement.promise))
    const errors = results.flatMap((result) => result.status === "rejected" ? [result.reason] : [])
    if (errors.length === 1) throw errors[0]
    if (errors.length > 1) throw new AggregateError(errors, "session deactivation settlement failed")
  }
}

async function runCases() {
  const cases = []

  {
    const runtime = new Runtime()
    await runtime.deactivate()
    assert.deepEqual(runtime.durable, { status: "open", version: 0 })
    cases.push("no-active-work")
  }
  {
    const runtime = new Runtime()
    const active = runtime.admit("one")
    let closed = false
    const close = runtime.deactivate().then(() => { closed = true })
    assert.equal(active.signal.aborted, true)
    await Promise.resolve()
    assert.equal(closed, false)
    runtime.settle("one", "cancelled")
    await close
    assert.deepEqual(runtime.record.work, [{ id: "one", status: "cancelled" }])
    assert.deepEqual(runtime.durable, { status: "open", version: 0 })
    cases.push("one-active-work")
  }
  {
    const runtime = new Runtime()
    runtime.admit("left")
    runtime.admit("right")
    let closed = false
    const close = runtime.deactivate().then(() => { closed = true })
    assert.deepEqual(runtime.trace, ["abort:left", "abort:right"])
    runtime.settle("right", "cancelled")
    await Promise.resolve()
    assert.equal(closed, false)
    runtime.settle("left", "cancelled")
    await close
    cases.push("multiple-active-siblings")
  }
  {
    const runtime = new Runtime()
    runtime.admit("done")
    runtime.settle("done", "completed")
    await runtime.deactivate()
    assert.deepEqual(runtime.trace, ["settle:done:completed"])
    cases.push("already-settled-work")
  }
  {
    const runtime = new Runtime()
    runtime.checkpoint()
    await runtime.deactivate()
    assert.deepEqual(runtime.commits, ["checkpoint"])
    assert.deepEqual(runtime.durable, { status: "open", version: 1 })
    cases.push("checkpoint-before-close")
  }
  {
    const runtime = new Runtime()
    runtime.admit("active", true)
    await runtime.finish()
    await runtime.deactivate()
    assert.deepEqual(runtime.commits, ["finish"])
    assert.deepEqual(runtime.durable, { status: "finished", version: 1 })
    cases.push("finish-before-close")
  }
  {
    const runtime = new Runtime()
    runtime.admit("active", true)
    const first = runtime.deactivate()
    assert.equal(runtime.deactivate(), first)
    await first
    assert.equal(runtime.deactivate(), first)
    assert.deepEqual(runtime.trace, ["abort:active", "settle:active:cancelled"])
    cases.push("repeated-deactivation")
  }
  {
    const runtime = new Runtime()
    runtime.admit("active", true)
    const finish = runtime.finish()
    const close = runtime.deactivate()
    await Promise.all([finish, close])
    assert.deepEqual(runtime.commits, ["finish"])
    cases.push("concurrent-finish-first")
  }
  {
    const runtime = new Runtime()
    runtime.admit("active")
    const close = runtime.deactivate()
    await assert.rejects(runtime.finish(), /deactivating/)
    runtime.settle("active", "cancelled")
    await close
    assert.deepEqual(runtime.commits, [])
    cases.push("concurrent-deactivate-first")
  }
  {
    const runtime = new Runtime()
    runtime.admit("bad")
    runtime.admit("normal")
    const original = new Error("original settlement failure")
    let closed = false
    const close = runtime.deactivate().then(
      () => { closed = true },
      (error) => {
        closed = true
        return error
      },
    )
    runtime.reject("bad", original)
    await Promise.resolve()
    assert.equal(closed, false)
    runtime.settle("normal", "cancelled")
    assert.equal(await close, original)
    assert.deepEqual(runtime.commits, [])
    cases.push("one-settlement-error")
  }
  {
    const runtime = new Runtime()
    runtime.admit("left")
    runtime.admit("right")
    runtime.admit("normal")
    let closed = false
    const close = runtime.deactivate().then(
      () => { closed = true },
      (error) => {
        closed = true
        return error
      },
    )
    assert.deepEqual(runtime.trace, ["abort:left", "abort:right", "abort:normal"])
    const left = new Error("left")
    const right = new Error("right")
    runtime.reject("right", right)
    runtime.reject("left", left)
    await Promise.resolve()
    assert.equal(closed, false)
    runtime.settle("normal", "cancelled")
    const error = await close
    assert.ok(error instanceof AggregateError)
    assert.deepEqual(error.errors, [left, right])
    assert.deepEqual(runtime.commits, [])
    assert.deepEqual(runtime.durable, { status: "open", version: 0 })
    cases.push("multiple-settlement-errors")
  }

  return cases
}

const base = ".okra/runs/issue-triage-session-20260715"
const checkpoint = JSON.parse(await readFile(`${base}/workers/dkr-1-cleanup-v3/checkpoint.v3.json`, "utf8"))
const contract = JSON.parse(await readFile(`${base}/workers/dkr-1-cleanup-v3/cleanup-contract.json`, "utf8"))
const priorValidator = JSON.parse(await readFile(`${base}/workers/validator-dkr-0-1/verification.json`, "utf8"))
const frame = JSON.parse(await readFile(`${base}/frame/frame.v2.json`, "utf8"))
const sessionSource = await readFile("pkg/sdk/core/src/session.ts", "utf8")
const liteSource = await readFile("pkg/core/lite/src/scope.ts", "utf8")
const activation = priorValidator.audit_traces.find((trace) => trace.claim_id === "DKR-1.activation-behavior")
const cleanupWall = frame.anti_goals.find((wall) => wall.metric_id === "cleanup_business_state_mutation_count")
const cases = await runCases()

assert.equal(cases.length, 11)
assert.equal(activation.value, 6)
assert.equal(activation.threshold, 6)
assert.equal(activation.decision, "accepted")
assert.equal(cleanupWall.threshold, 0)
assert.match(cleanupWall.read_method, /status and version remain unchanged/)
assert.equal(contract.inherits.placement_change_count, 0)
assert.equal(contract.inherits.lifecycle_semantic_change_count, 0)
assert.equal(contract.probe_expectations.new_lite_primitive_count, 0)
assert.match(sessionSource, /ownership: "current"/)
assert.match(sessionSource, /ctx\.cleanup\(\(\) => runtime\.shutdown\(\)\)/)
assert.match(liteSource, /private async runCloseCleanups/)
assert.equal(checkpoint.wall_gate.downstream_advance, "blocked")
assert.equal(checkpoint.active_anti_goal_verification.find(
  (wall) => wall.metric_id === "cleanup_business_state_mutation_count",
).value, 1)

const digest = (value) => createHash("sha256").update(value).digest("hex")
process.stdout.write(`${JSON.stringify({
  verdict: "replayed",
  cleanupCases: `${cases.length}/11`,
  caseIds: cases,
  activationBehaviors: `${activation.value}/${activation.threshold}`,
  abortAllBeforeWait: true,
  joinAllBeforeResult: true,
  deterministicAggregateErrorOrder: true,
  oneErrorIdentityPreserved: true,
  idempotency: true,
  checkpoint: true,
  finish: true,
  raceOrders: "2/2",
  hiddenCommitCount: 0,
  activationLocalCancelledIsDurableMutation: false,
  sdkPlacement: true,
  litePrimitiveChangeCount: 0,
  ownershipChangeCount: 0,
  currentProductCleanupWallValue: 1,
  downstreamAdvance: checkpoint.wall_gate.downstream_advance,
  sourceHashes: {
    checkpoint: digest(await readFile(`${base}/workers/dkr-1-cleanup-v3/checkpoint.v3.json`)),
    contract: digest(await readFile(`${base}/workers/dkr-1-cleanup-v3/cleanup-contract.json`)),
    sdkSession: digest(sessionSource),
    liteScope: digest(liteSource),
  },
}, null, 2)}\n`)
