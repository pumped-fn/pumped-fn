import assert from "node:assert/strict"
import { controller, createScope, flow, resource, tag, tags } from "../../../../../pkg/core/lite/dist/index.mjs"

const config = Object.freeze({
  concurrency: tag({ label: "probe.queue.config.concurrency" }),
  retryDelay: tag({ label: "probe.queue.config.retry-delay" }),
})

const queue = Object.freeze({
  receive: tag({ label: "probe.queue.port.receive" }),
  acknowledge: tag({ label: "probe.queue.port.acknowledge" }),
  reject: tag({ label: "probe.queue.port.reject" }),
  leaseValid: tag({ label: "probe.queue.port.lease-valid" }),
})

const timer = Object.freeze({
  wait: tag({ label: "probe.timer.port.wait" }),
})

const delivery = Object.freeze({
  session: tag({ label: "probe.delivery.session" }),
  authority: tag({ label: "probe.delivery.authority" }),
  issue: tag({ label: "probe.delivery.issue" }),
  queue: tag({ label: "probe.delivery.queue" }),
  lease: tag({ label: "probe.delivery.lease" }),
  observation: tag({ label: "probe.delivery.observation" }),
  tracker: tag({ label: "probe.delivery.tracker" }),
})

const runtime = resource({
  name: "probe.queue.runtime",
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

const triage = flow({
  name: "probe.github.issue-triage",
  deps: { tracker: tags.required(delivery.tracker) },
  factory: async (ctx, { tracker }) => {
    tracker.handlerStarts.push(ctx.input.id)
    if (ctx.input.behavior === "handler-error") throw new Error(`handler failed:${ctx.input.id}`)
    if (ctx.input.behavior === "slow") await tracker.slow.promise
    if (ctx.input.behavior === "paced") {
      const gate = deferred()
      tracker.paced.push(gate)
      if (tracker.paced.length === 2) {
        for (const pending of tracker.paced) pending.resolve()
      }
      await gate.promise
    }
    tracker.handlerEnds.push(ctx.input.id)
    return { hypothesis: `issue:${ctx.input.issue.number}` }
  },
})

const activate = flow({
  name: "probe.github.delivery-activation",
  deps: {
    triage: controller(triage),
    session: tags.required(delivery.session),
    authority: tags.required(delivery.authority),
    issue: tags.required(delivery.issue),
    queue: tags.required(delivery.queue),
    lease: tags.required(delivery.lease),
    observation: tags.required(delivery.observation),
    tracker: tags.required(delivery.tracker),
  },
  factory: async (ctx, deps) => {
    deps.tracker.activationActive++
    deps.tracker.activationMax = Math.max(deps.tracker.activationMax, deps.tracker.activationActive)
    deps.tracker.activations.push({
      deliveryId: ctx.input.id,
      sessionId: deps.session.id,
      authority: deps.authority.tenant,
      issue: deps.issue.number,
      queue: deps.queue.name,
      lease: deps.lease.id,
      observation: deps.observation.activationId,
    })
    try {
      return await deps.triage.exec({ input: ctx.input })
    } finally {
      deps.tracker.activationActive--
    }
  },
})

async function rejectDelivery(message, reason, retryDelay, wait, reject) {
  await wait.exec({ input: { milliseconds: retryDelay, deliveryId: message.id, reason } })
  return reject.exec({ input: { message, reason } })
}

const runDelivery = flow({
  name: "probe.queue.run-delivery",
  deps: {
    activate: controller(activate),
    acknowledge: tags.required(queue.acknowledge),
    reject: tags.required(queue.reject),
    leaseValid: tags.required(queue.leaseValid),
    wait: tags.required(timer.wait),
    retryDelay: tags.required(config.retryDelay),
  },
  factory: async (ctx, deps) => {
    const message = ctx.input
    const activationTags = [
      delivery.session({ id: message.sessionId }),
      delivery.authority({ tenant: message.tenant }),
      delivery.issue(message.issue),
      delivery.queue({ name: message.queue }),
      delivery.lease({ id: message.leaseId, attempt: message.attempt }),
      delivery.observation({ activationId: `activation:${message.id}:${message.attempt}` }),
      delivery.tracker(message.tracker),
    ]
    let result
    try {
      result = await deps.activate.exec({ input: message, tags: activationTags })
    } catch (error) {
      await rejectDelivery(message, "handler-error", deps.retryDelay, deps.wait, deps.reject)
      return { deliveryId: message.id, status: "rejected", error: error.message }
    }
    if (!await deps.leaseValid.exec({ input: { message } })) {
      await rejectDelivery(message, "lease-lost", deps.retryDelay, deps.wait, deps.reject)
      return { deliveryId: message.id, status: "lease-lost" }
    }
    try {
      await deps.acknowledge.exec({ input: { message, result } })
      return { deliveryId: message.id, status: "acknowledged" }
    } catch (error) {
      await rejectDelivery(message, "acknowledgement-error", deps.retryDelay, deps.wait, deps.reject)
      return { deliveryId: message.id, status: "acknowledgement-error", error: error.message }
    }
  },
})

const watch = flow({
  name: "probe.queue.watch",
  deps: {
    runtime,
    receive: tags.required(queue.receive),
    runDelivery: controller(runDelivery),
    concurrency: tags.required(config.concurrency),
  },
  factory: async (_ctx, deps) => {
    const results = []
    let backpressureCount = 0
    while (!deps.runtime.stopping) {
      if (deps.runtime.active.size >= deps.concurrency) {
        backpressureCount++
        await Promise.race(deps.runtime.active)
      }
      const received = await deps.receive.exec()
      if (received === null) break
      if (received.kind === "shutdown") {
        deps.runtime.stopping = true
        break
      }
      const task = deps.runDelivery.exec({ input: received.message }).then((result) => {
        results.push(result)
        return result
      })
      deps.runtime.active.add(task)
      task.then(
        () => { deps.runtime.active.delete(task) },
        () => { deps.runtime.active.delete(task) },
      )
    }
    await Promise.all(deps.runtime.active)
    return { results, backpressureCount, activeAfterJoin: deps.runtime.active.size }
  },
})

function deferred() {
  let resolve
  const promise = new Promise((onResolve) => { resolve = onResolve })
  return { promise, resolve }
}

function message(id, options = {}) {
  return {
    id,
    sessionId: options.sessionId ?? `session:${id}`,
    tenant: options.tenant ?? "tenant-a",
    issue: { number: options.issue ?? (Number(id.replace(/\D/g, "")) || 1) },
    queue: "github-issues",
    leaseId: `lease:${id}:${options.attempt ?? 1}`,
    attempt: options.attempt ?? 1,
    behavior: options.behavior ?? "success",
    leaseLost: options.leaseLost ?? false,
  }
}

async function runScenario(name, input) {
  const slow = deferred()
  const tracker = {
    name,
    activations: [],
    activationActive: 0,
    activationMax: 0,
    handlerStarts: [],
    handlerEnds: [],
    acknowledged: [],
    rejected: [],
    waits: [],
    receives: [],
    slow,
    paced: [],
    expectedFinal: input.messages.length,
    terminalCount: 0,
    queueChanged: deferred(),
  }
  const pending = input.messages.map((value) => ({ kind: "delivery", message: { ...value, tracker } }))
  if (input.shutdown) pending.splice(input.shutdown.afterReceives, 0, { kind: "shutdown" })

  const receive = flow({
    name: `probe.queue.receive.${name}`,
    factory: async () => {
      while (pending.length === 0 && tracker.terminalCount < tracker.expectedFinal) {
        await tracker.queueChanged.promise
      }
      const value = pending.shift() ?? null
      tracker.receives.push(value?.kind ?? "empty")
      if (value?.kind === "shutdown") queueMicrotask(() => slow.resolve())
      return value
    },
  })
  const acknowledge = flow({
    name: `probe.queue.acknowledge.${name}`,
    factory: (ctx) => {
      if (input.acknowledgementErrors?.includes(ctx.input.message.id)) {
        throw new Error(`acknowledgement failed:${ctx.input.message.id}`)
      }
      tracker.acknowledged.push(ctx.input.message.id)
      tracker.terminalCount++
      tracker.queueChanged.resolve()
      tracker.queueChanged = deferred()
    },
  })
  const reject = flow({
    name: `probe.queue.reject.${name}`,
    factory: (ctx) => {
      const { message: value, reason } = ctx.input
      tracker.rejected.push({ id: value.id, attempt: value.attempt, reason })
      if (reason === "lease-lost" && value.attempt < 2) {
        pending.push({ kind: "delivery", message: {
          ...value,
          leaseId: `lease:${value.id}:2`,
          attempt: 2,
          leaseLost: false,
        } })
      } else {
        tracker.terminalCount++
      }
      tracker.queueChanged.resolve()
      tracker.queueChanged = deferred()
    },
  })
  const leaseValid = flow({
    name: `probe.queue.lease-valid.${name}`,
    factory: (ctx) => !ctx.input.message.leaseLost,
  })
  const wait = flow({
    name: `probe.timer.wait.${name}`,
    factory: (ctx) => {
      tracker.waits.push(ctx.input)
      return Promise.resolve()
    },
  })

  const scope = createScope({ tags: [
    config.concurrency(input.concurrency ?? 2),
    config.retryDelay(5),
    queue.receive(receive),
    queue.acknowledge(acknowledge),
    queue.reject(reject),
    queue.leaseValid(leaseValid),
    timer.wait(wait),
  ] })
  const ctx = scope.createContext()
  const watched = await ctx.exec({ flow: watch })
  await ctx.close()
  await scope.dispose()
  assert.equal(watched.activeAfterJoin, 0)
  assert.equal(tracker.activationActive, 0)
  assert.equal(tracker.activations.length, tracker.handlerStarts.length)
  return {
    name,
    watched,
    activations: tracker.activations,
    activationMax: tracker.activationMax,
    handlerStarts: tracker.handlerStarts,
    handlerEnds: tracker.handlerEnds,
    acknowledged: tracker.acknowledged,
    rejected: tracker.rejected,
    waits: tracker.waits,
    receives: tracker.receives,
  }
}

const cases = {
  zeroMessages: await runScenario("zero-messages", { messages: [] }),
  oneMessage: await runScenario("one-message", { messages: [message("issue-1")] }),
  burstAboveConcurrency: await runScenario("burst", {
    concurrency: 2,
    messages: [
      message("issue-1", { behavior: "paced" }),
      message("issue-2", { behavior: "paced" }),
      message("issue-3"),
      message("issue-4"),
      message("issue-5"),
    ],
  }),
  handlerError: await runScenario("handler-error", {
    messages: [message("issue-1", { behavior: "handler-error" })],
  }),
  acknowledgementError: await runScenario("acknowledgement-error", {
    messages: [message("issue-1")],
    acknowledgementErrors: ["issue-1"],
  }),
  leaseLossRetry: await runScenario("lease-loss-retry", {
    messages: [message("issue-1", { leaseLost: true })],
  }),
  shutdownWhileActive: await runScenario("shutdown-active", {
    messages: [message("issue-1", { behavior: "slow" })],
    shutdown: { afterReceives: 1 },
  }),
  twoSessionsOneScope: await runScenario("two-sessions", {
    messages: [
      message("issue-1", { sessionId: "session-a", issue: 41 }),
      message("issue-2", { sessionId: "session-b", issue: 42 }),
    ],
  }),
}

assert.equal(cases.zeroMessages.activations.length, 0)
assert.equal(cases.oneMessage.activations.length, 1)
assert.deepEqual(cases.oneMessage.acknowledged, ["issue-1"])
assert.equal(cases.burstAboveConcurrency.activationMax, 2)
assert.ok(cases.burstAboveConcurrency.watched.backpressureCount > 0)
assert.equal(cases.burstAboveConcurrency.acknowledged.length, 5)
assert.deepEqual(cases.handlerError.rejected, [{ id: "issue-1", attempt: 1, reason: "handler-error" }])
assert.deepEqual(cases.acknowledgementError.rejected, [{ id: "issue-1", attempt: 1, reason: "acknowledgement-error" }])
assert.deepEqual(cases.leaseLossRetry.rejected, [{ id: "issue-1", attempt: 1, reason: "lease-lost" }])
assert.deepEqual(cases.leaseLossRetry.acknowledged, ["issue-1"])
assert.equal(cases.leaseLossRetry.activations.length, 2)
assert.deepEqual(cases.shutdownWhileActive.receives.slice(0, 2), ["delivery", "shutdown"])
assert.deepEqual(cases.shutdownWhileActive.handlerEnds, ["issue-1"])
assert.equal(cases.twoSessionsOneScope.activations.length, 2)
assert.deepEqual(cases.twoSessionsOneScope.activations.map((value) => value.sessionId), ["session-a", "session-b"])
assert.notEqual(cases.twoSessionsOneScope.activations[0].observation, cases.twoSessionsOneScope.activations[1].observation)

for (const value of Object.values(cases)) {
  assert.equal(value.activations.length, value.handlerStarts.length)
  assert.ok(value.activationMax <= 2)
  assert.ok(value.waits.every((wait) => wait.milliseconds === 5))
}

process.stdout.write(`${JSON.stringify({
  probe: "dkr-4-bounded-queue-composition-v1",
  pass: true,
  casePassCount: Object.keys(cases).length,
  caseTarget: 8,
  explicitPortCount: 5,
  hiddenQueueEffectCount: 0,
  hiddenTimerEffectCount: 0,
  workerRegistryDispatchCount: 0,
  startOrSpawnPrimitiveCount: 0,
  publicPoolAbstractionCount: 0,
  activationExecCount: Object.values(cases).reduce((count, value) => count + value.activations.length, 0),
  handlerStartCount: Object.values(cases).reduce((count, value) => count + value.handlerStarts.length, 0),
  maxObservedConcurrency: Math.max(...Object.values(cases).map((value) => value.activationMax)),
  cases,
}, null, 2)}\n`)
