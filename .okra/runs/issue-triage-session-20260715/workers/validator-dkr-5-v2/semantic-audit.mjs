import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { runProbe } from "../dkr-5-v2/evidence-publication-probe.mjs"

const run = ".okra/runs/issue-triage-session-20260715"
const candidate = `${run}/workers/dkr-5-v2`
const source = readFileSync(`${candidate}/evidence-publication-probe.mjs`, "utf8")
const contract = JSON.parse(readFileSync(`${candidate}/evidence-publication-contract.json`, "utf8"))
const objective = JSON.parse(readFileSync(`${candidate}/objective-contracts.json`, "utf8"))
const priorObjective = JSON.parse(readFileSync(`${run}/workers/dkr-5/objective-contracts.json`, "utf8"))
const checkpoint = JSON.parse(readFileSync(`${candidate}/checkpoint.v2.json`, "utf8"))
const frame = JSON.parse(readFileSync(`${run}/frame/frame.v2.json`, "utf8"))
const result = await runProbe()

assert.equal(result.inheritedFixturePassCount, 14)
assert.equal(result.semanticRegressionFixturePassCount, 2)
assert.equal(result.totalFixtureCount, 16)
assert.equal(result.standardSchemaShapeCount, 6)
assert.equal(result.traversalAdapterCallCount, 0)
assert.equal(result.traversalWriteCount, 0)
assert.equal(result.wrongHypothesisPublisherCallCount, 0)
assert.equal(result.wrongHypothesisWriteCount, 0)
assert.equal(result.duplicatePublicationExtraWriteCount, 0)
assert.equal(result.conflictingIdempotencyExtraWriteCount, 0)
assert.equal(result.retryAfterKnownReceiptExtraWriteCount, 0)
assert.equal(result.scopeSeamEscapeCount, 0)
assert.equal(result.undeclaredEffectEdgeCount, 0)
assert.equal(result.realExternalAccessCount, 0)

const pathGate = source.indexOf("const path = containedPath(capability.repositoryRoot, input.path)")
const firstEffect = source.indexOf("const evidence = await Promise.all(")
const verdictCall = source.indexOf("const verdict = await validate(verdictSchema, await deps.verifier")
const verdictGate = source.indexOf("if (verdict.hypothesisId !== hypothesis.id)")
const publisherCall = source.indexOf("return validate(receiptSchema, await deps.publisher")
assert.ok(pathGate > 0 && pathGate < firstEffect)
assert.ok(verdictCall > 0 && verdictCall < verdictGate && verdictGate < publisherCall)
assert.match(source, /const resolvedRoot = resolve\(root\)/)
assert.match(source, /const resolvedCandidate = resolve\(candidate\)/)
assert.match(source, /const offset = relative\(resolvedRoot, resolvedCandidate\)/)
assert.match(source, /!offset\.startsWith\("\.\."\) && !isAbsolute\(offset\)/)
assert.match(source, /verdict\.verifierId === hypothesis\.writerId/)
assert.match(source, /hypothesis\.evidenceIds\.some\(\(id\) => !verdict\.checkedEvidenceIds\.includes\(id\)\)/)
assert.match(source, /evidence\.some\(\(item\) => !fresh\(item, now\)\)/)

assert.equal(contract.validation.protocol, "Standard Schema v1")
assert.equal(contract.validation.shape_count, 6)
assert.equal(contract.effects.required_tag_ports.length, 8)
assert.equal(contract.effects.effect_ports.length, 6)
assert.equal(contract.effects.hidden_effect_count, 0)
assert.equal((source.match(/tags\.required\(ports\./g) ?? []).length, 8)
assert.equal(contract.inherited_fixtures.length, 14)
assert.equal(contract.semantic_regression_fixtures.length, 2)

const expectedObjectiveNames = [
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
assert.deepEqual(objective.contracts.map(({ id }) => id), expectedObjectiveNames)
assert.deepEqual(objective.contracts.map(({ id }) => id), priorObjective.contracts.map(({ id }) => id))
assert.equal(objective.target, frame.objective.target)
assert.equal(objective.denominator_change_count, 0)

assert.equal(frame.metric_contracts.anti_goals.max_age, "10m")
assert.equal(checkpoint.max_age, "10m")
assert.equal(checkpoint.active_anti_goal_verification.length, 7)
assert.ok(checkpoint.active_anti_goal_verification.every(({ max_age }) => max_age === "10m"))
assert.ok(checkpoint.active_anti_goal_verification.every(({ value, threshold }) => typeof value === "number" && typeof threshold === "number"))

const imports = [...source.matchAll(/^import .+ from ["']([^"']+)["']/gm)].map(([, specifier]) => specifier)
assert.ok(imports.every((specifier) => specifier.startsWith("node:") || specifier.startsWith("../../../../../")))
assert.doesNotMatch(source, /\bfetch\s*\(/)

const evidencePaths = [
  `${candidate}/evidence-publication-probe.mjs`,
  `${candidate}/evidence-publication-contract.json`,
  `${candidate}/objective-contracts.json`,
  `${candidate}/replay.sh`,
  `${run}/frame/frame.v2.json`,
  `${run}/workers/validator-dkr-5/verification.json`,
  "pkg/core/lite/src/types.ts",
  "pkg/sdk/core/src/validation.ts",
]
for (const path of evidencePaths) {
  const hash = createHash("sha256").update(readFileSync(path)).digest("hex")
  assert.ok(checkpoint.evidence_refs_or_hashes.includes(`sha256:${hash}`), path)
}

process.stdout.write(`${JSON.stringify({
  inheritedFixtures: "14/14",
  semanticRegressionFixtures: "2/2",
  standardSchemaShapes: "6/6",
  objectiveContracts: "16/16",
  traversalAdapterCalls: 0,
  traversalWrites: 0,
  wrongHypothesisPublisherCalls: 0,
  wrongHypothesisWrites: 0,
  freshnessCitationIndependenceIdempotencyGapCount: 0,
  requiredTagPorts: "8/8",
  effectPorts: "6/6",
  scopeSeamEscapeCount: 0,
  undeclaredEffectEdgeCount: 0,
  realExternalAccessCount: 0,
  denominatorChangeCount: 0,
  evidenceHashes: "8/8",
  wallEntries: "7/7",
  maxAge: "10m",
})}\n`)
