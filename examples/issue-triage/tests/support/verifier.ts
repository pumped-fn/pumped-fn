import { createScope, flow, typed, type Lite } from "@pumped-fn/lite"
import { model, type ModelRequest, type ModelResponse } from "@pumped-fn/sdk"
import * as agent from "@pumped-fn/sdk/agent"
import * as session from "@pumped-fn/sdk/session"
import * as sdkValidation from "@pumped-fn/sdk/validation"
import {
  config,
  collectEvidence,
  createZodSdkEngine,
  createZodValidationEngine,
  digest,
  ports,
  TriageError,
  triageIssue,
  watchIssues,
  type Capability,
  type Evidence,
  type IssueIntake,
  type DeliveryLease,
  type PublicationInput,
  type PublicationReceipt,
  type TriageResult,
  type VerificationInput,
} from "../../src/triage.js"

export const objectiveIds = [
  "issue-intake-valid",
  "repository-path-contained",
  "code-evidence-cited",
  "postgresql-read-only",
  "database-evidence-cited",
  "victoria-window-bounded",
  "telemetry-evidence-cited",
  "evidence-fresh",
  "hypothesis-supported",
  "citations-complete",
  "verdict-independent",
  "verdict-covers-citations",
  "publication-authorized",
  "publication-idempotent",
  "known-receipt-retry-safe",
  "scope-seam-substitutable",
] as const

type Mode =
  | "success"
  | "stale"
  | "unsupported"
  | "missing-citation"
  | "duplicate-citation"
  | "writer-verdict"
  | "partial-verdict"
  | "wrong-hypothesis"
  | "adapter-failure"
  | "lost-receipt"

interface PublicationStore {
  receipts: Map<string, PublicationReceipt>
  writes: number
}

interface EnvironmentOptions {
  mode?: Mode
  queue?: DeliveryLease[]
  authority?: session.Authority
  capability?: Capability
  publicationStore?: PublicationStore
  concurrencyGate?: boolean
}

interface ContractResult {
  id: typeof objectiveIds[number]
  passed: boolean
  evidence: string
}

type Context = ReturnType<ReturnType<typeof createScope>["createContext"]>

function issue(overrides: Partial<IssueIntake> = {}): IssueIntake {
  return {
    issueId: "issue-42",
    repository: "acme/payments",
    title: "Checkout latency regression",
    body: "Checkout slowed after the latest payment query change",
    revision: "8d30c61",
    path: "/workspace/acme/payments/src/checkout.ts",
    sql: "SELECT query, mean_exec_time FROM pg_stat_statements WHERE query LIKE '%checkout%'",
    victoriaQuery: "histogram_quantile(0.95, checkout_latency_bucket)",
    windowStart: "2026-07-15T05:00:00.000Z",
    windowEnd: "2026-07-15T05:30:00.000Z",
    idempotencyKey: "triage:issue-42:8d30c61",
    ...overrides,
  }
}

function capability(overrides: Partial<Capability> = {}): Capability {
  return {
    repositoryRoot: "/workspace/acme/payments",
    databaseMode: "read-only",
    victoriaMaxWindowMs: 3_600_000,
    publication: true,
    scopes: ["repository:read", "postgresql:read-only", "victoria:bounded-read", "issues:write"],
    ...overrides,
  }
}

function authority(tenant = "acme-triage", publication = true): session.Authority {
  return session.createAuthority({
    tenant,
    roots: ["/workspace/acme/payments"],
    permissions: publication ? ["issues:write"] : [],
    tools: [collectEvidence.name!],
    sandbox: {
      roots: ["/workspace/acme/payments"],
      commands: [],
      write: false,
      network: false,
    },
  })
}

