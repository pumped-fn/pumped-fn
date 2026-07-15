#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "$0")/../../../../.." && pwd)"
cd "$repo"

bash .okra/runs/issue-triage-session-20260715/workers/dkr-3-v2/replay.sh

node --input-type=module <<'NODE'
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"

const base = ".okra/runs/issue-triage-session-20260715"
const checkpoint = JSON.parse(await readFile(`${base}/workers/dkr-3-v3/checkpoint.v3.json`, "utf8"))
const evidencePaths = [
  `${base}/workers/dkr-3/artifacts/context-observation-probe.v1.json`,
  `${base}/workers/dkr-3/artifacts/context-observation-trace-contract.v1.json`,
  `${base}/workers/dkr-3/probes/context-observation-probe.mjs`,
  `${base}/workers/dkr-3/probes/replay-context-observation.mjs`,
  `${base}/workers/validator-dkr-3/verification.json`,
  `${base}/workers/validator-dkr-3/same-scope-probe.mjs`,
  `${base}/workers/validator-dkr-3/seam-probe.mjs`,
  `${base}/workers/dkr-3-v3/replay.sh`,
  "pkg/core/lite/src/types.ts",
  "pkg/core/lite/src/scope.ts",
  "pkg/ext/observable/src/index.ts"
]
const required = [
  "checkpoint_id", "conclusion_id", "decision_target", "source_of_truth", "read_method",
  "observed_at", "recorded_at", "max_age", "freshness_status", "confidence",
  "evidence_refs_or_hashes", "replay_command_or_checker", "questions_answered",
  "questions_unanswered", "decision", "flag_if_missing_or_stale", "reviewer_audit_status",
  "active_anti_goals", "active_anti_goal_verification", "wall_gate"
]

assert.equal(checkpoint.contract_version, "okra.executable-dkr-checkpoint.v1")
assert.equal(checkpoint.type, "dkr_learning_checkpoint")
assert.equal(checkpoint.unit_id, "DKR-3")
assert.equal(required.filter((field) => field in checkpoint).length, required.length)
assert.equal(checkpoint.replay_command_or_checker, "bash .okra/runs/issue-triage-session-20260715/workers/dkr-3-v3/replay.sh")
assert.deepEqual(checkpoint.observation_decision, {
  projectionSourceCount: 1,
  arbitraryTagEnumerationPathCount: 0,
  publicContextDataCallbackCount: 0,
  liteProjectionChangeCount: 0
})
assert.equal(checkpoint.active_anti_goals.length, 6)
assert.equal(checkpoint.active_anti_goal_verification.length, 6)
for (const wall of checkpoint.active_anti_goal_verification) {
  assert.equal(wall.value, 0)
  assert.equal(wall.threshold, 0)
  assert.equal(wall.verdict, "held")
  assert.match(wall.verification_record_ref, /^workers\/validator-dkr-3\/verification\.json#/)
  assert.notEqual(wall.evidence_ref, wall.verification_record_ref)
  assert.equal(wall.replay_command_or_checker, checkpoint.replay_command_or_checker)
}
for (const path of evidencePaths) {
  const hash = createHash("sha256").update(await readFile(path)).digest("hex")
  assert.ok(checkpoint.evidence_refs_or_hashes.includes(`sha256:${hash}`), path)
}
assert.equal(checkpoint.evidence_refs_or_hashes.length, evidencePaths.length)
assert.equal(checkpoint.wall_gate.verdict, "held")
assert.equal(checkpoint.wall_gate.downstream_advance, "blocked")
assert.equal(checkpoint.reviewer_audit_status, "pending_independent_v3_acceptance")
assert.match(checkpoint.decision, /candidate only/)

process.stdout.write(`${JSON.stringify({
  traceDimensions: "12/12",
  sameScopeCrossSessionLeakCount: 0,
  forbiddenExportCount: 0,
  terminalSettlementOrder: "2/2",
  evidenceHashes: "11/11",
  checkpointFields: "20/20",
  wallEntries: "6/6",
  independentWallReferences: "6/6",
  replayCommand: checkpoint.replay_command_or_checker,
  wallGate: checkpoint.wall_gate,
})}\n`)
NODE
