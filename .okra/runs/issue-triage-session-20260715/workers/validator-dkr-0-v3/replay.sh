#!/usr/bin/env bash
set -u

repo="$(cd "$(dirname "$0")/../../../../.." && pwd)"
cd "$repo"

sha256sum --check --strict <<'HASHES'
5706cf7a54ff9282cec4697c54df19cd41d356be9a8ba5d72e0ddf9f196f9bd1  .okra/runs/issue-triage-session-20260715/artifacts/dkr-0-current-pr-checkpoint.v3.json
422669bfa0769c52da1aa85c690dff3c92a0af944dd1413e1e613cf089b682b6  .okra/runs/issue-triage-session-20260715/artifacts/dkr-0-disposition-matrix.v3.json
98b74d03af507f21133d74644b9c3dc2d2c3136641162af05e0b6994db37ff5b  .okra/runs/issue-triage-session-20260715/artifacts/dkr-0-disposition-replay.v3.json
90ddad78e6793c7811152d084e95f62f8d3f02d3554f5754103bcc5ff0c473d7  .okra/runs/issue-triage-session-20260715/artifacts/dkr-0-regression-gates.v3.json
51dc235c8c65ff526a6ca90a8652f0542503218229b96aa2ad0e3673d5d7fc54  .okra/runs/issue-triage-session-20260715/artifacts/dkr-0-slop-gate.v3.json
54cca4dca4c441f97206ec7cd2abcf32efcfd966f582271aa5cf39c98565b259  .okra/runs/issue-triage-session-20260715/replay/dkr-0-disposition-v3.sh
d4f8405f073c05fe13a3929c372b6338b389b6c749b56e51edfb866c1b4957f6  .okra/runs/issue-triage-session-20260715/replay/dkr-0-regression-v3.sh
7bfbd6cc1a8c3ed9e1e55a0422896ee03d09a111f8bd6c89ac3306f1dd033e81  .okra/runs/issue-triage-session-20260715/replay/dkr-0-slop-v3.sh
8a21f143c6d009d84632c360ec1a3073a26e2caef215886c8c3ac7a50f280cd0  .okra/runs/issue-triage-session-20260715/frame/frame.v2.json
a10313a592fccc6143d4f4facb14445bcd0f559293e6b39d8ae8a102ea65d117  pkg/sdk/core/src/index.ts
78b6500dee31b501644f3a528149e2efb3cb8f684a59373071cf9fdc5f5cfe06  pkg/sdk/core/src/session.ts
3ced706ab034dc9c9e616d967c21bbdab78a130905572e5d2ecadf4b82f4c72d  pkg/sdk/codex/src/index.ts
904ccb93eabbc21ed8a3121e91f0eaf286c5ec6bbc05c4074e7bca64e210eb8c  pkg/sdk/codex/tests/codex.acp.test.ts
1670af50c3d86e89340fb109881f00cc49aa5c1e2eada5a35b9ed98fe2360458  pkg/sdk/core/tests/package-exports.test.ts
HASHES

bash .okra/runs/issue-triage-session-20260715/replay/dkr-0-disposition-v3.sh
bash .okra/runs/issue-triage-session-20260715/replay/dkr-0-slop-v3.sh

node --input-type=module <<'NODE'
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const run = ".okra/runs/issue-triage-session-20260715"
const matrix = JSON.parse(readFileSync(`${run}/artifacts/dkr-0-disposition-matrix.v3.json`, "utf8"))
const checkpoint = JSON.parse(readFileSync(`${run}/artifacts/dkr-0-current-pr-checkpoint.v3.json`, "utf8"))
const regression = JSON.parse(readFileSync(`${run}/artifacts/dkr-0-regression-gates.v3.json`, "utf8"))
const slop = JSON.parse(readFileSync(`${run}/artifacts/dkr-0-slop-gate.v3.json`, "utf8"))
const rows = matrix.files.flatMap((file) => file.public_concepts.map((concept) => ({ path: file.path, ...concept })))
const row = (path, id) => rows.find((candidate) => candidate.path === path && candidate.id === id)
const expectedGates = [
  "build-core", "build-bash", "build-claude", "build-codex", "build-pi", "build-test",
  "typecheck-core", "typecheck-bash", "typecheck-claude", "typecheck-codex", "typecheck-pi", "typecheck-test",
  "test-core", "test-bash", "test-claude", "test-codex", "test-pi", "test-test",
  "typecheck-framework-pumped", "typecheck-framework-pumped-tests", "test-framework-pumped",
  "typecheck-invoice-triage", "test-invoice-triage",
]

