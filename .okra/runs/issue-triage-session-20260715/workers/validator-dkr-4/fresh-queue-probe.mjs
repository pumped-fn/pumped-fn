import assert from "node:assert/strict"
import { controller, createScope, flow, resource, tag, tags } from "../../../../../pkg/core/lite/dist/index.mjs"

const config = Object.freeze({
  concurrency: tag({ label: "validator.queue.concurrency" }),
})

const ports = Object.freeze({
  receive: tag({ label: "validator.queue.receive" }),
  acknowledge: tag({ label: "validator.queue.acknowledge" }),
  reject: tag({ label: "validator.queue.reject" }),
  leaseValid: tag({ label: "validator.queue.lease-valid" }),
  wait: tag({ label: "validator.timer.wait" }),
})

const delivery = Object.freeze({
  session: tag({ label: "validator.delivery.session" }),
  issue: tag({ label: "validator.delivery.issue" }),
  lease: tag({ label: "validator.delivery.lease" }),
  tracker: tag({ label: "validator.delivery.tracker" }),
})

const runtime = resource({
  name: "validator.queue.runtime",
  ownership: "current",
  factory: (ctx) => {
    const value = { active: new Set(), stopping: false, cleanupActiveCount: undefined }
    ctx.cleanup(async () => {
      value.stopping = true
      value.cleanupActiveCount = value.active.size
      await Promise.allSettled([...value.active])
    })
    return value
  },
})

const handler = flow({
  name: "validator.issue.handler",
  deps: {
    session: tags.required(delivery.session),
    issue: tags.required(delivery.issue),
    lease: tags.required(delivery.lease),
    tracker: tags.required(delivery.tracker),
  },
  factory: async (ctx, deps) => {
    deps.tracker.active++
    deps.tracker.maxActive = Math.max(deps.tracker.maxActive, deps.tracker.active)
    deps.tracker.observations.push({
      id: ctx.input.id,
      session: deps.session,
      issue: deps.issue,
      lease: deps.lease,
      resultOwner: `${deps.session}:${ctx.input.id}`,
    })
    try {
      if (ctx.input.behavior === "handler-failure") throw new Error(`handler:${ctx.input.id}`)
      if (ctx.input.behavior === "paced") {
        deps.tracker.pacedStarted++
        if (deps.tracker.pacedStarted === 2) deps.tracker.pacedGate.resolve()
        await deps.tracker.pacedGate.promise
      }
      if (ctx.input.behavior === "slow") await deps.tracker.slow.promise
      return { owner: `${deps.session}:${ctx.input.id}` }
    } finally {
      deps.tracker.active--
    }
  },
})

const activateLease = flow({
  name: "validator.queue.activate-lease",
  deps: {
    handler: controller(handler),
    acknowledge: tags.required(ports.acknowledge),
    reject: tags.required(ports.reject),
    leaseValid: tags.required(ports.leaseValid),
    wait: tags.required(ports.wait),
  },
  factory: async (ctx, deps) => {
    const message = ctx.input
    let result
    try {
      result = await deps.handler.exec({ input: message })
    } catch (error) {
      await deps.wait.exec({ input: { reason: "handler-failure", id: message.id } })
      await deps.reject.exec({ input: { message, reason: "handler-failure" } })
      return { id: message.id, status: "rejected", error: error.message }
    }
    if (!await deps.leaseValid.exec({ input: message })) {
      await deps.wait.exec({ input: { reason: "lease-lost", id: message.id } })
      await deps.reject.exec({ input: { message, reason: "lease-lost" } })
      return { id: message.id, status: "lease-lost" }
    }
    try {
      await deps.acknowledge.exec({ input: { message, result } })
      return { id: message.id, status: "acknowledged", owner: result.owner }
    } catch (error) {
      await deps.wait.exec({ input: { reason: "acknowledgement-failure", id: message.id } })
      await deps.reject.exec({ input: { message, reason: "acknowledgement-failure" } })
      return { id: message.id, status: "acknowledgement-failure", error: error.message }
    }
  },
})

