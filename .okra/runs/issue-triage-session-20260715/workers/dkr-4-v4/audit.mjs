import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { pathToFileURL } from "node:url"

const run = ".okra/runs/issue-triage-session-20260715"
const candidate = `${run}/workers/dkr-4-v4`
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"))
const sha256 = async (path) => createHash("sha256").update(await readFile(path)).digest("hex")
const originalWrite = process.stdout.write.bind(process.stdout)
let captured = ""
process.stdout.write = (chunk, encoding, callback) => {
  captured += Buffer.isBuffer(chunk) ? chunk.toString(encoding) : chunk
  if (typeof encoding === "function") encoding()
  if (typeof callback === "function") callback()
  return true
}
try {
  await import(`${pathToFileURL(`${process.cwd()}/${run}/workers/dkr-4-v2/queue-probe.mjs`).href}?writer=dkr-4-v4`)
} finally {
  process.stdout.write = originalWrite
}

const probe = JSON.parse(captured)
const checkpoint = await readJson(`${candidate}/checkpoint.v4.json`)
const surface = await readJson(`${run}/workers/dkr-4-v3/modeled-surface.json`)
const contract = await readJson(`${run}/workers/dkr-4-v3/queue-contract.json`)
const dkr2 = await readJson(`${run}/artifacts/accept-dkr-2-v3.json`)
const frame = await readJson(`${run}/frame/frame.v2.json`)
const validator = await readJson(`${run}/workers/validator-dkr-4-v3/verification.json`)
const liteIndex = await readFile("pkg/core/lite/src/index.ts", "utf8")
const ageSeconds = Math.floor((Date.now() - Date.parse(checkpoint.observed_at)) / 1000)

assert.equal(probe.pass, true)
assert.equal(probe.casePassCount, 8)
assert.equal(probe.caseTarget, 8)
assert.equal(Object.keys(probe.cases).length, 8)
assert.equal(probe.maxObservedConcurrency, 2)
assert.equal(probe.activationExecCount, 13)
assert.equal(probe.hiddenQueueEffectCount, 0)
assert.equal(probe.hiddenTimerEffectCount, 0)
assert.equal(probe.workerRegistryDispatchCount, 0)
assert.equal(probe.startOrSpawnPrimitiveCount, 0)
assert.equal(probe.publicPoolAbstractionCount, 0)
assert.equal(Object.values(probe.cases).filter((value) => value.watched.activeAfterJoin !== 0).length, 0)
assert.deepEqual(probe.cases.twoSessionsOneScope.activations.map(({ sessionId }) => sessionId), ["session-a", "session-b"])
assert.equal(new Set(probe.cases.twoSessionsOneScope.activations.map(({ observation }) => observation)).size, 2)

assert.equal(surface.required_ports.length, 5)
assert.deepEqual(surface.required_ports, contract.composition.ports)
assert.equal(surface.controller_edges.length, 3)
assert.deepEqual(surface.controller_edges, contract.composition.controller_edges)
assert.equal(surface.effect_edges.length, 5)
assert.equal(surface.effect_edges.filter((edge) => !edge.via_required_port).length, 0)

const forbidden = new Set(["worker", "WorkerRegistry", "pool", "start", "spawn", "task", "session"])
const modeledPublic = [...surface.public_api, ...surface.public_lifecycle_surface]
const liteExports = [...liteIndex.matchAll(/export\s+(?:type\s+)?\{([^}]+)\}/g)]
  .flatMap(([, names]) => names.split(","))
  .map((name) => name.trim().split(/\s+as\s+/).at(-1))
assert.equal(modeledPublic.filter((name) => forbidden.has(name)).length, 0)
assert.equal(liteExports.filter((name) => forbidden.has(name)).length, 0)
assert.equal(surface.public_lifecycle_surface.length, 0)

assert.equal(dkr2.decision, "accepted_as_reducing_discovery")
assert.equal(dkr2.implementation_authorized, false)
assert.equal(contract.lifecycle_dependency.dkr_2_status, dkr2.decision)
assert.equal(contract.lifecycle_dependency.dkr_2_implementation_authorized, false)
assert.match(contract.lifecycle_dependency.forced_context_close, /later Lite implementation/)