assert.equal(row("pkg/sdk/core/src/session.ts", "session-resource-pre-resolution")?.disposition, "keep")
assert.equal(row("pkg/sdk/core/src/session.ts", "session-resource-pre-resolution")?.rule_ids.includes("X-PRE-RESOLVE"), false)
assert.equal(row("pkg/sdk/core/src/index.ts", "workflow-state-and-extension")?.disposition, "keep")
assert.equal(row("pkg/sdk/core/src/index.ts", "worker-registry-runtime-delegation")?.disposition, "reshape")
assert.equal(row("pkg/sdk/core/src/index.ts", "material-state-and-patching")?.disposition, "keep")
assert.equal(row("pkg/sdk/core/src/index.ts", "cli-worker-and-direct-process-execution")?.disposition, "reshape")
assert.deepEqual(rows.filter(({ disposition }) => disposition === "remove").map(({ path, id }) => [path, id]), [
  ["pkg/sdk/bash/src/index.ts", "abort-tag-bridge"],
  ["pkg/sdk/core/src/index.ts", "sdk-abort-signal-tag"],
  ["pkg/sdk/core/src/session.ts", "cleanup-begin-finish-transition"],
  ["pkg/sdk/pi/src/index.ts", "pi-abort-tag-bridge"],
])
assert.deepEqual(regression.gates.map(({ id }) => id), expectedGates)
assert.equal(new Set(regression.gates.map(({ id }) => id)).size, 23)
assert.equal(regression.gates.filter(({ exit_code }) => exit_code === 0).length, 21)
assert.deepEqual(regression.failed_gate_ids, ["test-core", "test-codex"])
assert.equal(slop.lint_diagnostic_count, 72)
assert.equal(slop.lint_diagnostics_by_rule.reduce((count, entry) => count + entry.count, 0), 72)
assert.equal(slop.agents_audit_violation_count, 2)
assert.equal(checkpoint.active_anti_goal_verification.length, 5)
assert.equal(checkpoint.wall_gate.downstream_advance, "blocked")
assert.ok(Date.now() - Date.parse(checkpoint.observed_at) > 10 * 60 * 1000)

console.log(JSON.stringify({
  correctedConceptFamilies: "3/3",
  removeRows: "4/4",
  savedGates: "23/23",
  rawLintDiagnostics: 72,
  graphViolations: 2,
  checkpointFreshness: "stale",
}))
NODE

core_log="$(mktemp)"
codex_log="$(mktemp)"
pack_log="$(mktemp)"
trap 'rm -f "$core_log" "$codex_log" "$pack_log"' EXIT

(cd pkg/sdk/core && ../../../node_modules/.bin/vitest run) >"$core_log" 2>&1
core_exit=$?
(cd pkg/sdk/core && npm pack --json --dry-run) >"$pack_log" 2>&1
pack_exit=$?
(cd pkg/sdk/codex && ../../../node_modules/.bin/vitest run) >"$codex_log" 2>&1
codex_exit=$?

test "$core_exit" -eq 1
test "$pack_exit" -eq 226
grep -Fq 'npm error code EROFS' "$pack_log"
grep -Fq '/home/lagz0ne/.npm/_cacache/tmp/' "$pack_log"
test "$codex_exit" -eq 1
grep -Fq '10 failed' "$codex_log"
grep -Fq 'Unhandled Rejection' "$codex_log"
grep -Fq 'Error: ACP connection closed' "$codex_log"

git diff --name-status main...HEAD -- pkg/sdk/core/tests/package-exports.test.ts pkg/sdk/core/package.json pkg/sdk/codex/src/index.ts pkg/sdk/codex/tests/codex.acp.test.ts
printf '%s\n' '{"testCore":"environment-only EROFS","testCodex":"confirmed touched defect","classifiedTouchedRegressionCount":1,"lintFileGrouping":"rejected unsupported"}'
