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
import { auditAuthoredGrayscale } from "./adapters/color-audit.mjs"

const baseline = await loadBaseline()
const preservedEntries = baseline.entries.filter(({ path }) => path !== "index.html")
const stagedPaths = await listFiles(stageRoot)
const revision = JSON.parse(await readFile(join(stageRoot, "revision.json"), "utf8"))

if (revision.schemaVersion !== 2) throw new Error("revision metadata has the wrong schema version")
if (revision.repository !== "pumped-fn/pumped-fn") throw new Error("revision metadata has the wrong repository")
if (revision.basePath !== "/pumped-fn/") throw new Error("revision metadata has the wrong base path")
if (!/^[a-f0-9]{40}$/.test(revision.sourceRevision)) throw new Error("revision metadata has an invalid source revision")
if (!/^(clean|dirty)$/.test(revision.sourceTreeState)) throw new Error("revision metadata has an invalid tree state")
if (revision.baselineManifestSha256 !== baseline.provenance.manifestSha256) throw new Error("wrong baseline manifest")
if (revision.baselinePathCount !== 109 || revision.baselinePathCount !== baseline.entries.length) throw new Error("wrong baseline count")
if (JSON.stringify(revision.replacedBaselinePaths) !== JSON.stringify(["index.html"])) throw new Error("wrong replacement set")
if (revision.preservedBaselinePathCount !== 108 || revision.preservedBaselinePathCount !== preservedEntries.length) {
  throw new Error("wrong preserved baseline count")
}
await validateDigests(stageRoot, preservedEntries)

const homepageManifest = `${revision.homepageAssets.map(({ path, digest }) => `${path} ${digest}`).join("\n")}\n`
const homepageAssets = parseManifest(homepageManifest)
if (!homepageAssets.some(({ path }) => path === "index.html")) throw new Error("homepage manifest has no index")
if (revision.homepageAssetPathCount !== homepageAssets.length) throw new Error("wrong homepage asset count")
if (revision.homepageAssetManifestSha256 !== sha256(homepageManifest)) throw new Error("wrong homepage manifest")
await validateDigests(stageRoot, homepageAssets)

if (revision.legacyRedirects.length !== 1) throw new Error("wrong legacy redirect count")
const [redirect] = revision.legacyRedirects
if (redirect.path !== "compare/index.html" || redirect.target !== "/pumped-fn/") throw new Error("wrong legacy redirect")
if (sha256(await readFile(join(stageRoot, redirect.path))) !== redirect.digest) throw new Error("legacy redirect digest mismatch")
if (stagedPaths.filter((path) => path.startsWith("compare/")).join("\n") !== redirect.path) {
  throw new Error("compare/ contains duplicate application assets")
}

const stagedContentPaths = [
  ...preservedEntries.map(({ path }) => path),
  ...homepageAssets.map(({ path }) => path),
  redirect.path,
].sort()
const stagedContentManifest = await fileManifest(stageRoot, stagedContentPaths)
if (revision.stagedContentPathCount !== stagedContentPaths.length) throw new Error("wrong staged content count")
if (revision.stagedContentManifestSha256 !== sha256(stagedContentManifest)) throw new Error("wrong staged content manifest")
const expectedPaths = [...stagedContentPaths, "revision.json"].sort()
if (stagedPaths.join("\n") !== expectedPaths.join("\n")) throw new Error("staged path set is not exact")

const expectedRollback = {
  archiveSha256: baseline.provenance.archiveSha256,
  manifestSha256: baseline.provenance.manifestSha256,
  rootSha256: baseline.provenance.rootSha256,
  pathCount: baseline.provenance.pathCount,
}
if (JSON.stringify(revision.rollback) !== JSON.stringify(expectedRollback)) throw new Error("wrong rollback provenance")

const index = await readFile(join(stageRoot, "index.html"), "utf8")
if (!index.includes("/pumped-fn/")) throw new Error("homepage build does not use the root Pages base")
if (index.includes("/pumped-fn/compare/")) throw new Error("homepage build still uses the comparison subpath")
await auditAuthoredGrayscale()

const expectedStagedManifest = await fileManifest(stageRoot, stagedPaths)
const recordedStagedManifest = await readFile(stageManifestPath, "utf8")
if (recordedStagedManifest !== expectedStagedManifest) throw new Error("staging manifest does not match staged bytes")

process.stdout.write(`${JSON.stringify({
  status: "verified-root",
  baselinePathCount: baseline.entries.length,
  preservedBaselinePathCount: preservedEntries.length,
  homepageAssetPathCount: homepageAssets.length,
  stagedPathCount: stagedPaths.length,
  authoredNonGrayscaleColorCount: 0,
  baselineManifestSha256: baseline.provenance.manifestSha256,
  stagedManifestSha256: sha256(recordedStagedManifest),
  stagedContentManifestSha256: sha256(stagedContentManifest),
  sourceRevision: revision.sourceRevision,
})}\n`)
