#!/usr/bin/env bash
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SUITE="$(cd "$HERE/.." && pwd)"
TASK_ID="${1:?usage: run-task.sh <task-id e.g. T-3> <solution-dir> [results-root]}"
SOLUTION="${2:?usage: run-task.sh <task-id> <solution-dir> [results-root]}"
RESULTS_ROOT="${3:-$SUITE/results}"
SOLUTION="$(cd "$SOLUTION" && pwd)"
RESULT_DIR="$RESULTS_ROOT/$TASK_ID"
rm -rf "$RESULT_DIR"
mkdir -p "$RESULT_DIR"
node -e '
  const [out, task] = process.argv.slice(1)
  require("fs").writeFileSync(out, JSON.stringify({ task: task, gates: null, checker_exit: null, admitted_score: 0, reason: "ABORTED_BEFORE_VERDICT: run-task.sh did not reach a completed gate verdict" }, null, 2) + "\n")
' "$RESULT_DIR/verdict.json" "$TASK_ID"
WS="$(mktemp -d "${TMPDIR:-/tmp}/suite-$TASK_ID-XXXXXX")"

"$HERE/instantiate.sh" "$TASK_ID" "$SOLUTION" "$WS" > "$RESULT_DIR/instantiate.log" 2>&1
INST_EXIT=$?
if [ "$INST_EXIT" -ne 0 ]; then
  node -e '
    const [out, task, ws] = process.argv.slice(1)
    require("fs").writeFileSync(out, JSON.stringify({ task: task, workspace: ws, instantiate_exit: 1, gates_passed: false, gates: null, checker_exit: null, admitted_score: 0, reason: "INSTANTIATE_FAILED" }, null, 2) + "\n")
  ' "$RESULT_DIR/verdict.json" "$TASK_ID" "$WS"
  echo "INSTANTIATE_FAILED: $TASK_ID" >&2
  rm -rf "$WS"
  exit 1
fi

ENTRY_COUNT="$(find "$WS/bin" -maxdepth 1 -name '*.ts' 2>/dev/null | wc -l)"
if [ "$ENTRY_COUNT" -ne 1 ]; then
  node -e '
    const [out, task, count] = process.argv.slice(1)
    require("fs").writeFileSync(out, JSON.stringify({ task: task, entrypoint: null, gates: null, checker_exit: null, admitted_score: 0, reason: "ENTRYPOINT_AMBIGUOUS: " + count + " bin/*.ts files (need exactly 1)" }, null, 2) + "\n")
  ' "$RESULT_DIR/verdict.json" "$TASK_ID" "$ENTRY_COUNT"
  echo "ENTRYPOINT_AMBIGUOUS: $TASK_ID has $ENTRY_COUNT files under bin/" >&2
  rm -rf "$WS"
  exit 2
fi
ENTRY="bin/$(basename "$(find "$WS/bin" -maxdepth 1 -name '*.ts')")"

"$HERE/run-all-gates.sh" "$WS" "$ENTRY" "check.mjs" > "$RESULT_DIR/gates.log" 2>&1
GATES_EXIT=$?

cp "$WS/gates.json" "$RESULT_DIR/gates.json" 2>/dev/null
for log in "$WS"/gate-*.log; do
  [ -f "$log" ] && cp "$log" "$RESULT_DIR/"
done

node -e '
  const fs = require("fs")
  const [out, task, ws, entry, gatesExit, gatesJsonPath] = process.argv.slice(1)
  let gates = null
  try { gates = JSON.parse(fs.readFileSync(gatesJsonPath, "utf8")) } catch {}
  const checkerExit = gates?.gates?.checker?.exit ?? null
  const allPass = gates !== null && ["lint", "tsgo", "vitest", "smoke", "checker"].every((g) => gates.gates?.[g]?.exit === 0)
  fs.writeFileSync(out, JSON.stringify({
    task: task,
    entrypoint: entry,
    gates_exit: Number(gatesExit),
    gates: gates ? Object.fromEntries(Object.entries(gates.gates).map(([k, v]) => [k, v.exit])) : null,
    checker_exit: checkerExit,
    lint_tarball_sha256: gates?.lint_tarball_sha256 ?? null,
    lite_tarball_sha256: gates?.lite_tarball_sha256 ?? null,
    admitted_score: allPass ? 1 : 0,
  }, null, 2) + "\n")
' "$RESULT_DIR/verdict.json" "$TASK_ID" "$WS" "$ENTRY" "$GATES_EXIT" "$RESULT_DIR/gates.json"

rm -rf "$WS"
cat "$RESULT_DIR/verdict.json"
exit "$GATES_EXIT"
