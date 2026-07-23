import { createScope, flow, preset, typed } from "@pumped-fn/lite"
import { model, type ModelRequest, type ModelResponse } from "@pumped-fn/sdk"
import * as agent from "@pumped-fn/sdk/agent"
import * as session from "@pumped-fn/sdk/session"
import * as sdkValidation from "@pumped-fn/sdk/validation"
import { afterEach, describe, expect, it } from "vitest"
import { initial } from "../src/session.js"
import {
  collectEvidence,
  config,
  createZodSdkEngine,
  createZodValidationEngine,
  digest,
  ports,
  postgresqlEvidence,
  repositoryEvidence,
  runDelivery,
  TriageError,
  triageIssue,
  victoriaEvidence,
  watchIssues,
  type Capability,
  type DeliveryLease,
  type Evidence,
  type IssueIntake,
  type PublicationInput,
  type PublicationReceipt,
  type VerificationInput,
} from "../src/triage.js"

const scopes: ReturnType<typeof createScope>[] = []
const triageCases = Object.freeze([
  { name: "complete pipeline", mode: "success", error: undefined, calls: [2, 3, 1, 1] },
  { name: "stale evidence", mode: "stale", error: "Evidence is incomplete or stale", calls: [2, 3, 0, 0] },
  { name: "unsupported hypothesis", mode: "unsupported", error: "Hypothesis is unsupported", calls: [2, 3, 0, 0] },
  { name: "missing citation", mode: "missing-citation", error: "Citation is missing", calls: [2, 3, 0, 0] },
  { name: "duplicate citation", mode: "duplicate-citation", error: "Validation failed", calls: [2, 3, 0, 0] },
  { name: "writer verdict", mode: "writer-verdict", error: "Independent verification is required", calls: [2, 3, 1, 0] },
  { name: "wrong-hypothesis verdict", mode: "wrong-hypothesis", error: "Verdict targets a different hypothesis", calls: [2, 3, 1, 0] },
  { name: "rejected verdict", mode: "rejected-verdict", error: "Independent verification is required", calls: [2, 3, 1, 0] },
  { name: "partial verdict", mode: "partial-verdict", error: "Verdict does not cover every citation", calls: [2, 3, 1, 0] },
  { name: "expired lease", mode: "expired-lease", error: "Issue lease expired before publication", calls: [2, 3, 1, 0] },
  { name: "publication authority", mode: "unauthorized", error: "Publication authority denied", calls: [0, 0, 0, 0] },
  { name: "receipt issue binding", mode: "receipt-issue", error: "Publication receipt does not bind the request", calls: [2, 3, 1, 1] },
  { name: "receipt key binding", mode: "receipt-key", error: "Publication receipt does not bind the request", calls: [2, 3, 1, 1] },
  { name: "receipt payload binding", mode: "receipt-digest", error: "Publication receipt does not bind the request", calls: [2, 3, 1, 1] },
  { name: "publication failure", mode: "publication-failure", error: "Publication failed", calls: [2, 3, 1, 1] },
] as const)
const bound = session.createAuthority({
  tenant: "acme/payments",
  roots: ["/workspace/acme/payments"],
  permissions: ["issues:write"],
  tools: [collectEvidence.name!],
  sandbox: {
    roots: ["/workspace/acme/payments"],
    commands: ["git"],
    write: false,
    network: true,
  },
})
const capability: Capability = {
  repositoryRoot: "/workspace/acme/payments",
  databaseMode: "read-only",
  victoriaMaxWindowMs: 3_600_000,
  publication: true,
  scopes: ["repository:read", "postgresql:read-only", "victoria:bounded-read", "issues:write"],
}
const issue: IssueIntake = {
  issueId: "acme/payments#42",
  repository: "acme/payments",
  title: "Checkout latency regression",
  body: "Checkout slowed after the latest payment query change",
  revision: "8d30c61",
  path: "/workspace/acme/payments/src/checkout.ts",
  sql: "SELECT query, mean_exec_time FROM pg_stat_statements",
  victoriaQuery: "checkout_latency_bucket",
  windowStart: "2026-07-15T05:00:00.000Z",
  windowEnd: "2026-07-15T05:30:00.000Z",
  idempotencyKey: "triage-42",
}

