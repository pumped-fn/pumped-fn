import { readFile } from "node:fs/promises"
import {
  fileManifest,
  listFiles,
  loadBaseline,
  sha256,
  stageManifestPath,
  stageRoot,
  validateFiles,
} from "./pages-lib.mjs"

const baseline = await loadBaseline()
const pathCount = await validateFiles(stageRoot, baseline.entries)
const stagedPaths = await listFiles(stageRoot)
const stagedManifest = await fileManifest(stageRoot, stagedPaths)
const recordedManifest = await readFile(stageManifestPath, "utf8")
if (recordedManifest !== stagedManifest) throw new Error("rollback staging manifest does not match staged bytes")
if (sha256(await readFile(`${stageRoot}/index.html`)) !== baseline.provenance.rootSha256) {
  throw new Error("rollback root digest does not match provenance")
}
if (stagedPaths.includes("revision.json") || stagedPaths.some((path) => path.startsWith("compare/"))) {
  throw new Error("rollback artifact contains successor-only paths")
}

process.stdout.write(`${JSON.stringify({
  status: "verified-baseline-rollback",
  baselinePathCount: pathCount,
  baselineManifestSha256: baseline.provenance.manifestSha256,
  baselineRootSha256: baseline.provenance.rootSha256,
  stagedManifestSha256: sha256(stagedManifest),
})}\n`)
