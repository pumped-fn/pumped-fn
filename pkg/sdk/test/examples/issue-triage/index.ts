import { createHash } from "node:crypto"
import { isAbsolute, relative, resolve } from "node:path"
import { controller, flow, tag, tags, typed, type Lite } from "@pumped-fn/lite"
import * as agent from "@pumped-fn/sdk/agent"
import * as session from "@pumped-fn/sdk/session"
import * as sdkValidation from "@pumped-fn/sdk/validation"
import { z } from "zod"

export interface StandardSchema<T> {
  readonly "~standard": {
    validate(value: unknown):
      | { readonly value: T; readonly issues?: undefined }
      | { readonly issues: readonly { readonly message: string }[] }
      | Promise<
          | { readonly value: T; readonly issues?: undefined }
          | { readonly issues: readonly { readonly message: string }[] }
        >
  }
}

export interface IssueIntake {
  issueId: string
  repository: string
  title: string
  body: string
  revision: string
  path: string
  sql: string
  victoriaQuery: string
  windowStart: string
  windowEnd: string
  idempotencyKey: string
}

export interface Capability {
  repositoryRoot: string
  databaseMode: "read-only"
  victoriaMaxWindowMs: number
  publication: boolean
  scopes: string[]
}

export interface Evidence {
  id: string
  source: "repository" | "postgresql" | "victoria"
  citation: string
  capturedAt: string
  expiresAt?: string
  maxAgeMs?: number
  queryIdentity: string
  revisionIdentity?: string
  capabilityScope: string
  summary: string
}

export interface Hypothesis {
  id: string
  statement: string
  writerId: string
  evidenceIds: string[]
  supported: boolean
}

export interface VerifierVerdict {
  hypothesisId: string
  verifierId: string
  verdict: "verified" | "rejected" | "failed"
  checkedEvidenceIds: string[]
}

export interface PublicationReceipt {
  publicationId: string
  issueId: string
  idempotencyKey: string
  payloadDigest: string
  publishedAt: string
  known: boolean
}

export interface ValidationEngine {
  issueIntake: StandardSchema<IssueIntake>
  capability: StandardSchema<Capability>
  evidence: StandardSchema<Evidence>
  hypothesis: StandardSchema<Hypothesis>
  verifierVerdict: StandardSchema<VerifierVerdict>
  publicationReceipt: StandardSchema<PublicationReceipt>
}

export interface IssueLease {
  leaseId: string
  issue: unknown
}

export interface RepositoryRead {
  path: string
  revision: string
}

export interface PostgreSQLRead {
  sql: string
}

export interface VictoriaRead {
  query: string
  windowStart: string
  windowEnd: string
}

export interface VerificationInput {
  hypothesis: Hypothesis
  evidence: Evidence[]
}

export interface PublicationInput {
  authorityFingerprint: string
  issueId: string
  idempotencyKey: string
  payload: {
    hypothesis: Hypothesis
    verdict: VerifierVerdict
    evidence: Evidence[]
  }
}

export interface TriageResult {
  issue: IssueIntake
  evidence: Evidence[]
  hypothesis: Hypothesis
  verdict: VerifierVerdict
  receipt: PublicationReceipt
}

export type DeliveryResult =
  | { leaseId: string; status: "acknowledged"; result: TriageResult }
  | { leaseId: string; status: "rejected"; error: unknown }

export class TriageError extends Error {
  readonly kind = "issue-triage"

  constructor(
    readonly op: "authorize" | "evidence" | "hypothesis" | "verify" | "publish" | "lease",
    readonly entity: string,
    message: string,
  ) {
    super(message)
    this.name = "TriageError"
  }
}

