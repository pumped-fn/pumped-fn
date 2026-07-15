import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const surface = JSON.parse(readFileSync(".okra/runs/issue-triage-session-20260715/workers/dkr-4-v2/modeled-surface.json", "utf8"))
const forbiddenPublicNames = new Set(["start", "spawn", "pool", "WorkerRegistry"])
const modeledNames = [...surface.public_api, ...surface.public_lifecycle_surface]

assert.equal(surface.required_ports.length, 5)
assert.equal(surface.controller_edges.length, 3)
assert.equal(surface.effect_edges.length, 5)
assert.ok(surface.effect_edges.every((edge) => edge.via_required_port === true))
assert.equal(modeledNames.filter((name) => forbiddenPublicNames.has(name)).length, 0)
assert.equal(surface.public_lifecycle_surface.length, 0)
assert.match(surface.graceful_shutdown, /joins every active promise/)
assert.match(surface.forced_context_close, /Conditional on accepted DKR-2/)
assert.match(surface.forced_context_close, /not required queue behavior/)

process.stdout.write(`${JSON.stringify({
  probe: "dkr-4-v2-modeled-surface",
  scan_target: "modeled-surface.json public_api, public_lifecycle_surface, and effect_edges only",
  checker_fixture_strings_scanned: false,
  explicit_required_port_count: surface.required_ports.length,
  declared_controller_edge_count: surface.controller_edges.length,
  explicit_effect_edge_count: surface.effect_edges.length,
  hidden_effect_edge_count: surface.effect_edges.filter((edge) => !edge.via_required_port).length,
  forbidden_public_surface_count: modeledNames.filter((name) => forbiddenPublicNames.has(name)).length,
  public_lifecycle_surface_count: surface.public_lifecycle_surface.length,
  graceful_join: true,
  forced_close_conditional_on_dkr_2: true,
})}\n`)
