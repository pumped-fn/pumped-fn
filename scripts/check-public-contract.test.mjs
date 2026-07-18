import { strict as assert } from "node:assert";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";

const root = process.cwd();
const script = join(root, "scripts/check-public-contract.mjs");

const temporary = [];

const fixture = (name, { legacyExport = false } = {}) => {
  const directory = mkdtempSync(join(tmpdir(), "pumped-public-contract-"));
  temporary.push(directory);
  cpSync(join(root, "scripts/fixtures/public-contract", name), directory, { recursive: true });
  if (legacyExport) {
    const path = join(directory, "pkg/core/demo/package.json");
    const manifest = JSON.parse(readFileSync(path, "utf8"));
    manifest.exports["./legacy"] = manifest.exports["."];
    writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  execFileSync("git", ["init", "-q"], { cwd: directory });
  execFileSync("git", ["config", "user.email", "fixture@example.com"], { cwd: directory });
  execFileSync("git", ["config", "user.name", "Fixture"], { cwd: directory });
  execFileSync("git", ["add", "."], { cwd: directory });
  execFileSync("git", ["commit", "-qm", "fixture"], { cwd: directory });
  return directory;
};

const execute = (directory, { expectedHead, prHead } = {}) => {
  const checkoutHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: directory, encoding: "utf8" }).trim();
  writeFileSync(join(directory, "pr.json"), `${JSON.stringify({ headRefOid: prHead ?? checkoutHead })}\n`);
  const result = spawnSync(process.execPath, [
    script,
    "--root", directory,
    "--base", "HEAD",
    "--changed-files", "changed-files.json",
    "--pr-json", "pr.json",
    "--expect-head", expectedHead ?? checkoutHead,
  ], { encoding: "utf8" });
  return { ...result, output: JSON.parse(result.stdout) };
};
const run = (name, options) => execute(fixture(name), options);

afterEach(() => {
  while (temporary.length > 0) rmSync(temporary.pop(), { recursive: true, force: true });
});

