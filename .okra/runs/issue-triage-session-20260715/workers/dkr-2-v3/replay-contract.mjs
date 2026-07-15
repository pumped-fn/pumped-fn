import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { runProbe } from "./cancellation-probe.mjs"

const expected = JSON.parse(await readFile(
  ".okra/runs/issue-triage-session-20260715/workers/dkr-2-v3/cancellation-contract.json",
  "utf8",
))
const actual = await runProbe()
assert.deepEqual(actual, expected)
process.stdout.write(`${JSON.stringify({
  verdict: "replayed",
  requiredCaseCount: actual.requiredCaseCount,
  passedCaseCount: actual.passedCaseCount,
  unhandledRejectionCount: actual.v2Behavior.unhandledRejectionCount,
  uncoveredCallerCount: actual.callerCoverage.uncoveredCallerCount,
  publicCancelAddedValueCount: actual.callerCoverage.publicCancelAddedValueCount,
  unrelatedPostAbortError: actual.classification.unrelatedPostAbortError,
}, null, 2)}\n`)
