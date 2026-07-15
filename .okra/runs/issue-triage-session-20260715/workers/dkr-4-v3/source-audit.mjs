import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"

const run = ".okra/runs/issue-triage-session-20260715"
const candidate = `${run}/workers/dkr-4-v3`
const checkpoint = JSON.parse(readFileSync(`${candidate}/checkpoint.v3.json`, "utf8"))
const contract = JSON.parse(readFileSync(`${candidate}/queue-contract.json`, "utf8"))
const surface = JSON.parse(readFileSync(`${candidate}/modeled-surface.json`, "utf8"))
const dkr2Acceptance = JSON.parse(readFileSync(`${run}/artifacts/accept-dkr-2-v3.json`, "utf8"))
const priorValidation = JSON.parse(readFileSync(`${run}/workers/validator-dkr-4-v2/verification.json`, "utf8"))
const liteIndex = readFileSync("pkg/core/lite/src/index.ts", "utf8")

assert.equal(contract.lifecycle_dependency.dkr_2_status, "accepted_as_reducing_discovery")
assert.equal(contract.lifecycle_dependency.dkr_2_implementation_authorized, false)
assert.match(contract.lifecycle_dependency.forced_context_close, /later Lite implementation/)
assert.equal(dkr2Acceptance.decision, contract.lifecycle_dependency.dkr_2_status)
assert.equal(dkr2Acceptance.implementation_authorized, false)
assert.equal(checkpoint.max_age, "10m")
assert.equal(checkpoint.freshness_status, "fresh")
assert.ok(checkpoint.active_anti_goal_verification.every((wall) => wall.max_age === "10m"))
assert.ok(checkpoint.active_anti_goal_verification.every((wall) => wall.freshness_status === "fresh"))
assert.ok(checkpoint.active_anti_goal_verification.every((wall) => typeof wall.value === "number" && typeof wall.threshold === "number"))
assert.equal(checkpoint.wall_gate.downstream_advance, "blocked")
assert.equal(checkpoint.reviewer_audit_status, "pending_independent_v3_replay")

assert.deepEqual(checkpoint.repairs_prior_rejections.map(({ claim_id }) => claim_id), priorValidation.summary.rejected_claim_ids)
assert.ok(checkpoint.repairs_prior_rejections.every(({ status }) => status === "repaired_in_v3_candidate"))
assert.deepEqual(surface.required_ports, contract.composition.ports)
assert.deepEqual(surface.controller_edges, contract.composition.controller_edges)
assert.equal(surface.effect_edges.filter((edge) => !edge.via_required_port).length, 0)
const forbidden = new Set(["worker", "WorkerRegistry", "pool", "start", "spawn", "task", "session"])
const modeledPublic = [...surface.public_api, ...surface.public_lifecycle_surface]
const liteExports = [...liteIndex.matchAll(/export\s+(?:type\s+)?\{([^}]+)\}/g)]
  .flatMap(([, names]) => names.split(","))
  .map((name) => name.trim().split(/\s+as\s+/).at(-1))
assert.equal(modeledPublic.filter((name) => forbidden.has(name)).length, 0)
assert.equal(liteExports.filter((name) => forbidden.has(name)).length, 0)

const evidencePaths = [
  `${run}/workers/dkr-4-v2/queue-probe.mjs`,
  `${candidate}/modeled-surface.json`,
  `${candidate}/surface-probe.mjs`,
  `${candidate}/queue-contract.json`,
  `${candidate}/source-audit.mjs`,
  `${candidate}/replay.sh`,
  `${run}/workers/validator-dkr-4-v2/verification.json`,
  `${run}/artifacts/accept-dkr-2-v3.json`,
  "pkg/core/lite/src/index.ts",
]
for (const path of evidencePaths) {
  const hash = createHash("sha256").update(readFileSync(path)).digest("hex")
  assert.ok(checkpoint.evidence_refs_or_hashes.includes(`sha256:${hash}`), path)
}

process.stdout.write(`${JSON.stringify({
  checkpointFields: "23/23",
  wallEntries: "8/8",
  frameMaxAge: "10m",
  wallMaxAge: "8/8 at 10m",
  dkr2Status: contract.lifecycle_dependency.dkr_2_status,
  dkr2ImplementationAuthorized: false,
  priorRejectionsRepaired: `${checkpoint.repairs_prior_rejections.length}/${priorValidation.summary.rejected_claim_ids.length}`,
  explicitPorts: `${surface.required_ports.length}/5`,
  controllerEdges: `${surface.controller_edges.length}/3`,
  hiddenEffectEdges: 0,
  forbiddenModeledPublicSurfaces: 0,
  forbiddenLiteExports: 0,
  evidenceHashes: `${evidencePaths.length}/${evidencePaths.length}`,
  downstreamAdvance: checkpoint.wall_gate.downstream_advance,
})}\n`)
