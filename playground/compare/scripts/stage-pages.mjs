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
const redirectPath = "compare/index.html"
const redirectSource = "<!doctype html><html lang=\"en\"><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><meta http-equiv=\"refresh\" content=\"0;url=/pumped-fn/\"><link rel=\"canonical\" href=\"/pumped-fn/\"><title>pumped-fn comparison</title></head><body><a href=\"/pumped-fn/\">Open the pumped-fn comparison</a></body></html>\n"

await mkdir(pagesRoot, { recursive: true })
const temporaryRoot = await mkdtemp(`${stageRoot}.tmp-`)
const baselineStage = join(temporaryRoot, "baseline")
const completeStage = join(temporaryRoot, "site")

try {
  const baseline = await extractBaseline(baselineStage)
  const homepagePaths = await listFiles(compareDist)
  if (!homepagePaths.includes("index.html")) throw new Error("homepage build has no index.html")
  const baselinePaths = new Set(baseline.entries.map(({ path }) => path))
  const collisions = homepagePaths.filter((path) => baselinePaths.has(path))
  if (collisions.join("\n") !== "index.html") {
    throw new Error(`generated/baseline collision set must equal index.html: ${collisions.join(", ")}`)
  }
  for (const reservedPath of ["revision.json", redirectPath]) {
    if (homepagePaths.includes(reservedPath) || baselinePaths.has(reservedPath)) {
      throw new Error(`reserved Pages path is occupied: ${reservedPath}`)
    }
  }

  await copyTree(baselineStage, completeStage)
  await rm(join(completeStage, "index.html"))
  await copyTree(compareDist, completeStage)
  await mkdir(join(completeStage, "compare"), { recursive: true })
  await writeFile(join(completeStage, redirectPath), redirectSource)

  const preservedEntries = baseline.entries.filter(({ path }) => path !== "index.html")
  await validateDigests(completeStage, preservedEntries)
  const homepageManifest = await fileManifest(completeStage, homepagePaths)
  const legacyRedirects = [{
    path: redirectPath,
    digest: sha256(redirectSource),
    target: "/pumped-fn/",
  }]
  const stagedContentPaths = [...preservedEntries.map(({ path }) => path), ...homepagePaths, redirectPath].sort()
  const stagedContentManifest = await fileManifest(completeStage, stagedContentPaths)
  const revisionMetadata = {
    schemaVersion: 2,
    repository: "pumped-fn/pumped-fn",
    basePath: "/pumped-fn/",
    sourceRevision: revision,
    sourceTreeState: treeState,
    baselineManifestSha256: baseline.provenance.manifestSha256,
    baselinePathCount: baseline.entries.length,
    replacedBaselinePaths: ["index.html"],
    preservedBaselinePathCount: preservedEntries.length,
    homepageAssetPathCount: homepagePaths.length,
    homepageAssetManifestSha256: sha256(homepageManifest),
    homepageAssets: parseManifest(homepageManifest),
    legacyRedirects,
    stagedContentPathCount: stagedContentPaths.length,
    stagedContentManifestSha256: sha256(stagedContentManifest),
    rollback: {
      archiveSha256: baseline.provenance.archiveSha256,
      manifestSha256: baseline.provenance.manifestSha256,
      rootSha256: baseline.provenance.rootSha256,
      pathCount: baseline.provenance.pathCount,
    },
  }
  await writeFile(join(completeStage, "revision.json"), `${JSON.stringify(revisionMetadata, null, 2)}\n`)

  const finalPaths = await listFiles(completeStage)
  const expectedPaths = [...stagedContentPaths, "revision.json"].sort()
  if (finalPaths.join("\n") !== expectedPaths.join("\n")) throw new Error("final staged path set is not exact")
  if (finalPaths.filter((path) => path.startsWith("compare/")).join("\n") !== redirectPath) {
    throw new Error("compare/ contains more than the legacy redirect")
  }

  const stagedManifest = await fileManifest(completeStage, finalPaths)
  await rm(stageRoot, { force: true, recursive: true })
  await rename(completeStage, stageRoot)
  await writeFile(stageManifestPath, stagedManifest)
  process.stdout.write(`${JSON.stringify({
    status: "staged-root",
    output: stageRoot,
    manifest: stageManifestPath,
    baselinePathCount: baseline.entries.length,
    preservedBaselinePathCount: preservedEntries.length,
    homepageAssetPathCount: homepagePaths.length,
    stagedPathCount: finalPaths.length,
    stagedManifestSha256: sha256(stagedManifest),
    stagedContentManifestSha256: sha256(stagedContentManifest),
    sourceRevision: revision,
  })}\n`)
} finally {
  await rm(temporaryRoot, { force: true, recursive: true })
}
