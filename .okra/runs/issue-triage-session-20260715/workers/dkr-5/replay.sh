#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "$0")/../../../../.." && pwd)"
cd "$repo"

node --input-type=module <<'NODE'
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { runProbe } from "./.okra/runs/issue-triage-session-20260715/workers/dkr-5/evidence-publication-probe.mjs"

const base = ".okra/runs/issue-triage-session-20260715"
const contract = JSON.parse(await readFile(`${base}/workers/dkr-5/evidence-publication-contract.json`, "utf8"))
const objective = JSON.parse(await readFile(`${base}/workers/dkr-5/objective-contracts.json`, "utf8"))
const checkpoint = JSON.parse(await readFile(`${base}/workers/dkr-5/checkpoint.json`, "utf8"))
const result = await runProbe()
const evidencePaths = [
  `${base}/workers/dkr-5/evidence-publication-probe.mjs`,
  `${base}/workers/dkr-5/evidence-publication-contract.json`,
  `${base}/workers/dkr-5/objective-contracts.json`,
  `${base}/workers/dkr-5/replay.sh`,
  `${base}/frame/frame.v2.json`,
  `${base}/worker-packets/dkr-5.json`,
  "pkg/core/lite/src/types.ts",
  "pkg/sdk/core/src/validation.ts"
]

assert.equal(result.totalFixtureCount, 14)
assert.equal(result.successCaseCount, 1)
assert.equal(result.denialCaseCount, 13)
assert.equal(result.duplicatePublicationExtraWriteCount, 0)
assert.equal(result.conflictingIdempotencyExtraWriteCount, 0)
assert.equal(result.retryAfterKnownReceiptExtraWriteCount, 0)
assert.equal(result.scopeSeamEscapeCount, 0)
assert.equal(result.undeclaredEffectEdgeCount, 0)
assert.equal(result.realExternalAccessCount, 0)
assert.equal(contract.validation.protocol, "Standard Schema v1")
assert.equal(contract.validation.shape_count, 6)
assert.equal(contract.fixtures.length, 14)
assert.equal(objective.contracts.length, 16)
assert.equal(objective.target, 16)
assert.equal(objective.denominator_change_count, 0)
assert.equal(checkpoint.active_anti_goals.length, 7)
assert.equal(checkpoint.active_anti_goal_verification.length, 7)
assert.equal(checkpoint.wall_gate.downstream_advance, "blocked")
assert.equal(checkpoint.reviewer_audit_status, "pending_independent_replay")
assert.equal(checkpoint.replay_command_or_checker, "bash .okra/runs/issue-triage-session-20260715/workers/dkr-5/replay.sh")
for (const path of evidencePaths) {
  const hash = createHash("sha256").update(await readFile(path)).digest("hex")
  assert.ok(checkpoint.evidence_refs_or_hashes.includes(`sha256:${hash}`), path)
}

process.stdout.write(`${JSON.stringify({
  fixturePassCount: `${result.totalFixtureCount}/${result.totalFixtureCount}`,
  standardSchemaShapes: `${result.standardSchemaShapeCount}/6`,
  objectiveContracts: `${objective.contracts.length}/16`,
  hiddenEffectCount: result.undeclaredEffectEdgeCount,
  scopeSeamEscapeCount: result.scopeSeamEscapeCount,
  externalAccessCount: result.realExternalAccessCount,
  evidenceHashes: `${evidencePaths.length}/${evidencePaths.length}`,
  wallEntries: `${checkpoint.active_anti_goal_verification.length}/${checkpoint.active_anti_goals.length}`,
  downstreamAdvance: checkpoint.wall_gate.downstream_advance,
  reviewerAuditStatus: checkpoint.reviewer_audit_status,
}, null, 2)}\n`)
NODE
