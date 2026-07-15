import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { runProbe } from "./cancellation-probe.mjs"

const saved = JSON.parse(await readFile(
  ".okra/runs/issue-triage-session-20260715/workers/dkr-2/cancellation-probe.json",
  "utf8",
))
const replayed = await runProbe()
assert.deepEqual(replayed, saved)

process.stdout.write(`${JSON.stringify({
  verdict: "replayed",
  currentNestedLeakCount: replayed.baseline.nestedParentClose.descendantLeakCountAtClose,
  candidateNestedLeakCount: replayed.candidate.nestedParentClose.descendantLeakCountAfterClose,
  candidateStreamLeakCount: replayed.candidate.streamParentClose.descendantLeakCountAfterClose,
  publicCancelAddedValueCount: replayed.decisionInputs.publicCancelAddedValueCount,
  unhandledRejectionCount: replayed.unhandledRejectionCount,
}, null, 2)}\n`)
