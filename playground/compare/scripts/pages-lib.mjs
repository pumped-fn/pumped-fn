import { createHash } from "node:crypto"
import { cp, lstat, mkdir, readFile, readdir } from "node:fs/promises"
import { dirname, join, posix, relative, resolve, sep } from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

export const compareRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
export const baselineRoot = join(compareRoot, "pages", "baseline")
export const archivePath = join(baselineRoot, "site-v1.tar.gz")
export const baselineManifestPath = join(baselineRoot, "live-baseline.sha256")
export const provenancePath = join(baselineRoot, "provenance.json")
export const pagesRoot = join(compareRoot, "dist-pages")
export const stageRoot = join(pagesRoot, "site")
export const stageManifestPath = join(pagesRoot, "site.sha256")

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex")
}

export async function listFiles(root) {
  const files = []

  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolutePath = join(directory, entry.name)
      if (entry.isDirectory()) {
        await visit(absolutePath)
      } else if (entry.isFile()) {
        files.push(relative(root, absolutePath).split(sep).join(posix.sep))
      } else {
        throw new Error(`unsupported staged entry: ${absolutePath}`)
      }
    }
  }

  await visit(root)
  return files.sort()
}

export function parseManifest(source) {
  const entries = source.trimEnd().split("\n").map((line) => {
    const separator = line.lastIndexOf(" ")
    if (separator < 1) throw new Error(`invalid manifest line: ${line}`)
    const path = line.slice(0, separator)
    const digest = line.slice(separator + 1)
    if (path !== posix.normalize(path) || path.startsWith("/") || path.includes("..")) {
      throw new Error(`unsafe manifest path: ${path}`)
    }
    if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error(`invalid digest for ${path}`)
    return { path, digest }
  })
  const paths = entries.map(({ path }) => path)
  if (new Set(paths).size !== paths.length) throw new Error("baseline manifest contains duplicate paths")
  if (paths.some((path) => path === "compare" || path.startsWith("compare/"))) {
    throw new Error("baseline manifest overlaps compare/")
  }
  if (paths.join("\n") !== [...paths].sort().join("\n")) {
    throw new Error("baseline manifest is not sorted")
  }
  return entries
}

export async function fileManifest(root, paths) {
  const manifestPaths = paths ?? await listFiles(root)
  const lines = []
  for (const path of manifestPaths) {
    lines.push(`${path} ${sha256(await readFile(join(root, path)))}`)
  }
  return `${lines.join("\n")}\n`
}

export async function validateFiles(root, expectedEntries) {
  const expectedPaths = expectedEntries.map(({ path }) => path)
  const actualPaths = await listFiles(root)
  if (actualPaths.join("\n") !== expectedPaths.join("\n")) {
    throw new Error(`path set mismatch: expected ${expectedPaths.length}, received ${actualPaths.length}`)
  }
  await validateDigests(root, expectedEntries)
  return actualPaths.length
}

export async function validateDigests(root, expectedEntries) {
  for (const { path, digest } of expectedEntries) {
    const actualDigest = sha256(await readFile(join(root, path)))
    if (actualDigest !== digest) throw new Error(`digest mismatch: ${path}`)
  }
}

export async function loadBaseline() {
  const manifestSource = await readFile(baselineManifestPath, "utf8")
  const provenance = JSON.parse(await readFile(provenancePath, "utf8"))
  const entries = parseManifest(manifestSource)
  const archiveDigest = sha256(await readFile(archivePath))
  if (entries.length !== provenance.pathCount) throw new Error("baseline path count does not match provenance")
  if (sha256(manifestSource) !== provenance.manifestSha256) {
    throw new Error("baseline manifest digest does not match provenance")
  }
  if (archiveDigest !== provenance.archiveSha256) throw new Error("baseline archive digest does not match provenance")
  const archiveListing = run("tar", ["-tzf", archivePath])
  if (sha256(archiveListing) !== provenance.archiveEntryListSha256) {
    throw new Error("baseline archive entry list does not match provenance")
  }
  const archivePaths = archiveListing.trimEnd().split("\n")
  if (archivePaths.join("\n") !== entries.map(({ path }) => path).join("\n")) {
    throw new Error("baseline archive paths do not match the manifest")
  }
  return { entries, manifestSource, provenance }
}

export async function extractBaseline(destination) {
  const baseline = await loadBaseline()
  await mkdir(destination, { recursive: true })
  run("tar", ["-xzf", archivePath, "-C", destination])
  await validateFiles(destination, baseline.entries)
  return baseline
}

export async function copyTree(source, destination) {
  await lstat(source)
  await mkdir(dirname(destination), { recursive: true })
  await cp(source, destination, { recursive: true })
}

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options })
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed\n${result.stderr || result.stdout}`)
  }
  return result.stdout
}
