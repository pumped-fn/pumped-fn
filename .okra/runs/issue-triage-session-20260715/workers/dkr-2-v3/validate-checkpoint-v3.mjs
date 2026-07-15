import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"

const checkpointPath = ".okra/runs/issue-triage-session-20260715/workers/dkr-2-v3/checkpoint.v3.json"
const evidence = Object.freeze([
  ["/home/lagz0ne/dev/pumped-fn/.agents/skills/reverse-tornado-okr/contracts/executable-dkr-checkpoint.v1.json", "54460581177fc2c6e0d17718a11b1a3b7910e364d04277cdfc79be867590630a"],
  [".okra/runs/issue-triage-session-20260715/workers/dkr-2-v3/cancellation-probe.mjs", "14073c31806a973d38aea92a9b9232ad7f63f9ed3e51ff007878f06ae5a37282"],
  [".okra/runs/issue-triage-session-20260715/workers/dkr-2-v3/cancellation-contract.json", "4e7f888f854b2925b1963557bbad768e928261ef7a76febaf9781d1cfc0c3058"],
  [".okra/runs/issue-triage-session-20260715/workers/dkr-2-v3/replay-contract.mjs", "aaeee332a526e3fa93048f708e5d19930eb10d2b0d82bc76e08b5aee87edb4f8"],
  ["pkg/core/lite/src/types.ts", "a208869ca9eeb3d8f2407d399d01394ed01c86dda46ee2df0b41899f72b86b34"],
  ["pkg/core/lite/src/scope.ts", "549e6b4096698a433f5a843dc4851d2ab9743c7b5e77e7497e0205c7d9aa3b0b"],
  [".okra/runs/issue-triage-session-20260715/workers/dkr-2/checkpoint.v2.json", "6c3a183edd003175c839ada032c98a64accacc8d5a977f26f522c1c94dd456e0"],
  [".okra/runs/issue-triage-session-20260715/workers/validator-dkr-2/verification.json", "9312e5d572e0718577c5ecebf5f5cf97fe75c4cba03e341f8e957141ccf3d27b"],
])

const digest = async (path) => createHash("sha256").update(await readFile(path)).digest("hex")
const checkpoint = JSON.parse(await readFile(checkpointPath, "utf8"))

assert.equal(checkpoint.contract_version, "okra.executable-dkr-checkpoint.v1")
assert.equal(checkpoint.type, "dkr_learning_checkpoint")
assert.equal(checkpoint.unit_id, "DKR-2")
assert.equal(checkpoint.checkpoint_id, "dkr-2-structured-cancellation-v3")
assert.equal(checkpoint.replay_command_or_checker, "bash .okra/runs/issue-triage-session-20260715/workers/dkr-2-v3/replay.sh")
assert.deepEqual(checkpoint.evidence_refs_or_hashes, evidence.map(([, hash]) => `sha256:${hash}`))
for (const [path, expected] of evidence) assert.equal(await digest(path), expected, `hash mismatch ${path}`)
assert.equal(checkpoint.active_anti_goals.length, 5)
assert.equal(checkpoint.active_anti_goal_verification.length, 5)
for (const wall of checkpoint.active_anti_goal_verification) {
  assert.equal(typeof wall.value, "number")
  assert.equal(typeof wall.threshold, "number")
  assert.notEqual(wall.evidence_ref, wall.verification_record_ref)
  assert.equal(wall.replay_command_or_checker, checkpoint.replay_command_or_checker)
}
assert.match(checkpoint.decision, /error is signal\.reason by identity or error\.name is AbortError/)
assert.match(checkpoint.decision, /preserves every unrelated original error/)
assert.match(checkpoint.decision, /do not add ExecutionContext\.cancel, start, spawn, task handles, worker pools, or session semantics/)
assert.equal(checkpoint.wall_gate.downstream_advance, "blocked")
assert.equal(checkpoint.reviewer_audit_status, "pending_independent_replay")

process.stdout.write(`${JSON.stringify({
  verdict: "replayed",
  checkpointId: checkpoint.checkpoint_id,
  resolvedEvidenceHashCount: evidence.length,
  activeWallCount: checkpoint.active_anti_goal_verification.length,
  downstreamAdvance: checkpoint.wall_gate.downstream_advance,
  reviewerAuditStatus: checkpoint.reviewer_audit_status,
}, null, 2)}\n`)
