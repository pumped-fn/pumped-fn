import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"

const base = ".okra/runs/issue-triage-session-20260715"
const sourcePath = `${base}/workers/dkr-5/evidence-publication-probe.mjs`
const source = await readFile(sourcePath, "utf8")
const contract = JSON.parse(await readFile(`${base}/workers/dkr-5/evidence-publication-contract.json`, "utf8"))
const objective = JSON.parse(await readFile(`${base}/workers/dkr-5/objective-contracts.json`, "utf8"))
const checkpoint = JSON.parse(await readFile(`${base}/workers/dkr-5/checkpoint.json`, "utf8"))
const frame = JSON.parse(await readFile(`${base}/frame/frame.v2.json`, "utf8"))
const validatorObservedAt = "2026-07-15T05:50:36Z"

const expectedFixtures = [
  "supported-success",
  "unsupported-hypothesis",
  "missing-citation",
  "stale-evidence",
  "unsafe-repository-path",
  "mutating-sql",
  "unbounded-victoria-query",
  "unauthorized-publication",
  "duplicate-publication",
  "conflicting-idempotency-result",
  "verifier-failure",
  "writer-only-verdict",
  "adapter-failure",
  "retry-after-known-receipt",
]
const expectedObjectiveContracts = [
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
]
const expectedWalls = [
  "scope_seam_escape_count",
  "undeclared_effect_edge_count",
  "unapproved_external_write_count",
  "unsupported_hypothesis_publish_count",
  "single_llm_truth_acceptance_count",
  "ungoverned_write_or_read_count",
  "anti_goal_bypass_or_dishonesty_count",
]
const evidencePaths = [
  `${base}/workers/dkr-5/evidence-publication-probe.mjs`,
  `${base}/workers/dkr-5/evidence-publication-contract.json`,
  `${base}/workers/dkr-5/objective-contracts.json`,
  `${base}/workers/dkr-5/replay.sh`,
  `${base}/frame/frame.v2.json`,
  `${base}/worker-packets/dkr-5.json`,
  "pkg/core/lite/src/types.ts",
  "pkg/sdk/core/src/validation.ts",
]

let instrumented = source
  .replace(
    "../../../../../pkg/sdk/core/node_modules/zod/index.js",
    pathToFileURL(resolve("pkg/sdk/core/node_modules/zod/index.js")).href,
  )
  .replace(
    "../../../../../pkg/core/lite/dist/index.mjs",
    pathToFileURL(resolve("pkg/core/lite/dist/index.mjs")).href,
  )
  .replace("const capabilitySchema =", "export const capabilitySchema =")
  .replace("const intakeSchema =", "export const intakeSchema =")
  .replace("const evidenceSchema =", "export const evidenceSchema =")
  .replace("const hypothesisSchema =", "export const hypothesisSchema =")
  .replace("const verdictSchema =", "export const verdictSchema =")
  .replace("const receiptSchema =", "export const receiptSchema =")
  .replace("const triage = flow", "export const triage = flow")
  .replace("function fakeEnvironment(mode = \"success\")", "export function fakeEnvironment(mode = \"success\")")
  .replace("const validInput = Object.freeze", "export const validInput = Object.freeze")
  .replace("async function execute(mode, input = validInput)", "export async function execute(mode, input = validInput)")
  .replace(
    "hypothesisId: hypothesis.id,",
    "hypothesisId: mode === \"wrong-hypothesis-verdict\" ? \"hyp-other\" : hypothesis.id,",
  )

const target = await import(`data:text/javascript;base64,${Buffer.from(instrumented).toString("base64")}`)
const candidate = await target.runProbe()
const traversal = await target.execute("success", { ...target.validInput, path: "/repo/../secret" })
const wrongVerdict = await target.execute("wrong-hypothesis-verdict")
const unauthorized = await target.execute("unauthorized")
const schemas = [
  target.capabilitySchema,
  target.intakeSchema,
  target.evidenceSchema,
  target.hypothesisSchema,
  target.verdictSchema,
  target.receiptSchema,
]

assert.equal(candidate.totalFixtureCount, 14)
assert.equal(candidate.successCaseCount, 1)
assert.equal(candidate.denialCaseCount, 13)
assert.equal(candidate.standardSchemaShapeCount, 6)
assert.equal(candidate.duplicatePublicationExtraWriteCount, 0)
assert.equal(candidate.conflictingIdempotencyExtraWriteCount, 0)
assert.equal(candidate.retryAfterKnownReceiptExtraWriteCount, 0)
assert.deepEqual(contract.fixtures, expectedFixtures)
assert.deepEqual(objective.contracts.map(({ id }) => id), expectedObjectiveContracts)
assert.deepEqual(checkpoint.active_anti_goals, expectedWalls)
assert.deepEqual(checkpoint.active_anti_goal_verification.map(({ metric_id }) => metric_id), expectedWalls)
assert.equal(frame.objective.target, 16)
assert.equal(objective.target, 16)
assert.equal(objective.denominator_change_count, 0)
assert.equal(frame.metric_contracts.anti_goals.max_age, "10m")
assert.equal(checkpoint.max_age, "30m")
assert.equal(schemas.every((schema) => typeof schema["~standard"]?.validate === "function"), true)
assert.equal(contract.validation.protocol, "Standard Schema v1")
assert.equal(contract.validation.shape_count, 6)
assert.deepEqual(contract.effects.required_tag_ports, [
  "capabilities",
  "clock",
  "repository",
  "postgresql",
  "victoria",
  "hypothesis",
  "verifier",
  "publisher",
])
assert.deepEqual(contract.effects.effect_ports, [
  "repository",
  "postgresql",
  "victoria",
  "hypothesis",
  "verifier",
  "publisher",
])

