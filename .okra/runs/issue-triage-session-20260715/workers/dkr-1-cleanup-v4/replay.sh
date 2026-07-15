#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "$0")/../../../../.." && pwd)"
cd "$repo"

bash .okra/runs/issue-triage-session-20260715/workers/dkr-1-cleanup-v3/replay.sh

node --input-type=module <<'NODE'
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"

const base = ".okra/runs/issue-triage-session-20260715"
const checkpoint = JSON.parse(await readFile(`${base}/workers/dkr-1-cleanup-v4/checkpoint.v4.json`, "utf8"))
const v3 = JSON.parse(await readFile(`${base}/workers/dkr-1-cleanup-v3/cleanup-contract.json`, "utf8"))
const v4 = JSON.parse(await readFile(`${base}/workers/dkr-1-cleanup-v4/cleanup-contract.json`, "utf8"))
const evidencePaths = [
  `${base}/workers/dkr-1-cleanup-v4/cleanup-contract.json`,
  `${base}/workers/dkr-1-cleanup-v4/replay.sh`,
  `${base}/workers/dkr-1-cleanup-v3/checkpoint.v3.json`,
  `${base}/workers/validator-dkr-1-v3/verification.json`,
  "pkg/sdk/core/src/session.ts",
  "pkg/core/lite/src/scope.ts"
]

assert.deepEqual(v4, v3)
assert.equal(checkpoint.contract_version, "okra.executable-dkr-checkpoint.v1")
assert.equal(checkpoint.type, "dkr_learning_checkpoint")
assert.equal(checkpoint.unit_id, "DKR-1")
assert.equal(checkpoint.checkpoint_id, "dkr-1-cleanup-contract-v4")
assert.equal(checkpoint.replay_command_or_checker, "bash .okra/runs/issue-triage-session-20260715/workers/dkr-1-cleanup-v4/replay.sh")
assert.equal(checkpoint.active_anti_goals.length, 6)
assert.equal(checkpoint.active_anti_goal_verification.length, 6)
assert.equal(checkpoint.active_anti_goal_verification.find(
  (wall) => wall.metric_id === "cleanup_business_state_mutation_count",
).value, 1)
assert.equal(checkpoint.wall_gate.verdict, "blocked")
assert.equal(checkpoint.wall_gate.downstream_advance, "blocked")
assert.equal(checkpoint.reviewer_audit_status, "pending_independent_replay")
for (const path of evidencePaths) {
  const hash = createHash("sha256").update(await readFile(path)).digest("hex")
  assert.ok(checkpoint.evidence_refs_or_hashes.includes(`sha256:${hash}`), path)
}

process.stdout.write(`${JSON.stringify({
  contractUnchanged: true,
  cleanupCases: "11/11",
  activationBehaviors: "6/6",
  evidenceHashes: `${evidencePaths.length}/${evidencePaths.length}`,
  replayCommand: checkpoint.replay_command_or_checker,
  cleanupWall: "1/0",
  downstreamAdvance: checkpoint.wall_gate.downstream_advance,
  reviewerAuditStatus: checkpoint.reviewer_audit_status,
})}\n`)
NODE
