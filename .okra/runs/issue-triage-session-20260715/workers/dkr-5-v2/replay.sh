#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "$0")/../../../../.." && pwd)"
cd "$repo"

node --input-type=module <<'NODE'
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { runProbe } from "./.okra/runs/issue-triage-session-20260715/workers/dkr-5-v2/evidence-publication-probe.mjs"

const base = ".okra/runs/issue-triage-session-20260715"
const contract = JSON.parse(await readFile(`${base}/workers/dkr-5-v2/evidence-publication-contract.json`, "utf8"))
const objective = JSON.parse(await readFile(`${base}/workers/dkr-5-v2/objective-contracts.json`, "utf8"))
const checkpoint = JSON.parse(await readFile(`${base}/workers/dkr-5-v2/checkpoint.v2.json`, "utf8"))
const frame = JSON.parse(await readFile(`${base}/frame/frame.v2.json`, "utf8"))
const result = await runProbe()
const evidencePaths = [
  `${base}/workers/dkr-5-v2/evidence-publication-probe.mjs`,
  `${base}/workers/dkr-5-v2/evidence-publication-contract.json`,
  `${base}/workers/dkr-5-v2/objective-contracts.json`,
  `${base}/workers/dkr-5-v2/replay.sh`,
  `${base}/frame/frame.v2.json`,
  `${base}/workers/validator-dkr-5/verification.json`,
  "pkg/core/lite/src/types.ts",
  "pkg/sdk/core/src/validation.ts",
]

assert.equal(result.totalFixtureCount, 16)
assert.equal(result.inheritedFixturePassCount, 14)
assert.equal(result.semanticRegressionFixturePassCount, 2)
assert.equal(result.successCaseCount, 1)
assert.equal(result.denialCaseCount, 15)
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
assert.equal(contract.validation.protocol, "Standard Schema v1")
assert.equal(contract.validation.shape_count, 6)
assert.equal(contract.inherited_fixtures.length, 14)
assert.equal(contract.semantic_regression_fixtures.length, 2)
assert.equal(objective.contracts.length, 16)
assert.equal(objective.target, 16)
assert.equal(objective.denominator_change_count, 0)
assert.equal(frame.metric_contracts.anti_goals.max_age, "10m")
assert.equal(checkpoint.max_age, "10m")
assert.equal(checkpoint.active_anti_goals.length, 7)
assert.equal(checkpoint.active_anti_goal_verification.length, 7)
assert.equal(checkpoint.active_anti_goal_verification.every(({ max_age }) => max_age === "10m"), true)
assert.equal(checkpoint.wall_gate.downstream_advance, "blocked")
assert.equal(checkpoint.reviewer_audit_status, "pending_independent_replay")
for (const path of evidencePaths) {
  const hash = createHash("sha256").update(await readFile(path)).digest("hex")
  assert.ok(checkpoint.evidence_refs_or_hashes.includes(`sha256:${hash}`), path)
}

process.stdout.write(`${JSON.stringify({
  inheritedFixtures: `${result.inheritedFixturePassCount}/14`,
  semanticRegressionFixtures: `${result.semanticRegressionFixturePassCount}/2`,
  totalFixtures: `${result.totalFixtureCount}/16`,
  standardSchemaShapes: `${result.standardSchemaShapeCount}/6`,
  objectiveContracts: `${objective.contracts.length}/16`,
  traversalAdapterCalls: result.traversalAdapterCallCount,
  traversalWrites: result.traversalWriteCount,
  wrongHypothesisPublisherCalls: result.wrongHypothesisPublisherCallCount,
  wrongHypothesisWrites: result.wrongHypothesisWriteCount,
  scopeSeamEscapeCount: result.scopeSeamEscapeCount,
  undeclaredEffectEdgeCount: result.undeclaredEffectEdgeCount,
  realExternalAccessCount: result.realExternalAccessCount,
  evidenceHashes: `${evidencePaths.length}/8`,
  wallEntries: `${checkpoint.active_anti_goal_verification.length}/7`,
  maxAge: checkpoint.max_age,
  downstreamAdvance: checkpoint.wall_gate.downstream_advance,
  reviewerAuditStatus: checkpoint.reviewer_audit_status,
}, null, 2)}\n`)
NODE
