import {
  controller,
  createScope,
  flow,
  resource,
  tag,
  tags,
  typed,
} from "@pumped-fn/lite"

type Authority = {
  tenant: string
  fingerprint: string
  schemas: readonly string[]
}

type SessionSeed = {
  id: string
  record?: SessionRecord
}

type SessionStatus = "open" | "finishing" | "sealed"
type WorkStatus = "working" | "waiting" | "completed" | "interrupted" | "failed"

type WorkRecord = {
  id: string
  status: WorkStatus
  attempts: number
  epoch: number
}

type SessionRecord = {
  id: string
  status: SessionStatus
  revision: number
  authorityFingerprint: string
  authorityTenant: string
  authoritySchemas: string[]
  evidence: string[]
  artifactRefs: string[]
  memoryCandidates: string[]
  memories: string[]
  works: Record<string, WorkRecord>
}

type Attempt = {
  id: string
  workId: string
  number: number
  epoch: number
  status: WorkStatus
  signal: AbortController
  liveLeases: number
  settled: Promise<void>
  settle(): void
}

type Branch = {
  id: string
  baseRevision: number
  evidence: readonly string[]
}

type SessionEvent = {
  index: number
  type: string
  detail?: string
}

type SessionRuntime = {
  record: SessionRecord
  events: SessionEvent[]
  active: Map<string, Attempt>
  attempts: Map<string, Attempt>
  quarantine: string[]
  finishPromise?: Promise<void>
  emit(type: string, detail?: string): void
  admit(workId: string): Attempt
  child(parent: Attempt, name: string): Attempt
  wait(attempt: Attempt): void
  complete(attempt: Attempt): void
  interrupt(attemptId: string): Attempt
  settleInterrupted(attempt: Attempt): void
  fail(attempt: Attempt): void
  accepts(attempt: Attempt, epoch: number): boolean
  snapshot(status?: SessionStatus): SessionRecord
}

type ToolReady = {
  identity: string
  name: "inspect_schema"
  permit: string
}

type RunKind = "normal" | "parallel" | "wait" | "resume" | "interrupt" | "finish-active" | "fail-fast"

type RunInput = {
  workId: string
  kind: RunKind
}

type InnerInput = RunInput & {
  attemptId: string
}

type InnerResult = {
  status: "completed" | "waiting" | "interrupted"
  attemptId: string
  snapshotIdentity?: string
  dispatchedIdentity?: string
  branches?: readonly Branch[]
  content?: string
  epoch?: number
  roundIdentities?: readonly string[]
}

type ToolInput = {
  attemptId: string
  identity: string
  analysis: string
  parallel?: boolean
}

type ModelInput = {
  attemptId: string
  phase: "select" | "reason" | "slow" | "finish-slow"
  tools: readonly string[]
}

type ModelOutput = {
  content: string
  toolIdentity?: string
}

type ChildInput = {
  attemptId: string
  branch: Branch
  identity: string
  analysis: string
}

type MergeInput = {
  expectedRevision: number
  branches: readonly Branch[]
}

type SteeringInput = {
  attemptId: string
}

type ArtifactInput = {
  digest: string
}

type MemoryInput = {
  content: string
  approvals?: number
}

type ScheduledInput = {
  workId: string
}

type StoredSessionInput = {
  id: string
}

type ForkInput = {
  parentId: string
  childId: string
}

type ProbeResult = {
  cases: Record<string, boolean>
  counts: Record<string, number>
  trace: readonly string[]
}

function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message)
}

function equal<T>(actual: T, expected: T, message: string): void {
  if (!Object.is(actual, expected)) {
    throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`)
  }
}

async function rejects(run: () => Promise<unknown>, pattern: RegExp, message: string): Promise<void> {
  try {
    await run()
  } catch (error) {
    check(error instanceof Error && pattern.test(error.message), `${message}: wrong rejection`)
    return
  }
  throw new Error(`${message}: did not reject`)
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}

function createRuntime(seed: SessionSeed, authority: Authority): SessionRuntime {
  let nextEvent = 0
  const record: SessionRecord = seed.record
    ? {
        ...structuredClone(seed.record),
        status: "open",
        authorityFingerprint: authority.fingerprint,
        authorityTenant: authority.tenant,
        authoritySchemas: [...authority.schemas],
      }
    : {
        id: seed.id,
        status: "open",
        revision: 0,
        authorityFingerprint: authority.fingerprint,
        authorityTenant: authority.tenant,
        authoritySchemas: [...authority.schemas],
        evidence: [],
        artifactRefs: [],
        memoryCandidates: [],
        memories: [],
        works: {},
      }
  function attempt(id: string, workId: string, number: number, epoch: number): Attempt {
    const settlement = deferred<void>()
    let settled = false
    return {
      id,
      workId,
      number,
      epoch,
      status: "working",
      signal: new AbortController(),
      liveLeases: 0,
      settled: settlement.promise,
      settle() {
        if (settled) return
        settled = true
        settlement.resolve()
      },
    }
  }
  const runtime: SessionRuntime = {
    record,
    events: [],
    active: new Map(),
    attempts: new Map(),
    quarantine: [],
    emit(type, detail) {
      runtime.events.push({ index: nextEvent++, type, ...(detail === undefined ? {} : { detail }) })
    },
    admit(workId) {
      if (record.status !== "open") throw new Error(`Session ${record.id} is not open`)
      const work = record.works[workId] ?? { id: workId, status: "working", attempts: 0, epoch: 0 }
      work.attempts++
      work.epoch++
      work.status = "working"
      record.works[workId] = work
      const current = attempt(`${workId}#${work.attempts}`, workId, work.attempts, work.epoch)
      runtime.active.set(current.id, current)
      runtime.attempts.set(current.id, current)
      runtime.emit("work.admitted", current.id)
      return current
    },
    child(parent, name) {
      const id = `${parent.id}/${name}`
      const current = attempt(id, id, 1, parent.epoch)
      runtime.active.set(id, current)
      runtime.attempts.set(id, current)
      runtime.emit("work.child.admitted", id)
      return current
    },
    wait(attempt) {
      equal(attempt.liveLeases, 0, `Attempt ${attempt.id} retained a live lease while waiting`)
      attempt.status = "waiting"
      record.works[attempt.workId]!.status = "waiting"
      runtime.active.delete(attempt.id)
      runtime.emit("work.waiting", attempt.id)
      attempt.settle()
    },
    complete(attempt) {
      equal(attempt.liveLeases, 0, `Attempt ${attempt.id} retained a live lease at completion`)
      attempt.status = "completed"
      const work = record.works[attempt.workId]
      if (work) work.status = "completed"
      runtime.active.delete(attempt.id)
      runtime.emit("work.completed", attempt.id)
      attempt.settle()
    },
    interrupt(attemptId) {
      const attempt = runtime.active.get(attemptId)
      if (!attempt) throw new Error(`Active attempt ${attemptId} not found`)
      const work = record.works[attempt.workId]
      if (work) work.epoch++
      attempt.epoch = work?.epoch ?? attempt.epoch + 1
      attempt.status = "interrupted"
      attempt.signal.abort(new Error("steered"))
      runtime.emit("work.interrupted", attempt.id)
      return attempt
    },
    settleInterrupted(attempt) {
      equal(attempt.liveLeases, 0, `Interrupted attempt ${attempt.id} retained a live lease`)
      attempt.status = "interrupted"
      const work = record.works[attempt.workId]
      if (work) work.status = "interrupted"
      runtime.active.delete(attempt.id)
      runtime.emit("work.interrupt.settled", attempt.id)
      attempt.settle()
    },
    fail(attempt) {
      attempt.status = "failed"
      const work = record.works[attempt.workId]
      if (work) work.status = "failed"
      runtime.active.delete(attempt.id)
      runtime.emit("work.failed", attempt.id)
      attempt.settle()
    },
    accepts(attempt, epoch) {
      return attempt.status === "working" && attempt.epoch === epoch
    },
    snapshot(status = record.status) {
      return structuredClone({ ...record, status })
    },
  }
  return runtime
}