const iso = z.string().datetime()
const shapes = Object.freeze({
  issueIntake: z.object({
    issueId: z.string().min(1),
    repository: z.string().min(1),
    title: z.string().min(1),
    body: z.string(),
    revision: z.string().min(1),
    path: z.string().min(1),
    sql: z.string().min(1),
    victoriaQuery: z.string().min(1),
    windowStart: iso,
    windowEnd: iso,
    idempotencyKey: z.string().min(1),
  }).strict(),
  capability: z.object({
    repositoryRoot: z.string().min(1),
    databaseMode: z.literal("read-only"),
    victoriaMaxWindowMs: z.number().int().positive(),
    publication: z.boolean(),
    scopes: z.array(z.string()).min(1),
  }).strict(),
  evidence: z.object({
    id: z.string().min(1),
    source: z.enum(["repository", "postgresql", "victoria"]),
    citation: z.string().min(1),
    capturedAt: iso,
    expiresAt: iso.optional(),
    maxAgeMs: z.number().int().positive().optional(),
    queryIdentity: z.string().min(1),
    revisionIdentity: z.string().min(1).optional(),
    capabilityScope: z.string().min(1),
    summary: z.string().min(1),
  }).strict().refine((value) => value.expiresAt !== undefined || value.maxAgeMs !== undefined),
  hypothesis: z.object({
    id: z.string().min(1),
    statement: z.string().min(1),
    writerId: z.string().min(1),
    evidenceIds: z.array(z.string()).min(1),
    supported: z.boolean(),
  }).strict(),
  verifierVerdict: z.object({
    hypothesisId: z.string().min(1),
    verifierId: z.string().min(1),
    verdict: z.enum(["verified", "rejected", "failed"]),
    checkedEvidenceIds: z.array(z.string()),
  }).strict(),
  publicationReceipt: z.object({
    publicationId: z.string().min(1),
    issueId: z.string().min(1),
    idempotencyKey: z.string().min(1),
    payloadDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    publishedAt: iso,
    known: z.boolean(),
  }).strict(),
})

function standard<T>(schema: z.ZodType<T>): StandardSchema<T> {
  return schema as unknown as StandardSchema<T>
}

export function createZodValidationEngine(): ValidationEngine {
  return {
    issueIntake: standard(shapes.issueIntake),
    capability: standard(shapes.capability),
    evidence: standard(shapes.evidence),
    hypothesis: standard(shapes.hypothesis),
    verifierVerdict: standard(shapes.verifierVerdict),
    publicationReceipt: standard(shapes.publicationReceipt),
  }
}

export function createZodSdkEngine(): sdkValidation.Engine {
  return sdkValidation.standard({
    id: "zod",
    toJsonSchema: (schema: z.ZodType) => z.toJSONSchema(schema),
  })
}

export const config = Object.freeze({
  validation: tag<ValidationEngine>({ label: "example.issue-triage.validation" }),
  capability: tag<unknown>({ label: "example.issue-triage.capability" }),
  clock: tag<() => number>({ label: "example.issue-triage.clock" }),
})

export const ports = Object.freeze({
  issueIntake: tag<Lite.Flow<IssueLease | undefined, void>>({ label: "example.issue-triage.issue-intake" }),
  acknowledge: tag<Lite.Flow<void, { leaseId: string; receipt: PublicationReceipt }>>({ label: "example.issue-triage.acknowledge" }),
  reject: tag<Lite.Flow<void, { leaseId: string; error: unknown }>>({ label: "example.issue-triage.reject" }),
  leaseValid: tag<Lite.Flow<boolean, { leaseId: string }>>({ label: "example.issue-triage.lease-valid" }),
  wait: tag<Lite.Flow<void, { milliseconds: number }>>({ label: "example.issue-triage.wait" }),
  repository: tag<Lite.Flow<unknown, RepositoryRead>>({ label: "example.issue-triage.repository-read" }),
  postgresql: tag<Lite.Flow<unknown, PostgreSQLRead>>({ label: "example.issue-triage.postgresql-read" }),
  victoria: tag<Lite.Flow<unknown, VictoriaRead>>({ label: "example.issue-triage.victoria-read" }),
  verifier: tag<Lite.Flow<unknown, VerificationInput>>({ label: "example.issue-triage.independent-verifier" }),
  publisher: tag<Lite.Flow<unknown, PublicationInput>>({ label: "example.issue-triage.github-publisher" }),
})