const evidenceHashes = []
for (const path of evidencePaths) {
  const hash = createHash("sha256").update(await readFile(path)).digest("hex")
  assert.equal(checkpoint.evidence_refs_or_hashes.includes(`sha256:${hash}`), true, path)
  evidenceHashes.push({ path, sha256: hash })
}

const originalImports = [...source.matchAll(/^import .* from ["']([^"']+)["']/gm)].map((match) => match[1])
const externalImports = originalImports.filter((specifier) => !specifier.startsWith("node:") && !specifier.startsWith("."))
const checkpointAgeMs = Date.parse(validatorObservedAt) - Date.parse(checkpoint.observed_at)
const frameAntiGoalMaxAgeMs = 10 * 60 * 1000
const candidateDeclaredMaxAgeMs = 30 * 60 * 1000
assert.equal(externalImports.length, 0)
assert.equal(candidate.realExternalAccessCount, 0)
assert.equal(candidate.scopeSeamEscapeCount, 0)
assert.equal(candidate.undeclaredEffectEdgeCount, 0)
assert.equal(unauthorized.result.ok, false)
assert.equal(unauthorized.env.calls.length, 0)
assert.equal(unauthorized.env.writes, 0)

assert.equal(traversal.result.ok, true)
assert.deepEqual(traversal.env.calls, ["repository", "postgresql", "victoria", "hypothesis", "verifier", "publisher"])
assert.equal(traversal.env.writes, 1)
assert.equal(wrongVerdict.result.ok, true)
assert.deepEqual(wrongVerdict.env.calls, ["repository", "postgresql", "victoria", "hypothesis", "verifier", "publisher"])
assert.equal(wrongVerdict.env.writes, 1)

process.stdout.write(`${JSON.stringify({
  verification: "validator-dkr-5-semantic-audit",
  candidateDecision: "rejected_semantic_gate_bypass",
  mechanical: {
    fixtures: `${candidate.totalFixtureCount}/14`,
    denialFixtures: `${candidate.denialCaseCount}/13`,
    standardSchemaCompatibleShapes: `${schemas.length}/6`,
    objectiveContracts: `${objective.contracts.length}/16`,
    evidenceHashes: `${evidenceHashes.length}/8`,
    wallEntries: `${checkpoint.active_anti_goal_verification.length}/7`,
    duplicatePublicationExtraWrites: candidate.duplicatePublicationExtraWriteCount,
    conflictingIdempotencyExtraWrites: candidate.conflictingIdempotencyExtraWriteCount,
    retryAfterKnownReceiptExtraWrites: candidate.retryAfterKnownReceiptExtraWriteCount,
    unauthorizedFixtureAdapterCalls: unauthorized.env.calls.length,
    unauthorizedFixtureWrites: unauthorized.env.writes,
  },
  semanticChallenges: {
    repositoryTraversal: {
      input: "/repo/../secret",
      accepted: traversal.result.ok,
      adapterCalls: traversal.env.calls,
      publicationWrites: traversal.env.writes,
    },
    wrongHypothesisVerdict: {
      verdictHypothesisId: "hyp-other",
      actualHypothesisId: "hyp-1",
      accepted: wrongVerdict.result.ok,
      adapterCalls: wrongVerdict.env.calls,
      unsupportedPublicationWrites: wrongVerdict.env.writes,
    },
  },
  metrics: {
    scopeSeamEscapeCount: candidate.scopeSeamEscapeCount,
    undeclaredEffectEdgeCount: candidate.undeclaredEffectEdgeCount,
    realExternalAccessCount: candidate.realExternalAccessCount,
    unauthorizedFixtureWriteCount: unauthorized.env.writes,
    unsupportedHypothesisPublishCount: wrongVerdict.env.writes,
    repositoryContainmentBypassCount: traversal.result.ok ? 1 : 0,
    checkpointFreshnessThresholdWideningCount: candidateDeclaredMaxAgeMs > frameAntiGoalMaxAgeMs ? 1 : 0,
    checkpointStaleAtValidationCount: checkpointAgeMs > frameAntiGoalMaxAgeMs ? 1 : 0,
    checkpointAgeMs,
    frameAntiGoalMaxAgeMs,
    denominatorChangeCount: objective.denominator_change_count,
  },
  evidenceHashes,
}, null, 2)}\n`)
