#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "$0")/../../../../.." && pwd)"
skill="/home/lagz0ne/dev/pumped-fn/.agents/skills/reverse-tornado-okr/SKILL.md"
claims="/home/lagz0ne/dev/pumped-fn/.agents/skills/reverse-tornado-okr/references/executable-claims.md"
cd "$repo"

sha256sum --check <<'HASHES'
912c3874fb823655abf4e69a6ed9db16573de8d3640638aa41a8b4dfabdb7603  .okra/runs/issue-triage-session-20260715/workers/dkr-1-cleanup/cleanup-contract.json
0d6a86e5d40573ef827767ed44bbc10c39aaa26eda317e5202449eae6eda6b4d  .okra/runs/issue-triage-session-20260715/workers/dkr-1-cleanup/cleanup-contract-probe.mjs
cfa9a363c400e6637e8537ba0ac5053fa96f70cf8dfca85d43deccede705b500  .okra/runs/issue-triage-session-20260715/workers/dkr-1-cleanup/replay.sh
78b6500dee31b501644f3a528149e2efb3cb8f684a59373071cf9fdc5f5cfe06  pkg/sdk/core/src/session.ts
7fb45a842db6233d61ee7f2d81e886c4ac2c8b5fc77549ff4db8bc41df8a725f  pkg/sdk/core/tests/session-kernel.test.ts
549e6b4096698a433f5a843dc4851d2ab9743c7b5e77e7497e0205c7d9aa3b0b  pkg/core/lite/src/scope.ts
b8810fd41440692eb6390cb6efb954dbfcbc8af188a2e370c30975eca9944001  .okra/runs/issue-triage-session-20260715/workers/dkr-1/checkpoint.json
b0d98497cdf17e6f3b2c6062344fca910aa310f99104c6276159657d2bec5129  .okra/runs/issue-triage-session-20260715/workers/validator-dkr-0-1/verification.json
75e39f86e5a4397e907113ac2dfb49b141935663643012ca4a04d447fc4e7c57  /home/lagz0ne/dev/pumped-fn/.agents/skills/reverse-tornado-okr/references/executable-claims.md
HASHES

node --input-type=module <<'NODE'
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const checkpoint = JSON.parse(await readFile(
  ".okra/runs/issue-triage-session-20260715/workers/dkr-1-cleanup/checkpoint.v2.json",
  "utf8",
))
const contract = JSON.parse(await readFile(
  ".okra/runs/issue-triage-session-20260715/workers/dkr-1-cleanup/cleanup-contract.json",
  "utf8",
))
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
assert.equal(contract.executable_cases.length, 10)
assert.equal(contract.preserved_activation_model.verified_behavior_pass_count, 6)
assert.equal(contract.preserved_activation_model.verified_behavior_target, 6)

process.stdout.write(`${JSON.stringify({
  checkpointFields: `${requiredCheckpointFields.length}/${requiredCheckpointFields.length}`,
  wallEntries: `${checkpoint.active_anti_goal_verification.length}/${checkpoint.active_anti_goals.length}`,
  candidateCases: `${contract.executable_cases.length}/10`,
  preservedActivationBehaviors: "6/6",
  wallGate: checkpoint.wall_gate,
})}\n`)
NODE

grep -Fq 'A DKR may save useful learning when a wall is breached, stale, or unknown, but it sets' "$claims"
grep -Fq 'only when every active wall reads exactly `held`' "$claims"
grep -Fq '`breaking` pauses' "$skill"
grep -Fq 'committing moves by default' "$skill"
printf '%s\n' '{"canonicalSkillRules":"3/3"}'
