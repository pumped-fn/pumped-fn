import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"

const run = ".okra/runs/issue-triage-session-20260715"
const probePath = `${run}/workers/dkr-4/queue-probe.mjs`
const contractPath = `${run}/workers/dkr-4/queue-contract.json`
const checkpointPath = `${run}/workers/dkr-4/checkpoint.json`
const probe = readFileSync(probePath, "utf8")
const contract = JSON.parse(readFileSync(contractPath, "utf8"))
const checkpoint = JSON.parse(readFileSync(checkpointPath, "utf8"))

const portMarkers = [
  "receive: tags.required(queue.receive)",
  "acknowledge: tags.required(queue.acknowledge)",
  "reject: tags.required(queue.reject)",
  "leaseValid: tags.required(queue.leaseValid)",
  "wait: tags.required(timer.wait)",
]
const controllerMarkers = [
  "triage: controller(triage)",
  "activate: controller(activate)",
  "runDelivery: controller(runDelivery)",
]
const forbiddenPatterns = [
  /\bWorkerRegistry\b/,
  /\bstart\s*\(/,
  /\bspawn\s*\(/,
  /setTimeout\s*\(/,
  /setInterval\s*\(/,
  /node:child_process/,
  /\bfetch\s*\(/,
  /createSharedScope\s*\(/,
]
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
const evidencePaths = [
  `${run}/workers/dkr-4/queue-probe.mjs`,
  `${run}/workers/dkr-4/queue-contract.json`,
  `${run}/workers/dkr-4/replay.sh`,
  `${run}/workers/dkr-2-v3/cancellation-contract.json`,
  `${run}/workers/validator-dkr-2/verification.json`,
  "pkg/core/lite/src/types.ts",
  "pkg/core/lite/src/scope.ts",
  "pkg/core/lite/PATTERNS.md",
]
const hashResults = evidencePaths.map((path) => {
  const sha256 = createHash("sha256").update(readFileSync(path)).digest("hex")
  return { path, sha256, present: checkpoint.evidence_refs_or_hashes.includes(`sha256:${sha256}`) }
})

assert.ok(portMarkers.every((marker) => probe.includes(marker)))
assert.ok(controllerMarkers.every((marker) => probe.includes(marker)))
assert.ok(forbiddenPatterns.every((pattern) => !pattern.test(probe)))
assert.equal(contract.composition.ports.length, 5)
assert.equal(contract.pool_comparison.public_pool_added_behavior_count, 0)
assert.equal(contract.lifecycle_dependency.dkr_2_status, "candidate_not_assumed_accepted")
assert.match(contract.lifecycle_dependency.conditional_on_dkr_2, /Forced ExecutionContext close/)
assert.equal(requiredCheckpointFields.filter((field) => checkpoint[field] !== undefined).length, requiredCheckpointFields.length)
assert.ok(hashResults.every((result) => result.present))

process.stdout.write(`${JSON.stringify({
  audit: "validator-dkr-4-source-v1",
  explicit_required_port_count: portMarkers.length,
  declared_controller_edge_count: controllerMarkers.length,
  forbidden_surface_count: 0,
  public_pool_added_behavior_count: contract.pool_comparison.public_pool_added_behavior_count,
  dkr_2_assumed_accepted: false,
  ordinary_graceful_join_uses_awaited_promises: probe.includes("await Promise.all(deps.runtime.active)"),
  forced_close_conditional_on_dkr_2: true,
  checkpoint_fields: `${requiredCheckpointFields.length}/${requiredCheckpointFields.length}`,
  evidence_hashes: `${hashResults.filter((result) => result.present).length}/${hashResults.length}`,
  hash_results: hashResults,
})}\n`)
