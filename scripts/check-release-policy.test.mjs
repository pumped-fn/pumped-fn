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

const manifest = (name, version, peerDependencies, peerDependenciesMeta) => ({
  name,
  version,
  ...(peerDependencies ? { peerDependencies } : {}),
  ...(peerDependenciesMeta ? { peerDependenciesMeta } : {}),
})

const createFixture = (valid) => {
  const directory = mkdtempSync(join(tmpdir(), "pumped-release-policy-"))
  temporary.push(directory)
  write(directory, ".changeset/release-policy.json", {
    schemaVersion: 1,
    majorReleasePackages: [
      "@pumped-fn/fixture-core",
      "@pumped-fn/fixture-required",
      "@pumped-fn/fixture-stable",
    ],
    compatibilityBumps: {
      pre1Breaking: "major",
      stableBreaking: "major",
      widening: "patch",
    },
  })
  write(directory, "pkg/core/core/package.json", manifest("@pumped-fn/fixture-core", "1.0.0"))
  write(directory, "pkg/ext/pre/package.json", manifest("@pumped-fn/fixture-pre", "0.2.0", { "@pumped-fn/fixture-core": "^1.0.0" }))
  write(directory, "pkg/ext/stable/package.json", manifest("@pumped-fn/fixture-stable", "2.3.0", { "@pumped-fn/fixture-core": "^1.0.0" }))
  write(directory, "pkg/ext/adapter/package.json", manifest("@pumped-fn/fixture-adapter", "1.0.0", { "@pumped-fn/fixture-core": "^1.0.0" }))
  write(directory, "pkg/ext/required/package.json", manifest("@pumped-fn/fixture-required", "1.0.0"))
  write(directory, "pkg/ext/optional/package.json", manifest("@pumped-fn/fixture-optional", "1.0.0"))
  write(directory, "pkg/ext/transition/package.json", manifest(
    "@pumped-fn/fixture-transition",
    "1.0.0",
    { "@pumped-fn/fixture-core": "^1.0.0 || ^2.0.0" },
    { "@pumped-fn/fixture-core": { optional: true } },
  ))
  write(directory, "pkg/ext/unplanned/package.json", manifest("@pumped-fn/fixture-unplanned", "1.0.0"))
  write(directory, "pkg/ext/retired/package.json", manifest("@pumped-fn/fixture-retired", "1.0.0"))
  execFileSync("git", ["init", "-q"], { cwd: directory })
  execFileSync("git", ["config", "user.email", "fixture@example.com"], { cwd: directory })
  execFileSync("git", ["config", "user.name", "Fixture"], { cwd: directory })
  execFileSync("git", ["add", "."], { cwd: directory })
  execFileSync("git", ["commit", "-qm", "baseline"], { cwd: directory })

  write(directory, "pkg/ext/pre/package.json", manifest("@pumped-fn/fixture-pre", "0.2.0", { "@pumped-fn/fixture-core": "^2.0.0" }))
  write(directory, "pkg/ext/stable/package.json", manifest("@pumped-fn/fixture-stable", "2.3.0", { "@pumped-fn/fixture-core": "^2.0.0" }))
  write(directory, "pkg/ext/new/package.json", manifest("@pumped-fn/fixture-new", "0.1.0", {
    "@pumped-fn/fixture-core": "^1.0.0 || ^2.0.0",
  }))
  write(directory, "pkg/ext/required/package.json", manifest("@pumped-fn/fixture-required", "1.0.0", {
    "@pumped-fn/fixture-core": "^1.0.0 || ^2.0.0",
  }))
  write(directory, "pkg/ext/optional/package.json", manifest(
    "@pumped-fn/fixture-optional",
    "1.0.0",
    { "@pumped-fn/fixture-core": "^1.0.0 || ^2.0.0" },
    { "@pumped-fn/fixture-core": { optional: true } },
  ))
  write(directory, "pkg/ext/transition/package.json", manifest(
    "@pumped-fn/fixture-transition",
    "1.0.0",
    { "@pumped-fn/fixture-core": "^1.0.0 || ^2.0.0" },
    { "@pumped-fn/fixture-core": { optional: true } },
  ))
  if (valid) {
    write(directory, "pkg/ext/adapter/package.json", manifest("@pumped-fn/fixture-adapter", "1.0.0", {
      "@pumped-fn/fixture-core": "^1.0.0 || ^2.0.0",
    }))
  }
  write(directory, ".changeset/release.md", `---
"@pumped-fn/fixture-core": major
"@pumped-fn/fixture-pre": ${valid ? "major" : "patch"}
"@pumped-fn/fixture-stable": ${valid ? "major" : "minor"}
"@pumped-fn/fixture-adapter": ${valid ? "patch" : "major"}
"@pumped-fn/fixture-required": ${valid ? "major" : "patch"}
"@pumped-fn/fixture-optional": patch
"@pumped-fn/fixture-transition": patch
"@pumped-fn/fixture-new": patch
---

Release fixture packages.
`)
  return directory
}

