#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "$0")/../../../../.." && pwd)"
cd "$repo"

bash .okra/runs/issue-triage-session-20260715/workers/dkr-3-v3/replay.sh
node .okra/runs/issue-triage-session-20260715/workers/validator-dkr-3-v3/independent-projection.mjs

node --input-type=module <<'NODE'
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"

const base = ".okra/runs/issue-triage-session-20260715"
const checkpoint = JSON.parse(await readFile(`${base}/workers/dkr-3-v4/checkpoint.v4.json`, "utf8"))
const validator = JSON.parse(await readFile(`${base}/workers/validator-dkr-3-v3/verification.json`, "utf8"))
const evidencePaths = [
  `${base}/workers/dkr-3/artifacts/context-observation-probe.v1.json`,
  `${base}/workers/dkr-3/artifacts/context-observation-trace-contract.v1.json`,
  `${base}/workers/dkr-3/probes/context-observation-probe.mjs`,
  `${base}/workers/dkr-3/probes/replay-context-observation.mjs`,
  `${base}/workers/validator-dkr-3-v3/verification.json`,
  `${base}/workers/validator-dkr-3-v3/independent-projection.mjs`,
  `${base}/workers/dkr-3-v4/replay.sh`,
  "pkg/core/lite/src/types.ts",
  "pkg/core/lite/src/scope.ts",
  "pkg/ext/observable/src/index.ts",
  `${base}/frame/frame.v2.json`
]
const required = [
  "checkpoint_id", "conclusion_id", "decision_target", "source_of_truth", "read_method",
  "observed_at", "recorded_at", "max_age", "freshness_status", "confidence",
  "evidence_refs_or_hashes", "replay_command_or_checker", "questions_answered",
  "questions_unanswered", "decision", "flag_if_missing_or_stale", "reviewer_audit_status",
  "active_anti_goals", "active_anti_goal_verification", "wall_gate"
]
const acceptedClaims = new Map(validator.audit_traces.map((trace) => [trace.claim_id, trace.decision]))
const replayCommand = "bash .okra/runs/issue-triage-session-20260715/workers/dkr-3-v4/replay.sh"
const freshnessAgeSeconds = (value) => (Date.now() - Date.parse(value)) / 1000

assert.equal(checkpoint.contract_version, "okra.executable-dkr-checkpoint.v1")
assert.equal(checkpoint.type, "dkr_learning_checkpoint")
assert.equal(checkpoint.unit_id, "DKR-3")
assert.equal(required.filter((field) => field in checkpoint).length, required.length)
assert.equal(checkpoint.replay_command_or_checker, replayCommand)
assert.equal(checkpoint.max_age, "10m")
assert.ok(freshnessAgeSeconds(checkpoint.observed_at) >= 0)
assert.ok(freshnessAgeSeconds(checkpoint.observed_at) <= 600)
assert.deepEqual(checkpoint.observation_decision, {
  projectionSourceCount: 1,
  arbitraryTagEnumerationPathCount: 0,
  publicContextDataCallbackCount: 0,
  liteProjectionChangeCount: 0
})
assert.equal(checkpoint.active_anti_goals.length, 6)
assert.equal(checkpoint.active_anti_goal_verification.length, 6)
for (const wall of checkpoint.active_anti_goal_verification) {
  assert.equal(wall.max_age, "10m")
  assert.equal(wall.value, 0)
  assert.equal(wall.threshold, 0)
  assert.equal(wall.verdict, "held")
  assert.equal(wall.replay_command_or_checker, replayCommand)
  assert.ok(freshnessAgeSeconds(wall.observed_at) >= 0)
  assert.ok(freshnessAgeSeconds(wall.observed_at) <= 600)
  assert.match(wall.verification_record_ref, /^workers\/validator-dkr-3-v3\/verification\.json#DKR-3-v3\./)
  assert.notEqual(wall.evidence_ref, wall.verification_record_ref)
  const claimId = wall.verification_record_ref.split("#")[1]
  assert.equal(acceptedClaims.get(claimId), "accepted", claimId)
}
assert.equal(acceptedClaims.get("DKR-3-v3.frame-wall-freshness"), "rejected")
assert.equal(validator.summary.required_before_acceptance, "fresh checkpoint wall records using frame v2 max_age 10m")
for (const path of evidencePaths) {
  const hash = createHash("sha256").update(await readFile(path)).digest("hex")
  assert.ok(checkpoint.evidence_refs_or_hashes.includes(`sha256:${hash}`), path)
}
assert.equal(checkpoint.evidence_refs_or_hashes.length, evidencePaths.length)
assert.equal(checkpoint.wall_gate.verdict, "held")
assert.equal(checkpoint.wall_gate.downstream_advance, "blocked")
assert.equal(checkpoint.reviewer_audit_status, "pending_independent_v4_acceptance")
assert.match(checkpoint.decision, /candidate only/)

process.stdout.write(`${JSON.stringify({
  traceDimensions: "12/12",
  sameScopeCrossSessionLeakCount: 0,
  forbiddenExportCount: 0,
  terminalSettlementOrder: "2/2",
  evidenceHashes: "11/11",
  checkpointFields: "20/20",
  wallEntries: "6/6",
  frameMaxAge: checkpoint.max_age,
  freshWallEntries: "6/6",
  acceptedWallReferences: "6/6",
  citedV3FreshnessRejection: true,
  replayCommand,
  wallGate: checkpoint.wall_gate
})}\n`)
NODE
