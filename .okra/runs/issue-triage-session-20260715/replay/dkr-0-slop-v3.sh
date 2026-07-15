#!/usr/bin/env bash
set -u

repo="$(cd "$(dirname "$0")/../../../.." && pwd)"
lint_output="$(mktemp)"
trap 'rm -f "$lint_output"' EXIT

cd "$repo"
node pkg/tool/lint/dist/cli.mjs --json pkg/sdk/bash pkg/sdk/claude pkg/sdk/codex pkg/sdk/core pkg/sdk/pi pkg/sdk/test pkg/framework/pumped/tests/agent.test.ts >"$lint_output"
lint_exit=$?

LINT_OUTPUT="$lint_output" LINT_EXIT="$lint_exit" node --input-type=module <<'NODE'
import { readFileSync } from "node:fs"

const lint = JSON.parse(readFileSync(process.env.LINT_OUTPUT, "utf8"))
const diagnostics = lint.diagnostics ?? []
const byRule = Object.entries(diagnostics.reduce((counts, diagnostic) => {
  counts[diagnostic.ruleId] = (counts[diagnostic.ruleId] ?? 0) + 1
  return counts
}, {})).sort(([a], [b]) => a.localeCompare(b)).map(([rule_id, count]) => ({ rule_id, count }))

const core = readFileSync("pkg/sdk/core/src/index.ts", "utf8")
const agents = readFileSync("AGENTS.md", "utf8")
const agentsAudit = [
  {
    check_id: "direct-child-process-effect",
    violation_count: core.includes('import("node:child_process")') ? 1 : 0,
    source_ref: "pkg/sdk/core/src/index.ts:583",
    rule_ref: "AGENTS.md Prime Rationale and no uncontrolled side effects",
  },
  {
    check_id: "dynamic-string-dispatch-facade",
    violation_count: core.includes("registry.get(name)") && core.includes("ctx.exec({ flow: target") ? 1 : 0,
    source_ref: "pkg/sdk/core/src/index.ts:112",
    rule_ref: "AGENTS.md explicit graph edges and no facade ceremony",
  },
  {
    check_id: "shared-production-scope-factory",
    violation_count: [...core.matchAll(/createScope\s*\(/g)].length,
    source_ref: "pkg/sdk/core/src/index.ts",
    rule_ref: "AGENTS.md no shared scopes",
  },
  {
    check_id: "agents-rule-source-present",
    violation_count: agents.includes("Prime Rationale") && agents.includes("Code Style (No Slop)") ? 0 : 1,
    source_ref: "AGENTS.md",
    rule_ref: "AGENTS.md",
  },
]
const agentsViolationCount = agentsAudit.reduce((count, check) => count + check.violation_count, 0)

process.stdout.write(`${JSON.stringify({
  schema_version: "dkr-0.slop-gate.v3",
  source_of_truth: "Authoritative pumped-lite-lint diagnostics over changed SDK source and tests plus an explicit AGENTS.md graph-boundary audit.",
  lint_exit_code: Number(process.env.LINT_EXIT),
  files_scanned: lint.filesScanned,
  lint_diagnostic_count: diagnostics.length,
  lint_error_count: diagnostics.filter((diagnostic) => diagnostic.severity === "error").length,
  lint_warning_count: diagnostics.filter((diagnostic) => diagnostic.severity === "warn").length,
  lint_diagnostics_by_rule: byRule,
  agents_audit: agentsAudit,
  agents_audit_violation_count: agentsViolationCount,
  slop_violation_count: diagnostics.length + agentsViolationCount,
}, null, 2)}\n`)
NODE
