import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { pathToFileURL } from "node:url"

const run = ".okra/runs/issue-triage-session-20260715"
const candidate = `${run}/workers/dkr-4-v3`
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
  await import(`${pathToFileURL(`${process.cwd()}/${run}/workers/dkr-4-v2/queue-probe.mjs`).href}?validator=dkr-4-v3`)
} finally {
  process.stdout.write = originalWrite
}

const probe = JSON.parse(captured)
const cases = probe.cases
const checkpoint = await readJson(`${candidate}/checkpoint.v3.json`)
const surface = await readJson(`${candidate}/modeled-surface.json`)
const contract = await readJson(`${candidate}/queue-contract.json`)
const dkr2 = await readJson(`${run}/artifacts/accept-dkr-2-v3.json`)
const v2Validation = await readJson(`${run}/workers/validator-dkr-4-v2/verification.json`)
const frame = await readJson(`${run}/frame/frame.v2.json`)
const liteIndex = await readFile("pkg/core/lite/src/index.ts", "utf8")
const auditSource = await readFile(`${run}/workers/validator-dkr-4-v3/independent-same-process.mjs`, "utf8")
const now = new Date()
const ageSeconds = Math.floor((now.getTime() - Date.parse(checkpoint.observed_at)) / 1000)

assert.equal(auditSource.includes("node:child_process"), false)
assert.equal(auditSource.includes("spawnSync"), false)
assert.equal(probe.pass, true)
assert.equal(probe.casePassCount, 8)
assert.equal(probe.caseTarget, 8)
assert.equal(Object.keys(cases).length, 8)
assert.equal(probe.maxObservedConcurrency, 2)
assert.equal(probe.hiddenQueueEffectCount, 0)
assert.equal(probe.hiddenTimerEffectCount, 0)
assert.equal(probe.workerRegistryDispatchCount, 0)
assert.equal(probe.startOrSpawnPrimitiveCount, 0)
assert.equal(probe.publicPoolAbstractionCount, 0)

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
assert.equal(probe.activationExecCount, 13)
assert.equal(probe.handlerStartCount, 13)
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
assert.match(surface.forced_context_close, /implementation is not authorized/)
assert.match(surface.forced_context_close, /later Lite implementation/)

assert.deepEqual(checkpoint.repairs_prior_rejections.map(({ claim_id }) => claim_id), v2Validation.summary.rejected_claim_ids)
assert.equal(checkpoint.repairs_prior_rejections.length, 4)
assert.equal(checkpoint.repairs_prior_rejections.every(({ status }) => status === "repaired_in_v3_candidate"), true)
assert.equal(frame.metric_contracts.anti_goals.max_age, "10m")
assert.equal(checkpoint.max_age, "10m")
assert.equal(checkpoint.active_anti_goal_verification.length, 8)
assert.equal(checkpoint.active_anti_goal_verification.every((wall) => wall.max_age === "10m"), true)
assert.equal(ageSeconds >= 0, true)
assert.equal(ageSeconds <= 600, true)

const evidencePaths = [
  `${run}/workers/dkr-4-v2/queue-probe.mjs`,
  `${candidate}/modeled-surface.json`,
  `${candidate}/surface-probe.mjs`,
  `${candidate}/queue-contract.json`,
  `${candidate}/source-audit.mjs`,
  `${candidate}/replay.sh`,
  `${run}/workers/validator-dkr-4-v2/verification.json`,
  `${run}/artifacts/accept-dkr-2-v3.json`,
  "pkg/core/lite/src/index.ts"
]
const hashes = await Promise.all(evidencePaths.map(sha256))
assert.equal(hashes.length, 9)
assert.deepEqual(new Set(checkpoint.evidence_refs_or_hashes), new Set(hashes.map((hash) => `sha256:${hash}`)))

originalWrite(`${JSON.stringify({
  probe: "validator-dkr-4-v3-independent-same-process",
  observedAt: now.toISOString().replace(/\.\d{3}Z$/, "Z"),
  checkpointAgeSeconds: ageSeconds,
  frameMaxAgeSeconds: 600,
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
  evidenceHashPassCount: 9,
  evidenceHashTarget: 9,
  wallReadPassCount: 8,
  wallReadTarget: 8,
  priorRejectionRepairPassCount: 4,
  priorRejectionRepairTarget: 4,
  absolutePublicContractPassCount: 10,
  absolutePublicContractTarget: 10
})}\n`)