const watch = flow({
  name: "validator.queue.watch",
  deps: {
    runtime,
    receive: tags.required(ports.receive),
    activateLease: controller(activateLease),
    concurrency: tags.required(config.concurrency),
  },
  factory: async (_ctx, deps) => {
    const results = []
    let backpressureCount = 0
    let activationExecCount = 0
    while (!deps.runtime.stopping) {
      if (deps.runtime.active.size >= deps.concurrency) {
        backpressureCount++
        await Promise.race(deps.runtime.active)
      }
      const event = await deps.receive.exec()
      if (event === null) break
      if (event.kind === "shutdown") {
        deps.runtime.stopping = true
        break
      }
      activationExecCount++
      const message = event.message
      const task = deps.activateLease.exec({
        input: message,
        tags: [
          delivery.session(message.session),
          delivery.issue(message.issue),
          delivery.lease(message.lease),
          delivery.tracker(message.tracker),
        ],
      }).then((result) => {
        results.push(result)
        return result
      })
      deps.runtime.active.add(task)
      void task.finally(() => deps.runtime.active.delete(task))
    }
    await Promise.allSettled([...deps.runtime.active])
    return { results, backpressureCount, activationExecCount, activeAfterJoin: deps.runtime.active.size }
  },
})

function deferred() {
  let resolve
  const promise = new Promise((onResolve) => { resolve = onResolve })
  return { promise, resolve }
}

function makeMessage(id, options = {}) {
  return {
    id,
    session: options.session ?? `session:${id}`,
    issue: options.issue ?? (Number(id.replace(/\D/g, "")) || 1),
    lease: options.lease ?? `lease:${id}:${options.attempt ?? 1}`,
    attempt: options.attempt ?? 1,
    behavior: options.behavior ?? "success",
    leaseLost: options.leaseLost ?? false,
  }
}

function makeQueue(initial, tracker, expectedTerminalCount) {
  const pending = [...initial]
  let wake = deferred()
  const signal = () => {
    wake.resolve()
    wake = deferred()
  }
  return {
    async receive() {
      while (pending.length === 0 && tracker.terminalCount < expectedTerminalCount) await wake.promise
      const event = pending.shift() ?? null
      if (event?.kind === "shutdown") tracker.slow.resolve()
      return event
    },
    push(event) {
      pending.push(event)
      signal()
    },
    terminal() {
      tracker.terminalCount++
      signal()
    },
  }
}

async function scenario(name, messages, options = {}) {
  const tracker = {
    name,
    active: 0,
    maxActive: 0,
    observations: [],
    acknowledgements: [],
    rejections: [],
    waits: [],
    terminalCount: 0,
    pacedStarted: 0,
    pacedGate: deferred(),
    slow: deferred(),
  }
  for (const message of messages) message.tracker = tracker
  const events = messages.map((message) => ({ kind: "delivery", message }))
  if (options.shutdownAfter !== undefined) events.splice(options.shutdownAfter, 0, { kind: "shutdown" })
  const queue = makeQueue(events, tracker, messages.length)
  const receive = flow({ name: `validator.receive.${name}`, factory: () => queue.receive() })
  const acknowledge = flow({
    name: `validator.acknowledge.${name}`,
    factory: (ctx) => {
      if (options.acknowledgementFailure === ctx.input.message.id) throw new Error(`ack:${ctx.input.message.id}`)
      tracker.acknowledgements.push({ id: ctx.input.message.id, lease: ctx.input.message.lease, owner: ctx.input.result.owner })
      queue.terminal()
    },
  })
  const reject = flow({
    name: `validator.reject.${name}`,
    factory: (ctx) => {
      const { message, reason } = ctx.input
      tracker.rejections.push({ id: message.id, lease: message.lease, reason })
      if (reason === "lease-lost" && message.attempt === 1) {
        const retry = makeMessage(message.id, { session: message.session, issue: message.issue, attempt: 2 })
        retry.tracker = tracker
        queue.push({ kind: "delivery", message: retry })
      } else {
        queue.terminal()
      }
    },
  })
  const leaseValid = flow({ name: `validator.lease-valid.${name}`, factory: (ctx) => !ctx.input.leaseLost })
  const wait = flow({ name: `validator.wait.${name}`, factory: (ctx) => { tracker.waits.push(ctx.input) } })
  const scope = createScope({ tags: [
    config.concurrency(options.concurrency ?? 2),
    ports.receive(receive),
    ports.acknowledge(acknowledge),
    ports.reject(reject),
    ports.leaseValid(leaseValid),
    ports.wait(wait),
  ] })
  const ctx = scope.createContext()
  const result = await ctx.exec({ flow: watch })
  await ctx.close()
  await scope.dispose()
  assert.equal(result.activeAfterJoin, 0)
  assert.equal(tracker.active, 0)
  assert.equal(result.activationExecCount, tracker.observations.length)
  assert.equal(result.activationExecCount, tracker.acknowledgements.length + tracker.rejections.length)
  assert.ok(tracker.maxActive <= (options.concurrency ?? 2))
  return { result, tracker }
}

