import { createHash } from "node:crypto"
import { readFile, readdir } from "node:fs/promises"
import { pathToFileURL } from "node:url"

const checkpointPath = ".okra/runs/issue-triage-session-20260715/workers/dkr-3/checkpoint.candidate.v1.json"
const roots = Object.freeze([
  "pkg/core/lite/src",
  "pkg/ext/observable/src",
  "pkg/ext/logging/src",
  "pkg/sdk/core/src",
  ".okra/runs/issue-triage-session-20260715/workers/dkr-3",
])

async function files(path) {
  const values = []
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = `${path}/${entry.name}`
    if (entry.isDirectory()) values.push(...await files(child))
    if (entry.isFile()) values.push(child)
  }
  return values
}

async function digest(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex")
}

export async function runProbe() {
  const checkpoint = JSON.parse(await readFile(checkpointPath, "utf8"))
  const expected = checkpoint.evidence_refs_or_hashes.map((value) => value.replace("sha256:", ""))
  const paths = (await Promise.all(roots.map(files))).flat()
  const actual = new Map()
  for (const path of paths) actual.set(await digest(path), path)
  const resolved = expected.filter((hash) => actual.has(hash)).map((hash) => ({ hash, path: actual.get(hash) }))
  const unresolved = expected.filter((hash) => !actual.has(hash))
  return Object.freeze({
    verdict: "replayed",
    evidenceHashCount: expected.length,
    resolvedEvidenceHashCount: resolved.length,
    unresolvedEvidenceHashCount: unresolved.length,
    resolved,
    unresolved,
  })
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(`${JSON.stringify(await runProbe(), null, 2)}\n`)
}