const authority = tag<Authority>({ label: "probe.session.authority" })
const seed = tag<SessionSeed>({ label: "probe.session.seed" })
const providerBinding = tag<{ name: string }>({ label: "probe.model.provider" })
const databasePolicy = tag<{ readOnly: true }>({ label: "probe.database.policy" })
const validationEngine = tag<{ validate(value: unknown): void }>({ label: "probe.validation.engine" })

const trace: string[] = []
let lifecycleDepth = 0
let businessEffectInLifecycleHookCount = 0
let providerCalls = 0
let toolCalls = 0
let readinessResolutions = 0
let reasoningWithBorrowCount = 0
let protectedEffects = 0
let abortObservedCount = 0

function lifecycle(run: () => void): void {
  lifecycleDepth++
  try {
    run()
  } finally {
    lifecycleDepth--
  }
}

function businessEffect(name: string): void {
  if (lifecycleDepth > 0) businessEffectInLifecycleHookCount++
  trace.push(name)
}

function freshRecord(id: string, bound: Authority): SessionRecord {
  return {
    id,
    status: "open",
    revision: 0,
    authorityFingerprint: bound.fingerprint,
    authorityTenant: bound.tenant,
    authoritySchemas: [...bound.schemas],
    evidence: [],
    artifactRefs: [],
    memoryCandidates: [],
    memories: [],
    works: {},
  }
}

function authorityNarrows(record: SessionRecord, bound: Authority): boolean {
  return record.authorityTenant === bound.tenant
    && bound.schemas.every((schema) => record.authoritySchemas.includes(schema))
}

const parallelGate = deferred<void>()
let parallelArrivals = 0

const backend = resource({
  name: "probe.database.backend",
  factory: (ctx) => {
    const state = {
      closed: false,
      unavailableTenants: new Set<string>(),
      activeBorrows: 0,
      maxBorrows: 0,
      borrows: 0,
      cleanupCount: 0,
      assertReady(tenant: string): void {
        if (state.closed || state.unavailableTenants.has(tenant)) throw new Error("Database backend unavailable")
      },
      async borrow<T>(sessionId: string, parallel: boolean, run: () => Promise<T>): Promise<T> {
        if (state.closed) throw new Error("Database backend is closed")
        businessEffect(`database.borrow:${sessionId}`)
        protectedEffects++
        state.activeBorrows++
        state.borrows++
        state.maxBorrows = Math.max(state.maxBorrows, state.activeBorrows)
        try {
          if (parallel) {
            parallelArrivals++
            if (parallelArrivals === 2) parallelGate.resolve()
            await parallelGate.promise
          }
          return await run()
        } finally {
          state.activeBorrows--
          trace.push(`database.return:${sessionId}`)
        }
      },
    }
    ctx.cleanup(() => {
      state.closed = true
      state.cleanupCount++
      trace.push("database.cleanup")
    })
    return state
  },
})

const checkpointStarted = deferred<void>()
const checkpointRelease = deferred<void>()

const store = resource({
  name: "probe.session.store",
  factory: (ctx) => {
    const state = {
      closed: false,
      values: new Map<string, SessionRecord>(),
      counts: new Map<string, number>(),
      failIds: new Set<string>(),
      load(id: string): SessionRecord {
        businessEffect(`session.load:${id}`)
        const found = state.values.get(id)
        if (!found) throw new Error(`Session ${id} not found`)
        return structuredClone(found)
      },
      seed(snapshot: SessionRecord): void {
        businessEffect(`session.seed:${snapshot.id}`)
        state.values.set(snapshot.id, structuredClone(snapshot))
      },
      async checkpoint(snapshot: SessionRecord): Promise<void> {
        if (state.closed) throw new Error("Session store is closed")
        businessEffect(`session.checkpoint:${snapshot.id}`)
        state.counts.set(snapshot.id, (state.counts.get(snapshot.id) ?? 0) + 1)
        if (state.failIds.has(snapshot.id)) throw new Error("Session checkpoint failed")
        if (snapshot.id === "session-A") {
          checkpointStarted.resolve()
          await checkpointRelease.promise
        }
        state.values.set(snapshot.id, structuredClone(snapshot))
      },
    }
    ctx.cleanup(() => {
      state.closed = true
      trace.push("store.cleanup")
    })
    return state
  },
})

const artifacts = resource({
  name: "probe.artifact.store",
  factory: (ctx) => {
    const state = {
      closed: false,
      published: new Set<string>(),
      publish(digest: string): void {
        if (state.closed) throw new Error("Artifact store is closed")
        businessEffect(`artifact.publish:${digest}`)
        state.published.add(digest)
      },
    }
    ctx.cleanup(() => {
      state.closed = true
      trace.push("artifact.cleanup")
    })
    return state
  },
})

const scheduler = resource({
  name: "probe.scheduler",
  factory: (ctx) => {
    const intents: { sessionId: string; workId: string }[] = []
    const state = {
      closed: false,
      enqueue(sessionId: string, workId: string): void {
        if (state.closed) throw new Error("Scheduler is closed")
        businessEffect(`scheduler.enqueue:${sessionId}:${workId}`)
        intents.push({ sessionId, workId })
      },
      claim(sessionId: string): { sessionId: string; workId: string } {
        const index = intents.findIndex((intent) => intent.sessionId === sessionId)
        if (index < 0) throw new Error(`No scheduled work for ${sessionId}`)
        return intents.splice(index, 1)[0]!
      },
    }
    ctx.cleanup(() => {
      state.closed = true
      trace.push("scheduler.cleanup")
    })
    return state
  },
})