describe("public contract checker", () => {
  it("accepts a complete contract with an informational non-interface TSDoc gap", () => {
    const result = run("valid");
    assert.equal(result.status, 0);
    assert.deepEqual(result.output.metrics, {
      changed_public_source_package_count: 1,
      changed_public_source_package_without_changeset_count: 0,
      current_guidance_exec_gap_count: 0,
      documentation_example_failure_count: 0,
      exported_symbol_count: 2,
      exported_symbol_tsdoc_gap_count: 1,
      major_migration_evidence_gap_count: 0,
      missing_runtime_target_count: 0,
      missing_type_target_count: 0,
      package_changelog_gap_count: 0,
      package_export_removal_gap_count: 0,
      package_readme_gap_count: 0,
      package_retirement_gap_count: 0,
      packed_file_omission_count: 0,
      pr_snapshot_gap_count: 0,
      public_api_interface_count: 1,
      public_api_tsdoc_gap_count: 0,
      public_export_row_count: 1,
      public_package_count: 1,
      public_contract_gap_count: 0,
    });
  });

  it("reports every direct negative fixture metric deterministically", () => {
    const first = run("invalid");
    const second = run("invalid");
    assert.equal(first.status, 1);
    assert.equal(second.status, 1);
    assert.deepEqual(
      { ...first.output, head: undefined },
      { ...second.output, head: undefined },
    );
    assert.deepEqual(first.output.metrics, {
      changed_public_source_package_count: 2,
      changed_public_source_package_without_changeset_count: 1,
      current_guidance_exec_gap_count: 2,
      documentation_example_failure_count: 2,
      exported_symbol_count: 2,
      exported_symbol_tsdoc_gap_count: 1,
      major_migration_evidence_gap_count: 1,
      missing_runtime_target_count: 1,
      missing_type_target_count: 1,
      package_changelog_gap_count: 1,
      package_export_removal_gap_count: 0,
      package_readme_gap_count: 1,
      package_retirement_gap_count: 0,
      packed_file_omission_count: 4,
      pr_snapshot_gap_count: 0,
      public_api_interface_count: 1,
      public_api_tsdoc_gap_count: 1,
      public_export_row_count: 3,
      public_package_count: 2,
      public_contract_gap_count: 15,
    });
    assert.deepEqual(
      first.output.details.documentation_example_failures.map(({ fence, language }) => ({ fence, language })),
      [{ fence: 1, language: "ts" }, { fence: 2, language: "tsx" }],
    );
    assert.ok(
      first.output.details.documentation_example_failures
        .find(({ language }) => language === "tsx")
        .diagnostics.length > 0,
    );
  });

  it("rejects a stale PR snapshot head", () => {
    const result = run("valid", { expectedHead: "different-head" });
    assert.equal(result.status, 1);
    assert.equal(result.output.metrics.pr_snapshot_gap_count, 1);
    assert.deepEqual(result.output.details.pr_snapshot_gaps, [{
      kind: "expected_head_checkout_mismatch",
      expected_head: result.output.head.checkout,
      actual_head: "different-head",
      path: "pr.json",
    }]);
  });

  it("rejects a PR snapshot that is stale against the checkout", () => {
    const result = run("valid", { prHead: "stale-pr-head" });
    assert.equal(result.status, 1);
    assert.equal(result.output.metrics.pr_snapshot_gap_count, 1);
    assert.equal(result.output.details.pr_snapshot_gaps[0].kind, "pr_head_checkout_mismatch");
  });

  it("accepts the GitHub pull_request event snapshot shape", () => {
    const directory = fixture("valid");
    const checkoutHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: directory, encoding: "utf8" }).trim();
    writeFileSync(join(directory, "pr.json"), `${JSON.stringify({ pull_request: { head: { sha: checkoutHead } } })}\n`);
    const result = spawnSync(process.execPath, [
      script,
      "--root", directory,
      "--base", "HEAD",
      "--changed-files", "changed-files.json",
      "--pr-json", "pr.json",
      "--expect-head", checkoutHead,
    ], { encoding: "utf8" });
    assert.equal(result.status, 0);
  });

  it("rejects colluding stale PR and expected heads", () => {
    const result = run("valid", { expectedHead: "same-stale-head", prHead: "same-stale-head" });
    assert.equal(result.status, 1);
    assert.equal(result.output.metrics.pr_snapshot_gap_count, 2);
    assert.deepEqual(
      result.output.details.pr_snapshot_gaps.map(({ kind }) => kind),
      ["expected_head_checkout_mismatch", "pr_head_checkout_mismatch"],
    );
  });

  it("requires explicit retirement evidence for a deleted public package", () => {
    const missing = fixture("valid");
    rmSync(join(missing, "pkg/core/demo"), { recursive: true });
    writeFileSync(join(missing, "changed-files.json"), `${JSON.stringify(["pkg/core/demo/package.json"])}\n`);
    const rejected = execute(missing);
    assert.equal(rejected.status, 1);
    assert.deepEqual(rejected.output.details.package_retirement_gaps, [{
      package: "@fixture/demo",
      path: "pkg/core/demo/package.json",
    }]);

    const explicit = fixture("valid");
    rmSync(join(explicit, "pkg/core/demo"), { recursive: true });
    writeFileSync(join(explicit, "changed-files.json"), `${JSON.stringify(["pkg/core/demo/package.json"])}\n`);
    writeFileSync(join(explicit, ".changeset/retire.md"), "---\n---\n\nRetires: @fixture/demo\n");
    const accepted = execute(explicit);
    assert.equal(accepted.status, 0);
    assert.equal(accepted.output.metrics.package_retirement_gap_count, 0);
  });

  it("requires major evidence when a public export is removed", () => {
    const rejectedDirectory = fixture("valid", { legacyExport: true });
    const rejectedPath = join(rejectedDirectory, "pkg/core/demo/package.json");
    const rejectedManifest = JSON.parse(readFileSync(rejectedPath, "utf8"));
    delete rejectedManifest.exports["./legacy"];
    writeFileSync(rejectedPath, `${JSON.stringify(rejectedManifest, null, 2)}\n`);
    writeFileSync(join(rejectedDirectory, ".changeset/demo.md"), "---\n\"@fixture/demo\": patch\n---\n\nPatch only.\n");
    writeFileSync(join(rejectedDirectory, "changed-files.json"), `${JSON.stringify(["pkg/core/demo/package.json"])}\n`);
    const rejected = execute(rejectedDirectory);
    assert.equal(rejected.status, 1);
    assert.deepEqual(rejected.output.details.package_export_removal_gaps, [{
      package: "@fixture/demo",
      export: "./legacy",
      previous_version: "1.0.0",
      current_version: "1.0.0",
    }]);

    const acceptedDirectory = fixture("valid", { legacyExport: true });
    const acceptedPath = join(acceptedDirectory, "pkg/core/demo/package.json");
    const acceptedManifest = JSON.parse(readFileSync(acceptedPath, "utf8"));
    delete acceptedManifest.exports["./legacy"];
    writeFileSync(acceptedPath, `${JSON.stringify(acceptedManifest, null, 2)}\n`);
    writeFileSync(join(acceptedDirectory, "changed-files.json"), `${JSON.stringify(["pkg/core/demo/package.json"])}\n`);
    const accepted = execute(acceptedDirectory);
    assert.equal(accepted.status, 0);
    assert.equal(accepted.output.metrics.package_export_removal_gap_count, 0);
  });

  it("uses a consumed base changeset as export-removal evidence", () => {
    const directory = fixture("valid", { legacyExport: true });
    const packagePath = join(directory, "pkg/core/demo/package.json");
    const manifest = JSON.parse(readFileSync(packagePath, "utf8"));
    delete manifest.exports["./legacy"];
    manifest.version = "2.0.0";
    writeFileSync(packagePath, `${JSON.stringify(manifest, null, 2)}\n`);
    rmSync(join(directory, ".changeset/demo.md"));
    writeFileSync(join(directory, "changed-files.json"), `${JSON.stringify(["pkg/core/demo/package.json"])}\n`);
    const result = execute(directory);
    assert.equal(result.status, 0);
    assert.equal(result.output.metrics.package_export_removal_gap_count, 0);
  });
});
