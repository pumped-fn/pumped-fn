import { createHash } from "node:crypto"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

const root = process.cwd()
const enforce = process.argv.includes("--enforce")
const observedAt = new Date().toISOString()

function pathOf(path) {
  return join(root, path)
}

function read(path) {
  return readFileSync(pathOf(path), "utf8")
}

function readJson(path) {
  return JSON.parse(read(path))
}

function collect(dir, accept) {
  if (!existsSync(pathOf(dir))) return []
  return readdirSync(pathOf(dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".vite") return []
    if (entry.isDirectory()) return collect(path, accept)
    return entry.isFile() && accept(path) ? [path] : []
  })
}

function sha(path) {
  return `sha256:${createHash("sha256").update(read(path)).digest("hex")}`
}

function count(paths, pattern) {
  return paths.reduce((total, path) => total + [...read(path).matchAll(pattern)].length, 0)
}

function has(paths, pattern) {
  return paths.some((path) => pattern.test(read(path)))
}

function dependencies(manifest) {
  return {
    ...manifest.dependencies,
    ...manifest.devDependencies,
    ...manifest.peerDependencies,
  }
}

function status(value, comparator, threshold) {
  if (comparator === "==") return value === threshold ? "pass" : "fail"
  if (comparator === "<=") return value <= threshold ? "pass" : "fail"
  if (comparator === ">=") return value >= threshold ? "pass" : "fail"
  throw new Error(`Unsupported comparator ${comparator}`)
}

function metric(metricId, value, comparator, threshold, source, evidence) {
  return {
    metric_id: metricId,
    value,
    comparator,
    threshold,
    status: status(value, comparator, threshold),
    source,
    evidence_refs_or_hashes: [...new Set(evidence)],
  }
}

const src = collect("examples/invoice-triage/src", (path) => path.endsWith(".ts")).sort()
const tests = collect("examples/invoice-triage/tests", (path) => path.endsWith(".ts")).sort()
const bin = collect("examples/invoice-triage/bin", (path) => path.endsWith(".ts")).sort()
const manifest = readJson("examples/invoice-triage/package.json")
const deps = dependencies(manifest)
const srcEvidence = src.map(sha)
const exampleEvidence = [...src, ...tests, ...bin].map(sha)
const packageEvidence = [sha("examples/invoice-triage/package.json")]
const runStore = "invoice-triage-operational-20260706"
const runStoreFiles = [
  `.okra/runs/${runStore}/frame/frame.v1.json`,
  `.okra/runs/${runStore}/tree/tree.v1.json`,
  `.okra/runs/${runStore}/ledger.jsonl`,
  `.okra/runs/${runStore}/flags.jsonl`,
  `.okra/runs/${runStore}/checkins.jsonl`,
]