const session = resource({
  name: "probe.session.runtime",
  ownership: "current",
  deps: {
    authority: tags.required(authority),
    seed: tags.required(seed),
  },
  factory: (ctx, deps) => {
    if (deps.seed.record && !authorityNarrows(deps.seed.record, deps.authority)) {
      throw new Error("Session authority mismatch")
    }
    const runtime = createRuntime(deps.seed, deps.authority)
    ctx.onClose(() => {
      lifecycle(() => {
        runtime.emit("runtime.onClose")
        trace.push(`runtime.onClose:${runtime.record.id}`)
      })
    })
    ctx.cleanup(() => {
      lifecycle(() => {
        runtime.emit("runtime.cleanup")
        trace.push(`runtime.cleanup:${runtime.record.id}`)
      })
    })
    return runtime
  },
})

const ready = resource({
  name: "probe.database.inspect.ready",
  ownership: "current",
  deps: {
    session,
    backend,
    authority: tags.required(authority),
    policy: tags.required(databasePolicy),
    validation: tags.required(validationEngine),
  },
  factory: (_ctx, deps): ToolReady => {
    deps.backend.assertReady(deps.authority.tenant)
    if (deps.authority.fingerprint !== deps.session.record.authorityFingerprint) {
      throw new Error("Session authority mismatch")
    }
    equal(deps.policy.readOnly, true, "Database policy is not read-only")
    deps.validation.validate({ name: "inspect_schema" })
    readinessResolutions++
    const identity = `inspect_schema@${deps.session.record.id}:${readinessResolutions}`
    deps.session.emit("tool.ready", identity)
    return {
      identity,
      name: "inspect_schema",
      permit: `${deps.session.record.authorityFingerprint}:read-only`,
    }
  },
})

const role = resource({
  name: "probe.database.analyst.role",
  ownership: "current",
  deps: { session, ready },
  factory: (_ctx, deps) => {
    deps.session.emit("role.ready", "database-analyst")
    return {
      name: "database-analyst",
      instructions: "Inspect and propose. Do not apply DDL.",
      toolIdentity: deps.ready.identity,
    }
  },
})

const inspectSchema = flow({
  name: "probe.database.inspect",
  parse: typed<ToolInput>(),
  deps: { session, ready, backend },
  factory: async (ctx, deps) => {
    equal(ctx.input.identity, deps.ready.identity, "Dispatched tool identity drifted from readiness identity")
    const attempt = deps.session.attempts.get(ctx.input.attemptId)
    if (!attempt) throw new Error(`Attempt ${ctx.input.attemptId} not found`)
    toolCalls++
    protectedEffects++
    deps.session.emit("tool.dispatched", deps.ready.identity)
    attempt.liveLeases++
    try {
      return await deps.backend.borrow(deps.session.record.id, ctx.input.parallel === true, async () => ({
        schema: "billing",
        analysis: ctx.input.analysis,
        version: 7,
      }))
    } finally {
      attempt.liveLeases--
    }
  },
})

const slowStarted = deferred<void>()
const slowResult = deferred<string>()
const slowAbortObserved = deferred<void>()
const finishSlowStarted = deferred<void>()
const finishAbortObserved = deferred<void>()
const finishAbortRelease = deferred<void>()

const invokeModel = flow({
  name: "probe.model.invoke",
  parse: typed<ModelInput>(),
  deps: {
    session,
    backend,
    provider: tags.required(providerBinding),
  },
  factory: async (ctx, deps): Promise<ModelOutput> => {
    providerCalls++
    protectedEffects++
    businessEffect(`model.invoke:${ctx.input.phase}`)
    deps.session.emit("model.started", `${deps.provider.name}:${ctx.input.phase}`)
    if (ctx.input.phase === "select") {
      const toolIdentity = ctx.input.tools[0]
      if (!toolIdentity) throw new Error("No ready tool advertised")
      deps.session.emit("model.completed", ctx.input.phase)
      return { content: "inspect", toolIdentity }
    }
    if (ctx.input.phase === "reason") {
      if (deps.backend.activeBorrows !== 0) reasoningWithBorrowCount++
      deps.session.emit("model.completed", ctx.input.phase)
      return { content: "propose-index-without-applying" }
    }
    const attempt = deps.session.active.get(ctx.input.attemptId)
    if (!attempt) throw new Error(`Active attempt ${ctx.input.attemptId} not found`)
    if (ctx.input.phase === "slow") {
      attempt.signal.signal.addEventListener("abort", () => {
        abortObservedCount++
        slowAbortObserved.resolve()
        deps.session.emit("model.abort.observed", attempt.id)
      }, { once: true })
      slowStarted.resolve()
      const content = await slowResult.promise
      deps.session.emit("model.completed", ctx.input.phase)
      return { content }
    }
    attempt.signal.signal.addEventListener("abort", () => {
      abortObservedCount++
      finishAbortObserved.resolve()
      deps.session.emit("model.abort.observed", attempt.id)
    }, { once: true })
    finishSlowStarted.resolve()
    await finishAbortObserved.promise
    await finishAbortRelease.promise
    deps.session.emit("model.abort.settled", attempt.id)
    trace.push(`model.abort.settled:${deps.session.record.id}`)
    throw new Error("Model invocation aborted")
  },
})

const schemaAnalysis = flow({
  name: "probe.database.schema-analysis",
  parse: typed<ChildInput>(),
  deps: { session, inspect: controller(inspectSchema) },
  factory: async (ctx, deps): Promise<Branch> => {
    deps.session.emit("child.started", ctx.input.branch.id)
    const result = await deps.inspect.exec({
      input: {
        attemptId: ctx.input.attemptId,
        identity: ctx.input.identity,
        analysis: ctx.input.analysis,
        parallel: true,
      },
    })
    deps.session.emit("child.completed", ctx.input.branch.id)
    return {
      ...ctx.input.branch,
      evidence: [`schema:${result.schema}:v${result.version}`],
    }
  },
})

const queryAnalysis = flow({
  name: "probe.database.query-analysis",
  parse: typed<ChildInput>(),
  deps: { session, inspect: controller(inspectSchema) },
  factory: async (ctx, deps): Promise<Branch> => {
    deps.session.emit("child.started", ctx.input.branch.id)
    const result = await deps.inspect.exec({
      input: {
        attemptId: ctx.input.attemptId,
        identity: ctx.input.identity,
        analysis: ctx.input.analysis,
        parallel: true,
      },
    })
    deps.session.emit("child.completed", ctx.input.branch.id)
    return {
      ...ctx.input.branch,
      evidence: [`query:${result.analysis}:v${result.version}`],
    }
  },
})

const failFastSiblingStarted = deferred<void>()
const failFastAbortObserved = deferred<void>()

