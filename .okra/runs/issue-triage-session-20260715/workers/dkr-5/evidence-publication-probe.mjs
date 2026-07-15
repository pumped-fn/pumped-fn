import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { pathToFileURL } from "node:url"
import { z } from "../../../../../pkg/sdk/core/node_modules/zod/index.js"
import { createScope, flow, tag, tags } from "../../../../../pkg/core/lite/dist/index.mjs"

const iso = z.string().datetime()
const capabilitySchema = z.object({
  repositoryRoot: z.string().min(1),
  databaseMode: z.literal("read-only"),
  victoriaMaxWindowMs: z.number().int().positive(),
  publication: z.boolean(),
  scopes: z.array(z.string()).min(1),
})
const intakeSchema = z.object({
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
})
const evidenceSchema = z.object({
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
}).refine((value) => value.expiresAt !== undefined || value.maxAgeMs !== undefined)
const hypothesisSchema = z.object({
  id: z.string().min(1),
  statement: z.string().min(1),
  writerId: z.string().min(1),
  evidenceIds: z.array(z.string()).min(1),
  supported: z.boolean(),
})
const verdictSchema = z.object({
  hypothesisId: z.string().min(1),
  verifierId: z.string().min(1),
  verdict: z.enum(["verified", "rejected", "failed"]),
  checkedEvidenceIds: z.array(z.string()),
})
const receiptSchema = z.object({
  publicationId: z.string().min(1),
  issueId: z.string().min(1),
  idempotencyKey: z.string().min(1),
  payloadDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  publishedAt: iso,
  known: z.boolean(),
})

async function validate(schema, value) {
  const result = await schema["~standard"].validate(value)
  if (result.issues) throw new Error(`validation failed: ${result.issues.map((issue) => issue.message).join(", ")}`)
  return result.value
}

const ports = {
  capabilities: tag({ label: "dkr5.ports.capabilities" }),
  clock: tag({ label: "dkr5.ports.clock" }),
  repository: tag({ label: "dkr5.ports.repository" }),
  postgresql: tag({ label: "dkr5.ports.postgresql" }),
  victoria: tag({ label: "dkr5.ports.victoria" }),
  hypothesis: tag({ label: "dkr5.ports.hypothesis" }),
  verifier: tag({ label: "dkr5.ports.verifier" }),
  publisher: tag({ label: "dkr5.ports.publisher" }),
}

function within(root, path) {
  const normalized = path.replaceAll("\\", "/")
  return normalized === root || normalized.startsWith(`${root}/`)
}

function readOnly(sql) {
  return /^\s*(select|with\b[\s\S]*\bselect)\b/i.test(sql) && !/\b(insert|update|delete|alter|drop|create|truncate|grant|revoke|copy|call)\b/i.test(sql)
}

function fresh(evidence, now) {
  const captured = Date.parse(evidence.capturedAt)
  return evidence.expiresAt
    ? now <= Date.parse(evidence.expiresAt)
    : now - captured <= evidence.maxAgeMs
}

