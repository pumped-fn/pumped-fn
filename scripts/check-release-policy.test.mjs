import { strict as assert } from "node:assert"
import { execFileSync, spawnSync } from "node:child_process"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, describe, it } from "node:test"

const root = process.cwd()
const script = join(root, "scripts", "check-release-policy.mjs")
const temporary = []

const write = (root, path, value) => {
  const target = join(root, path)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`)
}

const manifest = (name, version, peerDependencies) => ({
  name,
  version,
  ...(peerDependencies ? { peerDependencies } : {}),
})

const createFixture = (valid) => {
  const directory = mkdtempSync(join(tmpdir(), "pumped-release-policy-"))
  temporary.push(directory)
  write(directory, ".changeset/release-policy.json", {
    schemaVersion: 1,
    majorReleasePackages: ["@pumped-fn/fixture-core"],
    compatibilityBumps: {
      pre1Breaking: "major",
      stableBreaking: "minor",
      widening: "patch",
    },
  })
  write(directory, "pkg/core/core/package.json", manifest("@pumped-fn/fixture-core", "1.0.0"))
  write(directory, "pkg/ext/pre/package.json", manifest("@pumped-fn/fixture-pre", "0.2.0", { "@pumped-fn/fixture-core": "^1.0.0" }))
  write(directory, "pkg/ext/stable/package.json", manifest("@pumped-fn/fixture-stable", "2.3.0", { "@pumped-fn/fixture-core": "^1.0.0" }))
  write(directory, "pkg/ext/adapter/package.json", manifest("@pumped-fn/fixture-adapter", "1.0.0", { "@pumped-fn/fixture-core": "^1.0.0" }))
  execFileSync("git", ["init", "-q"], { cwd: directory })
  execFileSync("git", ["config", "user.email", "fixture@example.com"], { cwd: directory })
  execFileSync("git", ["config", "user.name", "Fixture"], { cwd: directory })
  execFileSync("git", ["add", "."], { cwd: directory })
  execFileSync("git", ["commit", "-qm", "baseline"], { cwd: directory })

  write(directory, "pkg/ext/pre/package.json", manifest("@pumped-fn/fixture-pre", "0.2.0", { "@pumped-fn/fixture-core": "^2.0.0" }))
  write(directory, "pkg/ext/stable/package.json", manifest("@pumped-fn/fixture-stable", "2.3.0", { "@pumped-fn/fixture-core": "^2.0.0" }))
  if (valid) {
    write(directory, "pkg/ext/adapter/package.json", manifest("@pumped-fn/fixture-adapter", "1.0.0", {
      "@pumped-fn/fixture-core": "^1.0.0 || ^2.0.0",
    }))
  }
  write(directory, ".changeset/release.md", `---
"@pumped-fn/fixture-core": major
"@pumped-fn/fixture-pre": ${valid ? "major" : "patch"}
"@pumped-fn/fixture-stable": ${valid ? "minor" : "major"}
"@pumped-fn/fixture-adapter": patch
---

Release fixture packages.
`)
  return directory
}

const run = (directory) => {
  const result = spawnSync(process.execPath, [script, "--root", directory, "--base", "HEAD"], { encoding: "utf8" })
  return { ...result, output: JSON.parse(result.stdout) }
}

afterEach(() => {
  while (temporary.length > 0) rmSync(temporary.pop(), { recursive: true, force: true })
})

describe("release policy checker", () => {
  it("accepts core majors, pre-1 graduation, stable minors, and compatibility widening", () => {
    const result = run(createFixture(true))
    assert.equal(result.status, 0)
    assert.deepEqual(result.output.metrics, {
      compatibility_bump_gap_count: 0,
      peer_alignment_gap_count: 0,
      unauthorized_major_count: 0,
      release_policy_gap_count: 0,
    })
  })

  it("rejects undersized pre-1 bumps, stable adapter majors, and stale peer ranges", () => {
    const result = run(createFixture(false))
    assert.equal(result.status, 1)
    assert.deepEqual(result.output.metrics, {
      compatibility_bump_gap_count: 1,
      peer_alignment_gap_count: 1,
      unauthorized_major_count: 1,
      release_policy_gap_count: 3,
    })
  })
})