const failFastFailure = flow({
  name: "probe.work.fail-fast-failure",
  parse: typed<{ attemptId: string }>(),
  deps: { session },
  factory: async (ctx, deps) => {
    await failFastSiblingStarted.promise
    deps.session.emit("fail-fast.failure", ctx.input.attemptId)
    throw new Error("Fail-fast child failed")
  },
})

const failFastSibling = flow({
  name: "probe.work.fail-fast-sibling",
  parse: typed<{ attemptId: string }>(),
  deps: { session },
  factory: async (ctx, deps) => {
    const attempt = deps.session.active.get(ctx.input.attemptId)
    if (!attempt) throw new Error(`Active attempt ${ctx.input.attemptId} not found`)
    const aborted = deferred<void>()
    attempt.signal.signal.addEventListener("abort", () => {
      abortObservedCount++
      failFastAbortObserved.resolve()
      aborted.resolve()
      deps.session.emit("fail-fast.sibling.abort-observed", attempt.id)
    }, { once: true })
    failFastSiblingStarted.resolve()
    await aborted.promise
    deps.session.emit("fail-fast.sibling.settled", attempt.id)
    throw new Error("Fail-fast sibling aborted")
  },
})

const streamEvents: string[] = []

const streamTurn = flow({
  name: "probe.turn.stream",
  parse: typed<{ id: string }>(),
  factory: async function* (ctx) {
    ctx.onClose((result) => {
      streamEvents.push(result.ok ? `close:${ctx.input.id}:ok` : `close:${ctx.input.id}:aborted-${result.aborted === true}`)
    })
    try {
      yield { type: "model.delta", content: `${ctx.input.id}:one` }
      yield { type: "tool.progress", content: `${ctx.input.id}:two` }
      return { id: ctx.input.id, content: `${ctx.input.id}:final` }
    } finally {
      streamEvents.push(`finally:${ctx.input.id}`)
    }
  },
})

const innerTurn = flow({
  name: "probe.session.inner-turn",
  parse: typed<InnerInput>(),
  deps: {
    session,
    ready,
    role,
    inspect: controller(inspectSchema),
    model: controller(invokeModel),
    schema: controller(schemaAnalysis),
    query: controller(queryAnalysis),
    fail: controller(failFastFailure),
    sibling: controller(failFastSibling),
  },
  factory: async (ctx, deps): Promise<InnerResult> => {
    const attempt = deps.session.active.get(ctx.input.attemptId)
    if (!attempt) throw new Error(`Active attempt ${ctx.input.attemptId} not found`)
    equal(deps.role.toolIdentity, deps.ready.identity, "Role readiness identity drifted")
    deps.session.emit("turn.snapshot", deps.ready.identity)

    if (ctx.input.kind === "normal") {
      const roundIdentities: string[] = []
      let dispatchedIdentity = ""
      let inspectedSchema = ""
      for (const round of [1, 2]) {
        const selected = await deps.model.exec({
          input: { attemptId: attempt.id, phase: "select", tools: [deps.ready.identity] },
        })
        dispatchedIdentity = selected.toolIdentity!
        roundIdentities.push(dispatchedIdentity)
        const inspected = await deps.inspect.exec({
          input: {
            attemptId: attempt.id,
            identity: dispatchedIdentity,
            analysis: `normal-round-${round}`,
          },
        })
        inspectedSchema = inspected.schema
        equal(deps.session.active.get(attempt.id)?.liveLeases, 0, "Database borrow survived tool invocation")
      }
      const reasoned = await deps.model.exec({
        input: { attemptId: attempt.id, phase: "reason", tools: [deps.ready.identity] },
      })
      return {
        status: "completed",
        attemptId: attempt.id,
        snapshotIdentity: deps.ready.identity,
        dispatchedIdentity,
        content: `${inspectedSchema}:${reasoned.content}`,
        epoch: attempt.epoch,
        roundIdentities,
      }
    }

    if (ctx.input.kind === "parallel") {
      const baseRevision = deps.session.record.revision
      const schemaAttempt = deps.session.child(attempt, "schema")
      const queryAttempt = deps.session.child(attempt, "query")
      const schemaBranch: Branch = { id: `${attempt.id}/schema`, baseRevision, evidence: [] }
      const queryBranch: Branch = { id: `${attempt.id}/query`, baseRevision, evidence: [] }
      const branches = await Promise.all([
        deps.schema.exec({
          input: {
            attemptId: schemaAttempt.id,
            branch: schemaBranch,
            identity: deps.ready.identity,
            analysis: "catalog",
          },
        }),
        deps.query.exec({
          input: {
            attemptId: queryAttempt.id,
            branch: queryBranch,
            identity: deps.ready.identity,
            analysis: "slow-invoice-query",
          },
        }),
      ])
      deps.session.complete(schemaAttempt)
      deps.session.complete(queryAttempt)
      deps.session.emit("work.children.joined", attempt.id)
      return {
        status: "completed",
        attemptId: attempt.id,
        snapshotIdentity: deps.ready.identity,
        branches,
        epoch: attempt.epoch,
      }
    }

    if (ctx.input.kind === "wait") {
      await deps.inspect.exec({
        input: {
          attemptId: attempt.id,
          identity: deps.ready.identity,
          analysis: "prepare-wait",
        },
      })
      return {
        status: "waiting",
        attemptId: attempt.id,
        snapshotIdentity: deps.ready.identity,
        epoch: attempt.epoch,
      }
    }

    if (ctx.input.kind === "resume") {
      const response = await deps.model.exec({
        input: { attemptId: attempt.id, phase: "reason", tools: [deps.ready.identity] },
      })
      return {
        status: "completed",
        attemptId: attempt.id,
        snapshotIdentity: deps.ready.identity,
        content: response.content,
        epoch: attempt.epoch,
      }
    }

    if (ctx.input.kind === "finish-active") {
      await deps.model.exec({
        input: { attemptId: attempt.id, phase: "finish-slow", tools: [deps.ready.identity] },
      })
      return {
        status: "completed",
        attemptId: attempt.id,
        snapshotIdentity: deps.ready.identity,
        epoch: attempt.epoch,
      }
    }

    if (ctx.input.kind === "fail-fast") {
      const failing = deps.session.child(attempt, "failing")
      const sibling = deps.session.child(attempt, "sibling")
      const failure = deps.fail.exec({ input: { attemptId: failing.id } }).then(
        (value) => {
          deps.session.complete(failing)
          return value
        },
        (error) => {
          deps.session.fail(failing)
          throw error
        },
      )
      const siblingRun = deps.sibling.exec({ input: { attemptId: sibling.id } }).then(
        (value) => {
          deps.session.complete(sibling)
          return value
        },
        (error) => {
          deps.session.fail(sibling)
          throw error
        },
      )
      try {
        await Promise.all([failure, siblingRun])
      } catch (error) {
        if (deps.session.active.has(sibling.id)) deps.session.interrupt(sibling.id)
        await Promise.allSettled([failure, siblingRun])
        deps.session.emit("fail-fast.joined", attempt.id)
        throw error
      }
      throw new Error("Fail-fast group unexpectedly completed")
    }

    const epoch = attempt.epoch
    const response = await deps.model.exec({
      input: { attemptId: attempt.id, phase: "slow", tools: [deps.ready.identity] },
    })
    if (!deps.session.accepts(attempt, epoch)) {
      deps.session.quarantine.push(response.content)
      deps.session.emit("model.quarantined", attempt.id)
      return {
        status: "interrupted",
        attemptId: attempt.id,
        snapshotIdentity: deps.ready.identity,
        epoch,
      }
    }
    return {
      status: "completed",
      attemptId: attempt.id,
      snapshotIdentity: deps.ready.identity,
      content: response.content,
      epoch,
    }
  },
})