async function validate<T>(schema: StandardSchema<T>, value: unknown): Promise<T> {
  const result = await schema["~standard"].validate(value)
  if (result.issues) throw new Error(`Validation failed: ${result.issues.map((issue) => issue.message).join(", ")}`)
  return result.value
}

export function containedRepositoryPath(root: string, candidate: string): string {
  const canonicalRoot = resolve(root)
  const canonicalCandidate = isAbsolute(candidate) ? resolve(candidate) : resolve(canonicalRoot, candidate)
  const offset = relative(canonicalRoot, canonicalCandidate)
  if (offset === "" || (!offset.startsWith("..") && !isAbsolute(offset))) return canonicalCandidate
  throw new Error("Repository path escapes the granted root")
}

export function isReadOnlySQL(sql: string): boolean {
  return /^\s*(select|with\b[\s\S]*\bselect)\b/i.test(sql)
    && !/\b(insert|update|delete|alter|drop|create|truncate|grant|revoke|copy|call|merge)\b/i.test(sql)
}

export function digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`
}

function isFresh(evidence: Evidence, now: number): boolean {
  const captured = Date.parse(evidence.capturedAt)
  if (!Number.isFinite(captured) || captured > now) return false
  return evidence.expiresAt !== undefined
    ? now <= Date.parse(evidence.expiresAt)
    : evidence.maxAgeMs !== undefined && now - captured <= evidence.maxAgeMs
}

function authorize(issue: IssueIntake, capability: Capability, authority: session.Authority): IssueIntake {
  const path = containedRepositoryPath(capability.repositoryRoot, issue.path)
  const windowStart = Date.parse(issue.windowStart)
  const windowEnd = Date.parse(issue.windowEnd)
  const requiredScopes = ["repository:read", "postgresql:read-only", "victoria:bounded-read", "issues:write"]
  if (!isReadOnlySQL(issue.sql) || capability.databaseMode !== "read-only") {
    throw new TriageError("authorize", issue.issueId, "Mutating SQL denied")
  }
  if (!(windowEnd > windowStart) || windowEnd - windowStart > capability.victoriaMaxWindowMs) {
    throw new TriageError("authorize", issue.issueId, "Victoria window is not positively bounded")
  }
  if (!capability.publication
    || requiredScopes.some((scope) => !capability.scopes.includes(scope))
    || !authority.permissions.includes("issues:write")) {
    throw new TriageError("authorize", issue.issueId, "Publication authority denied")
  }
  return { ...issue, path }
}

export const repositoryEvidence = flow({
  name: "issue_triage_repository",
  parse: typed<IssueIntake>(),
  deps: {
    validation: tags.required(config.validation),
    capability: tags.required(config.capability),
    authority: tags.required(session.current.authority),
    repository: tags.required(ports.repository),
  },
  factory: async (ctx, { validation, capability: rawCapability, authority, repository }): Promise<Evidence> => {
    const issue = authorize(ctx.input, await validate(validation.capability, rawCapability), authority)
    const input = { path: issue.path, revision: issue.revision }
    const evidence = await validate(validation.evidence, await repository.exec({ input }))
    if (evidence.source !== "repository"
      || evidence.revisionIdentity !== issue.revision
      || evidence.queryIdentity !== digest(input)) {
      throw new TriageError("evidence", issue.issueId, "Code evidence lacks revision identity")
    }
    return evidence
  },
})

export const postgresqlEvidence = flow({
  name: "issue_triage_postgresql",
  parse: typed<IssueIntake>(),
  deps: {
    validation: tags.required(config.validation),
    capability: tags.required(config.capability),
    authority: tags.required(session.current.authority),
    postgresql: tags.required(ports.postgresql),
  },
  factory: async (ctx, { validation, capability: rawCapability, authority, postgresql }): Promise<Evidence> => {
    const issue = authorize(ctx.input, await validate(validation.capability, rawCapability), authority)
    const input = { sql: issue.sql }
    const evidence = await validate(validation.evidence, await postgresql.exec({ input }))
    if (evidence.source !== "postgresql"
      || evidence.capabilityScope !== "postgresql:read-only"
      || evidence.queryIdentity !== digest(input)) {
      throw new TriageError("evidence", issue.issueId, "Database evidence lacks read-only scope")
    }
    return evidence
  },
})

export const victoriaEvidence = flow({
  name: "issue_triage_victoria",
  parse: typed<IssueIntake>(),
  deps: {
    validation: tags.required(config.validation),
    capability: tags.required(config.capability),
    authority: tags.required(session.current.authority),
    victoria: tags.required(ports.victoria),
  },
  factory: async (ctx, { validation, capability: rawCapability, authority, victoria }): Promise<Evidence> => {
    const issue = authorize(ctx.input, await validate(validation.capability, rawCapability), authority)
    const input = {
      query: issue.victoriaQuery,
      windowStart: issue.windowStart,
      windowEnd: issue.windowEnd,
    }
    const evidence = await validate(validation.evidence, await victoria.exec({ input }))
    if (evidence.source !== "victoria"
      || evidence.capabilityScope !== "victoria:bounded-read"
      || evidence.queryIdentity !== digest(input)) {
      throw new TriageError("evidence", issue.issueId, "Telemetry evidence lacks bounded-read scope")
    }
    return evidence
  },
})

export const collectEvidence = flow({
  name: "issue_triage_collect_evidence",
  tags: [agent.config.tool({
    version: "1",
    description: "Collect cited repository, PostgreSQL, and Victoria evidence under the session authority.",
    input: shapes.issueIntake,
  })],
  parse: typed<IssueIntake>(),
  deps: {
    repository: controller(repositoryEvidence),
    postgresql: controller(postgresqlEvidence),
    victoria: controller(victoriaEvidence),
  },
  factory: (ctx, { repository, postgresql, victoria }): Promise<Evidence[]> => Promise.all([
    repository.exec({ input: ctx.input }),
    postgresql.exec({ input: ctx.input }),
    victoria.exec({ input: ctx.input }),
  ]),
})

export const triageIssue = flow({
  name: "example.issue-triage.triage",
  parse: typed<IssueLease>(),
  deps: {
    runtime: session.session,
    validation: tags.required(config.validation),
    capability: tags.required(config.capability),
    clock: tags.required(config.clock),
    run: controller(session.run),
    verifier: tags.required(ports.verifier),
    publisher: tags.required(ports.publisher),
  },
  factory: async (ctx, { runtime, validation, capability: rawCapability, clock, run, verifier, publisher }): Promise<TriageResult> => {
    const issue = authorize(
      await validate(validation.issueIntake, ctx.input.issue),
      await validate(validation.capability, rawCapability),
      runtime.authority,
    )
    const result = await run.exec({
      tags: [
        agent.config.role({
          name: "issue-triage",
          version: "1",
          instructions: "Collect all three evidence sources, then write one cited hypothesis.",
          maxRounds: 2,
        }),
        agent.impl.tool(collectEvidence),
      ],
      input: {
        work: {
          id: ctx.input.leaseId,
          branchId: "main",
          role: "issue-triage",
          policy: "all",
        },
        input: {
          messages: [{ role: "user", content: JSON.stringify(issue) }],
          metadata: { issueId: issue.issueId },
        },
      },
    }) as agent.TurnResult
    const outputs = result.toolResults.flatMap((tool) => Array.isArray(tool.output) ? tool.output : [tool.output])
    const evidence = await Promise.all(outputs.map((output) => validate(validation.evidence, output)))
    if (evidence.length !== 3 || evidence.some((item) => !isFresh(item, clock()))) {
      throw new TriageError("evidence", issue.issueId, "Evidence is incomplete or stale")
    }
    const hypothesis = await validate(validation.hypothesis, JSON.parse(result.content))
    if (!hypothesis.supported) throw new TriageError("hypothesis", hypothesis.id, "Hypothesis is unsupported")
    const evidenceIds = new Set(evidence.map((item) => item.id))
    if (hypothesis.evidenceIds.length !== evidenceIds.size
      || hypothesis.evidenceIds.some((id) => !evidenceIds.has(id))) {
      throw new TriageError("hypothesis", hypothesis.id, "Citation is missing")
    }
    const verdict = await validate(
      validation.verifierVerdict,
      await verifier.exec({ input: { hypothesis, evidence } }),
    )
    if (verdict.hypothesisId !== hypothesis.id) {
      throw new TriageError("verify", hypothesis.id, "Verdict targets a different hypothesis")
    }
    if (verdict.verifierId === hypothesis.writerId || verdict.verdict !== "verified") {
      throw new TriageError("verify", hypothesis.id, "Independent verification is required")
    }
    if (hypothesis.evidenceIds.some((id) => !verdict.checkedEvidenceIds.includes(id))) {
      throw new TriageError("verify", hypothesis.id, "Verdict does not cover every citation")
    }
    const publication = {
      authorityFingerprint: runtime.authority.fingerprint,
      issueId: issue.issueId,
      idempotencyKey: issue.idempotencyKey,
      payload: { hypothesis, verdict, evidence },
    }
    const receipt = await validate(
      validation.publicationReceipt,
      await publisher.exec({ input: publication }),
    )
    if (receipt.issueId !== publication.issueId
      || receipt.idempotencyKey !== publication.idempotencyKey
      || receipt.payloadDigest !== digest(publication.payload)) {
      throw new TriageError("publish", issue.issueId, "Publication receipt does not bind the request")
    }
    return { issue, evidence, hypothesis, verdict, receipt }
  },
})

export const runDelivery = flow({
  name: "example.issue-triage.run-delivery",
  parse: typed<IssueLease>(),
  deps: {
    triage: controller(triageIssue),
    acknowledge: tags.required(ports.acknowledge),
    reject: tags.required(ports.reject),
    leaseValid: tags.required(ports.leaseValid),
    wait: tags.required(ports.wait),
  },
  factory: async (ctx, { triage, acknowledge, reject, leaseValid, wait }): Promise<DeliveryResult> => {
    try {
      if (!await leaseValid.exec({ input: { leaseId: ctx.input.leaseId } })) {
        throw new TriageError("lease", ctx.input.leaseId, "Issue lease expired")
      }
      const result = await triage.exec({ input: ctx.input })
      await acknowledge.exec({ input: { leaseId: ctx.input.leaseId, receipt: result.receipt } })
      return { leaseId: ctx.input.leaseId, status: "acknowledged", result }
    } catch (error) {
      await wait.exec({ input: { milliseconds: 0 } })
      await reject.exec({ input: { leaseId: ctx.input.leaseId, error } })
      return { leaseId: ctx.input.leaseId, status: "rejected", error }
    }
  },
})

export const watchIssues = flow({
  name: "example.issue-triage.watch",
  deps: {
    receive: tags.required(ports.issueIntake),
    delivery: controller(runDelivery),
  },
  factory: async (_ctx, { receive, delivery }): Promise<DeliveryResult[]> => {
    const active = new Set<Promise<void>>()
    const results: DeliveryResult[] = []
    for (;;) {
      const lease = await receive.exec()
      if (!lease) break
      const running = delivery.exec({ input: lease }).then((result) => {
        results.push(result)
      })
      active.add(running)
      void running.then(() => active.delete(running))
      if (active.size >= 2) await Promise.race(active)
    }
    await Promise.all(active)
    return results
  },
})