function initial(bound: session.Authority): session.SessionRecord {
  return {
    id: `session:${bound.tenant}`,
    version: 0,
    schemaVersion: 1,
    status: "open",
    authorityFingerprint: bound.fingerprint,
    authorityConstraints: bound,
    currentBranchId: "main",
    branches: [{
      id: "main",
      version: 0,
      createdBy: "bootstrap",
      authorityFingerprint: bound.fingerprint,
      authority: bound,
      evidence: [],
    }],
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

function publicationStore(): PublicationStore {
  return { receipts: new Map(), writes: 0 }
}

function modelIssue(request: ModelRequest): IssueIntake {
  const message = request.messages.find((entry) => entry.role === "user")
  if (!message) throw new TriageError("hypothesis", request.agentName, "Issue prompt is missing")
  return JSON.parse(message.content) as IssueIntake
}

function modelEvidence(request: ModelRequest): Evidence[] {
  return request.messages
    .filter((entry) => entry.role === "tool")
    .flatMap((entry) => {
      const parsed = JSON.parse(entry.content) as Evidence | Evidence[]
      return Array.isArray(parsed) ? parsed : [parsed]
    })
}

function createEnvironment(options: EnvironmentOptions = {}) {
  const mode = options.mode ?? "success"
  const concurrencyGate = options.concurrencyGate ?? false
  const queue = [...(options.queue ?? [])]
  const store = options.publicationStore ?? publicationStore()
  const bound = options.authority ?? authority()
  const calls = {
    model: 0,
    repository: 0,
    postgresql: 0,
    victoria: 0,
    hypothesis: 0,
    verifier: 0,
    publisher: 0,
    acknowledged: [] as string[],
    rejected: [] as string[],
    waited: 0,
    publicationKeys: [] as string[],
    activeRepository: 0,
    maxRepository: 0,
    observations: [] as session.ObservationProjection[],
  }
  let releaseGate: (() => void) | undefined
  const gate = new Promise<void>((resolve) => {
    releaseGate = resolve
  })
  let gateReleased = !concurrencyGate
  let lost = false
  const capturedAt = mode === "stale" ? "2026-07-15T03:00:00.000Z" : "2026-07-15T05:30:00.000Z"

  const repository = flow({
    name: "example.issue-triage.fake.repository",
    parse: typed<{ path: string; revision: string }>(),
    factory: async (ctx): Promise<Evidence> => {
      calls.repository += 1
      calls.activeRepository += 1
      calls.maxRepository = Math.max(calls.maxRepository, calls.activeRepository)
      if (concurrencyGate && !gateReleased) {
        if (calls.activeRepository === 2) {
          gateReleased = true
          releaseGate?.()
        }
        await gate
      }
      if (mode === "adapter-failure") {
        throw new TriageError("evidence", ctx.input.path, "Repository adapter failed")
      }
      calls.activeRepository -= 1
      return {
        id: `code:${ctx.input.revision}`,
        source: "repository",
        citation: `${ctx.input.path}@${ctx.input.revision}:L18-L33`,
        capturedAt,
        maxAgeMs: 3_600_000,
        queryIdentity: digest(ctx.input),
        revisionIdentity: ctx.input.revision,
        capabilityScope: "repository:read",
        summary: "The checkout handler issues the payment query before awaiting inventory",
      }
    },
  })
  const postgresql = flow({
    name: "example.issue-triage.fake.postgresql",
    parse: typed<{ sql: string }>(),
    factory: (ctx): Evidence => {
      calls.postgresql += 1
      return {
        id: "postgresql:pg-stat-checkout",
        source: "postgresql",
        citation: "postgresql://production/pg_stat_statements?query=checkout",
        capturedAt,
        maxAgeMs: 3_600_000,
        queryIdentity: digest(ctx.input),
        capabilityScope: "postgresql:read-only",
        summary: "The checkout statement mean execution time rose after the indexed predicate changed",
      }
    },
  })
  const victoria = flow({
    name: "example.issue-triage.fake.victoria",
    parse: typed<{ query: string; windowStart: string; windowEnd: string }>(),
    factory: (ctx): Evidence => {
      calls.victoria += 1
      return {
        id: "victoria:checkout-p95",
        source: "victoria",
        citation: `victoria://production?query=${encodeURIComponent(ctx.input.query)}&start=${ctx.input.windowStart}&end=${ctx.input.windowEnd}`,
        capturedAt,
        maxAgeMs: 3_600_000,
        queryIdentity: digest(ctx.input),
        capabilityScope: "victoria:bounded-read",
        summary: "Checkout p95 rose in the bounded window and correlates with database time",
      }
    },
  })
  const attempt = flow({
    name: "example.issue-triage.fake.model",
    parse: typed<ModelRequest>(),
    factory: (ctx): ModelResponse => {
      calls.model += 1
      const value = modelIssue(ctx.input)
      if (ctx.input.round === 0) {
        return {
          content: "Collecting evidence",
          toolCalls: [
            { name: collectEvidence.name!, input: value },
          ],
        }
      }
      const evidence = modelEvidence(ctx.input)
      calls.hypothesis += 1
      return {
        content: JSON.stringify({
          id: `hypothesis:${value.issueId}`,
          statement: `${value.title}: ${value.body}`,
          writerId: "writer:luna",
          evidenceIds: mode === "missing-citation"
            ? evidence.slice(0, 2).map((item) => item.id)
            : mode === "duplicate-citation"
              ? [evidence[0]!.id, evidence[0]!.id, evidence[1]!.id]
              : evidence.map((item) => item.id),
          supported: mode !== "unsupported",
        }),
        stop: true,
      }
    },
  })
  const verifier = flow({
    name: "example.issue-triage.fake.verifier",
    parse: typed<VerificationInput>(),
    factory: (ctx) => {
      calls.verifier += 1
      return {
        hypothesisId: mode === "wrong-hypothesis" ? "hypothesis:other" : ctx.input.hypothesis.id,
        verifierId: mode === "writer-verdict" ? ctx.input.hypothesis.writerId : "reviewer:sol",
        verdict: "verified" as const,
        checkedEvidenceIds: mode === "partial-verdict"
          ? ctx.input.hypothesis.evidenceIds.slice(0, 2)
          : ctx.input.hypothesis.evidenceIds,
      }
    },
  })
  const publisher = flow({
    name: "example.issue-triage.fake.publisher",
    parse: typed<PublicationInput>(),
    factory: (ctx): PublicationReceipt => {
      calls.publisher += 1
      const key = `${ctx.input.authorityFingerprint}:${ctx.input.idempotencyKey}`
      const payloadDigest = digest(ctx.input.payload)
      calls.publicationKeys.push(key)
      const existing = store.receipts.get(key)
      if (existing) {
        if (existing.payloadDigest !== payloadDigest) {
          throw new TriageError("publish", ctx.input.issueId, "Idempotency key conflicts with a different payload")
        }
        return { ...existing, known: true }
      }
      store.writes += 1
      const receipt = {
        publicationId: `github-comment:${store.writes}`,
        issueId: ctx.input.issueId,
        idempotencyKey: ctx.input.idempotencyKey,
        payloadDigest,
        publishedAt: "2026-07-15T05:45:00.000Z",
        known: false,
      }
      store.receipts.set(key, receipt)
      if (mode === "lost-receipt" && !lost) {
        lost = true
        throw new TriageError("publish", ctx.input.issueId, "Publication response was lost")
      }
      return receipt
    },
  })
  const issueIntake = flow({
    name: "example.issue-triage.fake.issue-intake",
    factory: (): DeliveryLease | undefined => queue.shift(),
  })
  const acknowledge = flow({
    name: "example.issue-triage.fake.acknowledge",
    parse: typed<{ leaseId: string; receipt: PublicationReceipt }>(),
    factory: (ctx): void => {
      calls.acknowledged.push(ctx.input.leaseId)
    },
  })
  const reject = flow({
    name: "example.issue-triage.fake.reject",
    parse: typed<{ leaseId: string; error: unknown }>(),
    factory: (ctx): void => {
      calls.rejected.push(ctx.input.leaseId)
    },
  })
  const leaseValid = flow({
    name: "example.issue-triage.fake.lease-valid",
    parse: typed<{ leaseId: string }>(),
    factory: (): boolean => true,
  })
  const wait = flow({
    name: "example.issue-triage.fake.wait",
    parse: typed<{ milliseconds: number }>(),
    factory: (): void => {
      calls.waited += 1
    },
  })
  const commit: session.Commit = flow({
    name: "example.issue-triage.fake.session-commit",
    parse: typed<{ record: session.SessionRecord; expectedVersion: number }>(),
    factory: (ctx) => ({ version: ctx.input.expectedVersion + 1 }),
  })
  const observation: Lite.Extension = {
    name: "example.issue-triage.fake.observation",
    wrapExec: (next, target, ctx) => {
      const projection = ctx.data.seekTag(session.observation.current)
      if (target === agent.turn && projection) calls.observations.push(projection)
      return next()
    },
  }

  return {
    calls,
    store,
    extensions: [observation],
    tags: [
      session.authority(bound),
      session.record(initial(bound)),
      session.clock({ now: () => "2026-07-15T05:45:00.000Z" }),
      session.execution.turn({ flow: agent.turn }),
      sdkValidation.engine(createZodSdkEngine()),
      agent.impl.attempt(agent.fromModel),
      model(attempt),
      config.validation(createZodValidationEngine()),
      config.capability(options.capability ?? capability()),
      config.clock(() => Date.parse("2026-07-15T05:45:00.000Z")),
      config.watch({ concurrency: 2, continuous: false, idleWaitMs: 0 }),
      ports.repository(repository),
      ports.postgresql(postgresql),
      ports.victoria(victoria),
      ports.verifier(verifier),
      ports.publisher(publisher),
      ports.issueIntake(issueIntake),
      ports.acknowledge(acknowledge),
      ports.reject(reject),
      ports.leaseValid(leaseValid),
      ports.wait(wait),
      session.store.commit(commit),
    ],
  }
}

async function useEnvironment<T>(environment: ReturnType<typeof createEnvironment>, run: (ctx: Context) => Promise<T>): Promise<T> {
  const scope = createScope({ tags: environment.tags, extensions: environment.extensions })
  const ctx = scope.createContext()
  try {
    return await run(ctx)
  } finally {
    await ctx.close()
    await scope.dispose()
  }
}

async function useDeliveryEnvironment<T>(
  environment: ReturnType<typeof createEnvironment>,
  run: (ctx: Context) => Promise<T>,
): Promise<T> {
  const scope = createScope({
    tags: environment.tags.filter((value) => value.tag !== session.authority && value.tag !== session.record),
    extensions: environment.extensions,
  })
  const ctx = scope.createContext()
  try {
    return await run(ctx)
  } finally {
    await ctx.close()
    await scope.dispose()
  }
}

async function runIssue(ctx: Context, input: unknown, workId: string): Promise<TriageResult> {
  return ctx.exec({ flow: triageIssue, input: { leaseId: workId, issue: input } })
}

async function rejects(run: () => Promise<unknown>): Promise<boolean> {
  try {
    await run()
    return false
  } catch {
    return true
  }
}

function untouched(environment: ReturnType<typeof createEnvironment>): boolean {
  return environment.calls.model === 0
    && environment.calls.repository === 0
    && environment.calls.postgresql === 0
    && environment.calls.victoria === 0
    && environment.calls.publisher === 0
}

export async function runVerifier(): Promise<{
  target: 16
  passedCount: number
  contracts: ContractResult[]
}> {
  const contracts: ContractResult[] = []
  const record = (id: typeof objectiveIds[number], passed: boolean, evidence: string): void => {
    contracts.push({ id, passed, evidence })
  }

  const valid = createEnvironment()
  const validResult = await useEnvironment(valid, (ctx) => runIssue(ctx, issue(), "valid"))
  const invalid = createEnvironment()
  const invalidRejected = await useEnvironment(invalid, (ctx) => rejects(() => runIssue(ctx, { issueId: "" }, "invalid")))
  record("issue-intake-valid", invalidRejected && untouched(invalid), "Strict Standard Schema intake rejects malformed input before the model or any adapter call")

  const traversal = createEnvironment()
  const traversalRejected = await useEnvironment(traversal, (ctx) => rejects(() => runIssue(ctx, issue({ path: "/workspace/acme/payments/../secrets.txt" }), "traversal")))
  record("repository-path-contained", traversalRejected && untouched(traversal), "Canonical containment rejects traversal before model, evidence, or publication effects")
  record("code-evidence-cited", validResult.evidence[0]?.source === "repository"
    && validResult.evidence[0].revisionIdentity === validResult.issue.revision
    && validResult.evidence[0].citation.includes(validResult.issue.revision), "Repository tool evidence binds its canonical path, revision, query identity, and citation")

  const mutating = createEnvironment()
  const mutatingRejected = await useEnvironment(mutating, (ctx) => rejects(() => runIssue(ctx, issue({ sql: "DELETE FROM payments" }), "mutating")))
  record("postgresql-read-only", mutatingRejected && untouched(mutating), "Mutating SQL is denied before the model, PostgreSQL port, or peer effects")
  record("database-evidence-cited", validResult.evidence[1]?.source === "postgresql"
    && validResult.evidence[1].capabilityScope === "postgresql:read-only"
    && validResult.evidence[1].citation.startsWith("postgresql://"), "Database tool evidence carries read-only capability, exact query identity, freshness, and a durable citation")

  const unbounded = createEnvironment()
  const unboundedRejected = await useEnvironment(unbounded, (ctx) => rejects(() => runIssue(ctx, issue({ windowEnd: "2026-07-15T07:00:00.000Z" }), "unbounded")))
  record("victoria-window-bounded", unboundedRejected && untouched(unbounded), "An over-limit Victoria window is denied before model, telemetry, or publication effects")
  record("telemetry-evidence-cited", validResult.evidence[2]?.source === "victoria"
    && validResult.evidence[2].capabilityScope === "victoria:bounded-read"
    && validResult.evidence[2].citation.startsWith("victoria://"), "Telemetry tool evidence binds query, bounded window, freshness, capability, and citation")

  const stale = createEnvironment({ mode: "stale" })
  const staleRejected = await useEnvironment(stale, (ctx) => rejects(() => runIssue(ctx, issue(), "stale")))
  record("evidence-fresh", staleRejected && stale.calls.publisher === 0, "Expired tool evidence cannot reach hypothesis publication")

  const unsupported = createEnvironment({ mode: "unsupported" })
  const unsupportedRejected = await useEnvironment(unsupported, (ctx) => rejects(() => runIssue(ctx, issue(), "unsupported")))
  record("hypothesis-supported", unsupportedRejected && unsupported.calls.publisher === 0, "A model-marked unsupported hypothesis is not published")

  const missingCitation = createEnvironment({ mode: "missing-citation" })
  const citationRejected = await useEnvironment(missingCitation, (ctx) => rejects(() => runIssue(ctx, issue(), "missing-citation")))
  const duplicateCitation = createEnvironment({ mode: "duplicate-citation" })
  const duplicateCitationRejected = await useEnvironment(duplicateCitation, (ctx) => rejects(() => runIssue(ctx, issue(), "duplicate-citation")))
  record("citations-complete", citationRejected && duplicateCitationRejected
    && missingCitation.calls.verifier === 0 && missingCitation.calls.publisher === 0
    && duplicateCitation.calls.verifier === 0 && duplicateCitation.calls.publisher === 0,
  "Every tool evidence ID must appear exactly once in the model hypothesis before verification")

  const writerVerdict = createEnvironment({ mode: "writer-verdict" })
  const writerVerdictRejected = await useEnvironment(writerVerdict, (ctx) => rejects(() => runIssue(ctx, issue(), "writer-verdict")))
  const wrongHypothesis = createEnvironment({ mode: "wrong-hypothesis" })
  const wrongHypothesisRejected = await useEnvironment(wrongHypothesis, (ctx) => rejects(() => runIssue(ctx, issue(), "wrong-hypothesis")))
  record("verdict-independent", writerVerdictRejected && wrongHypothesisRejected
    && writerVerdict.calls.publisher === 0 && wrongHypothesis.calls.publisher === 0, "The verifier must differ from the model writer and target the exact hypothesis")

  const partialVerdict = createEnvironment({ mode: "partial-verdict" })
  const partialVerdictRejected = await useEnvironment(partialVerdict, (ctx) => rejects(() => runIssue(ctx, issue(), "partial-verdict")))
  record("verdict-covers-citations", partialVerdictRejected && partialVerdict.calls.publisher === 0, "The independent verdict must check every hypothesis citation")

  const unauthorized = createEnvironment({ authority: authority("denied", false) })
  const unauthorizedRejected = await useEnvironment(unauthorized, (ctx) => rejects(() => runIssue(ctx, issue(), "unauthorized")))
  record("publication-authorized", unauthorizedRejected && untouched(unauthorized), "Missing session publication authority is denied before model, evidence, or publication effects")

  const duplicateStore = publicationStore()
  const duplicate = createEnvironment({ publicationStore: duplicateStore })
  const duplicateResult = await useEnvironment(duplicate, async (ctx) => {
    const first = await runIssue(ctx, issue(), "duplicate-1")
    const second = await runIssue(ctx, issue(), "duplicate-2")
    const conflict = await rejects(() => runIssue(ctx, issue({ body: "Conflicting payload" }), "duplicate-conflict"))
    return { first, second, conflict }
  })
  const otherAuthority = createEnvironment({
    publicationStore: duplicateStore,
    authority: authority("other-triage"),
  })
  await useEnvironment(otherAuthority, (ctx) => runIssue(ctx, issue(), "other-authority"))
  record("publication-idempotent", duplicateResult.first.receipt.publicationId === duplicateResult.second.receipt.publicationId
    && duplicateResult.second.receipt.known && duplicateResult.conflict && duplicateStore.writes === 2
    && new Set([...duplicate.calls.publicationKeys, ...otherAuthority.calls.publicationKeys]).size === 2,
  "Same session authority and key reuse one receipt, conflicting payloads fail, and another authority has a separate key space")

  const retryStore = publicationStore()
  const retry = createEnvironment({ mode: "lost-receipt", publicationStore: retryStore })
  const retryResult = await useEnvironment(retry, async (ctx) => {
    const firstLost = await rejects(() => runIssue(ctx, issue(), "retry-1"))
    const second = await runIssue(ctx, issue(), "retry-2")
    return { firstLost, second }
  })
  record("known-receipt-retry-safe", retryResult.firstLost && retryResult.second.receipt.known && retryStore.writes === 1,
    "A lost response retries to the authority-bound known receipt without a second publication write")

  const substitutableAuthority = authority()
  const queue = [1, 2, 3].map((number): DeliveryLease => ({
    leaseId: `lease-${number}`,
    issue: issue({ issueId: `issue-${number}`, idempotencyKey: `triage:issue-${number}:8d30c61` }),
    authority: substitutableAuthority,
    record: initial(substitutableAuthority),
  }))
  const substitutable = createEnvironment({ queue, authority: substitutableAuthority, concurrencyGate: true })
  const deliveries = await useDeliveryEnvironment(substitutable, (ctx) => ctx.exec({ flow: watchIssues }))
  const failedAdapter = createEnvironment({ mode: "adapter-failure" })
  const adapterRejected = await useEnvironment(failedAdapter, (ctx) => rejects(() => runIssue(ctx, issue(), "adapter-failure")))
  record("scope-seam-substitutable", deliveries.length === 3
    && deliveries.every((delivery) => delivery.status === "acknowledged")
    && substitutable.calls.acknowledged.length === 3
    && substitutable.calls.rejected.length === 0
    && substitutable.calls.maxRepository === 2
    && substitutable.calls.model === 6
    && new Set(substitutable.calls.observations.map((value) => value.workId)).size === 3
    && adapterRejected && failedAdapter.calls.publisher === 0,
  "createScope tags and a named observation projection drive session.run, agent.turn, selected tools, failures, and concurrency capped at two")

  return {
    target: 16,
    passedCount: contracts.filter((contract) => contract.passed).length,
    contracts,
  }
}
