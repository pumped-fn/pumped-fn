import { strict as assert } from "node:assert"
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, describe, it } from "node:test"

const root = process.cwd()
const script = join(root, "scripts", "check-repository-alignment.mjs")
const workflow = readFileSync(join(root, ".github", "workflows", "ci.yml"), "utf8")
const temporary = []
const write = (directory, path, value) => {
  const target = join(directory, path)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`)
}
const fixture = (workflowSource = workflow) => {
  const directory = mkdtempSync(join(tmpdir(), "pumped-repository-alignment-"))
  temporary.push(directory)
  write(directory, "packages/demo/package.json", {
    name: "@fixture/demo",
    version: "1.0.0",
    repository: { directory: "packages/demo" },
    devDependencies: { typescript: "catalog:" },
    peerDependencies: { react: "^19.0.0" },
  })
  write(directory, "packages/demo/README.md", "# Demo\n")
  write(directory, "README.md", "`@fixture/demo` lives at `packages/demo`.\n")
  write(directory, "docs/README.md", "# Docs\n")
  write(directory, "package.json", {
    scripts: {
      lint: "pumped-lite-lint --config pumped-lite-lint.json README.md docs scripts packages/*/README.md packages/*/src && pnpm alignment:check",
      "packed-lite:check": "pnpm -r build && node scripts/check-packed-lite.mjs",
      "alignment:check": "node scripts/check-repository-alignment.mjs",
      "ci:changed-packages": "node scripts/check-changed-packages.mjs",
    },
    devDependencies: { "@pumped-fn/lite-lint": "workspace:*" },
  })
  write(directory, "pnpm-workspace.yaml", "packages:\n  - packages/*\n  - benchmarks/*\n\ncatalog:\n  typescript: 7.0.2\n")
  write(directory, "pumped-lite-lint.json", "{}\n")
  write(directory, "tsconfig.base.json", { compilerOptions: { paths: { "@fixture/demo": ["./packages/demo/src/index.ts"] } } })
  write(directory, "scripts/check-repository-alignment.mjs", "")
  write(directory, "scripts/check-changed-packages.mjs", "")
  write(directory, "scripts/check-packed-lite.mjs", "")
  write(directory, "scripts/README.md", "| File | Role |\n| --- | --- |\n| `check-repository-alignment.mjs` | Check. |\n| `check-changed-packages.mjs` | Check. |\n| `check-packed-lite.mjs` | Check. |\n")
  write(directory, ".github/workflows/ci.yml", workflowSource)
  return directory
}
const run = (workflowSource) => spawnSync(process.execPath, [script], { cwd: fixture(workflowSource), encoding: "utf8" })

afterEach(() => {
  while (temporary.length > 0) rmSync(temporary.pop(), { recursive: true, force: true })
})

describe("repository alignment", () => {
  it("accepts the flat package map and exact workflow provenance", () => {
    const result = run()
    assert.equal(result.status, 0, result.stderr)
  })

  it("rejects a missing public lint binary", () => {
    const directory = fixture()
    const manifest = JSON.parse(readFileSync(join(directory, "package.json"), "utf8"))
    manifest.scripts.lint = "node packages/lite-lint/dist/cli.mjs README.md"
    write(directory, "package.json", manifest)
    const result = spawnSync(process.execPath, [script], { cwd: directory, encoding: "utf8" })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /lint_binary_mismatch/u)
  })

  it("rejects a docs-only lint surface", () => {
    const directory = fixture()
    const manifest = JSON.parse(readFileSync(join(directory, "package.json"), "utf8"))
    manifest.scripts.lint = manifest.scripts.lint.replace(" packages/*/src", "")
    write(directory, "package.json", manifest)
    const result = spawnSync(process.execPath, [script], { cwd: directory, encoding: "utf8" })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /lint_path_mismatch/u)
  })

  it("rejects changed-package CI without event provenance", () => {
    const result = run(workflow.replace(
      "BASE_REF: ${{ github.event.pull_request.base.sha || github.event.before }}",
      "BASE_REF: origin/main",
    ))
    assert.equal(result.status, 1)
    assert.match(result.stderr, /workflow_changed_package_provenance/u)
  })
})
