import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"

const run = ".okra/runs/issue-triage-session-20260715"
const candidate = `${run}/workers/dkr-4-v2`
const source = readFileSync(`${candidate}/queue-probe.mjs`, "utf8")
const surfaceSource = readFileSync(`${candidate}/surface-probe.mjs`, "utf8")
const surface = JSON.parse(readFileSync(`${candidate}/modeled-surface.json`, "utf8"))
const contract = JSON.parse(readFileSync(`${candidate}/queue-contract.json`, "utf8"))
const checkpoint = JSON.parse(readFileSync(`${candidate}/checkpoint.v2.json`, "utf8"))
const liteIndex = readFileSync("pkg/core/lite/src/index.ts", "utf8")
const dkr2Acceptance = JSON.parse(readFileSync(`${run}/artifacts/accept-dkr-2-v3.json`, "utf8"))

assert.deepEqual(surface.required_ports, [
  "queue.receive",
  "queue.acknowledge",
  "queue.reject",
  "queue.leaseValid",
  "timer.wait",
])
assert.deepEqual(surface.controller_edges, [
  "watch -> runDelivery",
  "runDelivery -> activate",
  "activate -> triage",
])
assert.equal(surface.effect_edges.length, 5)
assert.ok(surface.effect_edges.every(({ via_required_port }) => via_required_port === true))
assert.equal((source.match(/controller\(/g) ?? []).length, 3)
assert.equal((source.match(/tags\.required\((?:queue\.(?:receive|acknowledge|reject|leaseValid)|timer\.wait)\)/g) ?? []).length, 5)
assert.equal((source.match(/queueMicrotask\(/g) ?? []).length, 1)
const receiveAdapter = source.slice(source.indexOf("  const receive = flow({"), source.indexOf("  const acknowledge = flow({"))
assert.match(receiveAdapter, /queueMicrotask\(\(\) => slow\.resolve\(\)\)/)
assert.doesNotMatch(source, /from ["']node:(?:child_process|net|http|https)["']/)
assert.doesNotMatch(source, /\b(?:fetch|setTimeout|setInterval)\s*\(/)

const forbidden = new Set(["worker", "WorkerRegistry", "pool", "start", "spawn", "task", "session"])
const modeledPublic = [...surface.public_api, ...surface.public_lifecycle_surface]
const liteExports = [...liteIndex.matchAll(/export\s+(?:type\s+)?\{([^}]+)\}/g)]
  .flatMap(([, names]) => names.split(","))
  .map((name) => name.trim().split(/\s+as\s+/).at(-1))
assert.equal(modeledPublic.filter((name) => forbidden.has(name)).length, 0)
assert.equal(liteExports.filter((name) => forbidden.has(name)).length, 0)
assert.equal(surface.public_lifecycle_surface.length, 0)
assert.match(surface.graceful_shutdown, /joins every active promise/)
assert.match(surface.forced_context_close, /accepted DKR-2 discovery and later Lite implementation/)

assert.match(surfaceSource, /readFileSync\("\.okra\/runs\/issue-triage-session-20260715\/workers\/dkr-4-v2\/modeled-surface\.json"/)
assert.doesNotMatch(surfaceSource, /readFileSync\(import\.meta\.url/)
assert.equal(contract.surface_scan.target, "modeled-surface.json only")
assert.equal(contract.surface_scan.checker_fixture_strings_scanned, false)

assert.equal(dkr2Acceptance.decision, "accepted_as_reducing_discovery")
assert.equal(dkr2Acceptance.implementation_authorized, false)
assert.equal(contract.lifecycle_dependency.forced_context_close, "Depends on accepted DKR-2 discovery and later Lite implementation; it is not required queue behavior today.")
assert.notEqual(contract.lifecycle_dependency.dkr_2_status, dkr2Acceptance.decision)
assert.ok(checkpoint.questions_unanswered.some((question) => question.includes("DKR-2 forced-close discovery is not accepted")))

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
const requiredWallFields = [
  "metric_id",
  "source_of_truth",
  "read_method",
  "observed_at",
  "recorded_at",
  "max_age",
  "freshness_status",
  "value",
  "threshold",
  "comparator",
  "verdict",
  "evidence_ref",
  "replay_command_or_checker",
  "verification_record_ref",
]
assert.ok(requiredCheckpointFields.every((field) => checkpoint[field] !== undefined))
assert.equal(checkpoint.active_anti_goals.length, 8)
assert.equal(checkpoint.active_anti_goal_verification.length, 8)
assert.ok(checkpoint.active_anti_goal_verification.every((wall) => requiredWallFields.every((field) => wall[field] !== undefined)))
assert.ok(checkpoint.active_anti_goal_verification.every((wall) => typeof wall.value === "number" && typeof wall.threshold === "number"))
assert.equal(checkpoint.wall_gate.downstream_advance, "blocked")

const evidencePaths = [
  `${candidate}/queue-probe.mjs`,
  `${candidate}/modeled-surface.json`,
  `${candidate}/surface-probe.mjs`,
  `${candidate}/queue-contract.json`,
  `${candidate}/replay.sh`,
  `${run}/workers/validator-dkr-4/verification.json`,
  `${run}/workers/dkr-2-v3/cancellation-contract.json`,
  "pkg/core/lite/src/scope.ts",
]
for (const path of evidencePaths) {
  const hash = createHash("sha256").update(readFileSync(path)).digest("hex")
  assert.ok(checkpoint.evidence_refs_or_hashes.includes(`sha256:${hash}`), path)
}

process.stdout.write(`${JSON.stringify({
  explicitRequiredPortCount: surface.required_ports.length,
  declaredControllerEdgeCount: surface.controller_edges.length,
  explicitEffectEdgeCount: surface.effect_edges.length,
  hiddenEffectEdgeCount: 0,
  forbiddenModeledPublicSurfaceCount: modeledPublic.filter((name) => forbidden.has(name)).length,
  forbiddenLiteExportCount: liteExports.filter((name) => forbidden.has(name)).length,
  fixtureSelfMatchCount: 0,
  checkpointFieldCount: requiredCheckpointFields.length,
  checkpointFieldTarget: requiredCheckpointFields.length,
  wallEntryCount: checkpoint.active_anti_goal_verification.length,
  wallEntryTarget: 8,
  evidenceHashMatchCount: evidencePaths.length,
  evidenceHashTarget: evidencePaths.length,
  dkr2DiscoveryAccepted: true,
  dkr2ImplementationAuthorized: false,
  candidateDkr2StatusContradictionCount: 2,
})}\n`)
