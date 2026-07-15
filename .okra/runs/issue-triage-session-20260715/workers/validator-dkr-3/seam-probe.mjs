import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { pathToFileURL } from "node:url"

const files = {
  types: "pkg/core/lite/src/types.ts",
  scope: "pkg/core/lite/src/scope.ts",
  observable: "pkg/ext/observable/src/index.ts",
  writerProbe: ".okra/runs/issue-triage-session-20260715/workers/dkr-3/probes/context-observation-probe.mjs",
  contract: ".okra/runs/issue-triage-session-20260715/workers/dkr-3/artifacts/context-observation-trace-contract.v1.json",
}

function count(source, pattern) {
  return [...source.matchAll(pattern)].length
}

export async function runProbe() {
  const types = await readFile(files.types, "utf8")
  const scope = await readFile(files.scope, "utf8")
  const observable = await readFile(files.observable, "utf8")
  const writerProbe = await readFile(files.writerProbe, "utf8")
  const contractText = await readFile(files.contract, "utf8")
  const contract = JSON.parse(contractText)

  const seams = Object.freeze({
    wrapExecContext: types.includes("ctx: ExecutionContext"),
    executionParent: types.includes("readonly parent: ExecutionContext | undefined"),
    executionOnClose: types.includes("onClose(fn: (result: CloseResult)"),
    namedTagLookup: scope.includes("seekTag<T>(tag:"),
    observableRuntimeOwner: observable.includes("ownerContext(ctx, value)"),
    observableOwnerClose: observable.includes("owner.onClose(() => close(current))"),
  })

  assert(Object.values(seams).every(Boolean))
  assert.equal(contract.safeProjection.source, "one explicit SDK observation tag selected by observable extension configuration")
  assert.equal(contract.safeProjection.unknownKeys, "drop")

  const arbitraryTagEnumerationPathCount = count(writerProbe, /getAllTags/g) + count(contractText, /getAllTags/g)
  const publicContextDataCallbackCount = count(contractText, /ContextData(?!\.seekTag)/g)
  assert.equal(arbitraryTagEnumerationPathCount, 0)
  assert.equal(publicContextDataCallbackCount, 0)

  return Object.freeze({
    verdict: "replayed",
    seams,
    liteCoreChangeRequiredForProjection: false,
    safeProjectionSourceCount: 1,
    arbitraryTagEnumerationPathCount,
    publicContextDataCallbackCount,
  })
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(`${JSON.stringify(await runProbe(), null, 2)}\n`)
}
