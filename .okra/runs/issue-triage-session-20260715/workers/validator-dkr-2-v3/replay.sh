#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "$0")/../../../../.." && pwd)"
cd "$repo"

sha256sum --check --strict <<'HASHES'
676cddcfa7ce6f58afd9d97a1bed07de656e6aaa8daacec1a1527da96347c181  .okra/runs/issue-triage-session-20260715/workers/dkr-2-v3/checkpoint.v3.json
71534eec674ae192d7e110dfe07d28e3d5b6153ab0ee9af0e8cde6df9c8d2355  .okra/runs/issue-triage-session-20260715/workers/dkr-2-v3/replay.sh
4e7f888f854b2925b1963557bbad768e928261ef7a76febaf9781d1cfc0c3058  .okra/runs/issue-triage-session-20260715/workers/dkr-2-v3/cancellation-contract.json
14073c31806a973d38aea92a9b9232ad7f63f9ed3e51ff007878f06ae5a37282  .okra/runs/issue-triage-session-20260715/workers/dkr-2-v3/cancellation-probe.mjs
aaeee332a526e3fa93048f708e5d19930eb10d2b0d82bc76e08b5aee87edb4f8  .okra/runs/issue-triage-session-20260715/workers/dkr-2-v3/replay-contract.mjs
71ebed65fb663f27248973e2145d8d49afbc87ad6ed26e0f032b767ffe270b24  .okra/runs/issue-triage-session-20260715/workers/dkr-2-v3/validate-checkpoint-v3.mjs
d1586101411c3397e729e7522dc8d99cf821ac33dfe41b65990f4aea20c4631d  .okra/runs/issue-triage-session-20260715/workers/validator-dkr-2-v3/independent-probe.mjs
a208869ca9eeb3d8f2407d399d01394ed01c86dda46ee2df0b41899f72b86b34  pkg/core/lite/src/types.ts
549e6b4096698a433f5a843dc4851d2ab9743c7b5e77e7497e0205c7d9aa3b0b  pkg/core/lite/src/scope.ts
HASHES

bash .okra/runs/issue-triage-session-20260715/workers/dkr-2-v3/replay.sh
node .okra/runs/issue-triage-session-20260715/workers/validator-dkr-2-v3/independent-probe.mjs

node --input-type=module <<'NODE'
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const contract = JSON.parse(await readFile(
  ".okra/runs/issue-triage-session-20260715/workers/dkr-2-v3/cancellation-contract.json",
  "utf8",
))
const checkpoint = JSON.parse(await readFile(
  ".okra/runs/issue-triage-session-20260715/workers/dkr-2-v3/checkpoint.v3.json",
  "utf8",
))

assert.equal(contract.requiredCaseCount, 16)
assert.equal(contract.passedCaseCount, 16)
assert.equal(contract.classification.signalReasonIdentity, "aborted")
assert.equal(contract.classification.canonicalAbortErrorName, "aborted")
assert.equal(contract.classification.unrelatedPostAbortError, "error")
assert.equal(contract.classification.abortErrorBeforeSignalAbort, "error")
assert.equal(contract.classification.unrelatedErrorIdentityPreserved, true)
assert.equal(contract.originalErrors.postAbortOriginalIdentityPreserved, true)
assert.equal(contract.originalErrors.postAbortOriginalClassification, "error")
assert.equal(contract.callerCoverage.uncoveredCallerCount, 0)
assert.equal(contract.callerCoverage.publicCancelAddedValueCount, 0)
assert.deepEqual(contract.rejectedSurface, [
  "cancel",
  "start",
  "spawn",
  "task handle",
  "worker pool",
  "session semantics",
])
assert.equal(checkpoint.replay_command_or_checker, "bash .okra/runs/issue-triage-session-20260715/workers/dkr-2-v3/replay.sh")
assert.equal(checkpoint.active_anti_goals.length, 5)
assert.equal(checkpoint.active_anti_goal_verification.length, 5)
assert.equal(checkpoint.wall_gate.downstream_advance, "blocked")

process.stdout.write(`${JSON.stringify({
  contractCases: "16/16",
  classificationChallenges: "4/4",
  originalErrorChallenges: "2/2",
  callerCoverageGapCount: 0,
  forbiddenPublicSurfaceCount: 0,
  checkpointWalls: "5/5",
})}\n`)
NODE
