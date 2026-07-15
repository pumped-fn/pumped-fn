import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const surface = JSON.parse(readFileSync(".okra/runs/issue-triage-session-20260715/workers/dkr-4-v3/modeled-surface.json", "utf8"))
const forbiddenPublicNames = new Set(["worker", "WorkerRegistry", "pool", "start", "spawn", "task", "session"])
const modeledNames = [...surface.public_api, ...surface.public_lifecycle_surface]

assert.equal(surface.required_ports.length, 5)
assert.equal(surface.controller_edges.length, 3)
assert.equal(surface.effect_edges.length, 5)
assert.ok(surface.effect_edges.every((edge) => edge.via_required_port === true))
assert.equal(modeledNames.filter((name) => forbiddenPublicNames.has(name)).length, 0)
assert.equal(surface.public_lifecycle_surface.length, 0)
assert.match(surface.graceful_shutdown, /joins every active promise/)
assert.match(surface.forced_context_close, /discovery is accepted/)
assert.match(surface.forced_context_close, /implementation is not authorized/)
assert.match(surface.forced_context_close, /later Lite implementation/)

process.stdout.write(`${JSON.stringify({
  probe: "dkr-4-v3-modeled-surface",
  scanTarget: "modeled-surface.json public_api, public_lifecycle_surface, and effect_edges only",
  checkerFixtureStringsScanned: false,
  explicitRequiredPortCount: surface.required_ports.length,
  declaredControllerEdgeCount: surface.controller_edges.length,
  explicitEffectEdgeCount: surface.effect_edges.length,
  hiddenEffectEdgeCount: surface.effect_edges.filter((edge) => !edge.via_required_port).length,
  forbiddenPublicSurfaceCount: modeledNames.filter((name) => forbiddenPublicNames.has(name)).length,
  publicLifecycleSurfaceCount: surface.public_lifecycle_surface.length,
  gracefulJoin: true,
  dkr2DiscoveryAccepted: true,
  dkr2ImplementationAuthorized: false,
  forcedCloseDependsOnLaterLiteImplementation: true,
})}\n`)