function unexpectedEvidence(): Evidence {
  return {
    id: "unexpected",
    source: "repository",
    citation: "repository://unexpected",
    capturedAt: "2026-07-15T05:30:00.000Z",
    maxAgeMs: 3_600_000,
    queryIdentity: "unexpected",
    capabilityScope: "repository:read",
    summary: "Unexpected port call",
  }
}

afterEach(async () => {
  await Promise.all(scopes.splice(0).map((scope) => scope.dispose()))
})

describe("issue triage scope seam", () => {
  it("collects three identity-bound evidence records through public ports", async () => {
    const repository = flow({
      name: "issue-triage.test.repository",
      parse: typed<{ path: string; revision: string }>(),
      factory: (ctx): Evidence => ({
        id: "code",
        source: "repository",
        citation: `${ctx.input.revision}:src/checkout.ts:L18`,
        capturedAt: "2026-07-15T05:30:00.000Z",
        maxAgeMs: 3_600_000,
        queryIdentity: digest(ctx.input),
        revisionIdentity: ctx.input.revision,
        capabilityScope: "repository:read",
        summary: "Code evidence",
      }),
    })
    const postgresql = flow({
      name: "issue-triage.test.postgresql",
      parse: typed<{ sql: string }>(),
      factory: (ctx): Evidence => ({
        id: "database",
        source: "postgresql",
        citation: "postgresql://target/explain",
        capturedAt: "2026-07-15T05:30:00.000Z",
        maxAgeMs: 3_600_000,
        queryIdentity: digest(ctx.input),
        capabilityScope: "postgresql:read-only",
        summary: "Database evidence",
      }),
    })
    const victoria = flow({
      name: "issue-triage.test.victoria",
      parse: typed<{ query: string; windowStart: string; windowEnd: string }>(),
      factory: (ctx): Evidence => ({
        id: "telemetry",
        source: "victoria",
        citation: "victoria://query-range",
        capturedAt: "2026-07-15T05:30:00.000Z",
        maxAgeMs: 3_600_000,
        queryIdentity: digest(ctx.input),
        capabilityScope: "victoria:bounded-read",
        summary: "Telemetry evidence",
      }),
    })
    const scope = createScope({
      tags: [
        config.validation(createZodValidationEngine()),
        config.capability(capability),
        session.current.authority(bound),
        ports.repository(repository),
        ports.postgresql(postgresql),
        ports.victoria(victoria),
      ],
    })
    scopes.push(scope)
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: collectEvidence, input: issue })).resolves.toMatchObject([
      { id: "code", source: "repository", revisionIdentity: issue.revision },
      { id: "database", source: "postgresql", capabilityScope: "postgresql:read-only" },
      { id: "telemetry", source: "victoria", capabilityScope: "victoria:bounded-read" },
    ])
    await ctx.close()
  })

  it.each(triageCases)("enforces $name through triageIssue", async ({ mode, error, calls: expectedCalls }) => {
    const activeAuthority = mode === "unauthorized"
      ? session.createAuthority({
          tenant: "acme/payments",
          roots: ["/workspace/acme/payments"],
          permissions: [],
          tools: [collectEvidence.name!],
          sandbox: {
            roots: ["/workspace/acme/payments"],
            commands: ["git"],
            write: false,
            network: true,
          },
        })
      : bound
    const calls = { model: 0, evidence: 0, verifier: 0, publisher: 0 }
    const capturedAt = mode === "stale"
      ? "2026-07-15T03:00:00.000Z"
      : "2026-07-15T05:30:00.000Z"
    const repository = flow({
      name: "issue-triage.test.pipeline.repository",
      parse: typed<{ path: string; revision: string }>(),
      factory: (ctx): Evidence => {
        calls.evidence += 1
        return {
          id: "code",
          source: "repository",
          citation: `${ctx.input.revision}:src/checkout.ts:L18`,
          capturedAt,
          maxAgeMs: 3_600_000,
          queryIdentity: digest(ctx.input),
          revisionIdentity: ctx.input.revision,
          capabilityScope: "repository:read",
          summary: "Code evidence",
        }
      },
    })
    const postgresql = flow({
      name: "issue-triage.test.pipeline.postgresql",
      parse: typed<{ sql: string }>(),
      factory: (ctx): Evidence => {
        calls.evidence += 1
        return {
          id: "database",
          source: "postgresql",
          citation: "postgresql://target/explain",
          capturedAt,
          maxAgeMs: 3_600_000,
          queryIdentity: digest(ctx.input),
          capabilityScope: "postgresql:read-only",
          summary: "Database evidence",
        }
      },
    })
    const victoria = flow({
      name: "issue-triage.test.pipeline.victoria",
      parse: typed<{ query: string; windowStart: string; windowEnd: string }>(),
      factory: (ctx): Evidence => {
        calls.evidence += 1
        return {
          id: "telemetry",
          source: "victoria",
          citation: "victoria://query-range",
          capturedAt,
          maxAgeMs: 3_600_000,
          queryIdentity: digest(ctx.input),
          capabilityScope: "victoria:bounded-read",
          summary: "Telemetry evidence",
        }
      },
    })
    const attempt = flow({
      name: "issue-triage.test.pipeline.model",
      parse: typed<ModelRequest>(),
      factory: (ctx): ModelResponse => {
        calls.model += 1
        const message = ctx.input.messages.find((entry) => entry.role === "user")
        if (!message) throw new TriageError("hypothesis", ctx.input.agentName, "Issue prompt is missing")
        const value = JSON.parse(message.content) as IssueIntake
        if (ctx.input.round === 0) {
          return {
            content: "Collecting evidence",
            toolCalls: [{ name: collectEvidence.name!, input: value }],
          }
        }
        const evidence = ctx.input.messages
          .filter((entry) => entry.role === "tool")
          .flatMap((entry) => {
            const parsed = JSON.parse(entry.content) as Evidence | Evidence[]
            return Array.isArray(parsed) ? parsed : [parsed]
          })
        return {
          content: JSON.stringify({
            id: "hypothesis-42",
            statement: "The checkout query regressed.",
            writerId: "writer:pi",
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
      name: "issue-triage.test.pipeline.verifier",
      parse: typed<VerificationInput>(),
      factory: (ctx) => {
        calls.verifier += 1
        return {
          hypothesisId: mode === "wrong-hypothesis" ? "hypothesis-other" : ctx.input.hypothesis.id,
          verifierId: mode === "writer-verdict" ? ctx.input.hypothesis.writerId : "reviewer:sol",
          verdict: mode === "rejected-verdict" ? "rejected" as const : "verified" as const,
          checkedEvidenceIds: mode === "partial-verdict"
            ? ctx.input.hypothesis.evidenceIds.slice(0, 2)
            : ctx.input.hypothesis.evidenceIds,
        }
      },
    })
    const publisher = flow({
      name: "issue-triage.test.pipeline.publisher",
      parse: typed<PublicationInput>(),
      factory: (ctx): PublicationReceipt => {
        calls.publisher += 1
        if (mode === "publication-failure") {
          throw new TriageError("publish", ctx.input.issueId, "Publication failed")
        }
        return {
          publicationId: "github-comment:99",
          issueId: mode === "receipt-issue" ? "acme/payments#99" : ctx.input.issueId,
          idempotencyKey: mode === "receipt-key" ? "other-key" : ctx.input.idempotencyKey,
          payloadDigest: mode === "receipt-digest" ? `sha256:${"0".repeat(64)}` : digest(ctx.input.payload),
          publishedAt: "2026-07-15T05:45:00.000Z",
          known: false,
        }
      },
    })
    const leaseValid = flow({
      name: "issue-triage.test.pipeline.lease",
      parse: typed<{ leaseId: string }>(),
      factory: (): boolean => mode !== "expired-lease",
    })
    const commit: session.Commit = flow({
      name: "issue-triage.test.pipeline.commit",
      parse: typed<{ record: session.SessionRecord; expectedVersion: number }>(),
      factory: (ctx) => ({ version: ctx.input.expectedVersion + 1 }),
    })
    const scope = createScope({
      tags: [
        session.authority(activeAuthority),
        session.record(initial(`session-${mode}`, activeAuthority)),
        session.clock({ now: () => "2026-07-15T05:45:00.000Z" }),
        session.execution.turn({ flow: agent.turn }),
        session.store.commit(commit),
        sdkValidation.engine(createZodSdkEngine()),
        agent.impl.attempt(agent.fromModel),
        model(attempt),
        config.validation(createZodValidationEngine()),
        config.capability(capability),
        config.clock(() => Date.parse("2026-07-15T05:45:00.000Z")),
        ports.repository(repository),
        ports.postgresql(postgresql),
        ports.victoria(victoria),
        ports.verifier(verifier),
        ports.publisher(publisher),
        ports.leaseValid(leaseValid),
      ],
    })
    scopes.push(scope)
    const ctx = scope.createContext()
    const execution = ctx.exec({
      flow: triageIssue,
      input: { leaseId: `lease-${mode}`, issue },
    })

    if (error === undefined) {
      await expect(execution).resolves.toMatchObject({
        issue: { issueId: issue.issueId },
        evidence: [{ id: "code" }, { id: "database" }, { id: "telemetry" }],
        hypothesis: { id: "hypothesis-42", supported: true },
        verdict: { verdict: "verified" },
        receipt: { publicationId: "github-comment:99" },
      })
    } else {
      await expect(execution).rejects.toThrow(error)
    }
    expect([calls.model, calls.evidence, calls.verifier, calls.publisher]).toEqual(expectedCalls)
    await ctx.close()
  })

  it("rejects a repository path outside the granted root before the port runs", async () => {
    let calls = 0
    const repository = flow({
      name: "issue-triage.test.repository",
      parse: typed<{ path: string; revision: string }>(),
      factory: (): Evidence => {
        calls += 1
        return unexpectedEvidence()
      },
    })
    const scope = createScope({
      tags: [
        config.validation(createZodValidationEngine()),
        config.capability(capability),
        session.current.authority(bound),
        ports.repository(repository),
      ],
    })
    scopes.push(scope)
    const ctx = scope.createContext()

    await expect(ctx.exec({
      flow: repositoryEvidence,
      input: { ...issue, path: "/workspace/acme/secrets.txt" },
    })).rejects.toThrow("Repository path escapes the granted root")
    expect(calls).toBe(0)
    await ctx.close()
  })

  it("rejects mutating SQL before the database port runs", async () => {
    let calls = 0
    const postgresql = flow({
      name: "issue-triage.test.postgresql",
      parse: typed<{ sql: string }>(),
      factory: (): Evidence => {
        calls += 1
        return unexpectedEvidence()
      },
    })
    const scope = createScope({
      tags: [
        config.validation(createZodValidationEngine()),
        config.capability(capability),
        session.current.authority(bound),
        ports.postgresql(postgresql),
      ],
    })
    scopes.push(scope)
    const ctx = scope.createContext()

    await expect(ctx.exec({
      flow: postgresqlEvidence,
      input: { ...issue, sql: "DELETE FROM payments" },
    })).rejects.toThrow("Mutating SQL denied")
    expect(calls).toBe(0)
    await ctx.close()
  })

  it("rejects an unbounded telemetry window before the Victoria port runs", async () => {
    let calls = 0
    const victoria = flow({
      name: "issue-triage.test.victoria",
      parse: typed<{ query: string; windowStart: string; windowEnd: string }>(),
      factory: (): Evidence => {
        calls += 1
        return unexpectedEvidence()
      },
    })
    const scope = createScope({
      tags: [
        config.validation(createZodValidationEngine()),
        config.capability(capability),
        session.current.authority(bound),
        ports.victoria(victoria),
      ],
    })
    scopes.push(scope)
    const ctx = scope.createContext()

    await expect(ctx.exec({
      flow: victoriaEvidence,
      input: { ...issue, windowEnd: "2026-07-15T07:00:00.000Z" },
    })).rejects.toThrow("Victoria window is not positively bounded")
    expect(calls).toBe(0)
    await ctx.close()
  })

  it("activates each delivery authority only on its child execution", async () => {
    const other = session.createAuthority({
      tenant: "acme/refunds",
      roots: ["/workspace/acme/refunds"],
      permissions: ["issues:write"],
      tools: [collectEvidence.name!],
      sandbox: {
        roots: ["/workspace/acme/refunds"],
        commands: ["git"],
        write: false,
        network: true,
      },
    })
    const queue: DeliveryLease[] = [
      { leaseId: "lease-1", issue, authority: bound, record: initial("session-1", bound) },
      { leaseId: "lease-2", issue, authority: other, record: initial("session-2", other) },
    ]
    const seen: string[] = []
    const receive = flow({
      name: "issue-triage.test.receive",
      factory: (): DeliveryLease | undefined => queue.shift(),
    })
    const wait = flow({
      name: "issue-triage.test.wait",
      parse: typed<{ milliseconds: number }>(),
      factory: (): void => undefined,
    })
    const scope = createScope({
      tags: [
        config.watch({ concurrency: 1, continuous: false, idleWaitMs: 0 }),
        ports.issueIntake(receive),
        ports.wait(wait),
      ],
      presets: [preset(runDelivery, (ctx) => {
        seen.push(ctx.data.seekTag(session.authority)!.tenant)
        return { leaseId: ctx.input.leaseId, status: "rejected" as const, error: undefined }
      })],
    })
    scopes.push(scope)
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: watchIssues })).resolves.toHaveLength(2)
    expect(seen).toEqual(["acme/payments", "acme/refunds"])
    expect(ctx.data.seekTag(session.authority)).toBeUndefined()
    await ctx.close()
  })

  it("caps concurrent delivery execution at two and completes the queue", async () => {
    const queue: DeliveryLease[] = [1, 2, 3].map((number) => ({
      leaseId: `lease-${number}`,
      issue,
      authority: bound,
      record: initial(`session-${number}`, bound),
    }))
    const completed: string[] = []
    let active = 0
    let maxActive = 0
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const receive = flow({
      name: "issue-triage.test.concurrent.receive",
      factory: (): DeliveryLease | undefined => queue.shift(),
    })
    const wait = flow({
      name: "issue-triage.test.concurrent.wait",
      parse: typed<{ milliseconds: number }>(),
      factory: (): void => undefined,
    })
    const scope = createScope({
      tags: [
        config.watch({ concurrency: 2, continuous: false, idleWaitMs: 0 }),
        ports.issueIntake(receive),
        ports.wait(wait),
      ],
      presets: [preset(runDelivery, async (ctx) => {
        active += 1
        maxActive = Math.max(maxActive, active)
        if (active === 2) release()
        await gate
        active -= 1
        completed.push(ctx.input.leaseId)
        return { leaseId: ctx.input.leaseId, status: "rejected" as const, error: undefined }
      })],
    })
    scopes.push(scope)
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: watchIssues })).resolves.toHaveLength(3)
    expect(maxActive).toBe(2)
    expect(active).toBe(0)
    expect(completed.sort()).toEqual(["lease-1", "lease-2", "lease-3"])
    await ctx.close()
  })
})