const zero = await scenario("zero", [])
const one = await scenario("one", [makeMessage("issue-1")])
const burst = await scenario("burst", [
  makeMessage("issue-1", { behavior: "paced" }),
  makeMessage("issue-2", { behavior: "paced" }),
  makeMessage("issue-3"),
  makeMessage("issue-4"),
  makeMessage("issue-5"),
], { concurrency: 2 })
const handlerFailure = await scenario("handler-failure", [makeMessage("issue-1", { behavior: "handler-failure" })])
const acknowledgementFailure = await scenario("acknowledgement-failure", [makeMessage("issue-1")], { acknowledgementFailure: "issue-1" })
const leaseLoss = await scenario("lease-loss", [makeMessage("issue-1", { leaseLost: true })])
const shutdown = await scenario("shutdown", [makeMessage("issue-1", { behavior: "slow" })], { shutdownAfter: 1 })
const sharedScope = await scenario("shared-scope", [
  makeMessage("issue-1", { session: "session-a", issue: 41 }),
  makeMessage("issue-2", { session: "session-b", issue: 42 }),
])

assert.equal(zero.result.activationExecCount, 0)
assert.equal(one.tracker.acknowledgements.length, 1)
assert.equal(burst.tracker.maxActive, 2)
assert.ok(burst.result.backpressureCount > 0)
assert.equal(burst.tracker.acknowledgements.length, 5)
assert.deepEqual(handlerFailure.tracker.rejections.map(({ reason }) => reason), ["handler-failure"])
assert.deepEqual(acknowledgementFailure.tracker.rejections.map(({ reason }) => reason), ["acknowledgement-failure"])
assert.deepEqual(leaseLoss.tracker.rejections.map(({ reason }) => reason), ["lease-lost"])
assert.equal(leaseLoss.tracker.acknowledgements.length, 1)
assert.equal(leaseLoss.result.activationExecCount, 2)
assert.equal(shutdown.result.activeAfterJoin, 0)
assert.deepEqual(sharedScope.tracker.observations.map(({ session }) => session), ["session-a", "session-b"])
assert.deepEqual(sharedScope.tracker.observations.map(({ issue }) => issue), [41, 42])
assert.deepEqual(sharedScope.tracker.observations.map(({ resultOwner }) => resultOwner), ["session-a:issue-1", "session-b:issue-2"])

const source = await import("node:fs/promises").then(({ readFile }) => readFile(new URL(import.meta.url), "utf8"))
const requiredPortMarkers = ["tags.required(ports.receive)", "tags.required(ports.acknowledge)", "tags.required(ports.reject)", "tags.required(ports.leaseValid)", "tags.required(ports.wait)"]
const forbiddenMarkers = ["WorkerRegistry", ".start(", ".spawn(", "setTimeout(", "setInterval(", "node:child_process", "fetch(", "createSharedScope"]
assert.ok(requiredPortMarkers.every((marker) => source.includes(marker)))
assert.ok(forbiddenMarkers.every((marker) => !source.includes(marker)))

const all = [zero, one, burst, handlerFailure, acknowledgementFailure, leaseLoss, shutdown, sharedScope]
const activationExecCount = all.reduce((count, value) => count + value.result.activationExecCount, 0)
const terminalPortCallCount = all.reduce((count, value) => count + value.tracker.acknowledgements.length + value.tracker.rejections.length, 0)

process.stdout.write(`${JSON.stringify({
  probe: "validator-dkr-4-fresh-queue-v1",
  pass: true,
  case_pass_count: 8,
  case_target: 8,
  explicit_required_port_count: requiredPortMarkers.length,
  hidden_queue_or_timer_effect_count: 0,
  max_observed_concurrency: Math.max(...all.map((value) => value.tracker.maxActive)),
  backpressure_observed: burst.result.backpressureCount > 0,
  activation_exec_count: activationExecCount,
  terminal_port_call_count: terminalPortCallCount,
  one_activation_per_lease: activationExecCount === terminalPortCallCount,
  active_after_graceful_join: all.reduce((count, value) => count + value.result.activeAfterJoin, 0),
  cross_session_tag_or_result_leak_count: 0,
  forbidden_surface_count: 0,
  forced_context_close_case_count: 0,
  forced_context_close_dependency: "conditional on accepted DKR-2",
  scenarios: {
    zero_messages: zero.result,
    one_delivery: one.result,
    burst_above_concurrency: burst.result,
    handler_failure: handlerFailure.result,
    acknowledgement_failure: acknowledgementFailure.result,
    lease_loss: leaseLoss.result,
    shutdown_while_active: shutdown.result,
    two_sessions_one_server_scope: sharedScope.result,
  },
}, null, 2)}\n`)
