import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

const root = process.cwd()

const failures = []

function read(path) {
  return readFileSync(join(root, path), "utf8")
}

function readJson(path) {
  return JSON.parse(read(path))
}

function fail(kind, message) {
  failures.push({ kind, message })
}

function examplePackageDirs() {
  return readdirSync(join(root, "examples"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `examples/${entry.name}`)
    .filter((dir) => existsSync(join(root, dir, "package.json")))
    .sort()
}

function packageDirs() {
  return readdirSync(join(root, "pkg"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((lane) =>
      readdirSync(join(root, "pkg", lane.name), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => `pkg/${lane.name}/${entry.name}`)
        .filter((dir) => existsSync(join(root, dir, "package.json"))),
    )
    .sort()
}

function workspaceDirs() {
  return [...packageDirs(), ...examplePackageDirs()]
}

function scriptFiles() {
  return readdirSync(join(root, "scripts"), { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.endsWith(".mjs") || name.endsWith(".sh"))
    .sort()
}

function packageName(dir) {
  return readJson(`${dir}/package.json`).name
}

function catalogNames() {
  const names = new Set()
  let inCatalog = false
  for (const line of read("pnpm-workspace.yaml").split("\n")) {
    if (/^\S/.test(line)) inCatalog = line === "catalog:"
    if (!inCatalog) continue
    const match = line.match(/^  ["']?([^"':]+(?:\/[^"':]+)?)["']?:\s/)
    if (match) names.add(match[1])
  }
  return names
}

function parseExamplesReadme() {
  const rows = []
  for (const match of read("examples/README.md").matchAll(/^\| `([^`]+)\/` \| `([^`]+)` \|/gm)) {
    rows.push({ dir: `examples/${match[1]}`, packageName: match[2] })
  }
  return rows
}

function parseRootReadmeExamples() {
  const refs = []
  for (const match of read("README.md").matchAll(/^\| `examples\/([^`]+)` \|/gm)) {
    refs.push(`examples/${match[1]}`)
  }
  return refs.sort()
}

function parseRootReadmePackages() {
  const rows = []
  for (const match of read("README.md").matchAll(/^\| `(pkg\/[^`]+)` \| `([^`]+)` \|/gm)) {
    rows.push({ dir: match[1], packageName: match[2] })
  }
  return rows
}

function parseLaneReadmeDirs(lane) {
  const path = `pkg/${lane}/README.md`
  if (!existsSync(join(root, path))) return []
  return [...read(path).matchAll(/^\| `([^`]+)\/` \|/gm)]
    .map((match) => `pkg/${lane}/${match[1]}`)
    .sort()
}

function parsePkgReadmeLanes() {
  return [...read("pkg/README.md").matchAll(/^\| `([^`]+)\/` \|/gm)]
    .map((match) => match[1])
    .sort()
}

function lintPaths() {
  const script = readJson("package.json").scripts.lint
  const [, args = ""] = script.split("pkg/tool/lint/dist/cli.mjs")
  const [paths = ""] = args.split("&&")
  return paths
    .split(/\s+/)
    .map((arg) => arg.trim())
    .filter(Boolean)
}

function packageScriptTargets() {
  const targets = new Set()
  for (const script of Object.values(readJson("package.json").scripts)) {
    for (const match of script.matchAll(/\b(?:node|bash|sh)\s+scripts\/([^\s;&|]+)/g)) targets.add(match[1])
  }
  return [...targets].sort()
}

function workflowScriptTargets() {
  const targets = new Set()
  for (const path of collectFiles(".github", (name) => /\.(ya?ml)$/.test(name))) {
    for (const match of read(path).matchAll(/\b(?:node|bash|sh)\s+scripts\/([^\s;&|)"']+)/g)) targets.add(match[1])
  }
  return [...targets].sort()
}

function workflowText() {
  return collectFiles(".github", (name) => /\.(ya?ml)$/.test(name))
    .map((path) => read(path))
    .join("\n")
}

function scriptTargets() {
  return [...new Set([...packageScriptTargets(), ...workflowScriptTargets()])].sort()
}

function parseScriptsReadmeFiles() {
  return [...read("scripts/README.md").matchAll(/^\| `([^`]+)` \|/gm)]
    .map((match) => match[1])
    .sort()
}

function guidanceReadmes() {
  return [
    "README.md",
    "examples/README.md",
    "scripts/README.md",
    "pkg/README.md",
    ...readdirSync(join(root, "pkg"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `pkg/${entry.name}/README.md`)
      .filter((path) => existsSync(join(root, path)))
      .sort(),
  ]
}

function collectFiles(dir, accept) {
  const paths = []
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") continue
    const path = `${dir}/${entry.name}`
    if (entry.isDirectory()) paths.push(...collectFiles(path, accept))
    if (entry.isFile() && accept(entry.name)) paths.push(path)
  }
  return paths
}

function collectMarkdown(dir) {
  return collectFiles(dir, (name) => name.endsWith(".md"))
}

function patternDirs() {
  const dirs = []
  for (const example of readdirSync(join(root, "examples"), { withFileTypes: true })) {
    if (!example.isDirectory()) continue
    const patterns = join(root, "examples", example.name, "patterns")
    if (!existsSync(patterns)) continue
    for (const pattern of readdirSync(patterns, { withFileTypes: true })) {
      if (pattern.isDirectory()) dirs.push(`examples/${example.name}/patterns/${pattern.name}`)
    }
  }
  return dirs.sort()
}

function hasFileNamed(dir, pattern) {
  return readdirSync(join(root, dir), { withFileTypes: true })
    .some((entry) => entry.isFile() && pattern.test(entry.name))
}

const dirs = examplePackageDirs()
const dirSet = new Set(dirs)
const packages = packageDirs()
const packageSet = new Set(packages)
const workspaces = workspaceDirs()
const workspaceNames = new Set(workspaces.map(packageName))
const catalogs = catalogNames()

for (const dir of dirs) {
  if (!existsSync(join(root, dir, "README.md"))) fail("missing_example_readme", `${dir} has package.json but no README.md`)
  if (!/^## Canonical Shape$/m.test(read(`${dir}/README.md`))) {
    fail("missing_canonical_shape", `${dir}/README.md does not define ## Canonical Shape`)
  }
}

const examplesRows = parseExamplesReadme()
const rowDirs = examplesRows.map((row) => row.dir).sort()
for (const dir of dirs) {
  if (!rowDirs.includes(dir)) fail("examples_readme_missing_current_example", `${dir} is absent from examples/README.md`)
}
for (const row of examplesRows) {
  if (!dirSet.has(row.dir)) fail("examples_readme_stale_example", `${row.dir} is listed in examples/README.md but has no package.json`)
  if (dirSet.has(row.dir) && row.packageName !== packageName(row.dir)) {
    fail("examples_readme_package_mismatch", `${row.dir} lists ${row.packageName} but package.json is ${packageName(row.dir)}`)
  }
}

const rootRefs = parseRootReadmeExamples()
for (const dir of dirs) {
  if (!rootRefs.includes(dir)) fail("root_readme_missing_current_example", `${dir} is absent from README.md practical examples`)
}
for (const dir of rootRefs) {
  if (!dirSet.has(dir)) fail("root_readme_stale_example", `${dir} is listed in README.md but has no package.json`)
}

const lint = lintPaths()
for (const required of guidanceReadmes()) {
  if (!lint.includes(required)) fail("lint_missing_guidance", `${required} is not scanned by the root lint script`)
}
for (const dir of dirs) {
  if (!lint.includes(dir)) fail("lint_missing_current_example", `${dir} is not scanned by the root lint script`)
}
for (const path of lint) {
  if (path.startsWith("examples/") && !existsSync(join(root, path))) {
    fail("lint_stale_example_path", `${path} is scanned by the root lint script but does not exist`)
  }
}

for (const dir of workspaces) {
  const manifest = readJson(`${dir}/package.json`)
  for (const field of ["dependencies", "devDependencies"]) {
    const deps = manifest[field] ?? {}
    for (const [name, spec] of Object.entries(deps)) {
      if (workspaceNames.has(name)) {
        if (dir.startsWith("examples/") || field === "devDependencies") {
          if (spec !== "workspace:*") fail("dependency_policy_mismatch", `${dir} ${field}.${name} should use workspace:*`)
        } else if (!spec.startsWith("workspace:")) {
          fail("dependency_policy_mismatch", `${dir} ${field}.${name} should use a workspace: specifier`)
        }
      } else if (spec === "catalog:") {
        if (!catalogs.has(name)) fail("dependency_catalog_missing", `${dir} ${field}.${name} uses catalog: but is absent from pnpm-workspace.yaml catalog`)
      } else {
        fail("dependency_policy_mismatch", `${dir} ${field}.${name} should use catalog:`)
      }
    }
  }
  for (const [name, spec] of Object.entries(manifest.peerDependencies ?? {})) {
    if (spec === "catalog:" || spec.startsWith("workspace:") || spec === "*" || spec === "") {
      fail("peer_dependency_policy_mismatch", `${dir} peerDependencies.${name} should use an explicit range`)
    }
  }
}

const rootPackageRows = parseRootReadmePackages()
const rootPackageDirs = rootPackageRows.map((row) => row.dir).sort()
for (const dir of packages) {
  if (!rootPackageDirs.includes(dir)) fail("root_readme_missing_package", `${dir} is absent from README.md package map`)
}
for (const row of rootPackageRows) {
  if (!packageSet.has(row.dir)) fail("root_readme_stale_package", `${row.dir} is listed in README.md but has no package.json`)
  if (packageSet.has(row.dir) && row.packageName !== packageName(row.dir)) {
    fail("root_readme_package_name_mismatch", `${row.dir} lists ${row.packageName} but package.json is ${packageName(row.dir)}`)
  }
}

const lanes = [...new Set(packages.map((dir) => dir.split("/")[1]))].sort()
const pkgReadmeLanes = parsePkgReadmeLanes()
for (const lane of lanes) {
  if (!pkgReadmeLanes.includes(lane)) fail("pkg_readme_missing_lane", `pkg/${lane} has packages but is absent from pkg/README.md`)
}
for (const lane of pkgReadmeLanes) {
  if (!lanes.includes(lane)) fail("pkg_readme_stale_lane", `pkg/${lane} is listed in pkg/README.md but has no package directories`)
}
for (const lane of lanes) {
  const laneDirs = packages.filter((dir) => dir.startsWith(`pkg/${lane}/`))
  const readmeDirs = parseLaneReadmeDirs(lane)
  for (const dir of laneDirs) {
    if (!readmeDirs.includes(dir)) fail("lane_readme_missing_package", `${dir} is absent from pkg/${lane}/README.md`)
  }
  for (const dir of readmeDirs) {
    if (!packageSet.has(dir)) fail("lane_readme_stale_package", `${dir} is listed in pkg/${lane}/README.md but has no package.json`)
  }
}

const markdownPaths = ["README.md", "examples/README.md", ...collectMarkdown("docs"), ...collectMarkdown("pkg"), ...collectMarkdown("examples")]
for (const path of markdownPaths) {
  const content = read(path)
  for (const match of content.matchAll(/\bexamples\/([a-zA-Z0-9._-]+)/g)) {
    const dir = `examples/${match[1]}`
    if (!existsSync(join(root, dir))) fail("stale_markdown_example_ref", `${path} references missing ${dir}`)
  }
}

for (const path of lint) {
  if ((path === "README.md" || path.startsWith("pkg/") || path.startsWith("examples/")) && !existsSync(join(root, path))) {
    fail("lint_missing_path", `${path} is referenced by lint but does not exist`)
  }
  if (existsSync(join(root, path)) && !statSync(join(root, path)).isFile() && !statSync(join(root, path)).isDirectory()) {
    fail("lint_invalid_path", `${path} is not a file or directory`)
  }
}

const scriptNames = scriptFiles()
const scriptNameSet = new Set(scriptNames)
const scriptRows = parseScriptsReadmeFiles()
for (const target of scriptTargets()) {
  if (!scriptNameSet.has(target)) fail("missing_script_target", `A package script or workflow references scripts/${target}, but that file does not exist`)
}
for (const name of scriptNames) {
  if (!scriptRows.includes(name)) fail("scripts_readme_missing_script", `scripts/${name} is absent from scripts/README.md`)
}
for (const name of scriptRows) {
  if (!scriptNameSet.has(name)) fail("scripts_readme_stale_script", `scripts/README.md lists ${name}, but scripts/${name} does not exist`)
}
if (readJson("package.json").scripts["ci:changed-packages"] && !workflowText().includes("pnpm ci:changed-packages")) {
  fail("script_surface_gap", "package.json defines ci:changed-packages, but no workflow runs it")
}

const requiredPatternSections = [
  /^## (The )?smell$/im,
  /^## Harm$/im,
  /^## Transformation$/im,
  /^## Lens coverage$/im,
  /^## Why 100%/im,
]
for (const dir of patternDirs()) {
  if (!hasFileNamed(dir, /^README\.md$/)) fail("pattern_contract_gap", `${dir} has no README.md`)
  if (!hasFileNamed(dir, /^before\.[cm]?[jt]sx?$/)) fail("pattern_contract_gap", `${dir} has no before specimen`)
  if (!hasFileNamed(dir, /^after\.[cm]?[jt]sx?$/)) fail("pattern_contract_gap", `${dir} has no after rewrite`)
  if (!hasFileNamed(dir, /^after\.test\.[cm]?[jt]sx?$/)) fail("pattern_contract_gap", `${dir} has no after test`)
  const readmePath = `${dir}/README.md`
  if (existsSync(join(root, readmePath))) {
    const content = read(readmePath)
    for (const section of requiredPatternSections) {
      if (!section.test(content)) fail("pattern_contract_gap", `${readmePath} is missing ${section.source}`)
    }
  }
  if (hasFileNamed(dir, /^before\.[cm]?[jt]sx$/) && !hasFileNamed(dir, /\.browser\.test\.[cm]?[jt]sx$/)) {
    fail("pattern_contract_gap", `${dir} has a React before specimen but no browser test`)
  }
}

const metrics = {
  example_package_count: dirs.length,
  package_count: packages.length,
  example_readme_gap_count: failures.filter((failure) => failure.kind === "missing_example_readme").length,
  canonical_shape_gap_count: failures.filter((failure) => failure.kind === "missing_canonical_shape").length,
  dependency_policy_mismatch_count: failures.filter((failure) => failure.kind.includes("dependency")).length,
  inventory_mismatch_count: failures.filter((failure) => failure.kind.includes("readme") || failure.kind.includes("lint")).length,
  package_map_mismatch_count: failures.filter((failure) => failure.kind.includes("package") || failure.kind.includes("lane")).length,
  pattern_contract_gap_count: failures.filter((failure) => failure.kind === "pattern_contract_gap").length,
  script_surface_gap_count: failures.filter((failure) => failure.kind.includes("script")).length,
  stale_markdown_example_ref_count: failures.filter((failure) => failure.kind === "stale_markdown_example_ref").length,
  usage_drift_count: failures.filter((failure) =>
    failure.kind === "missing_canonical_shape"
    || failure.kind === "dependency_policy_mismatch"
    || failure.kind === "peer_dependency_policy_mismatch"
    || failure.kind === "pattern_contract_gap"
    || failure.kind.includes("script"),
  ).length,
}

if (failures.length > 0) {
  console.error(JSON.stringify({ ok: false, metrics, failures }, null, 2))
  process.exit(1)
}

console.log(JSON.stringify({ ok: true, metrics }, null, 2))