const run = (directory, env = process.env) => {
  const result = spawnSync(process.execPath, [script, "--root", directory, "--base", "HEAD"], { encoding: "utf8", env })
  return { ...result, output: result.stdout ? JSON.parse(result.stdout) : undefined }
}

afterEach(() => {
  while (temporary.length > 0) rmSync(temporary.pop(), { recursive: true, force: true })
})

describe("release policy checker", () => {
  it("accepts core majors, pre-1 graduation, stable majors, and compatibility widening", () => {
    const result = run(createFixture(true))
    assert.equal(result.status, 0)
    assert.deepEqual(result.output.metrics, {
      compatibility_bump_gap_count: 0,
      peer_alignment_gap_count: 0,
      package_retirement_gap_count: 0,
      unauthorized_major_count: 0,
      version_delta_gap_count: 0,
      release_policy_gap_count: 0,
    })
  })

  it("rejects undersized pre-1 and stable bumps, unauthorized adapter majors, and stale peer ranges", () => {
    const result = run(createFixture(false))
    assert.equal(result.status, 1)
    assert.deepEqual(result.output.metrics, {
      compatibility_bump_gap_count: 3,
      peer_alignment_gap_count: 1,
      package_retirement_gap_count: 0,
      unauthorized_major_count: 1,
      version_delta_gap_count: 0,
      release_policy_gap_count: 5,
    })
    assert.deepEqual(
      result.output.details.compatibility_bump_gaps.find(({ package: name }) => name === "@pumped-fn/fixture-stable"),
      {
        package: "@pumped-fn/fixture-stable",
        peer: "@pumped-fn/fixture-core",
        previous: "^1.0.0",
        previous_optional: false,
        current: "^2.0.0",
        current_optional: false,
        required: "major",
        declared: "minor",
      },
    )
    assert.deepEqual(
      result.output.details.compatibility_bump_gaps.find(({ package: name }) => name === "@pumped-fn/fixture-required"),
      {
        package: "@pumped-fn/fixture-required",
        peer: "@pumped-fn/fixture-core",
        previous: null,
        previous_optional: false,
        current: "^1.0.0 || ^2.0.0",
        current_optional: false,
        required: "major",
        declared: "patch",
      },
    )
  })

  it("accepts direct versions produced by the declared Changesets plan", () => {
    const directory = createFixture(true)
    write(directory, "pkg/core/core/package.json", manifest("@pumped-fn/fixture-core", "2.0.0"))
    write(directory, "pkg/ext/pre/package.json", manifest("@pumped-fn/fixture-pre", "1.0.0", { "@pumped-fn/fixture-core": "^2.0.0" }))
    write(directory, "pkg/ext/stable/package.json", manifest("@pumped-fn/fixture-stable", "3.0.0", { "@pumped-fn/fixture-core": "^2.0.0" }))
    write(directory, "pkg/ext/adapter/package.json", manifest("@pumped-fn/fixture-adapter", "1.0.1", {
      "@pumped-fn/fixture-core": "^1.0.0 || ^2.0.0",
    }))
    write(directory, "pkg/ext/required/package.json", manifest("@pumped-fn/fixture-required", "2.0.0", {
      "@pumped-fn/fixture-core": "^1.0.0 || ^2.0.0",
    }))
    write(directory, "pkg/ext/optional/package.json", manifest(
      "@pumped-fn/fixture-optional",
      "1.0.1",
      { "@pumped-fn/fixture-core": "^1.0.0 || ^2.0.0" },
      { "@pumped-fn/fixture-core": { optional: true } },
    ))
    const result = run(directory)
    assert.equal(result.status, 0)
    assert.equal(result.output.metrics.version_delta_gap_count, 0)
  })

  it("recovers a consumed Changesets plan from the base commit", () => {
    const directory = createFixture(true)
    execFileSync("git", ["add", ".changeset/release.md"], { cwd: directory })
    execFileSync("git", ["commit", "-qm", "plan"], { cwd: directory })
    write(directory, "pkg/core/core/package.json", manifest("@pumped-fn/fixture-core", "2.0.0"))
    write(directory, "pkg/ext/pre/package.json", manifest("@pumped-fn/fixture-pre", "1.0.0", { "@pumped-fn/fixture-core": "^2.0.0" }))
    write(directory, "pkg/ext/stable/package.json", manifest("@pumped-fn/fixture-stable", "3.0.0", { "@pumped-fn/fixture-core": "^2.0.0" }))
    write(directory, "pkg/ext/adapter/package.json", manifest("@pumped-fn/fixture-adapter", "1.0.1", {
      "@pumped-fn/fixture-core": "^1.0.0 || ^2.0.0",
    }))
    write(directory, "pkg/ext/required/package.json", manifest("@pumped-fn/fixture-required", "2.0.0", {
      "@pumped-fn/fixture-core": "^1.0.0 || ^2.0.0",
    }))
    rmSync(join(directory, ".changeset/release.md"))
    const result = run(directory)
    assert.equal(result.status, 0)
    assert.equal(result.output.metrics.version_delta_gap_count, 0)
    assert.equal(result.output.metrics.unauthorized_major_count, 0)
  })

  it("rejects an optional peer becoming required without a breaking bump", () => {
    const directory = createFixture(true)
    write(directory, "pkg/ext/transition/package.json", manifest(
      "@pumped-fn/fixture-transition",
      "1.0.0",
      { "@pumped-fn/fixture-core": "^1.0.0 || ^2.0.0" },
    ))
    const result = run(directory)
    assert.equal(result.status, 1)
    assert.deepEqual(result.output.details.compatibility_bump_gaps, [{
      package: "@pumped-fn/fixture-transition",
      peer: "@pumped-fn/fixture-core",
      previous: "^1.0.0 || ^2.0.0",
      previous_optional: true,
      current: "^1.0.0 || ^2.0.0",
      current_optional: false,
      required: "major",
      declared: "patch",
    }])
  })

  it("requires explicit retirement evidence for a deleted public package", () => {
    const missing = createFixture(true)
    rmSync(join(missing, "pkg/ext/retired"), { recursive: true })
    const rejected = run(missing)
    assert.equal(rejected.status, 1)
    assert.deepEqual(rejected.output.details.package_retirement_gaps, [{
      package: "@pumped-fn/fixture-retired",
      path: "pkg/ext/retired/package.json",
    }])

    const explicit = createFixture(true)
    rmSync(join(explicit, "pkg/ext/retired"), { recursive: true })
    write(explicit, ".changeset/retire.md", "---\n---\n\nRetires: @pumped-fn/fixture-retired\n")
    const accepted = run(explicit)
    assert.equal(accepted.status, 0)
    assert.equal(accepted.output.metrics.package_retirement_gap_count, 0)
  })

  it("rejects mismatched and unplanned direct version deltas", () => {
    const directory = createFixture(true)
    write(directory, "pkg/core/core/package.json", manifest("@pumped-fn/fixture-core", "1.1.0"))
    write(directory, "pkg/ext/unplanned/package.json", manifest("@pumped-fn/fixture-unplanned", "1.0.1"))
    const result = run(directory)
    assert.equal(result.status, 1)
    assert.equal(result.output.metrics.version_delta_gap_count, 2)
    assert.deepEqual(result.output.details.version_delta_gaps, [
      {
        package: "@pumped-fn/fixture-core",
        previous: "1.0.0",
        current: "1.1.0",
        declared: "major",
        expected: "2.0.0",
      },
      {
        package: "@pumped-fn/fixture-unplanned",
        previous: "1.0.0",
        current: "1.0.1",
        declared: null,
        expected: null,
      },
    ])
  })

  it("fails closed when git cannot read the baseline", () => {
    const directory = createFixture(true)
    const result = run(directory, { ...process.env, PATH: join(directory, "missing-bin") })
    assert.notEqual(result.status, 0)
    assert.equal(result.output, undefined)
    assert.match(result.stderr, /git ls-tree .* failed: (?:spawnSync git ENOENT|Executable not found in \$PATH)/u)
  })
})
