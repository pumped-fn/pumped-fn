#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "$0")/../../../../.." && pwd)"
cd "$repo"

node .okra/runs/issue-triage-session-20260715/workers/dkr-3/probes/replay-context-observation.mjs \
  .okra/runs/issue-triage-session-20260715/workers/dkr-3/artifacts/context-observation-probe.v1.json
node .okra/runs/issue-triage-session-20260715/workers/validator-dkr-3/same-scope-probe.mjs
node .okra/runs/issue-triage-session-20260715/workers/validator-dkr-3/seam-probe.mjs

node --input-type=module <<'NODE'
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"

const base = ".okra/runs/issue-triage-session-20260715"
const checkpoint = JSON.parse(await readFile(`${base}/workers/dkr-3-v2/checkpoint.v2.json`, "utf8"))
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
  `${base}/workers/dkr-3/artifacts/context-observation-probe.v1.json`,
  `${base}/workers/dkr-3/artifacts/context-observation-trace-contract.v1.json`,
  `${base}/workers/dkr-3/probes/context-observation-probe.mjs`,
  `${base}/workers/dkr-3/probes/replay-context-observation.mjs`,
  `${base}/workers/validator-dkr-3/verification.json`,
  `${base}/workers/validator-dkr-3/same-scope-probe.mjs`,
  `${base}/workers/validator-dkr-3/seam-probe.mjs`,
  `${base}/workers/dkr-3-v2/replay.sh`,
  "pkg/core/lite/src/types.ts",
  "pkg/core/lite/src/scope.ts",
  "pkg/ext/observable/src/index.ts"
]

assert.equal(checkpoint.contract_version, "okra.executable-dkr-checkpoint.v1")
assert.equal(checkpoint.type, "dkr_learning_checkpoint")
assert.equal(checkpoint.unit_id, "DKR-3")
assert.equal(requiredCheckpointFields.filter((field) => field in checkpoint).length, requiredCheckpointFields.length)
assert.equal(checkpoint.active_anti_goals.length, 6)
assert.equal(checkpoint.active_anti_goal_verification.length, 6)
for (const wall of checkpoint.active_anti_goal_verification) {
  assert.equal(requiredWallFields.filter((field) => field in wall).length, requiredWallFields.length)
  assert.equal(typeof wall.value, "number")
  assert.equal(wall.verdict, "held")
  assert.notEqual(wall.evidence_ref, wall.verification_record_ref)
}
assert.equal(checkpoint.wall_gate.verdict, "held")
assert.equal(checkpoint.wall_gate.downstream_advance, "blocked")
assert.match(checkpoint.wall_gate.decided_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)
assert.equal(checkpoint.reviewer_audit_status, "pending_independent_v2_acceptance")
assert.match(checkpoint.decision, /candidate/)
assert.deepEqual(checkpoint.observation_decision, {
  projectionSourceCount: 1,
  arbitraryTagEnumerationPathCount: 0,
  publicContextDataCallbackCount: 0,
  liteProjectionChangeCount: 0
})

for (const path of evidencePaths) {
  const hash = createHash("sha256").update(await readFile(path)).digest("hex")
  assert.ok(checkpoint.evidence_refs_or_hashes.includes(`sha256:${hash}`), path)
}
assert.equal(checkpoint.evidence_refs_or_hashes.length, evidencePaths.length)

process.stdout.write(`${JSON.stringify({
  traceDimensions: "12/12",
  sameScopeCrossSessionLeakCount: 0,
  forbiddenExportCount: 0,
  terminalSettlementOrder: "2/2",
  checkpointFields: `${requiredCheckpointFields.length}/${requiredCheckpointFields.length}`,
  wallEntries: `${checkpoint.active_anti_goal_verification.length}/${checkpoint.active_anti_goals.length}`,
  evidenceHashes: `${evidencePaths.length}/${evidencePaths.length}`,
  unresolvedEvidenceHashes: 0,
  decision: checkpoint.decision,
  wallGate: checkpoint.wall_gate
})}\n`)
NODE
