#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "$0")/../../../../.." && pwd)"
cd "$repo"

node .okra/runs/issue-triage-session-20260715/workers/dkr-4/queue-probe.mjs

node --input-type=module <<'NODE'
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"

const base = ".okra/runs/issue-triage-session-20260715"
const checkpoint = JSON.parse(await readFile(`${base}/workers/dkr-4/checkpoint.json`, "utf8"))
const contract = JSON.parse(await readFile(`${base}/workers/dkr-4/queue-contract.json`, "utf8"))
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
  `${base}/workers/dkr-4/queue-probe.mjs`,
  `${base}/workers/dkr-4/queue-contract.json`,
  `${base}/workers/dkr-4/replay.sh`,
  `${base}/workers/dkr-2-v3/cancellation-contract.json`,
  `${base}/workers/validator-dkr-2/verification.json`,
  "pkg/core/lite/src/types.ts",
  "pkg/core/lite/src/scope.ts",
  "pkg/core/lite/PATTERNS.md"
]

assert.equal(checkpoint.contract_version, "okra.executable-dkr-checkpoint.v1")
assert.equal(checkpoint.type, "dkr_learning_checkpoint")
assert.equal(checkpoint.unit_id, "DKR-4")
assert.equal(requiredCheckpointFields.filter((field) => field in checkpoint).length, requiredCheckpointFields.length)
assert.equal(checkpoint.active_anti_goals.length, 8)
assert.equal(checkpoint.active_anti_goal_verification.length, 8)
for (const wall of checkpoint.active_anti_goal_verification) {
  assert.equal(requiredWallFields.filter((field) => field in wall).length, requiredWallFields.length)
  assert.equal(typeof wall.value, "number")
  assert.notEqual(wall.evidence_ref, wall.verification_record_ref)
}
assert.equal(checkpoint.wall_gate.verdict, "blocked")
assert.equal(checkpoint.wall_gate.downstream_advance, "blocked")
assert.match(checkpoint.wall_gate.decided_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)
assert.equal(checkpoint.reviewer_audit_status, "pending_independent_replay")
assert.match(checkpoint.decision, /candidate/)
assert.equal(contract.case_contract.case_pass_target, 8)
assert.equal(contract.composition.ports.length, 5)
assert.equal(contract.pool_comparison.public_pool_added_behavior_count, 0)
assert.equal(contract.lifecycle_dependency.dkr_2_status, "candidate_not_assumed_accepted")

for (const path of evidencePaths) {
  const hash = createHash("sha256").update(await readFile(path)).digest("hex")
  assert.ok(checkpoint.evidence_refs_or_hashes.includes(`sha256:${hash}`), path)
}
assert.equal(checkpoint.evidence_refs_or_hashes.length, evidencePaths.length)

process.stdout.write(`${JSON.stringify({
  queueCases: "8/8",
  explicitPorts: "5/5",
  checkpointFields: `${requiredCheckpointFields.length}/${requiredCheckpointFields.length}`,
  wallEntries: `${checkpoint.active_anti_goal_verification.length}/${checkpoint.active_anti_goals.length}`,
  evidenceHashes: `${evidencePaths.length}/${evidencePaths.length}`,
  publicPoolAddedBehaviorCount: 0,
  dkr2AssumedAccepted: false,
  decision: checkpoint.decision,
  wallGate: checkpoint.wall_gate
})}\n`)
NODE
