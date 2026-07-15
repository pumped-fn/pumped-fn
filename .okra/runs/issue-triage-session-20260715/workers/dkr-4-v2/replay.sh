#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "$0")/../../../../.." && pwd)"
cd "$repo"

node .okra/runs/issue-triage-session-20260715/workers/dkr-4-v2/queue-probe.mjs
node .okra/runs/issue-triage-session-20260715/workers/dkr-4-v2/surface-probe.mjs

node --input-type=module <<'NODE'
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"

const run = ".okra/runs/issue-triage-session-20260715"
const checkpoint = JSON.parse(readFileSync(`${run}/workers/dkr-4-v2/checkpoint.v2.json`, "utf8"))
const contract = JSON.parse(readFileSync(`${run}/workers/dkr-4-v2/queue-contract.json`, "utf8"))
const surface = JSON.parse(readFileSync(`${run}/workers/dkr-4-v2/modeled-surface.json`, "utf8"))
const requiredCheckpointFields = [
  "contract_version",
  "type",
  "unit_id",
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
  "wall_gate",
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
  "verification_record_ref",
]
const evidencePaths = [
  `${run}/workers/dkr-4-v2/queue-probe.mjs`,
  `${run}/workers/dkr-4-v2/modeled-surface.json`,
  `${run}/workers/dkr-4-v2/surface-probe.mjs`,
  `${run}/workers/dkr-4-v2/queue-contract.json`,
  `${run}/workers/dkr-4-v2/replay.sh`,
  `${run}/workers/validator-dkr-4/verification.json`,
  `${run}/workers/dkr-2-v3/cancellation-contract.json`,
  "pkg/core/lite/src/scope.ts",
]

assert.equal(requiredCheckpointFields.filter((field) => checkpoint[field] !== undefined).length, requiredCheckpointFields.length)
assert.equal(checkpoint.replay_command_or_checker, "bash .okra/runs/issue-triage-session-20260715/workers/dkr-4-v2/replay.sh")
assert.equal(checkpoint.active_anti_goals.length, 8)
assert.equal(checkpoint.active_anti_goal_verification.length, 8)
assert.ok(checkpoint.active_anti_goal_verification.every((wall) => requiredWallFields.every((field) => wall[field] !== undefined)))
assert.ok(checkpoint.active_anti_goal_verification.every((wall) => typeof wall.value === "number" && typeof wall.threshold === "number"))
assert.equal(checkpoint.wall_gate.downstream_advance, "blocked")
assert.equal(checkpoint.reviewer_audit_status, "pending_independent_v2_replay")
assert.equal(contract.case_contract.case_pass_target, 8)
assert.equal(contract.composition.ports.length, 5)
assert.equal(contract.composition.controller_edges.length, 3)
assert.equal(surface.public_lifecycle_surface.length, 0)
assert.equal(surface.effect_edges.filter((edge) => !edge.via_required_port).length, 0)
for (const path of evidencePaths) {
  const sha256 = createHash("sha256").update(readFileSync(path)).digest("hex")
  assert.ok(checkpoint.evidence_refs_or_hashes.includes(`sha256:${sha256}`), path)
}

process.stdout.write(`${JSON.stringify({
  queueCases: "8/8",
  explicitPorts: "5/5",
  controllerEdges: "3/3",
  maxConcurrency: "2/2",
  activationExecPerLease: "1/1",
  crossSessionLeaks: "0/0",
  forbiddenPublicSurfaces: "0/0",
  hiddenEffectEdges: "0/0",
  checkpointFields: `${requiredCheckpointFields.length}/${requiredCheckpointFields.length}`,
  wallEntries: "8/8",
  evidenceHashes: `${evidencePaths.length}/${evidencePaths.length}`,
  dkr2AssumedAccepted: false,
  downstreamAdvance: checkpoint.wall_gate.downstream_advance,
})}\n`)
NODE