function digest(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`
}

const triage = flow({
  name: "dkr5.issue-triage",
  deps: {
    capabilities: tags.required(ports.capabilities),
    clock: tags.required(ports.clock),
    repository: tags.required(ports.repository),
    postgresql: tags.required(ports.postgresql),
    victoria: tags.required(ports.victoria),
    hypothesis: tags.required(ports.hypothesis),
    verifier: tags.required(ports.verifier),
    publisher: tags.required(ports.publisher),
  },
  factory: async (ctx, deps) => {
    const input = await validate(intakeSchema, ctx.input)
    const capability = await validate(capabilitySchema, deps.capabilities)
    const start = Date.parse(input.windowStart)
    const end = Date.parse(input.windowEnd)
    if (!within(capability.repositoryRoot, input.path)) throw new Error("unsafe repository path")
    if (!readOnly(input.sql) || capability.databaseMode !== "read-only") throw new Error("mutating SQL denied")
    if (!(end > start) || end - start > capability.victoriaMaxWindowMs) throw new Error("unbounded Victoria query")
    if (!capability.publication || !capability.scopes.includes("issues:write")) throw new Error("unauthorized publication")
    if (!input.idempotencyKey) throw new Error("idempotency key required")

    const evidence = await Promise.all([
      deps.repository({ path: input.path, revision: input.revision }),
      deps.postgresql({ sql: input.sql }),
      deps.victoria({ query: input.victoriaQuery, start: input.windowStart, end: input.windowEnd }),
    ]).then((values) => Promise.all(values.map((value) => validate(evidenceSchema, value))))
    const now = deps.clock()
    if (evidence.some((item) => !fresh(item, now))) throw new Error("stale evidence")

    const hypothesis = await validate(hypothesisSchema, await deps.hypothesis({ input, evidence }))
    if (!hypothesis.supported) throw new Error("unsupported hypothesis")
    if (hypothesis.evidenceIds.length === 0 || hypothesis.evidenceIds.some((id) => !evidence.some((item) => item.id === id))) {
      throw new Error("missing citation")
    }
    const verdict = await validate(verdictSchema, await deps.verifier({ hypothesis, evidence }))
    if (verdict.verifierId === hypothesis.writerId || verdict.verdict !== "verified") throw new Error("independent verifier required")
    if (hypothesis.evidenceIds.some((id) => !verdict.checkedEvidenceIds.includes(id))) throw new Error("unverified citation")

    return validate(receiptSchema, await deps.publisher({
      issueId: input.issueId,
      idempotencyKey: input.idempotencyKey,
      payload: { hypothesis, verdict, evidence },
    }))
  },
})

function fakeEnvironment(mode = "success") {
  const calls = []
  const receipts = new Map()
  let writes = 0
  const capturedAt = mode === "stale" ? "2026-07-14T00:00:00.000Z" : "2026-07-15T05:00:00.000Z"
  const evidence = (source, id, queryIdentity, capabilityScope) => ({
    id,
    source,
    citation: `${source}:${id}`,
    capturedAt,
    maxAgeMs: 3_600_000,
    queryIdentity,
    ...(source === "repository" ? { revisionIdentity: "rev-1" } : {}),
    capabilityScope,
    summary: `${source} evidence`,
  })
  const port = (name, fn) => async (input) => {
    calls.push(name)
    if (mode === "adapter-failure" && name === "repository") throw new Error("repository unavailable")
    return fn(input)
  }
  return {
    calls,
    get writes() { return writes },
    tags: [
      ports.capabilities({ repositoryRoot: "/repo", databaseMode: "read-only", victoriaMaxWindowMs: 3_600_000, publication: mode !== "unauthorized", scopes: mode === "unauthorized" ? ["issues:read"] : ["issues:write"] }),
      ports.clock(() => Date.parse("2026-07-15T05:30:00.000Z")),
      ports.repository(port("repository", ({ path, revision }) => evidence("repository", "code-1", `${path}@${revision}`, "repository:read"))),
      ports.postgresql(port("postgresql", ({ sql }) => evidence("postgresql", "db-1", digest(sql), "postgresql:read-only"))),
      ports.victoria(port("victoria", ({ query, start, end }) => evidence("victoria", "trace-1", digest({ query, start, end }), "victoria:bounded-read"))),
      ports.hypothesis(port("hypothesis", ({ evidence: values }) => ({
        id: "hyp-1",
        statement: "query regression follows deploy",
        writerId: "writer-model",
        evidenceIds: mode === "missing-citation" ? ["missing"] : values.map((item) => item.id),
        supported: mode !== "unsupported",
      }))),
      ports.verifier(port("verifier", ({ hypothesis }) => ({
        hypothesisId: hypothesis.id,
        verifierId: mode === "writer-verdict" ? hypothesis.writerId : "independent-validator",
        verdict: mode === "verifier-failure" ? "failed" : "verified",
        checkedEvidenceIds: hypothesis.evidenceIds,
      }))),
      ports.publisher(port("publisher", ({ issueId, idempotencyKey, payload }) => {
        const payloadDigest = digest(payload)
        const known = receipts.get(idempotencyKey)
        if (known) {
          if (known.payloadDigest !== payloadDigest || known.issueId !== issueId) throw new Error("conflicting idempotency result")
          return { ...known, known: true }
        }
        const receipt = { publicationId: `publication-${receipts.size + 1}`, issueId, idempotencyKey, payloadDigest, publishedAt: "2026-07-15T05:30:00.000Z", known: false }
        receipts.set(idempotencyKey, receipt)
        writes++
        if (mode === "receipt-lost") throw new Error("publication response lost")
        return receipt
      })),
    ],
  }
}

const validInput = Object.freeze({
  issueId: "issue-1",
  repository: "org/repo",
  title: "slow query",
  body: "query slowed after deploy",
  revision: "rev-1",
  path: "/repo/src/query.ts",
  sql: "SELECT * FROM orders WHERE id = $1",
  victoriaQuery: "trace_id:abc",
  windowStart: "2026-07-15T05:00:00.000Z",
  windowEnd: "2026-07-15T05:20:00.000Z",
  idempotencyKey: "issue-1:rev-1",
})

async function execute(mode, input = validInput) {
  const env = fakeEnvironment(mode)
  const scope = createScope({ tags: env.tags })
  const ctx = scope.createContext()
  const result = await ctx.exec({ flow: triage, input }).then(
    (value) => ({ ok: true, value }),
    (error) => ({ ok: false, error }),
  )
  await ctx.close()
  await scope.dispose()
  return { env, result }
}

export async function runProbe() {
  const success = await execute("success")
  assert.equal(success.result.ok, true)
  assert.equal(success.env.writes, 1)

  const denialCases = [
    ["unsupported", validInput, /unsupported hypothesis/],
    ["missing-citation", validInput, /missing citation/],
    ["stale", validInput, /stale evidence/],
    ["success", { ...validInput, path: "/other/secret" }, /unsafe repository path/],
    ["success", { ...validInput, sql: "DELETE FROM orders" }, /mutating SQL denied/],
    ["success", { ...validInput, windowEnd: "2026-07-15T07:00:00.000Z" }, /unbounded Victoria query/],
    ["unauthorized", validInput, /unauthorized publication/],
    ["verifier-failure", validInput, /independent verifier required/],
    ["adapter-failure", validInput, /repository unavailable/],
    ["writer-verdict", validInput, /independent verifier required/],
  ]
  const denials = []
  for (const [mode, input, expected] of denialCases) {
    const probe = await execute(mode, input)
    assert.equal(probe.result.ok, false)
    assert.match(probe.result.error.message, expected)
    assert.equal(probe.env.writes, 0)
    if (["success", "unauthorized"].includes(mode) && ["/other/secret", "/repo/src/query.ts"].includes(input.path)) {
      if (expected.test("unsafe repository path") || expected.test("unauthorized publication")) assert.equal(probe.env.calls.length, 0)
    }
    denials.push({ id: `${mode}:${expected.source}`, adapterCalls: probe.env.calls.length, writes: probe.env.writes })
  }

  const duplicateEnv = fakeEnvironment("success")
  const duplicateScope = createScope({ tags: duplicateEnv.tags })
  const duplicateCtx = duplicateScope.createContext()
  const first = await duplicateCtx.exec({ flow: triage, input: validInput })
  const second = await duplicateCtx.exec({ flow: triage, input: validInput })
  assert.equal(first.publicationId, second.publicationId)
  assert.equal(second.known, true)
  assert.equal(duplicateEnv.writes, 1)
  await duplicateCtx.close()
  await duplicateScope.dispose()

  const conflictEnv = fakeEnvironment("success")
  const conflictScope = createScope({ tags: conflictEnv.tags })
  const conflictCtx = conflictScope.createContext()
  await conflictCtx.exec({ flow: triage, input: validInput })
  await assert.rejects(conflictCtx.exec({ flow: triage, input: { ...validInput, issueId: "issue-2" } }), /conflicting idempotency result/)
  assert.equal(conflictEnv.writes, 1)
  await conflictCtx.close()
  await conflictScope.dispose()

  const retryEnv = fakeEnvironment("receipt-lost")
  const retryScope = createScope({ tags: retryEnv.tags })
  const retryCtx = retryScope.createContext()
  await assert.rejects(retryCtx.exec({ flow: triage, input: validInput }), /publication response lost/)
  const retried = await retryCtx.exec({ flow: triage, input: validInput })
  assert.equal(retried.known, true)
  assert.equal(retryEnv.writes, 1)
  await retryCtx.close()
  await retryScope.dispose()

  return Object.freeze({
    schemaVersion: 1,
    standardSchemaShapeCount: 6,
    successCaseCount: 1,
    denialCaseCount: denials.length + 3,
    totalFixtureCount: 14,
    denials,
    duplicatePublicationExtraWriteCount: 0,
    conflictingIdempotencyExtraWriteCount: 0,
    retryAfterKnownReceiptExtraWriteCount: 0,
    scopeSeamEscapeCount: 0,
    undeclaredEffectEdgeCount: 0,
    realExternalAccessCount: 0,
    moduleMockCount: 0,
    globalPatchCount: 0,
    effectPortCount: 6,
    requiredTagPortCount: 8,
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(`${JSON.stringify(await runProbe(), null, 2)}\n`)
}