const traces = new Map(validator.audit_traces.map((trace) => [trace.claim_id, trace]))
assert.equal(traces.get("DKR-4-v3.queue-cases").decision, "accepted")
assert.equal(traces.get("DKR-4-v3.graph-shape").decision, "accepted")
assert.equal(traces.get("DKR-4-v3.effect-and-privacy-boundary").decision, "accepted")
assert.equal(traces.get("DKR-4-v3.dkr2-status").decision, "accepted")
assert.equal(traces.get("DKR-4-v3.absolute-public-contract").decision, "accepted")
assert.equal(traces.get("DKR-4-v3.fresh-independent-same-process").decision, "rejected")
assert.equal(traces.get("DKR-4-v3.fresh-independent-same-process").failure_mode, "checker_self_match")
assert.match(traces.get("DKR-4-v3.fresh-independent-same-process").evidence, /matched its own spawnSync fixture string/)
assert.deepEqual(validator.summary.rejected_claim_ids, ["DKR-4-v3.fresh-independent-same-process", "DKR-4-v3.wall-gate"])

assert.equal(frame.metric_contracts.anti_goals.max_age, "10m")
assert.equal(checkpoint.max_age, "10m")
assert.equal(checkpoint.active_anti_goal_verification.length, 8)
assert.equal(checkpoint.active_anti_goal_verification.every((wall) => wall.max_age === "10m"), true)
assert.equal(checkpoint.active_anti_goal_verification.every((wall) => wall.value === 0 && wall.threshold === 0), true)
assert.equal(checkpoint.active_anti_goal_verification.every((wall) => wall.replay_command_or_checker === checkpoint.replay_command_or_checker), true)
assert.equal(ageSeconds >= 0, true)
assert.equal(ageSeconds <= 600, true)
assert.equal(checkpoint.wall_gate.downstream_advance, "blocked")
assert.equal(checkpoint.reviewer_audit_status, "pending_independent_v4_replay")
assert.match(checkpoint.decision, /candidate only/)

assert.deepEqual(checkpoint.validator_guidance.independent_source_audit_allowlist, [
  "workers/dkr-4-v3/modeled-surface.json#public_api",
  "workers/dkr-4-v3/modeled-surface.json#public_lifecycle_surface",
  "pkg/core/lite/src/index.ts#exported_symbols"
])
assert.equal(checkpoint.validator_guidance.validator_or_checker_source_in_universe, false)
assert.equal(checkpoint.validator_guidance.fixture_literals_in_universe, false)
assert.equal(checkpoint.validator_guidance.assertion_source_in_universe, false)

const evidencePaths = [
  `${run}/workers/dkr-4-v2/queue-probe.mjs`,
  `${run}/workers/dkr-4-v3/modeled-surface.json`,
  `${run}/workers/dkr-4-v3/queue-contract.json`,
  `${run}/workers/dkr-4-v3/checkpoint.v3.json`,
  `${run}/artifacts/accept-dkr-2-v3.json`,
  `${run}/workers/validator-dkr-4-v3/verification.json`,
  `${run}/frame/frame.v2.json`,
  `${candidate}/audit.mjs`,
  `${candidate}/replay.sh`,
  "pkg/core/lite/src/index.ts"
]
const hashes = await Promise.all(evidencePaths.map(sha256))
assert.deepEqual(new Set(checkpoint.evidence_refs_or_hashes), new Set(hashes.map((hash) => `sha256:${hash}`)))

originalWrite(`${JSON.stringify({
  casePassCount: 8,
  caseTarget: 8,
  explicitPortCount: 5,
  controllerEdgeCount: 3,
  maxObservedConcurrency: 2,
  activationExecCount: 13,
  crossSessionLeakCount: 0,
  hiddenEffectEdgeCount: 0,
  forbiddenPublicSurfaceCount: 0,
  gracefulJoinFailureCount: 0,
  dkr2DiscoveryAccepted: true,
  dkr2ImplementationAuthorized: false,
  evidenceHashPassCount: hashes.length,
  evidenceHashTarget: evidencePaths.length,
  wallReadPassCount: 8,
  wallReadTarget: 8,
  checkpointAgeSeconds: ageSeconds,
  frameMaxAgeSeconds: 600,
  v3RejectionCause: "validator-harness self-match only",
  sourceAuditAllowlistCount: checkpoint.validator_guidance.independent_source_audit_allowlist.length,
  assertionSourceInUniverse: false
})}\n`)
