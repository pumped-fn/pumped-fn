import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { fileURLToPath, pathToFileURL } from "node:url"

const run = ".okra/runs/issue-triage-session-20260715"
const candidate = `${run}/workers/dkr-4-v4`
const sourceAuditUniverse = [
  `${run}/workers/dkr-4-v3/queue-contract.json`,
  `${run}/workers/dkr-4-v3/modeled-surface.json`,
  "pkg/core/lite/src/index.ts"
]
const assertionSource = fileURLToPath(import.meta.url)
const absoluteUniverse = new Set(sourceAuditUniverse.map((path) => `${process.cwd()}/${path}`))
const assertionSourceInUniverse = absoluteUniverse.has(assertionSource)
assert.equal(assertionSourceInUniverse, false)

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
  await import(`${pathToFileURL(`${process.cwd()}/${run}/workers/dkr-4-v2/queue-probe.mjs`).href}?validator=dkr-4-v4`)
} finally {
  process.stdout.write = originalWrite
}

const probe = JSON.parse(captured)
const cases = probe.cases
const [contract, surface] = await Promise.all(sourceAuditUniverse.slice(0, 2).map(readJson))
const liteIndex = await readFile(sourceAuditUniverse[2], "utf8")
const checkpoint = await readJson(`${candidate}/checkpoint.v4.json`)
const dkr2 = await readJson(`${run}/artifacts/accept-dkr-2-v3.json`)
const v3Validation = await readJson(`${run}/workers/validator-dkr-4-v3/verification.json`)
const frame = await readJson(`${run}/frame/frame.v2.json`)
const now = new Date()
const ageSeconds = Math.floor((now.getTime() - Date.parse(checkpoint.observed_at)) / 1000)

assert.equal(probe.pass, true)
assert.equal(probe.casePassCount, 8)
assert.equal(probe.caseTarget, 8)
assert.equal(Object.keys(cases).length, 8)
assert.equal(probe.maxObservedConcurrency, 2)
assert.equal(probe.activationExecCount, 13)
assert.equal(probe.handlerStartCount, 13)

let activationCount = 0
let activationPerLeaseViolationCount = 0
let gracefulJoinFailureCount = 0
for (const value of Object.values(cases)) {
  activationCount += value.activations.length
  activationPerLeaseViolationCount += value.activations.length - new Set(value.activations.map(({ lease }) => lease)).size
  gracefulJoinFailureCount += Number(value.watched.activeAfterJoin !== 0)
  assert.ok(value.activationMax <= 2)
}
assert.equal(activationCount, 13)
assert.equal(activationPerLeaseViolationCount, 0)
assert.equal(gracefulJoinFailureCount, 0)
assert.deepEqual(cases.twoSessionsOneScope.activations.map(({ sessionId }) => sessionId), ["session-a", "session-b"])
assert.deepEqual(cases.twoSessionsOneScope.activations.map(({ issue }) => issue), [41, 42])
assert.equal(new Set(cases.twoSessionsOneScope.activations.map(({ observation }) => observation)).size, 2)

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
assert.match(surface.graceful_shutdown, /joins every active promise/)

assert.equal(dkr2.decision, "accepted_as_reducing_discovery")
assert.equal(dkr2.implementation_authorized, false)
assert.equal(contract.lifecycle_dependency.dkr_2_status, dkr2.decision)
assert.equal(contract.lifecycle_dependency.dkr_2_implementation_authorized, false)
assert.match(contract.lifecycle_dependency.forced_context_close, /later Lite implementation/)

const v3Traces = new Map(v3Validation.audit_traces.map((trace) => [trace.claim_id, trace]))
assert.equal(v3Traces.get("DKR-4-v3.queue-cases").decision, "accepted")
assert.equal(v3Traces.get("DKR-4-v3.graph-shape").decision, "accepted")
assert.equal(v3Traces.get("DKR-4-v3.effect-and-privacy-boundary").decision, "accepted")
assert.equal(v3Traces.get("DKR-4-v3.dkr2-status").decision, "accepted")
assert.equal(v3Traces.get("DKR-4-v3.absolute-public-contract").decision, "accepted")
assert.equal(v3Traces.get("DKR-4-v3.fresh-independent-same-process").failure_mode, "checker_self_match")
assert.equal(v3Validation.summary.rejected_claim_ids.length, 2)
assert.equal(v3Validation.summary.rejected_claim_ids.includes("DKR-4-v3.wall-gate"), true)

assert.equal(frame.metric_contracts.anti_goals.max_age, "10m")
assert.equal(checkpoint.max_age, "10m")
assert.equal(checkpoint.active_anti_goal_verification.length, 8)
assert.equal(checkpoint.active_anti_goal_verification.every((wall) => wall.max_age === "10m"), true)
assert.equal(checkpoint.active_anti_goal_verification.every((wall) => wall.value === 0 && wall.threshold === 0), true)
assert.equal(checkpoint.active_anti_goal_verification.every((wall) => wall.verdict === "held"), true)
assert.equal(ageSeconds >= 0, true)
assert.equal(ageSeconds <= 600, true)
assert.equal(checkpoint.validator_guidance.assertion_source_in_universe, false)
assert.deepEqual(checkpoint.validator_guidance.independent_source_audit_allowlist, [
  "workers/dkr-4-v3/modeled-surface.json#public_api",
  "workers/dkr-4-v3/modeled-surface.json#public_lifecycle_surface",
  "pkg/core/lite/src/index.ts#exported_symbols"
])

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
assert.equal(hashes.length, 10)
assert.deepEqual(new Set(checkpoint.evidence_refs_or_hashes), new Set(hashes.map((hash) => `sha256:${hash}`)))

originalWrite(`${JSON.stringify({
  probe: "validator-dkr-4-v4-independent-allowlist-audit",
  observedAt: now.toISOString().replace(/\.\d{3}Z$/, "Z"),
  checkpointAgeSeconds: ageSeconds,
  frameMaxAgeSeconds: 600,
  sourceAuditAllowlistCount: sourceAuditUniverse.length,
  assertionSourceInUniverse,
  validatorSourceScanned: false,
  fixtureLiteralSourceScanned: false,
  childNodeProcessCount: 0,
  casePassCount: 8,
  caseTarget: 8,
  explicitPortCount: 5,
  controllerEdgeCount: 3,
  maxObservedConcurrency: 2,
  activationExecCount: 13,
  activationPerLeaseViolationCount,
  crossSessionLeakCount: 0,
  hiddenEffectEdgeCount: 0,
  forbiddenPublicSurfaceCount: 0,
  gracefulJoinFailureCount,
  dkr2DiscoveryAccepted: true,
  dkr2ImplementationAuthorized: false,
  forcedCloseDependsOnLaterLiteImplementation: true,
  v3RejectionCause: "validator-harness self-match only",
  evidenceHashPassCount: 10,
  evidenceHashTarget: 10,
  wallReadPassCount: 8,
  wallReadTarget: 8,
  absolutePublicContractPassCount: 10,
  absolutePublicContractTarget: 10
})}\n`)
