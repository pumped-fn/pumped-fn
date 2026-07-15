#!/usr/bin/env bash
set -u

repo="$(cd "$(dirname "$0")/../../../.." && pwd)"
bin="$repo/node_modules/.bin"
status_file="$(mktemp)"
log_dir="$(mktemp -d)"
trap 'rm -f "$status_file"; rm -rf "$log_dir"' EXIT

run_gate() {
  local id="$1"
  local dir="$2"
  shift 2
  local log="$log_dir/$id.log"
  local started_at
  local finished_at
  started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  (cd "$repo/$dir" && "$@") >"$log" 2>&1
  local exit_code=$?
  finished_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  local output_sha
  output_sha="$(sha256sum "$log" | cut -d' ' -f1)"
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$id" "$dir" "$exit_code" "$started_at" "$finished_at" "$output_sha" "$log" >>"$status_file"
}

for package in core bash claude codex pi test; do
  run_gate "build-$package" "pkg/sdk/$package" "$bin/tsdown"
done

for package in core bash claude codex pi test; do
  run_gate "typecheck-$package" "pkg/sdk/$package" "$bin/tsgo" --noEmit
done

for package in core bash claude codex pi test; do
  run_gate "test-$package" "pkg/sdk/$package" "$bin/vitest" run
done

run_gate "typecheck-framework-pumped" "pkg/framework/pumped" "$bin/tsc" --noEmit
run_gate "typecheck-framework-pumped-tests" "pkg/framework/pumped" "$bin/tsc" --noEmit -p tsconfig.test.json
run_gate "test-framework-pumped" "pkg/framework/pumped" "$bin/vitest" run tests/agent.test.ts
run_gate "typecheck-invoice-triage" "examples/invoice-triage" "$bin/tsgo" --noEmit
run_gate "test-invoice-triage" "examples/invoice-triage" "$bin/vitest" run

STATUS_FILE="$status_file" node --input-type=module <<'NODE'
import { readFileSync } from "node:fs"

const gates = readFileSync(process.env.STATUS_FILE, "utf8").trim().split("\n").filter(Boolean).map((line) => {
  const [id, workdir, exitCode, startedAt, finishedAt, outputSha256, log] = line.split("\t")
  const output = readFileSync(log, "utf8")
  return {
    id,
    workdir,
    exit_code: Number(exitCode),
    started_at: startedAt,
    finished_at: finishedAt,
    output_sha256: `sha256:${outputSha256}`,
    ...(Number(exitCode) === 0 ? {} : { output_tail: output.split("\n").slice(-40).join("\n") }),
  }
})

const failed = gates.filter((gate) => gate.exit_code !== 0)
process.stdout.write(`${JSON.stringify({
  schema_version: "dkr-0.regression-gates.v3",
  source_of_truth: "Direct offline build, typecheck, and test commands over every changed SDK package plus changed framework and invoice-triage test surfaces.",
  gate_count: gates.length,
  failed_gate_count: failed.length,
  passed_gate_count: gates.length - failed.length,
  failed_gate_ids: failed.map((gate) => gate.id),
  gates,
}, null, 2)}\n`)
NODE
