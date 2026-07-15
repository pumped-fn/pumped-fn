#!/usr/bin/env bash
set -u

repo="$(cd "$(dirname "$0")/../../../../.." && pwd)"
cd "$repo"

candidate_output="$(bash .okra/runs/issue-triage-session-20260715/workers/dkr-1-cleanup-v4/replay.sh 2>&1)"
candidate_exit=$?

CANDIDATE_OUTPUT="$candidate_output" CANDIDATE_EXIT="$candidate_exit" node --input-type=module <<'NODE'
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"

const run = ".okra/runs/issue-triage-session-20260715"
const checkpointPath = `${run}/workers/dkr-1-cleanup-v4/checkpoint.v4.json`
const v3ContractPath = `${run}/workers/dkr-1-cleanup-v3/cleanup-contract.json`
const v4ContractPath = `${run}/workers/dkr-1-cleanup-v4/cleanup-contract.json`
const checkpoint = JSON.parse(readFileSync(checkpointPath, "utf8"))
const v3Contract = readFileSync(v3ContractPath)
const v4Contract = readFileSync(v4ContractPath)
const flags = readFileSync(`${run}/flags.jsonl`, "utf8").trim().split("\n").map((line) => JSON.parse(line))
const cleanupFlag = flags.find((record) => record.payload?.flag_id === "breaking.DKR-1.cleanup-business-state-mutation")
const output = process.env.CANDIDATE_OUTPUT

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
const missingCheckpointFields = requiredCheckpointFields.filter((field) => checkpoint[field] === undefined)
const evidencePaths = [
  `${run}/workers/dkr-1-cleanup-v4/cleanup-contract.json`,
  `${run}/workers/dkr-1-cleanup-v4/replay.sh`,
  `${run}/workers/dkr-1-cleanup-v3/checkpoint.v3.json`,
  `${run}/workers/validator-dkr-1-v3/verification.json`,
  "pkg/sdk/core/src/session.ts",
  "pkg/core/lite/src/scope.ts",
]
const hashResults = evidencePaths.map((path) => {
  const sha256 = createHash("sha256").update(readFileSync(path)).digest("hex")
  return { path, sha256, present: checkpoint.evidence_refs_or_hashes.includes(`sha256:${sha256}`) }
})
const cleanupWall = checkpoint.active_anti_goal_verification.find((wall) => wall.metric_id === "cleanup_business_state_mutation_count")

assert.equal(Number(process.env.CANDIDATE_EXIT), 0)
assert.ok(output.includes('"contractUnchanged":true'))
assert.ok(output.includes('"cleanupCases":"11/11"'))
assert.ok(output.includes('"activationBehaviors":"6/6"'))
assert.ok(output.includes('"evidenceHashes":"6/6"'))
assert.deepEqual(v4Contract, v3Contract)
assert.deepEqual(missingCheckpointFields, [])
assert.ok(hashResults.every((result) => result.present))
assert.equal(cleanupWall.value, 1)
assert.equal(cleanupWall.threshold, 0)
assert.equal(cleanupWall.verdict, "breached")
assert.equal(checkpoint.wall_gate.verdict, "blocked")
assert.equal(checkpoint.wall_gate.downstream_advance, "blocked")
assert.equal(cleanupFlag?.payload.status, "open")
assert.ok(checkpoint.risk_or_anti_goal_implications.includes("No product, Lite, ownership, threshold, or remediation change is supported by this revision."))

process.stdout.write(`${JSON.stringify({
  verification: "validator-dkr-1-v4-replay",
  exact_recorded_replay: checkpoint.replay_command_or_checker,
  candidate_exit_code: Number(process.env.CANDIDATE_EXIT),
  contract_semantic_equality: true,
  contract_byte_equality: v4Contract.equals(v3Contract),
  cleanup_cases: "11/11",
  activation_behaviors: "6/6",
  evidence_hashes: `${hashResults.filter((result) => result.present).length}/${hashResults.length}`,
  checkpoint_fields: `${requiredCheckpointFields.length - missingCheckpointFields.length}/${requiredCheckpointFields.length}`,
  cleanup_wall: { value: cleanupWall.value, threshold: cleanupWall.threshold, verdict: cleanupWall.verdict },
  breaking_flag: { flag_id: cleanupFlag.payload.flag_id, status: cleanupFlag.payload.status },
  remediation_authorized: false,
  reducing_checkpoint_replayable: true,
  product_progression: "blocked",
  hash_results: hashResults,
})}\n`)
NODE