const runWork = flow({
  name: "probe.session.run-work",
  parse: typed<RunInput>(),
  deps: {
    session,
    authority: tags.required(authority),
    turn: controller(innerTurn),
  },
  factory: async (ctx, deps): Promise<InnerResult> => {
    if (deps.authority.fingerprint !== deps.session.record.authorityFingerprint) {
      deps.session.emit("authority.rejected", deps.authority.fingerprint)
      throw new Error("Session authority mismatch")
    }
    const attempt = deps.session.admit(ctx.input.workId)
    try {
      const result = await deps.turn.exec({ input: { ...ctx.input, attemptId: attempt.id } })
      if (result.status === "waiting") deps.session.wait(attempt)
      else if (result.status === "interrupted") deps.session.settleInterrupted(attempt)
      else deps.session.complete(attempt)
      return result
    } catch (error) {
      deps.session.fail(attempt)
      throw error
    }
  },
})

const mergeBranches = flow({
  name: "probe.session.merge-branches",
  parse: typed<MergeInput>(),
  deps: {
    session,
    authority: tags.required(authority),
  },
  factory: (ctx, deps) => {
    if (deps.authority.fingerprint !== deps.session.record.authorityFingerprint) {
      throw new Error("Session authority mismatch")
    }
    if (deps.session.record.revision !== ctx.input.expectedRevision) {
      throw new Error("Session revision conflict")
    }
    for (const branch of ctx.input.branches) {
      if (branch.baseRevision !== ctx.input.expectedRevision) throw new Error("Branch base revision conflict")
    }
    deps.session.record.evidence.push(...ctx.input.branches.flatMap((branch) => branch.evidence))
    deps.session.record.revision++
    deps.session.emit("branches.merged", String(deps.session.record.revision))
    return deps.session.record.revision
  },
})

const steerWork = flow({
  name: "probe.session.steer-work",
  parse: typed<SteeringInput>(),
  deps: {
    session,
    authority: tags.required(authority),
    restart: controller(runWork),
  },
  factory: async (ctx, deps) => {
    if (deps.authority.fingerprint !== deps.session.record.authorityFingerprint) {
      throw new Error("Session authority mismatch")
    }
    const attempt = deps.session.interrupt(ctx.input.attemptId)
    await attempt.settled
    deps.session.emit("steering.joined", attempt.id)
    return deps.restart.exec({ input: { workId: attempt.workId, kind: "resume" } })
  },
})

const checkpointSession = flow({
  name: "probe.session.checkpoint",
  parse: typed<SessionRecord>(),
  deps: { store },
  factory: (ctx, deps) => deps.store.checkpoint(ctx.input),
})

const finishSession = flow({
  name: "probe.session.finish",
  deps: {
    session,
    checkpoint: controller(checkpointSession),
  },
  factory: (_ctx, deps) => {
    if (!deps.session.finishPromise) {
      deps.session.record.status = "finishing"
      deps.session.emit("session.finishing")
      const active = [...deps.session.active.values()]
      for (const attempt of active) deps.session.interrupt(attempt.id)
      deps.session.finishPromise = Promise.all(active.map((attempt) => attempt.settled)).then(async () => {
        await deps.checkpoint.exec({ input: deps.session.snapshot("sealed") })
        deps.session.record.status = "sealed"
        deps.session.emit("session.sealed")
      })
    }
    return deps.session.finishPromise
  },
})

const seedSession = flow({
  name: "probe.session.seed-record",
  parse: typed<SessionRecord>(),
  deps: { store },
  factory: (ctx, deps) => deps.store.seed(ctx.input),
})

const loadAndBindSession = flow({
  name: "probe.session.load-and-bind",
  parse: typed<StoredSessionInput>(),
  deps: {
    store,
    authority: tags.required(authority),
  },
  factory: (ctx, deps): SessionSeed => {
    const record = deps.store.load(ctx.input.id)
    if (!authorityNarrows(record, deps.authority)) throw new Error("Session authority mismatch")
    return { id: record.id, record }
  },
})

const forkBoundSession = flow({
  name: "probe.session.fork-bound",
  parse: typed<ForkInput>(),
  deps: {
    store,
    authority: tags.required(authority),
  },
  factory: (ctx, deps): SessionSeed => {
    const parent = deps.store.load(ctx.input.parentId)
    if (!authorityNarrows(parent, deps.authority)) throw new Error("Session fork widens authority")
    return {
      id: ctx.input.childId,
      record: {
        ...parent,
        id: ctx.input.childId,
        status: "open",
        authorityFingerprint: deps.authority.fingerprint,
        authorityTenant: deps.authority.tenant,
        authoritySchemas: [...deps.authority.schemas],
        works: {},
      },
    }
  },
})

const publishArtifact = flow({
  name: "probe.artifact.publish",
  parse: typed<ArtifactInput>(),
  deps: { artifacts },
  factory: (ctx, deps) => deps.artifacts.publish(ctx.input.digest),
})

const referenceArtifact = flow({
  name: "probe.artifact.reference",
  parse: typed<ArtifactInput>(),
  deps: { session, artifacts },
  factory: (ctx, deps) => {
    if (!deps.artifacts.published.has(ctx.input.digest)) throw new Error("Artifact is not published")
    deps.session.record.artifactRefs.push(ctx.input.digest)
    deps.session.emit("artifact.referenced", ctx.input.digest)
  },
})

const proposeMemory = flow({
  name: "probe.memory.propose",
  parse: typed<MemoryInput>(),
  deps: { session },
  factory: (ctx, deps) => {
    deps.session.record.memoryCandidates.push(ctx.input.content)
    deps.session.emit("memory.candidate", ctx.input.content)
  },
})

const acceptMemory = flow({
  name: "probe.memory.accept",
  parse: typed<MemoryInput>(),
  deps: { session },
  factory: (ctx, deps) => {
    if ((ctx.input.approvals ?? 0) < 2) throw new Error("Memory acceptance requires reviewer quorum")
    const index = deps.session.record.memoryCandidates.indexOf(ctx.input.content)
    if (index < 0) throw new Error("Memory candidate not found")
    deps.session.record.memoryCandidates.splice(index, 1)
    deps.session.record.memories.push(ctx.input.content)
    deps.session.emit("memory.accepted", ctx.input.content)
  },
})

