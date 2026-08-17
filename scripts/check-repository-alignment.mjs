import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

const root = process.cwd()
const failures = []

const read = (path) => readFileSync(join(root, path), "utf8")
const readJson = (path) => JSON.parse(read(path))
const fail = (kind, message) => failures.push({ kind, message })
const collectFiles = (directory, accept) => {
  if (!existsSync(join(root, directory))) return []
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`
    if (entry.isDirectory()) return collectFiles(path, accept)
    return entry.isFile() && accept(entry.name) ? [path] : []
  })
}
const workflowText = () => collectFiles(".github", (name) => /\.ya?ml$/u.test(name)).map(read).join("\n")
const workflowJob = (name) => {
  const content = read(".github/workflows/ci.yml")
  const start = content.indexOf(`  ${name}:\n`)
  if (start === -1) return ""
  const remainder = content.slice(start + 1)
  const next = remainder.search(/^  [a-zA-Z0-9_-]+:\n/mu)
  return next === -1 ? content.slice(start) : content.slice(start, start + 1 + next)
}
const packageDirs = existsSync(join(root, "packages"))
  ? readdirSync(join(root, "packages"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(root, "packages", entry.name, "package.json")))
    .map((entry) => `packages/${entry.name}`)
    .sort()
  : []
const packages = packageDirs.map((directory) => ({ directory, manifest: readJson(`${directory}/package.json`) }))
const packageNames = new Set(packages.map(({ manifest }) => manifest.name))
const rootPackage = readJson("package.json")
const workspace = read("pnpm-workspace.yaml")
const tsconfig = readJson("tsconfig.base.json")
const rootReadme = read("README.md")

const workspacePatterns = []
let inPackages = false
for (const line of workspace.split("\n")) {
  if (/^packages:\s*$/u.test(line)) {
    inPackages = true
    continue
  }
  if (inPackages && /^\S/u.test(line)) break
  const match = inPackages ? line.match(/^\s+-\s+(.+)\s*$/u) : null
  if (match) workspacePatterns.push(match[1].replace(/^['"]|['"]$/gu, ""))
}
if (JSON.stringify(workspacePatterns) !== JSON.stringify(["packages/*", "benchmarks/*"])) {
  fail("workspace_pattern_mismatch", `workspace packages must be packages/* and benchmarks/*, got ${workspacePatterns.join(", ")}`)
}

const catalogs = new Set()
let inCatalog = false
for (const line of workspace.split("\n")) {
  if (/^\S/u.test(line)) inCatalog = line === "catalog:"
  if (!inCatalog) continue
  const match = line.match(/^  ["']?([^"':]+(?:\/[^"':]+)?)["']?:\s/u)
  if (match) catalogs.add(match[1])
}

for (const { directory, manifest } of packages) {
  if (manifest.private === true) continue
  if (!existsSync(join(root, directory, "README.md"))) fail("missing_package_readme", `${directory} has no README.md`)
  if (manifest.repository?.directory !== directory) {
    fail("repository_directory_mismatch", `${manifest.name} repository.directory must be ${directory}`)
  }
  if (!rootReadme.includes(directory) || !rootReadme.includes(manifest.name)) {
    fail("root_package_map_mismatch", `README.md must name ${manifest.name} at ${directory}`)
  }
  const expectedPath = `./${directory}/src/index.ts`
  if (!tsconfig.compilerOptions?.paths?.[manifest.name]?.includes(expectedPath)) {
    fail("typescript_path_mismatch", `tsconfig.base.json must map ${manifest.name} to ${expectedPath}`)
  }
  for (const field of ["dependencies", "devDependencies"]) {
    for (const [name, spec] of Object.entries(manifest[field] ?? {})) {
      if (packageNames.has(name)) {
        if (!spec.startsWith("workspace:")) fail("dependency_policy_mismatch", `${directory} ${field}.${name} must use workspace:`)
      } else if (spec !== "catalog:") {
        fail("dependency_policy_mismatch", `${directory} ${field}.${name} must use catalog:`)
      } else if (!catalogs.has(name)) {
        fail("dependency_catalog_missing", `${directory} ${field}.${name} is absent from the catalog`)
      }
    }
  }
  for (const [name, spec] of Object.entries(manifest.peerDependencies ?? {})) {
    if (!spec || spec === "catalog:" || spec === "*" || spec.startsWith("workspace:")) {
      fail("peer_dependency_policy_mismatch", `${directory} peerDependencies.${name} must use an explicit range`)
    }
  }
}
if (packageNames.size !== packages.length) fail("duplicate_package_name", "package names must be unique")

const lintDependency = rootPackage.devDependencies?.["@pumped-fn/lite-lint"]
if (lintDependency !== "workspace:*") fail("lint_dependency_mismatch", "root devDependencies must declare @pumped-fn/lite-lint as workspace:*")
const lintScript = rootPackage.scripts?.lint ?? ""
if (!/(?:^|&&\s*)pumped-lite-lint\s/u.test(lintScript) || /dist\/cli\.[cm]?js/u.test(lintScript)) {
  fail("lint_binary_mismatch", "root lint must invoke the public pumped-lite-lint binary")
}
if (!lintScript.includes("--config pumped-lite-lint.json") || !existsSync(join(root, "pumped-lite-lint.json"))) {
  fail("lint_config_mismatch", "root lint must use the checked-in pumped-lite-lint.json config")
}
for (const path of ["README.md", "docs", "scripts", "packages/*/README.md", "packages/*/src"]) {
  if (!lintScript.includes(path)) fail("lint_path_mismatch", `root lint must scan ${path}`)
}
const packedScript = rootPackage.scripts?.["packed-lite:check"] ?? ""
if (!packedScript.includes("pnpm -r build") || !packedScript.includes("node scripts/check-packed-lite.mjs")) {
  fail("packed_build_mismatch", "packed-lite:check must build every public package before packing")
}

for (const path of ["pkg", "examples", "playground", "research", "skills", "tests", ".okra", ".vscode", "tsconfig.json"]) {
  if (existsSync(join(root, path))) fail("retired_root_path", `${path} must not remain in the working tree`)
}
for (const [path, content] of [["package.json", JSON.stringify(rootPackage)], ["workflows", workflowText()]]) {
  for (const stale of ["@pumped-fn/compare", "examples:", "pages:", "lite-render-react", "npm-bootstrap"]) {
    if (content.includes(stale)) fail("retired_command_reference", `${path} still references ${stale}`)
  }
}

const scriptFiles = readdirSync(join(root, "scripts"), { withFileTypes: true })
  .filter((entry) => entry.isFile() && (entry.name.endsWith(".mjs") || entry.name.endsWith(".sh")))
  .map((entry) => entry.name)
  .sort()
const documentedScripts = [...read("scripts/README.md").matchAll(/^\| `([^`]+)` \|/gmu)].map((match) => match[1]).sort()
const referencedScripts = new Set()
for (const content of [JSON.stringify(rootPackage.scripts), workflowText()]) {
  for (const match of content.matchAll(/\b(?:node|bash|sh)\s+scripts\/([^\s;&|)"']+)/gu)) referencedScripts.add(match[1])
}
for (const name of referencedScripts) if (!scriptFiles.includes(name)) fail("missing_script_target", `scripts/${name} does not exist`)
for (const name of scriptFiles) {
  if (!name.endsWith(".test.mjs") && !documentedScripts.includes(name)) fail("scripts_readme_missing_script", `scripts/README.md omits ${name}`)
}
for (const name of documentedScripts) if (!scriptFiles.includes(name)) fail("scripts_readme_stale_script", `scripts/README.md lists missing ${name}`)

const ordered = (job, values) => {
  const positions = values.map((value) => job.indexOf(value))
  return job !== "" && positions.every((position) => position !== -1)
    && positions.every((position, index) => index === 0 || position > positions[index - 1])
}
const changesetJob = workflowJob("changeset")
if (!ordered(changesetJob, [
  "ref: ${{ github.event.pull_request.head.sha || github.sha }}",
  "- name: Check release policy",
  "BASE_SHA: ${{ github.event.pull_request.base.sha || github.event.before }}",
  "pnpm release-policy:test",
  "pnpm release-policy:check -- --base \"$BASE_SHA\"",
  "- name: Check for changeset",
  "pnpm changeset status --since=\"$BASE_SHA\"",
])) fail("workflow_policy_gate_order", "Changeset CI must bind the exact event base and run policy before status")
const contractJob = workflowJob("contract")
if (!ordered(contractJob, [
  "ref: ${{ github.event.pull_request.head.sha }}",
  "CHECKOUT_HEAD=\"$(git rev-parse HEAD)\"",
  "git diff --name-only \"$BASE_SHA...$CHECKOUT_HEAD\"",
  "pnpm alignment:test",
  "pnpm alignment:check",
  "pnpm contract:test",
  "pnpm contract:check -- --base \"$BASE_SHA\" --changed-files \"$CHANGED_FILES\" --pr-json \"$GITHUB_EVENT_PATH\" --expect-head \"$CHECKOUT_HEAD\"",
  "pnpm inline-exec:test",
  "pnpm inline-exec:check -- --expect-head \"$CHECKOUT_HEAD\"",
])) fail("workflow_contract_gate_order", "Contract CI must bind checks to the exact PR snapshot")
const changedPackagesJob = workflowJob("changed-packages")
if (!ordered(changedPackagesJob, [
  "ref: ${{ github.event.pull_request.head.sha || github.sha }}",
  "BASE_REF: ${{ github.event.pull_request.base.sha || github.event.before }}",
  "pnpm ci:changed-packages",
])) fail("workflow_changed_package_provenance", "Changed-package CI must use the exact event head and base")

const metrics = {
  package_count: packages.length,
  dependency_policy_gap_count: failures.filter(({ kind }) => kind.includes("dependency")).length,
  inventory_gap_count: failures.filter(({ kind }) => kind.includes("package_map") || kind.includes("path_mismatch") || kind === "retired_root_path").length,
  script_surface_gap_count: failures.filter(({ kind }) => kind.includes("script") || kind.includes("command_reference") || kind.includes("lint_")).length,
  workflow_gap_count: failures.filter(({ kind }) => kind.startsWith("workflow_")).length,
  repository_alignment_gap_count: failures.length,
}
if (failures.length > 0) {
  console.error(JSON.stringify({ ok: false, metrics, failures }, null, 2))
  process.exit(1)
}
console.log(JSON.stringify({ ok: true, metrics }, null, 2))
