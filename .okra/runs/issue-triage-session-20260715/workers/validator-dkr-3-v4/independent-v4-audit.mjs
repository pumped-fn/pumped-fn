import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"

const run = ".okra/runs/issue-triage-session-20260715"
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"))
const sha256 = async (path) => createHash("sha256").update(await readFile(path)).digest("hex")
const v3 = await readJson(`${run}/workers/dkr-3-v3/checkpoint.v3.json`)
const v4 = await readJson(`${run}/workers/dkr-3-v4/checkpoint.v4.json`)
const validator = await readJson(`${run}/workers/validator-dkr-3-v3/verification.json`)
const frame = await readJson(`${run}/frame/frame.v2.json`)
const progress = (await readFile(`${run}/workers/dkr-3-v4/progress.jsonl`, "utf8")).trim().split("\n").map(JSON.parse).at(-1).payload
const replay = `bash ${run}/workers/dkr-3-v4/replay.sh`
const requiredFields = [
  "checkpoint_id", "conclusion_id", "decision_target", "source_of_truth", "read_method",
  "observed_at", "recorded_at", "max_age", "freshness_status", "confidence",
  "evidence_refs_or_hashes", "replay_command_or_checker", "questions_answered",
  "questions_unanswered", "decision", "flag_if_missing_or_stale", "reviewer_audit_status",
  "active_anti_goals", "active_anti_goal_verification", "wall_gate"
]
const evidencePaths = [
  `${run}/workers/dkr-3/artifacts/context-observation-probe.v1.json`,
  `${run}/workers/dkr-3/artifacts/context-observation-trace-contract.v1.json`,
  `${run}/workers/dkr-3/probes/context-observation-probe.mjs`,
  `${run}/workers/dkr-3/probes/replay-context-observation.mjs`,
  `${run}/workers/validator-dkr-3-v3/verification.json`,
  `${run}/workers/validator-dkr-3-v3/independent-projection.mjs`,
  `${run}/workers/dkr-3-v4/replay.sh`,
  "pkg/core/lite/src/types.ts",
  "pkg/core/lite/src/scope.ts",
  "pkg/ext/observable/src/index.ts",
  `${run}/frame/frame.v2.json`
]
const claims = new Map(validator.audit_traces.map((trace) => [trace.claim_id, trace]))
const v3Walls = new Map(v3.active_anti_goal_verification.map((wall) => [wall.metric_id, wall]))
const now = new Date()
const ageSeconds = (value) => Math.floor((now.getTime() - Date.parse(value)) / 1000)

assert.equal(frame.metric_contracts.anti_goals.max_age, "10m")
assert.equal(v4.max_age, "10m")
assert.equal(v4.replay_command_or_checker, replay)
assert.equal(requiredFields.filter((field) => field in v4).length, 20)
assert.deepEqual(v4.observation_decision, v3.observation_decision)
assert.deepEqual(v4.active_anti_goals, v3.active_anti_goals)
assert.equal(v4.active_anti_goal_verification.length, 6)
assert.equal(v4.wall_gate.verdict, "held")
assert.equal(v4.wall_gate.downstream_advance, "blocked")
assert.equal(v4.reviewer_audit_status, "pending_independent_v4_acceptance")
assert.match(v4.decision, /candidate only/)
assert.equal(ageSeconds(v4.observed_at) >= 0, true)
assert.equal(ageSeconds(v4.observed_at) <= 600, true)

for (const wall of v4.active_anti_goal_verification) {
  const old = v3Walls.get(wall.metric_id)
  assert.ok(old)
  assert.deepEqual(
    [wall.anti_goal_id, wall.metric_id, wall.value, wall.threshold, wall.comparator, wall.verdict],
    [old.anti_goal_id, old.metric_id, old.value, old.threshold, old.comparator, old.verdict]
  )
  assert.equal(wall.max_age, "10m")
  assert.equal(wall.freshness_status, "fresh")
  assert.equal(wall.replay_command_or_checker, replay)
  assert.equal(ageSeconds(wall.observed_at) >= 0, true)
  assert.equal(ageSeconds(wall.observed_at) <= 600, true)
  assert.match(wall.verification_record_ref, /^workers\/validator-dkr-3-v3\/verification\.json#DKR-3-v3\./)
  assert.equal(claims.get(wall.verification_record_ref.split("#")[1])?.decision, "accepted")
  assert.notEqual(wall.evidence_ref, wall.verification_record_ref)
}

const evidenceHashes = await Promise.all(evidencePaths.map(sha256))
assert.equal(evidenceHashes.length, 11)
assert.equal(new Set(evidenceHashes).size, 11)
assert.deepEqual(new Set(v4.evidence_refs_or_hashes), new Set(evidenceHashes.map((hash) => `sha256:${hash}`)))
assert.equal(progress.checkpoint_sha256, await sha256(`${run}/workers/dkr-3-v4/checkpoint.v4.json`))
assert.equal(progress.replay_sha256, await sha256(`${run}/workers/dkr-3-v4/replay.sh`))
assert.equal(progress.exact_replay_command, replay)
assert.equal(claims.get("DKR-3-v3.independent-dimensions")?.value, 12)
assert.equal(claims.get("DKR-3-v3.same-scope-privacy")?.value, 0)
assert.equal(claims.get("DKR-3-v3.terminal-order")?.value, 2)
assert.equal(claims.get("DKR-3-v3.safe-api-boundary")?.value, 0)
assert.equal(claims.get("DKR-3-v3.frame-wall-freshness")?.decision, "rejected")
assert.equal(validator.summary.required_before_acceptance, "fresh checkpoint wall records using frame v2 max_age 10m")

process.stdout.write(`${JSON.stringify({
  probe: "validator-dkr-3-v4-independent-audit",
  observedAt: now.toISOString().replace(/\.\d{3}Z$/, "Z"),
  checkpointAgeSeconds: ageSeconds(v4.observed_at),
  frameMaxAgeSeconds: 600,
  behaviorProjectionMatchesAcceptedV3: true,
  dimensionPassCount: 12,
  dimensionTarget: 12,
  sameScopeCrossSessionLeakCount: 0,
  forbiddenExportCount: 0,
  terminalEventOrderingPassCount: 2,
  terminalEventOrderingTarget: 2,
  checkpointFieldPassCount: 20,
  checkpointFieldTarget: 20,
  evidenceHashPassCount: 11,
  evidenceHashTarget: 11,
  wallPassCount: 6,
  wallTarget: 6,
  acceptedWallReferencePassCount: 6,
  acceptedWallReferenceTarget: 6,
  progressPinsMatch: true,
  downstreamAdvance: v4.wall_gate.downstream_advance
})}\n`)
