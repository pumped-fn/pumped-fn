import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"

const checkpointPath = ".okra/runs/issue-triage-session-20260715/workers/dkr-2/checkpoint.v2.json"
const contractPath = "/home/lagz0ne/dev/pumped-fn/.agents/skills/reverse-tornado-okr/contracts/executable-dkr-checkpoint.v1.json"
const evidence = Object.freeze([
  [contractPath, "54460581177fc2c6e0d17718a11b1a3b7910e364d04277cdfc79be867590630a"],
  [".okra/runs/issue-triage-session-20260715/workers/dkr-2/cancellation-probe.mjs", "30858c146118a23be1e942cc5e4adba683a7f517c8daef02537b0d643146249f"],
  [".okra/runs/issue-triage-session-20260715/workers/dkr-2/cancellation-probe.json", "267674e4a35a3164f3e2a686dce592de00234d1951bec04a6e7acff1e9c9f5d7"],
  ["pkg/core/lite/src/types.ts", "a208869ca9eeb3d8f2407d399d01394ed01c86dda46ee2df0b41899f72b86b34"],
  ["pkg/core/lite/src/scope.ts", "549e6b4096698a433f5a843dc4851d2ab9743c7b5e77e7497e0205c7d9aa3b0b"],
  [".okra/runs/issue-triage-session-20260715/workers/dkr-2/checkpoint.json", "8aa3127afe09d23506868d906dd778dd6cc55ebc6ed129781504c9b7c08a408d"],
])

const required = Object.freeze([
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
])

const digest = async (path) => createHash("sha256").update(await readFile(path)).digest("hex")
const checkpoint = JSON.parse(await readFile(checkpointPath, "utf8"))
const contract = JSON.parse(await readFile(contractPath, "utf8"))

for (const key of required) assert(key in checkpoint, `missing checkpoint field ${key}`)
assert.equal(checkpoint.contract_version, contract.contract_version)
assert.equal(checkpoint.type, "dkr_learning_checkpoint")
assert.equal(checkpoint.unit_id, "DKR-2")
assert.equal(checkpoint.freshness_status, "fresh")
assert.equal(typeof checkpoint.confidence, "number")
assert(checkpoint.confidence >= 0 && checkpoint.confidence <= 1)

const expectedHashes = evidence.map(([, hash]) => `sha256:${hash}`)
assert.deepEqual(checkpoint.evidence_refs_or_hashes, expectedHashes)
for (const [path, expected] of evidence) assert.equal(await digest(path), expected, `hash mismatch ${path}`)

assert.equal(checkpoint.active_anti_goals.length, 5)
assert.equal(checkpoint.active_anti_goal_verification.length, 5)
for (const wall of checkpoint.active_anti_goal_verification) {
  assert.equal(typeof wall.value, "number")
  assert.equal(typeof wall.threshold, "number")
  assert.notEqual(wall.evidence_ref, wall.verification_record_ref)
  assert.match(wall.observed_at, /^\d{4}-\d{2}-\d{2}T/)
  assert.match(wall.recorded_at, /^\d{4}-\d{2}-\d{2}T/)
  assert.match(wall.max_age, /^\d+m$/)
}

assert.equal(checkpoint.wall_gate.downstream_advance, "blocked")
assert.match(checkpoint.decision, /ExecutionContext\.signal/)
assert.match(checkpoint.decision, /do not add ExecutionContext\.cancel, start, spawn, or task handles/)
assert.match(checkpoint.checkpoint_rejection_policy, /single-LLM-truth/)
assert.deepEqual(checkpoint.role_grammar, [
  "CKRs are measurable contribution context, not worker work.",
  "DKRs are discovery-worker scopes; PKRs are progression-worker execution units; there is no CKR worker.",
])

process.stdout.write(`${JSON.stringify({
  verdict: "replayed",
  contractVersion: checkpoint.contract_version,
  requiredFieldCount: required.length,
  resolvedEvidenceHashCount: evidence.length,
  activeWallCount: checkpoint.active_anti_goal_verification.length,
  numericWallCount: checkpoint.active_anti_goal_verification.filter(
    (wall) => typeof wall.value === "number" && typeof wall.threshold === "number",
  ).length,
  distinctWallReferenceCount: checkpoint.active_anti_goal_verification.filter(
    (wall) => wall.evidence_ref !== wall.verification_record_ref,
  ).length,
  downstreamAdvance: checkpoint.wall_gate.downstream_advance,
  reviewerAuditStatus: checkpoint.reviewer_audit_status,
}, null, 2)}\n`)