const scheduleResume = flow({
  name: "probe.scheduler.schedule-resume",
  parse: typed<ScheduledInput>(),
  deps: { session, scheduler },
  factory: (ctx, deps) => {
    if (deps.session.record.works[ctx.input.workId]?.status !== "waiting") {
      throw new Error("Only waiting work can be scheduled")
    }
    deps.scheduler.enqueue(deps.session.record.id, ctx.input.workId)
  },
})

const wakeScheduled = flow({
  name: "probe.scheduler.wake",
  deps: {
    session,
    scheduler,
    run: controller(runWork),
  },
  factory: (_ctx, deps) => {
    const intent = deps.scheduler.claim(deps.session.record.id)
    return deps.run.exec({ input: { workId: intent.workId, kind: "resume" } })
  },
})

async function main(): Promise<ProbeResult> {
  const scope = createScope()
  const root = scope.createContext()
  const sharedBackend = await root.resolve(backend)
  const sharedStore = await root.resolve(store)
  const sharedArtifacts = await root.resolve(artifacts)
  const sharedScheduler = await root.resolve(scheduler)
  const authorityA: Authority = {
    tenant: "tenant-A",
    fingerprint: "authority-A",
    schemas: ["billing"],
  }
  const authorityB: Authority = {
    tenant: "tenant-B",
    fingerprint: "authority-B",
    schemas: ["billing"],
  }
  const provider = providerBinding({ name: "neutral-provider" })
  const policy = databasePolicy({ readOnly: true })
  const validator = validationEngine({ validate: () => undefined })
  const contextA = scope.createContext({
    parent: root,
    tags: [authority(authorityA), seed({ id: "session-A" }), provider, policy, validator],
  })
  const contextB = scope.createContext({
    parent: root,
    tags: [authority(authorityB), seed({ id: "session-B" }), provider, policy, validator],
  })
  const runtimeA = await contextA.resolve(session)
  const runtimeB = await contextB.resolve(session)

  const normal = await contextA.exec({
    flow: runWork,
    input: { workId: "normal", kind: "normal" },
  })
  const admittedIndex = runtimeA.events.findIndex((event) => event.type === "work.admitted")
  const readyIndex = runtimeA.events.findIndex((event) => event.type === "tool.ready")
  check(admittedIndex >= 0 && readyIndex > admittedIndex, "Tool readiness resolved before work admission")
  equal(normal.snapshotIdentity, normal.dispatchedIdentity, "Advertised and dispatched tool identities differ")
  check(normal.roundIdentities?.every((identity) => identity === normal.snapshotIdentity) === true, "Tool snapshot drifted across rounds")
  equal(sharedBackend.activeBorrows, 0, "Database borrow survived model turn")
  equal(reasoningWithBorrowCount, 0, "Model reasoning ran while a database borrow was live")

  const providerBeforeMismatch = providerCalls
  const toolsBeforeMismatch = toolCalls
  await rejects(
    () => contextA.exec({
      flow: runWork,
      input: { workId: "wrong-authority", kind: "normal" },
      tags: [authority({ tenant: "tenant-X", fingerprint: "authority-X", schemas: ["private"] })],
    }),
    /authority mismatch/,
    "Authority mismatch",
  )
  equal(providerCalls, providerBeforeMismatch, "Authority mismatch reached the model")
  equal(toolCalls, toolsBeforeMismatch, "Authority mismatch reached a tool")

  const storedAuthority: Authority = {
    tenant: "tenant-protected",
    fingerprint: "authority-protected-original",
    schemas: ["billing"],
  }
  await root.exec({ flow: seedSession, input: freshRecord("session-protected", storedAuthority) })
  const effectsBeforeRebind = protectedEffects
  await rejects(
    () => root.exec({
      flow: loadAndBindSession,
      input: { id: "session-protected" },
      tags: [authority({ tenant: "tenant-wrong", fingerprint: "authority-wrong", schemas: ["billing"] })],
    }),
    /authority mismatch/,
    "Resume authority mismatch",
  )
  await rejects(
    () => root.exec({
      flow: forkBoundSession,
      input: { parentId: "session-protected", childId: "session-widened" },
      tags: [authority({
        tenant: "tenant-protected",
        fingerprint: "authority-widened",
        schemas: ["billing", "private"],
      })],
    }),
    /widens authority/,
    "Fork authority widening",
  )
  equal(protectedEffects, effectsBeforeRebind, "Authority rebind failure reached a protected effect")
  const reboundAuthority: Authority = {
    tenant: "tenant-protected",
    fingerprint: "authority-protected-fresh",
    schemas: ["billing"],
  }
  const reboundSeed = await root.exec({
    flow: loadAndBindSession,
    input: { id: "session-protected" },
    tags: [authority(reboundAuthority)],
  })
  const reboundContext = scope.createContext({
    parent: root,
    tags: [authority(reboundAuthority), seed(reboundSeed), provider, policy, validator],
  })
  const reboundRuntime = await reboundContext.resolve(session)
  const reboundRun = await reboundContext.exec({
    flow: runWork,
    input: { workId: "rebound", kind: "normal" },
  })
  check(reboundRun.content?.includes("billing") === true, "Rebound session could not use protected capabilities")
  equal(reboundRuntime.record.authorityFingerprint, reboundAuthority.fingerprint, "Fresh authority was not bound")
  await reboundContext.exec({ flow: finishSession })
  await reboundContext.close({ ok: true })

  const missingContext = scope.createContext({
    parent: root,
    tags: [authority(authorityA), seed({ id: "session-missing-binding" }), policy, validator],
  })
  await missingContext.resolve(session)
  const modelBeforeMissing = providerCalls
  await rejects(
    () => missingContext.exec({ flow: runWork, input: { workId: "missing", kind: "normal" } }),
    /provider/,
    "Missing provider binding",
  )
  equal(providerCalls, modelBeforeMissing, "Missing binding reached the model factory")
  await missingContext.close({ ok: false, error: new Error("probe complete") })

  const unavailableAuthority: Authority = {
    tenant: "tenant-unavailable",
    fingerprint: "authority-unavailable",
    schemas: ["billing"],
  }
  sharedBackend.unavailableTenants.add(unavailableAuthority.tenant)
  const unavailableContext = scope.createContext({
    parent: root,
    tags: [authority(unavailableAuthority), seed({ id: "session-unavailable" }), provider, policy, validator],
  })
  await unavailableContext.resolve(session)
  const modelBeforeUnavailable = providerCalls
  await rejects(
    () => unavailableContext.exec({ flow: runWork, input: { workId: "unavailable", kind: "normal" } }),
    /backend unavailable/,
    "Backend readiness failure",
  )
  equal(providerCalls, modelBeforeUnavailable, "Unavailable backend reached the model")
  await unavailableContext.close({ ok: false, error: new Error("probe complete") })

  const validationContext = scope.createContext({
    parent: root,
    tags: [
      authority(authorityA),
      seed({ id: "session-validation-failure" }),
      provider,
      policy,
      validationEngine({ validate: () => { throw new Error("Validation engine failed") } }),
    ],
  })
  await validationContext.resolve(session)
  const modelBeforeValidation = providerCalls
  await rejects(
    () => validationContext.exec({ flow: runWork, input: { workId: "invalid", kind: "normal" } }),
    /Validation engine failed/,
    "Validation engine failure",
  )
  equal(providerCalls, modelBeforeValidation, "Validation failure reached the model")
  await validationContext.close({ ok: false, error: new Error("probe complete") })

  const parallel = await contextA.exec({
    flow: runWork,
    input: { workId: "parallel", kind: "parallel" },
  })
  check(parallel.branches?.length === 2, "Parallel analysis did not return two branches")
  equal(sharedBackend.maxBorrows >= 2, true, "Child analysis did not execute in parallel")
  equal(runtimeA.record.evidence.length, 0, "Execution join implicitly merged branch evidence")
  equal(runtimeA.record.revision, 0, "Execution join changed the main branch revision")

  const mergedRevision = await contextA.exec({
    flow: mergeBranches,
    input: { expectedRevision: 0, branches: parallel.branches },
  })
  equal(mergedRevision, 1, "Explicit merge did not advance the revision")
  equal(runtimeA.record.evidence.length, 2, "Explicit merge did not commit both evidence records")
  const evidenceAfterMerge = [...runtimeA.record.evidence]
  await rejects(
    () => contextA.exec({
      flow: mergeBranches,
      input: { expectedRevision: 0, branches: parallel.branches! },
    }),
    /revision conflict/,
    "Stale merge",
  )
  equal(runtimeA.record.revision, 1, "Stale merge changed the revision")
  equal(runtimeA.record.evidence.join("|"), evidenceAfterMerge.join("|"), "Stale merge changed evidence")

  await rejects(
    () => contextA.exec({ flow: runWork, input: { workId: "fail-fast", kind: "fail-fast" } }),
    /Fail-fast child failed/,
    "Fail-fast group",
  )
  await failFastAbortObserved.promise
  check(runtimeA.events.some((event) => event.type === "fail-fast.joined"), "Fail-fast parent did not join siblings")
  check([...runtimeA.active.values()].every((attempt) => !attempt.id.includes("fail-fast")), "Fail-fast left a sibling active")

  const waiting = await contextA.exec({
    flow: runWork,
    input: { workId: "waiting", kind: "wait" },
  })
  equal(waiting.status, "waiting", "Work did not enter waiting state")
  equal(sharedBackend.activeBorrows, 0, "Waiting work retained a database borrow")
  equal(runtimeA.active.has(waiting.attemptId), false, "Waiting work retained a live attempt")
  await contextA.exec({ flow: scheduleResume, input: { workId: "waiting" } })
  const resumed = await contextA.exec({ flow: wakeScheduled })
  check(resumed.attemptId !== waiting.attemptId, "Resume reused the waiting attempt")
  equal(runtimeA.record.works["waiting"]?.attempts, 2, "Resume did not create attempt two")

  const interruptedPromise = contextA.exec({
    flow: runWork,
    input: { workId: "interrupt", kind: "interrupt" },
  })
  await slowStarted.promise
  const interruptAttempt = runtimeA.record.works["interrupt"]
  check(interruptAttempt !== undefined, "Interrupt work was not admitted")
  const activeInterrupt = [...runtimeA.active.values()].find((attempt) => attempt.workId === "interrupt")
  check(activeInterrupt !== undefined, "Interrupt attempt was not active")
  const steering = contextA.exec({
    flow: steerWork,
    input: { attemptId: activeInterrupt.id },
  })
  await slowAbortObserved.promise
  equal(runtimeA.record.works["interrupt"]?.attempts, 1, "Steering restarted before the interrupted attempt settled")
  slowResult.resolve("late-provider-output")
  const [interrupted, restarted] = await Promise.all([interruptedPromise, steering])
  equal(interrupted.status, "interrupted", "Interrupted work accepted late output")
  check((restarted.epoch ?? 0) > (interrupted.epoch ?? 0), "Steering did not restart at a new epoch")
  check(restarted.snapshotIdentity !== interrupted.snapshotIdentity, "New epoch mutated or reused the old tool snapshot")
  equal(runtimeA.quarantine.join("|"), "late-provider-output", "Late output was not quarantined")
  equal(runtimeA.record.evidence.includes("late-provider-output"), false, "Late output reached committed evidence")

  const authorityE: Authority = {
    tenant: "tenant-E",
    fingerprint: "authority-E",
    schemas: ["billing"],
  }
  const contextE = scope.createContext({
    parent: root,
    tags: [authority(authorityE), seed({ id: "session-E" }), provider, policy, validator],
  })
  const runtimeE = await contextE.resolve(session)
  const activeRun = contextE.exec({
    flow: runWork,
    input: { workId: "finish-active", kind: "finish-active" },
  })
  await finishSlowStarted.promise
  const activeFinish = contextE.exec({ flow: finishSession })
  await finishAbortObserved.promise
  equal(sharedStore.counts.get("session-E") ?? 0, 0, "Finish checkpointed before active invocation settlement")
  equal(runtimeE.record.status, "finishing", "Finish did not fence admission while joining active work")
  finishAbortRelease.resolve()
  await rejects(() => activeRun, /aborted/, "Finish-time model cancellation")
  await activeFinish
  equal(sharedStore.counts.get("session-E"), 1, "Finish did not checkpoint exactly once after active settlement")
  const abortSettledIndex = trace.indexOf("model.abort.settled:session-E")
  const checkpointEIndex = trace.indexOf("session.checkpoint:session-E")
  check(abortSettledIndex >= 0 && checkpointEIndex > abortSettledIndex, "Finish checkpoint order is invalid")
  await contextE.close({ ok: true })

  await contextA.exec({ flow: proposeMemory, input: { content: "candidate-index-memory" } })
  equal(runtimeA.record.memories.length, 0, "Memory candidate was accepted implicitly")
  equal(runtimeA.record.memoryCandidates.length, 1, "Memory candidate was not retained")
  await rejects(
    () => contextA.exec({
      flow: acceptMemory,
      input: { content: "candidate-index-memory", approvals: 1 },
    }),
    /reviewer quorum/,
    "Single-reviewer memory acceptance",
  )
  await contextA.exec({
    flow: acceptMemory,
    input: { content: "candidate-index-memory", approvals: 2 },
  })
  equal(runtimeA.record.memories.length, 1, "Explicit memory acceptance did not promote the candidate")
  equal(runtimeA.record.memoryCandidates.length, 0, "Accepted memory remained a candidate")

  const firstFinish = contextA.exec({ flow: finishSession })
  await checkpointStarted.promise
  let secondFinishSettled = false
  const secondFinish = contextA.exec({ flow: finishSession }).then(() => {
    secondFinishSettled = true
  })
  await Promise.resolve()
  equal(secondFinishSettled, false, "Repeated finish did not join the in-flight checkpoint")
  checkpointRelease.resolve()
  await Promise.all([firstFinish, secondFinish])
  equal(sharedStore.counts.get("session-A"), 1, "Repeated finish checkpointed more than once")
  equal(runtimeA.record.status, "sealed", "Session A did not seal")
  const checkpointIndex = trace.indexOf("session.checkpoint:session-A")
  await contextA.close({ ok: true })
  const closeIndex = trace.indexOf("runtime.onClose:session-A")
  check(checkpointIndex >= 0 && closeIndex > checkpointIndex, "Host close preceded explicit checkpoint")
  equal(businessEffectInLifecycleHookCount, 0, "A lifecycle hook performed a business effect")

  const backendBorrowsBeforeB = sharedBackend.borrows
  const normalB = await contextB.exec({
    flow: runWork,
    input: { workId: "normal-B", kind: "normal" },
  })
  check(normalB.content?.includes("billing") === true, "Session B could not use the shared backend")
  check(sharedBackend.borrows > backendBorrowsBeforeB, "Session B did not borrow the shared backend")
  equal(sharedBackend.closed, false, "Closing session A closed the root backend")

  const scalarStreamResult = await contextB.exec({ flow: streamTurn, input: { id: "drain" } })
  const streamed = contextB.execStream({ flow: streamTurn, input: { id: "drain" } })
  const streamedEvents: unknown[] = []
  for await (const event of streamed) streamedEvents.push(event)
  const streamedResult = await streamed.result
  equal(JSON.stringify(streamedResult), JSON.stringify(scalarStreamResult), "Scalar drain and stream final result differ")
  equal(streamedEvents.length, 2, "Streaming turn did not emit both provider-neutral events")
  const broken = contextB.execStream({ flow: streamTurn, input: { id: "break" } })
  for await (const _event of broken) break
  await rejects(() => broken.result, /Flow stream aborted/, "Consumer break settlement")
  check(streamEvents.includes("close:break:aborted-true"), "Consumer break did not close as aborted")

  await rejects(
    () => contextB.exec({ flow: referenceArtifact, input: { digest: "sha256:db-report" } }),
    /not published/,
    "Unpublished artifact reference",
  )
  await contextB.exec({ flow: publishArtifact, input: { digest: "sha256:db-report" } })
  await contextB.exec({ flow: referenceArtifact, input: { digest: "sha256:db-report" } })
  equal(runtimeB.record.artifactRefs[0], "sha256:db-report", "Published artifact was not referenced")

  await contextB.exec({ flow: finishSession })
  const artifactPublishIndex = trace.indexOf("artifact.publish:sha256:db-report")
  const checkpointBIndex = trace.indexOf("session.checkpoint:session-B")
  check(artifactPublishIndex >= 0 && checkpointBIndex > artifactPublishIndex, "Checkpoint referenced an unpublished artifact")
  equal(sharedStore.values.get("session-B")?.artifactRefs[0], "sha256:db-report", "Checkpoint omitted artifact reference")
  await contextB.close({ ok: true })
  equal(businessEffectInLifecycleHookCount, 0, "Session B lifecycle hook performed a business effect")

  const authorityC: Authority = {
    tenant: "tenant-C",
    fingerprint: "authority-C",
    schemas: ["billing"],
  }
  const contextC = scope.createContext({
    parent: root,
    tags: [authority(authorityC), seed({ id: "session-C" }), provider, policy, validator],
  })
  const runtimeC = await contextC.resolve(session)
  sharedStore.failIds.add("session-C")
  await rejects(() => contextC.exec({ flow: finishSession }), /checkpoint failed/, "Commit failure")
  equal(runtimeC.record.status, "finishing", "Commit failure incorrectly sealed the runtime")
  equal(sharedStore.values.has("session-C"), false, "Failed commit published a session snapshot")
  await contextC.close({ ok: false, error: new Error("checkpoint failed") })

  await root.close({ ok: true })
  equal(sharedBackend.closed, true, "Root close did not close the shared backend")
  equal(sharedBackend.cleanupCount, 1, "Shared backend cleanup did not run exactly once")
  await scope.dispose()

  return {
    cases: {
      admissionBeforeInnerDependencies: true,
      toolSnapshotIdentity: true,
      authorityBeforeToolAndModel: true,
      boundedDatabaseBorrow: true,
      parallelJoinWithoutMerge: true,
      explicitCasMerge: true,
      waitingResumeAttemptSplit: true,
      interruptLateOutputFence: true,
      explicitFinishBeforeHostClose: true,
      lifecycleHooksEffectFree: true,
      sharedRootBackendIsolation: true,
      joinableFinish: true,
      authorityLoadBeforeBind: true,
      resumeMismatchFailClosed: true,
      forkWideningFailClosed: true,
      finishActiveAbortJoin: true,
      steeringAbortJoinRestart: true,
      missingBindingFailClosed: true,
      backendReadinessFailClosed: true,
      validationEngineFailClosed: true,
      failFastSiblingCancelJoin: true,
      scalarStreamParity: true,
      consumerBreakSettlement: true,
      multiRoundSnapshotImmutable: true,
      epochSnapshotImmutable: true,
      commitFailureUnfinished: true,
      artifactBeforeCheckpoint: true,
      memoryCandidateAcceptance: true,
      schedulerWakeNewAttempt: true,
    },
    counts: {
      providerCalls,
      toolCalls,
      readinessResolutions,
      backendBorrows: sharedBackend.borrows,
      maxConcurrentBorrows: sharedBackend.maxBorrows,
      checkpointsA: sharedStore.counts.get("session-A") ?? 0,
      checkpointsB: sharedStore.counts.get("session-B") ?? 0,
      quarantinedOutputs: runtimeA.quarantine.length,
      lifecycleBusinessEffects: businessEffectInLifecycleHookCount,
      abortsObserved: abortObservedCount,
      protectedEffects,
      artifactsPublished: sharedArtifacts.published.size,
      acceptedMemories: runtimeA.record.memories.length,
      streamAbortCloses: streamEvents.filter((event) => event.includes("aborted-true")).length,
      rootSchedulerClosed: Number(sharedScheduler.closed),
    },
    trace,
  }
}

void main().then((result) => {
  process.stdout.write(`${JSON.stringify(result)}\n`)
})
