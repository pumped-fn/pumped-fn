import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
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
const output = execFileSync(process.execPath, [`${candidate}/queue-probe.mjs`], { encoding: "utf8" })
const probe = JSON.parse(output)
const cases = probe.cases

assert.equal(probe.pass, true)
assert.equal(probe.casePassCount, 8)
assert.equal(probe.caseTarget, 8)
assert.deepEqual(Object.keys(cases), [
  "zeroMessages",
  "oneMessage",
  "burstAboveConcurrency",
  "handlerError",
  "acknowledgementError",
  "leaseLossRetry",
  "shutdownWhileActive",
  "twoSessionsOneScope",
])

assert.equal(cases.zeroMessages.activations.length, 0)
assert.deepEqual(cases.zeroMessages.watched.results, [])
assert.deepEqual(cases.oneMessage.watched.results, [{ deliveryId: "issue-1", status: "acknowledged" }])
assert.equal(cases.burstAboveConcurrency.activationMax, 2)
assert.equal(cases.burstAboveConcurrency.activations.length, 5)
assert.ok(cases.burstAboveConcurrency.watched.backpressureCount > 0)
assert.deepEqual(cases.handlerError.rejected, [{ id: "issue-1", attempt: 1, reason: "handler-error" }])
assert.deepEqual(cases.acknowledgementError.rejected, [{ id: "issue-1", attempt: 1, reason: "acknowledgement-error" }])
assert.deepEqual(cases.leaseLossRetry.activations.map(({ lease }) => lease), ["lease:issue-1:1", "lease:issue-1:2"])
assert.deepEqual(cases.leaseLossRetry.watched.results.map(({ status }) => status), ["lease-lost", "acknowledged"])
assert.deepEqual(cases.shutdownWhileActive.receives, ["delivery", "shutdown"])
assert.deepEqual(cases.shutdownWhileActive.handlerEnds, ["issue-1"])

let activationCount = 0
let terminalPortCount = 0
for (const value of Object.values(cases)) {
  assert.equal(value.watched.activeAfterJoin, 0)
  assert.ok(value.activationMax <= 2)
  assert.equal(value.activations.length, value.handlerStarts.length)
  assert.equal(new Set(value.activations.map(({ lease }) => lease)).size, value.activations.length)
  assert.equal(value.watched.results.length, value.activations.length)
  assert.equal(value.acknowledged.length + value.rejected.length, value.activations.length)
  activationCount += value.activations.length
  terminalPortCount += value.acknowledged.length + value.rejected.length
}
assert.equal(activationCount, 13)
assert.equal(terminalPortCount, 13)
assert.equal(probe.activationExecCount, 13)
assert.equal(probe.handlerStartCount, 13)
assert.equal(probe.maxObservedConcurrency, 2)

const sessionActivations = cases.twoSessionsOneScope.activations
assert.deepEqual(sessionActivations.map(({ sessionId }) => sessionId), ["session-a", "session-b"])
assert.deepEqual(sessionActivations.map(({ issue }) => issue), [41, 42])
assert.deepEqual(sessionActivations.map(({ lease }) => lease), ["lease:issue-1:1", "lease:issue-2:1"])
assert.equal(new Set(sessionActivations.map(({ observation }) => observation)).size, 2)
assert.deepEqual(cases.twoSessionsOneScope.watched.results, [
  { deliveryId: "issue-1", status: "acknowledged" },
  { deliveryId: "issue-2", status: "acknowledged" },
])

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
assert.equal(modeledPublic.filter((name) => forbidden.has(name)).length, 0)
const liteExports = [...liteIndex.matchAll(/export\s+(?:type\s+)?\{([^}]+)\}/g)]
  .flatMap(([, names]) => names.split(","))
  .map((name) => name.trim().split(/\s+as\s+/).at(-1))
assert.equal(liteExports.filter((name) => forbidden.has(name)).length, 0)
assert.equal(surface.public_lifecycle_surface.length, 0)
assert.match(surface.graceful_shutdown, /joins every active promise/)
assert.match(surface.forced_context_close, /accepted DKR-2 discovery and later Lite implementation/)

assert.equal(surfaceSource.includes("readFileSync(\".okra/runs/issue-triage-session-20260715/workers/dkr-4-v2/modeled-surface.json\""), true)
assert.equal(surfaceSource.includes("readFileSync(import.meta.url"), false)
assert.equal(contract.surface_scan.target, "modeled-surface.json only")
assert.equal(contract.surface_scan.checker_fixture_strings_scanned, false)

assert.equal(dkr2Acceptance.decision, "accepted_as_reducing_discovery")
assert.equal(dkr2Acceptance.implementation_authorized, false)
assert.equal(contract.lifecycle_dependency.forced_context_close, "Depends on accepted DKR-2 discovery and later Lite implementation; it is not required queue behavior today.")
assert.notEqual(contract.lifecycle_dependency.dkr_2_status, "accepted_as_reducing_discovery")
assert.ok(checkpoint.questions_unanswered.some((question) => question.includes("DKR-2 forced-close discovery is not accepted")))

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
  independentCasePassCount: 8,
  independentCaseTarget: 8,
  activationExecCount: activationCount,
  terminalPortCount,
  maxObservedConcurrency: probe.maxObservedConcurrency,
  crossSessionLeakCount: 0,
  explicitRequiredPortCount: surface.required_ports.length,
  declaredControllerEdgeCount: surface.controller_edges.length,
  hiddenEffectEdgeCount: 0,
  forbiddenModeledPublicSurfaceCount: modeledPublic.filter((name) => forbidden.has(name)).length,
  forbiddenLiteExportCount: liteExports.filter((name) => forbidden.has(name)).length,
  fixtureSelfMatchCount: 0,
  gracefulJoinCaseCount: Object.values(cases).filter(({ watched }) => watched.activeAfterJoin === 0).length,
  evidenceHashMatchCount: evidencePaths.length,
  evidenceHashTarget: evidencePaths.length,
  dkr2DiscoveryAccepted: true,
  dkr2ImplementationAuthorized: false,
  candidateDkr2StatusContradictionCount: 2,
})}\n`)
