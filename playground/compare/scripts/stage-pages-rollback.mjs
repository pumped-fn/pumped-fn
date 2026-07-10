import { mkdtemp, mkdir, rename, rm, writeFile } from "node:fs/promises"
import {
  extractBaseline,
  fileManifest,
  pagesRoot,
  sha256,
  stageManifestPath,
  stageRoot,
} from "./pages-lib.mjs"

await mkdir(pagesRoot, { recursive: true })
const temporaryRoot = await mkdtemp(`${stageRoot}.rollback-`)

try {
  const baseline = await extractBaseline(temporaryRoot)
  const stagedManifest = await fileManifest(temporaryRoot, baseline.entries.map(({ path }) => path))
  await rm(stageRoot, { force: true, recursive: true })
  await rename(temporaryRoot, stageRoot)
  await writeFile(stageManifestPath, stagedManifest)
  process.stdout.write(`${JSON.stringify({
    status: "staged-baseline-rollback",
    output: stageRoot,
    baselinePathCount: baseline.entries.length,
    baselineManifestSha256: baseline.provenance.manifestSha256,
    baselineArchiveSha256: baseline.provenance.archiveSha256,
    baselineRootSha256: baseline.provenance.rootSha256,
    stagedManifestSha256: sha256(stagedManifest),
  })}\n`)
} catch (error) {
  await rm(temporaryRoot, { force: true, recursive: true })
  throw error
}
