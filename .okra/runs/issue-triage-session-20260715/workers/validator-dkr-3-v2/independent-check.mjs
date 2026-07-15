import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"

const base = ".okra/runs/issue-triage-session-20260715"
const checkpoint = JSON.parse(await readFile(`${base}/workers/dkr-3-v2/checkpoint.v2.json`, "utf8"))
const prior = JSON.parse(await readFile(`${base}/workers/validator-dkr-3/verification.json`, "utf8"))
const artifact = JSON.parse(await readFile(`${base}/workers/dkr-3/artifacts/context-observation-probe.v1.json`, "utf8"))
const contract = JSON.parse(await readFile(`${base}/workers/dkr-3/artifacts/context-observation-trace-contract.v1.json`, "utf8"))
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
  "pkg/ext/observable/src/index.ts",
]

const trace = (id) => prior.audit_traces.find((entry) => entry.claim_id === id)
assert.equal(trace("dkr3.safe-projection-behavior").value, 12)
assert.equal(trace("dkr3.safe-projection-behavior").threshold, 12)
assert.equal(trace("dkr3.safe-projection-behavior").decision, "accepted")
assert.equal(trace("dkr3.same-scope-isolation").value, 0)
assert.equal(trace("dkr3.same-scope-isolation").decision, "accepted")
assert.equal(trace("dkr3.terminal-and-settlement").value, 2)
assert.equal(trace("dkr3.forbidden-export").value, 0)
assert.equal(trace("dkr3.lite-core-necessity").value, 0)
assert.equal(trace("dkr3.public-api-boundary").value, 0)

assert.deepEqual(checkpoint.observation_decision, {
  projectionSourceCount: 1,
  arbitraryTagEnumerationPathCount: 0,
  publicContextDataCallbackCount: 0,
  liteProjectionChangeCount: 0,
})
assert.deepEqual(artifact.candidate.forbiddenValueMatches, [])
assert.equal(contract.publicBoundary.safeProjectionSourceCount, 1)
assert.equal(contract.publicBoundary.arbitraryTagEnumerationPathCount, 0)
assert.equal(contract.publicBoundary.publicContextDataCallbackCount, 0)

assert.equal(checkpoint.active_anti_goals.length, 6)
assert.equal(checkpoint.active_anti_goal_verification.length, 6)
for (const wall of checkpoint.active_anti_goal_verification) {
  assert.equal(wall.value, 0)
  assert.equal(wall.threshold, 0)
  assert.equal(wall.verdict, "held")
  assert.match(wall.verification_record_ref, /^workers\/validator-dkr-3\/verification\.json#/)
  assert.notEqual(wall.evidence_ref, wall.verification_record_ref)
}

const resolved = []
for (const path of evidencePaths) {
  const hash = createHash("sha256").update(await readFile(path)).digest("hex")
  assert.ok(checkpoint.evidence_refs_or_hashes.includes(`sha256:${hash}`), path)
  resolved.push(hash)
}
assert.equal(resolved.length, 11)
assert.equal(checkpoint.evidence_refs_or_hashes.length, 11)
assert.equal(checkpoint.wall_gate.verdict, "held")
assert.equal(checkpoint.wall_gate.downstream_advance, "blocked")
assert.equal(checkpoint.reviewer_audit_status, "pending_independent_v2_acceptance")

process.stdout.write(`${JSON.stringify({
  verdict: "replayed",
  traceDimensions: "12/12",
  sameScopeCrossSessionLeakCount: 0,
  forbiddenExportCount: 0,
  terminalSettlementOrder: "2/2",
  projectionSourceCount: 1,
  arbitraryTagEnumerationPathCount: 0,
  publicContextDataCallbackCount: 0,
  liteProjectionChangeCount: 0,
  activeWallsUsingPriorIndependentRecord: "6/6",
  evidenceHashes: "11/11",
  unresolvedEvidenceHashes: 0,
  wallGate: checkpoint.wall_gate,
}, null, 2)}\n`)
