import { readFile } from "node:fs/promises"
import { join } from "node:path"
import {
  fileManifest,
  listFiles,
  loadBaseline,
  parseManifest,
  sha256,
  stageManifestPath,
  stageRoot,
  validateDigests,
} from "./pages-lib.mjs"

const baseline = await loadBaseline()
const stagedPaths = await listFiles(stageRoot)
const nonComparePaths = stagedPaths.filter((path) => !path.startsWith("compare/"))
const comparePaths = stagedPaths.filter((path) => path.startsWith("compare/"))

if (nonComparePaths.join("\n") !== baseline.entries.map(({ path }) => path).join("\n")) {
  throw new Error("non-compare path set does not match the ratified baseline")
}
await validateDigests(stageRoot, baseline.entries)
if (!comparePaths.includes("compare/index.html") || !comparePaths.includes("compare/revision.json")) {
  throw new Error("comparison overlay is incomplete")
}

const index = await readFile(join(stageRoot, "compare", "index.html"), "utf8")
if (!index.includes("/pumped-fn/compare/")) throw new Error("comparison build does not use the Pages subpath")

const revision = JSON.parse(await readFile(join(stageRoot, "compare", "revision.json"), "utf8"))
if (revision.basePath !== "/pumped-fn/compare/") throw new Error("revision metadata has the wrong base path")
if (revision.baselineManifestSha256 !== baseline.provenance.manifestSha256) {
  throw new Error("revision metadata has the wrong baseline manifest")
}
if (revision.baselinePathCount !== baseline.entries.length) throw new Error("revision metadata has the wrong baseline count")

const compareAssetPaths = comparePaths
  .filter((path) => path !== "compare/revision.json")
  .map((path) => path.slice("compare/".length))
const compareManifest = await fileManifest(join(stageRoot, "compare"), compareAssetPaths)
if (revision.comparisonAssetPathCount !== compareAssetPaths.length) {
  throw new Error("revision metadata has the wrong comparison path count")
}
if (revision.comparisonAssetManifestSha256 !== sha256(compareManifest)) {
  throw new Error("revision metadata has the wrong comparison manifest")
}
if (JSON.stringify(revision.comparisonAssets) !== JSON.stringify(parseManifest(compareManifest))) {
  throw new Error("revision metadata has the wrong comparison assets")
}

const expectedStagedManifest = await fileManifest(stageRoot, stagedPaths)
const recordedStagedManifest = await readFile(stageManifestPath, "utf8")
if (recordedStagedManifest !== expectedStagedManifest) throw new Error("staging manifest does not match staged bytes")

process.stdout.write(`${JSON.stringify({
  status: "verified",
  baselinePathCount: baseline.entries.length,
  unchangedNonComparePathCount: nonComparePaths.length,
  comparisonPathCount: comparePaths.length,
  stagedPathCount: stagedPaths.length,
  baselineManifestSha256: baseline.provenance.manifestSha256,
  stagedManifestSha256: sha256(recordedStagedManifest),
  sourceRevision: revision.sourceRevision,
})}\n`)