const hasServer = existsSync(pathOf("examples/invoice-triage/src/server.ts"))
const hasCli = existsSync(pathOf("examples/invoice-triage/src/cli.ts")) || Boolean(manifest.bin)
const hasWatcher = existsSync(pathOf("examples/invoice-triage/src/watcher.ts")) ||
  has(src, /\bfs\.(?:watch|watchFile)\s*\(|\bchokidar\b/)
const hasDockerCompose = [
  "examples/invoice-triage/compose.yaml",
  "examples/invoice-triage/compose.yml",
  "examples/invoice-triage/docker-compose.yaml",
  "examples/invoice-triage/docker-compose.yml",
].some((path) => existsSync(pathOf(path)))
const hasDrizzle = Boolean(deps["drizzle-orm"]) && (Boolean(deps.pg) || Boolean(deps.postgres))
const hasCodex = Boolean(deps["@pumped-fn/sdk-codex"]) && !has(src, /\bprovider\(heuristic\)/)
const hasAudit = existsSync(pathOf("examples/invoice-triage/src/audit.ts")) || has(src, /\baudit\b/i)
const hasDynamicDatabaseStartup = has(src, /tags\.optional\(databaseStartup\)/) &&
  has(src, /controller\(migrateDatabase\)/) &&
  has(src, /controller\(verifyDatabase\)/) &&
  has(src, /startup === "migrate"[\s\S]*migrate\.exec\(\)/) &&
  has(src, /startup === "verify"[\s\S]*verify\.exec\(\)/)
const hasRunStore = runStoreFiles.every((path) => existsSync(pathOf(path)))
const runStoreEvidence = hasRunStore ? runStoreFiles.map(sha) : [sha("examples/invoice-triage/OPERATIONS-OKR.md")]

const metrics = [
  metric(
    "raw_bound_dependency_count",
    count(src, /\bbound\s*\(/g),
    "==",
    0,
    "examples/invoice-triage/src",
    srcEvidence,
  ),
  metric(
    "ctx_scope_escape_count",
    count(src, /\bLite\.(?:ExecutionContext|ResolveContext)\b/g),
    "==",
    0,
    "examples/invoice-triage/src",
    srcEvidence,
  ),
  metric(
    "volatile_operational_state_count",
    count(src, /export const (?:queue|ledger) = atom\s*\(/g),
    "==",
    0,
    "examples/invoice-triage/src",
    srcEvidence,
  ),
  metric(
    "conditional_test_specific_leak_count",
    count(src, /\b(?:DatabaseOpenOptions|migrationPolicy|NODE_ENV|VITEST|vitest|__TEST__)\b/g),
    "==",
    0,
    "examples/invoice-triage/src",
    srcEvidence,
  ),
  metric(
    "production_builtin_leak_count",
    count(src, /\bprocess\.(?:env|stdin|argv)\b|node:readline/g),
    "==",
    0,
    "examples/invoice-triage/src",
    srcEvidence,
  ),
  metric(
    "production_test_material_leak_count",
    count(src, /\b(?:memoryDatabase|MemoryInvoiceDatabase|DatabaseSeed|memoryMailer)\b/g),
    "==",
    0,
    "examples/invoice-triage/src",
    srcEvidence,
  ),
  metric(
    "user_defined_class_count",
    count([...src, ...tests, ...bin], /\bclass\s+[A-Z][A-Za-z0-9_]*/g),
    "==",
    0,
    "examples/invoice-triage src/tests/bin",
    exampleEvidence,
  ),
  metric(
    "dynamic_resource_loading_gap_count",
    hasDynamicDatabaseStartup ? 0 : 1,
    "==",
    0,
    "examples/invoice-triage/src/database-lifecycle.ts",
    srcEvidence,
  ),
  metric(
    "stdin_only_intake_count",
    has(src, /process\.stdin|node:readline/) && !hasCli && !hasWatcher ? 1 : 0,
    "==",
    0,
    "examples/invoice-triage/src plus package entrypoints",
    srcEvidence,
  ),
  metric(
    "postgres_drizzle_gap_count",
    hasDrizzle ? 0 : 1,
    "==",
    0,
    "examples/invoice-triage/package.json",
    packageEvidence,
  ),
  metric(
    "rest_server_gap_count",
    hasServer ? 0 : 1,
    "==",
    0,
    "examples/invoice-triage/src/server.ts",
    srcEvidence,
  ),
  metric(
    "cli_gap_count",
    hasCli ? 0 : 1,
    "==",
    0,
    "examples/invoice-triage/src/cli.ts or package bin",
    packageEvidence,
  ),
  metric(
    "directory_watcher_gap_count",
    hasWatcher ? 0 : 1,
    "==",
    0,
    "examples/invoice-triage/src",
    srcEvidence,
  ),
  metric(
    "audit_gap_count",
    hasAudit ? 0 : 1,
    "==",
    0,
    "examples/invoice-triage/src/audit.ts or audit references",
    srcEvidence,
  ),
  metric(
    "fake_codex_showcase_count",
    hasCodex ? 0 : 1,
    "==",
    0,
    "examples/invoice-triage/package.json and src/main.ts",
    [...packageEvidence, sha("examples/invoice-triage/src/main.ts")],
  ),
  metric(
    "docker_compose_gap_count",
    hasDockerCompose ? 0 : 1,
    "==",
    0,
    "examples/invoice-triage compose file",
    packageEvidence,
  ),
  metric(
    "module_mock_or_internal_reach_count",
    count(tests, /\bvi\.mock\s*\(|\bjest\.mock\s*\(|(?:\.\.\/){2,}pkg\/core\/lite\/src/g),
    "==",
    0,
    "examples/invoice-triage/tests",
    tests.map(sha),
  ),
  metric(
    "repo_okra_run_store_gap_count",
    hasRunStore ? 0 : 1,
    "==",
    0,
    `.okra/runs/${runStore}`,
    runStoreEvidence,
  ),
]

const objectiveMetric = metric(
  "invoice_triage_operational_showcase_gate_pass_count",
  metrics.filter((item) => item.status === "pass").length,
  "==",
  metrics.length,
  "derived from invoice-triage OKR gate metrics",
  [...new Set(metrics.flatMap((item) => item.evidence_refs_or_hashes))],
)

const result = {
  artifact: "invoice-triage-operational-okr-metrics",
  observed_at: observedAt,
  objective: objectiveMetric,
  metrics,
  failed_metrics: metrics.filter((item) => item.status !== "pass").map((item) => item.metric_id),
}

console.log(JSON.stringify(result, null, 2))

if (enforce && result.failed_metrics.length > 0) process.exitCode = 1
