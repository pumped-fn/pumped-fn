import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, it } from "node:test";

const root = process.cwd();
const script = join(root, "scripts/check-public-contract.mjs");

const run = (fixture, head = "fixture-head") => {
  const directory = join(root, "scripts/fixtures/public-contract", fixture);
  const result = spawnSync(process.execPath, [
    script,
    "--root", directory,
    "--changed-files", "changed-files.json",
    "--pr-json", "pr.json",
    "--expect-head", head,
  ], { encoding: "utf8" });
  return { ...result, output: JSON.parse(result.stdout) };
};

describe("public contract checker", () => {
  it("accepts a complete contract with an informational non-interface TSDoc gap", () => {
    const result = run("valid");
    assert.equal(result.status, 0);
    assert.deepEqual(result.output.metrics, {
      changed_public_source_package_count: 1,
      changed_public_source_package_without_changeset_count: 0,
      documentation_example_failure_count: 0,
      exported_symbol_count: 2,
      exported_symbol_tsdoc_gap_count: 1,
      major_migration_evidence_gap_count: 0,
      missing_runtime_target_count: 0,
      missing_type_target_count: 0,
      package_changelog_gap_count: 0,
      package_readme_gap_count: 0,
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
    assert.equal(first.stdout, second.stdout);
    assert.deepEqual(first.output.metrics, {
      changed_public_source_package_count: 2,
      changed_public_source_package_without_changeset_count: 1,
      documentation_example_failure_count: 2,
      exported_symbol_count: 2,
      exported_symbol_tsdoc_gap_count: 1,
      major_migration_evidence_gap_count: 1,
      missing_runtime_target_count: 1,
      missing_type_target_count: 1,
      package_changelog_gap_count: 1,
      package_readme_gap_count: 1,
      packed_file_omission_count: 4,
      pr_snapshot_gap_count: 0,
      public_api_interface_count: 1,
      public_api_tsdoc_gap_count: 1,
      public_export_row_count: 3,
      public_package_count: 2,
      public_contract_gap_count: 13,
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
    const result = run("valid", "different-head");
    assert.equal(result.status, 1);
    assert.equal(result.output.metrics.pr_snapshot_gap_count, 1);
    assert.deepEqual(result.output.details.pr_snapshot_gaps, [{
      expected_head: "different-head",
      actual_head: "fixture-head",
      path: "pr.json",
    }]);
  });
});
