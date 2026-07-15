#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "$0")/../../../../.." && pwd)"
cd "$repo"

bash .okra/runs/issue-triage-session-20260715/workers/dkr-1-cleanup/replay.sh
node .okra/runs/issue-triage-session-20260715/workers/dkr-1-cleanup-v3/cleanup-contract-probe.mjs

node --input-type=module <<'NODE'
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"

const base = ".okra/runs/issue-triage-session-20260715"
const checkpoint = JSON.parse(await readFile(`${base}/workers/dkr-1-cleanup-v3/checkpoint.v3.json`, "utf8"))
const contract = JSON.parse(await readFile(`${base}/workers/dkr-1-cleanup-v3/cleanup-contract.json`, "utf8"))
const requiredCheckpointFields = [
  "checkpoint_id",
  "conclusion_id",
  "decision_target",
  "source_of_truth",
  "read_method",
  "observed_at",
  "recorded_at",
  "max_age",
  "freshness_status",
  "confidence",
  "evidence_refs_or_hashes",
  "replay_command_or_checker",
  "questions_answered",
  "questions_unanswered",
  "decision",
  "flag_if_missing_or_stale",
  "reviewer_audit_status",
  "active_anti_goals",
  "active_anti_goal_verification",
  "wall_gate"
]
const requiredWallFields = [
  "metric_id",
  "source_of_truth",
  "read_method",
  "observed_at",
  "recorded_at",
  "max_age",
  "freshness_status",
  "value",
  "threshold",
  "comparator",
  "verdict",
  "evidence_ref",
  "replay_command_or_checker",
  "verification_record_ref"
]
const evidencePaths = [
  `${base}/workers/dkr-1-cleanup-v3/cleanup-contract.json`,
  `${base}/workers/dkr-1-cleanup-v3/cleanup-contract-probe.mjs`,
  `${base}/workers/dkr-1-cleanup-v3/replay.sh`,
  `${base}/workers/dkr-1-cleanup/cleanup-contract.json`,
  `${base}/workers/dkr-1-cleanup/checkpoint.v2.json`,
  `${base}/workers/validator-dkr-1-cleanup/verification.json`,
  "pkg/sdk/core/src/session.ts",
  "pkg/core/lite/src/scope.ts"
]

assert.equal(checkpoint.contract_version, "okra.executable-dkr-checkpoint.v1")
assert.equal(checkpoint.type, "dkr_learning_checkpoint")
assert.equal(checkpoint.unit_id, "DKR-1")
assert.equal(requiredCheckpointFields.filter((field) => field in checkpoint).length, requiredCheckpointFields.length)
assert.equal(checkpoint.active_anti_goals.length, 6)
assert.equal(checkpoint.active_anti_goal_verification.length, 6)
for (const wall of checkpoint.active_anti_goal_verification) {
  assert.equal(requiredWallFields.filter((field) => field in wall).length, requiredWallFields.length)
}
assert.equal(checkpoint.wall_gate.verdict, "blocked")
assert.equal(checkpoint.wall_gate.downstream_advance, "blocked")
assert.equal(checkpoint.reviewer_audit_status, "pending_independent_replay")
assert.match(checkpoint.decision, /candidate/)
assert.equal(contract.inherits.preserved_case_count, 10)
assert.equal(contract.inherits.preserved_activation_behavior_count, 6)
assert.equal(contract.probe_expectations.total_cleanup_case_pass_count, 11)
assert.equal(contract.probe_expectations.multiple_error_case_pass_count, 1)

for (const path of evidencePaths) {
  const hash = createHash("sha256").update(await readFile(path)).digest("hex")
  assert.ok(checkpoint.evidence_refs_or_hashes.includes(`sha256:${hash}`), path)
}

process.stdout.write(`${JSON.stringify({
  checkpointFields: `${requiredCheckpointFields.length}/${requiredCheckpointFields.length}`,
  wallEntries: `${checkpoint.active_anti_goal_verification.length}/${checkpoint.active_anti_goals.length}`,
  cleanupCases: "11/11",
  activationBehaviors: "6/6",
  evidenceHashes: `${evidencePaths.length}/${evidencePaths.length}`,
  decision: checkpoint.decision,
  wallGate: checkpoint.wall_gate
})}\n`)
NODE
