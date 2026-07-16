import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs"
import { createRequire } from "node:module"
import { join, relative, resolve, sep } from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

const args = process.argv.slice(2)
const option = (name) => {
  const index = args.indexOf(name)
  return index === -1 ? undefined : args[index + 1]
}

const root = resolve(option("--root") ?? process.cwd())
const base = option("--base")
const toolRoot = resolve(fileURLToPath(new URL("..", import.meta.url)))
const require = createRequire(realpathSync(join(toolRoot, "node_modules", "@changesets", "cli", "package.json")))
const semver = require("semver")

if (!base) {
  process.stderr.write("Usage: node scripts/check-release-policy.mjs --base <ref> [--root <path>]\n")
  process.exit(2)
}

const normalize = (value) => value.split(sep).join("/")
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"))
const rank = { patch: 1, minor: 2, major: 3 }
const policy = readJson(join(root, ".changeset", "release-policy.json"))
const majorReleasePackages = new Set(policy.majorReleasePackages)

const packageDirectories = readdirSync(join(root, "pkg"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap((lane) =>
    readdirSync(join(root, "pkg", lane.name), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(root, "pkg", lane.name, entry.name)),
  )
  .filter((directory) => existsSync(join(directory, "package.json")))
  .map((directory) => ({
    directory,
    path: normalize(relative(root, join(directory, "package.json"))),
    manifest: readJson(join(directory, "package.json")),
  }))
  .filter(({ manifest }) => manifest.private !== true)

const packages = new Map(packageDirectories.map((entry) => [entry.manifest.name, entry]))
const changesets = readdirSync(join(root, ".changeset"), { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".md") && entry.name !== "README.md")
  .flatMap((entry) => {
    const path = join(root, ".changeset", entry.name)
    const content = readFileSync(path, "utf8")
    const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/u)?.[1] ?? ""
    return frontmatter.split(/\r?\n/u).flatMap((line) => {
      const match = line.match(/^\s*["']?([^"']+?)["']?\s*:\s*(major|minor|patch)\s*$/u)
      return match ? [{ package: match[1], bump: match[2], path: normalize(relative(root, path)) }] : []
    })
  })

const bumps = new Map()
for (const change of changesets) {
  const current = bumps.get(change.package)
  if (!current || rank[change.bump] > rank[current.bump]) bumps.set(change.package, change)
}

const nextVersion = (version, bump) => {
  const parsed = semver.parse(version)
  if (bump === "major") return `${parsed.major + 1}.0.0`
  if (bump === "minor") return `${parsed.major}.${parsed.minor + 1}.0`
  return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`
}

const releases = new Map([...bumps].flatMap(([name, change]) => {
  const entry = packages.get(name)
  return entry ? [[name, nextVersion(entry.manifest.version, change.bump)]] : []
}))

const baseManifest = (entry) => {
  try {
    return JSON.parse(execFileSync("git", ["show", `${base}:${entry.path}`], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }))
  } catch {
    return undefined
  }
}

const unauthorizedMajors = []
const compatibilityBumpGaps = []
const peerAlignmentGaps = []

for (const [name, change] of bumps) {
  const entry = packages.get(name)
  if (!entry || change.bump !== "major") continue
  const currentMajor = semver.major(entry.manifest.version)
  if (currentMajor > 0 && !majorReleasePackages.has(name)) {
    unauthorizedMajors.push({ package: name, version: entry.manifest.version, changeset: change.path })
  }
}

for (const entry of packageDirectories) {
  const previous = baseManifest(entry)
  const oldPeers = previous?.peerDependencies ?? {}
  const newPeers = entry.manifest.peerDependencies ?? {}
  const peerNames = new Set([...Object.keys(oldPeers), ...Object.keys(newPeers)])

  for (const peer of peerNames) {
    if (!peer.startsWith("@pumped-fn/") || oldPeers[peer] === newPeers[peer]) continue
    const widening = oldPeers[peer] === undefined
      || (newPeers[peer] !== undefined && semver.subset(oldPeers[peer], newPeers[peer]))
    const currentMajor = semver.major(entry.manifest.version)
    const required = widening
      ? policy.compatibilityBumps.widening
      : currentMajor === 0
        ? policy.compatibilityBumps.pre1Breaking
        : policy.compatibilityBumps.stableBreaking
    const declared = bumps.get(entry.manifest.name)
    if (!declared || rank[declared.bump] < rank[required]) {
      compatibilityBumpGaps.push({
        package: entry.manifest.name,
        peer,
        previous: oldPeers[peer] ?? null,
        current: newPeers[peer] ?? null,
        required,
        declared: declared?.bump ?? null,
      })
    }
  }

  for (const [peer, range] of Object.entries(newPeers)) {
    const target = releases.get(peer)
    if (target && !semver.satisfies(target, range)) {
      peerAlignmentGaps.push({
        package: entry.manifest.name,
        peer,
        range,
        target,
      })
    }
  }
}

const sort = (items) => items.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
sort(unauthorizedMajors)
sort(compatibilityBumpGaps)
sort(peerAlignmentGaps)

const details = {
  compatibility_bump_gaps: compatibilityBumpGaps,
  peer_alignment_gaps: peerAlignmentGaps,
  unauthorized_majors: unauthorizedMajors,
}
const metrics = {
  compatibility_bump_gap_count: compatibilityBumpGaps.length,
  peer_alignment_gap_count: peerAlignmentGaps.length,
  unauthorized_major_count: unauthorizedMajors.length,
}
metrics.release_policy_gap_count = Object.values(metrics).reduce((total, count) => total + count, 0)

const result = {
  schema_version: 1,
  ok: metrics.release_policy_gap_count === 0,
  metrics,
  details,
}

process.stdout.write(`${JSON.stringify(result)}\n`)
process.exitCode = result.ok ? 0 : 1
