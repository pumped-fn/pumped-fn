import { strict as assert } from "node:assert";
import { execFileSync, spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, it } from "node:test";

const root = process.cwd();
const script = join(root, "scripts/check-inline-exec-contract.mjs");
const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const run = (fixture, expectedHead = head) => {
  const result = spawnSync(process.execPath, [
    script,
    "--root", join(root, "scripts/fixtures/inline-exec-contract", fixture),
    "--expect-head", expectedHead,
  ], { encoding: "utf8" });
  return { ...result, output: JSON.parse(result.stdout) };
};

describe("inline execution contract checker", () => {
  it("accepts explicit deps and params on both receivers", () => {
    const result = run("valid");
    assert.equal(result.status, 0);
    assert.deepEqual(result.output.metrics, {
      captured_dependency_count: 0,
      context_callback_argument_count: 0,
      ctx_scope_param_argument_count: 0,
      head_mismatch_count: 0,
      inline_exec_callsite_count: 3,
      legacy_inline_option_type_count: 0,
      missing_deps_count: 0,
      missing_name_count: 0,
      missing_params_count: 0,
      public_context_callback_type_count: 0,
      uninspectable_callback_count: 0,
      inline_exec_contract_gap_count: 0,
    });
  });

  it("reports every negative metric deterministically", () => {
    const first = run("invalid");
    const second = run("invalid");
    assert.equal(first.status, 1);
    assert.equal(first.stdout, second.stdout);
    assert.deepEqual(first.output.metrics, {
      captured_dependency_count: 6,
      context_callback_argument_count: 1,
      ctx_scope_param_argument_count: 2,
      head_mismatch_count: 0,
      inline_exec_callsite_count: 5,
      legacy_inline_option_type_count: 3,
      missing_deps_count: 1,
      missing_name_count: 1,
      missing_params_count: 1,
      public_context_callback_type_count: 1,
      uninspectable_callback_count: 1,
      inline_exec_contract_gap_count: 17,
    });
  });

  it("rejects a stale expected head", () => {
    const result = run("valid", "stale-head");
    assert.equal(result.status, 1);
    assert.equal(result.output.metrics.head_mismatch_count, 1);
  });
});
