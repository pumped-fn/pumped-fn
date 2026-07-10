import { mkdtemp, mkdir, rename, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import {
  compareRoot,
  copyTree,
  extractBaseline,
  fileManifest,
  listFiles,
  parseManifest,
  pagesRoot,
  run,
  sha256,
  stageManifestPath,
  stageRoot,
  validateDigests,
} from "./pages-lib.mjs"

const compareDist = join(compareRoot, "dist")
const revision = process.env.GITHUB_SHA ?? run("git", ["rev-parse", "HEAD"], { cwd: compareRoot }).trim()
const treeState = run("git", ["status", "--porcelain"], { cwd: compareRoot }).trim() === "" ? "clean" : "dirty"

await mkdir(pagesRoot, { recursive: true })
const temporaryRoot = await mkdtemp(`${stageRoot}.tmp-`)
const baselineStage = join(temporaryRoot, "baseline")
const completeStage = join(temporaryRoot, "site")

try {
  const baseline = await extractBaseline(baselineStage)
  await copyTree(baselineStage, completeStage)
  await copyTree(compareDist, join(completeStage, "compare"))
  const comparePaths = await listFiles(join(completeStage, "compare"))
  if (!comparePaths.includes("index.html")) throw new Error("comparison build has no index.html")
  const compareManifest = await fileManifest(join(completeStage, "compare"), comparePaths)
  const revisionMetadata = {
    schemaVersion: 1,
    repository: "pumped-fn/pumped-fn",
    basePath: "/pumped-fn/compare/",
    sourceRevision: revision,
    sourceTreeState: treeState,
    baselineManifestSha256: baseline.provenance.manifestSha256,
    baselinePathCount: baseline.entries.length,
    comparisonAssetPathCount: comparePaths.length,
    comparisonAssetManifestSha256: sha256(compareManifest),
    comparisonAssets: parseManifest(compareManifest),
  }
  await writeFile(join(completeStage, "compare", "revision.json"), `${JSON.stringify(revisionMetadata, null, 2)}\n`)
  const nonComparePaths = (await listFiles(completeStage)).filter((path) => !path.startsWith("compare/"))
  if (nonComparePaths.join("\n") !== baseline.entries.map(({ path }) => path).join("\n")) {
    throw new Error("non-compare path set changed after overlay")
  }
  await validateDigests(completeStage, baseline.entries)
  const stagedManifest = await fileManifest(completeStage)
  await rm(stageRoot, { force: true, recursive: true })
  await rename(completeStage, stageRoot)
  await writeFile(stageManifestPath, stagedManifest)
  process.stdout.write(`${JSON.stringify({
    status: "staged",
    output: stageRoot,
    manifest: stageManifestPath,
    baselinePathCount: baseline.entries.length,
    comparisonPathCount: comparePaths.length + 1,
    stagedPathCount: stagedManifest.trimEnd().split("\n").length,
    stagedManifestSha256: sha256(stagedManifest),
    sourceRevision: revision,
  })}\n`)
} finally {
  await rm(temporaryRoot, { force: true, recursive: true })
}
