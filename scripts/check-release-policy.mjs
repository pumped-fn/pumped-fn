import { spawnSync } from "node:child_process"
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
const changesetFiles = readdirSync(join(root, ".changeset"), { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".md") && entry.name !== "README.md")
  .map((entry) => {
    const path = join(root, ".changeset", entry.name)
    return { content: readFileSync(path, "utf8"), path }
  })
const nextVersion = (version, bump) => {
  const parsed = semver.parse(version)
  if (bump === "major") return `${parsed.major + 1}.0.0`
  if (bump === "minor") return `${parsed.major}.${parsed.minor + 1}.0`
  return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`
}

const runGit = (gitArgs) => {
  const result = spawnSync("git", gitArgs, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })
  const command = `git ${gitArgs.join(" ")}`
  const stderr = result.stderr?.trim() ?? ""
  if (result.error) throw new Error(`${command} failed: ${result.error.message}${stderr ? `\n${stderr}` : ""}`)
  if (result.signal) throw new Error(`${command} failed with signal ${result.signal}${stderr ? `\n${stderr}` : ""}`)
  if (result.status === null) throw new Error(`${command} failed without an exit status${stderr ? `\n${stderr}` : ""}`)
  if (result.status !== 0) throw new Error(`${command} failed with exit ${result.status}${stderr ? `\n${stderr}` : ""}`)
  return result.stdout
}

const currentChangesetPaths = new Set(changesetFiles.map(({ path }) => normalize(relative(root, path))))
const baseChangesetPaths = runGit(["ls-tree", "-r", "--name-only", base, "--", ".changeset"])
  .split("\n")
  .filter((path) => /^\.changeset\/[^/]+\.md$/u.test(path) && path !== ".changeset/README.md")
for (const path of baseChangesetPaths) {
  if (currentChangesetPaths.has(path)) continue
  changesetFiles.push({
    content: runGit(["show", `${base}:${path}`]),
    path: join(root, path),
  })
}
const allChangesetFiles = changesetFiles
const allChangesets = allChangesetFiles.flatMap(({ content, path }) => {
  const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/u)?.[1] ?? ""
  return frontmatter.split(/\r?\n/u).flatMap((line) => {
    const match = line.match(/^\s*["']?([^"']+?)["']?\s*:\s*(major|minor|patch)\s*$/u)
    return match ? [{ package: match[1], bump: match[2], path: normalize(relative(root, path)) }] : []
  })
})
const allRetiredPackages = new Set(allChangesetFiles.flatMap(({ content }) =>
  [...content.matchAll(/^Retires:\s*["']?([^"'\s]+)["']?\s*$/gimu)].map((match) => match[1])
))
const changesets = allChangesets
const bumps = new Map()
for (const change of changesets) {
  const current = bumps.get(change.package)
  if (!current || rank[change.bump] > rank[current.bump]) bumps.set(change.package, change)
}

const basePackageDirectories = runGit(["ls-tree", "-r", "--name-only", base, "--", "pkg"])
  .split("\n")
  .filter((path) => /^pkg\/[^/]+\/[^/]+\/package\.json$/u.test(path))
  .map((path) => ({ path, manifest: JSON.parse(runGit(["show", `${base}:${path}`])) }))
  .filter(({ manifest }) => manifest.private !== true)
const baseManifests = new Map(basePackageDirectories.map((entry) => [entry.manifest.name, entry.manifest]))
const releases = new Map([...bumps].flatMap(([name, change]) => {
  const entry = packages.get(name)
  if (!entry) return []
  const previous = baseManifests.get(name)
  return [[name, nextVersion(previous?.version ?? entry.manifest.version, change.bump)]]
}))

const unauthorizedMajors = []
const compatibilityBumpGaps = []
const peerAlignmentGaps = []
const packageRetirementGaps = basePackageDirectories
  .filter(({ manifest }) => !packages.has(manifest.name) && !allRetiredPackages.has(manifest.name))
  .map(({ manifest, path }) => ({ package: manifest.name, path }))
const versionDeltaGaps = []

for (const [name, change] of bumps) {
  const entry = packages.get(name)
  if (!entry || change.bump !== "major") continue
  const previous = baseManifests.get(name)
  const baseMajor = semver.major(previous?.version ?? entry.manifest.version)
  if (baseMajor > 0 && !majorReleasePackages.has(name)) {
    unauthorizedMajors.push({ package: name, version: entry.manifest.version, changeset: change.path })
  }
}

for (const entry of packageDirectories) {
  const previous = baseManifests.get(entry.manifest.name)
  const declared = bumps.get(entry.manifest.name)
  if (previous && previous.version !== entry.manifest.version) {
    const expected = declared ? nextVersion(previous.version, declared.bump) : null
    if (entry.manifest.version !== expected) {
      versionDeltaGaps.push({
        package: entry.manifest.name,
        previous: previous.version,
        current: entry.manifest.version,
        declared: declared?.bump ?? null,
        expected,
      })
    }
  }
  const oldPeers = previous?.peerDependencies ?? {}
  const newPeers = entry.manifest.peerDependencies ?? {}
  const oldPeerMeta = previous?.peerDependenciesMeta ?? {}
  const newPeerMeta = entry.manifest.peerDependenciesMeta ?? {}
  const peerNames = new Set([...Object.keys(oldPeers), ...Object.keys(newPeers)])

  for (const peer of peerNames) {
    const previousOptional = oldPeerMeta[peer]?.optional === true
    const currentOptional = newPeerMeta[peer]?.optional === true
    const optionalityChanged = oldPeers[peer] !== undefined
      && newPeers[peer] !== undefined
      && previousOptional !== currentOptional
    if (!peer.startsWith("@pumped-fn/") || (oldPeers[peer] === newPeers[peer] && !optionalityChanged)) continue
    const addedRequiredPeer = previous !== undefined
      && oldPeers[peer] === undefined
      && newPeers[peer] !== undefined
      && !currentOptional
    const becameRequired = optionalityChanged && previousOptional && !currentOptional
    const widening = !addedRequiredPeer && !becameRequired && (oldPeers[peer] === undefined
      || (newPeers[peer] !== undefined && semver.subset(oldPeers[peer], newPeers[peer]))
    )
    const currentMajor = semver.major(previous?.version ?? entry.manifest.version)
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
        previous_optional: previousOptional,
        current: newPeers[peer] ?? null,
        current_optional: currentOptional,
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
sort(packageRetirementGaps)
sort(versionDeltaGaps)

const details = {
  compatibility_bump_gaps: compatibilityBumpGaps,
  peer_alignment_gaps: peerAlignmentGaps,
  package_retirement_gaps: packageRetirementGaps,
  unauthorized_majors: unauthorizedMajors,
  version_delta_gaps: versionDeltaGaps,
}
const metrics = {
  compatibility_bump_gap_count: compatibilityBumpGaps.length,
  peer_alignment_gap_count: peerAlignmentGaps.length,
  package_retirement_gap_count: packageRetirementGaps.length,
  unauthorized_major_count: unauthorizedMajors.length,
  version_delta_gap_count: versionDeltaGaps.length,
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
