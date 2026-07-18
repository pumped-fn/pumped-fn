import { strict as assert } from "node:assert"
import { spawnSync } from "node:child_process"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, describe, it } from "node:test"
import "./check-changed-packages.test.mjs"

const root = process.cwd()
const script = join(root, "scripts", "check-example-alignment.mjs")
const workflow = readFileSync(join(root, ".github", "workflows", "ci.yml"), "utf8")
const temporary = []

const write = (directory, path, value) => {
  const target = join(directory, path)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, value)
}

const fixture = (workflowSource) => {
  const directory = mkdtempSync(join(tmpdir(), "pumped-example-alignment-"))
  temporary.push(directory)
  for (const path of ["docs", "examples", "pkg", "scripts"]) mkdirSync(join(directory, path), { recursive: true })
  for (const path of ["README.md", "examples/README.md", "scripts/README.md", "pkg/README.md"]) write(directory, path, "# Fixture\n")
  for (const path of ["scripts/check-example-alignment.test.mjs", "scripts/check-changed-packages.test.mjs"]) {
    write(directory, path, readFileSync(join(root, path), "utf8"))
  }
  write(directory, "pnpm-workspace.yaml", "catalog:\n")
  write(directory, "package.json", `${JSON.stringify({
    scripts: {
      lint: "node pkg/tool/lint/dist/cli.mjs README.md examples/README.md scripts/README.md pkg/README.md",
    },
  })}\n`)
  write(directory, ".github/workflows/ci.yml", workflowSource)
  return directory
}

const run = (workflowSource) => spawnSync(process.execPath, [script], {
  cwd: fixture(workflowSource),
  encoding: "utf8",
})

afterEach(() => {
  while (temporary.length > 0) rmSync(temporary.pop(), { recursive: true, force: true })
})

describe("example alignment workflow anchors", () => {
  it("accepts exact-head contract wiring before the anchored changeset skip", () => {
    const result = run(workflow)
    assert.equal(result.status, 0)
    assert.equal(JSON.parse(result.stdout).metrics.workflow_policy_gate_order_gap_count, 0)
  })

  it("rejects an unanchored title substring skip", () => {
    const result = run(workflow.replace(
      '[[ "$PR_TITLE" =~ $TITLE_SKIP_PATTERN ]]',
      '[[ "$PR_TITLE" == *"chore:"* ]]',
    ))
    assert.equal(result.status, 1)
    assert.match(result.stderr, /workflow_policy_gate_order/u)
  })

  it("rejects contract wiring without the exact PR snapshot input", () => {
    const result = run(workflow.replace(' --pr-json "$GITHUB_EVENT_PATH"', ""))
    assert.equal(result.status, 1)
    assert.match(result.stderr, /workflow_contract_gate_order/u)
  })

  it("rejects Changeset policy without exact event head and base provenance", () => {
    const result = run(workflow
      .replace("ref: ${{ github.event.pull_request.head.sha || github.sha }}", "ref: HEAD")
      .replace("BASE_SHA: ${{ github.event.pull_request.base.sha || github.event.before }}", "BASE_SHA: origin/main"))
    assert.equal(result.status, 1)
    assert.match(result.stderr, /workflow_policy_gate_order/u)
  })

  it("rejects changed-package execution without event provenance", () => {
    const result = run(workflow.replace(
      "BASE_REF: ${{ github.event.pull_request.base.sha || github.event.before }}",
      "BASE_REF: origin/main",
    ))
    assert.equal(result.status, 1)
    assert.match(result.stderr, /workflow_changed_package_provenance/u)
  })

})
