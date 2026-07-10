#!/usr/bin/env bash
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SOLUTIONS="${1:?usage: run-suite.sh <solutions-root containing T-1..T-10 dirs> [results-root]}"
SOLUTIONS="$(cd "$SOLUTIONS" && pwd)"
RESULTS_ROOT="${2:-$HERE/results}"
mkdir -p "$RESULTS_ROOT"

TASKS="T-1 T-2 T-3 T-4 T-5 T-6 T-7 T-8 T-9 T-10"
rm -f "$RESULTS_ROOT/suite.json"
for task in $TASKS; do
  rm -rf "${RESULTS_ROOT:?}/$task"
done
for task in $TASKS; do
  echo "=== suite task: $task ==="
  if [ -d "$SOLUTIONS/$task" ]; then
    "$HERE/harness/run-task.sh" "$task" "$SOLUTIONS/$task" "$RESULTS_ROOT"
  else
    mkdir -p "$RESULTS_ROOT/$task"
    node -e '
      const [out, t] = process.argv.slice(1)
      require("fs").writeFileSync(out, JSON.stringify({ task: t, missing_solution: true, gates: null, checker_exit: null, admitted_score: 0, reason: "MISSING_SOLUTION" }, null, 2) + "\n")
    ' "$RESULTS_ROOT/$task/verdict.json" "$task"
    echo "MISSING_SOLUTION: $task" >&2
  fi
done

node -e '
  const fs = require("fs")
  const [resultsRoot] = process.argv.slice(1)
  const multipliers = { "T-1": 0.75, "T-4": 1.25, "T-7": 1.25 }
  const tiers = { "T-1": "B", "T-4": "D", "T-7": "D" }
  const tasks = {}
  let weighted = 0
  let total = 0
  for (let n = 1; n <= 10; n++) {
    const id = "T-" + n
    let v = null
    try { v = JSON.parse(fs.readFileSync(resultsRoot + "/" + id + "/verdict.json", "utf8")) } catch {}
    const mult = multipliers[id] ?? 1.0
    const score = v?.admitted_score ?? 0
    tasks[id] = {
      tier: tiers[id] ?? "C",
      multiplier: mult,
      gates: v?.gates ?? null,
      checker_exit: v?.checker_exit ?? null,
      admitted_score: score,
    }
    weighted += mult * score
    total += mult
  }
  const suite = {
    formula: "suite_% = 100 * sum(multiplier * admitted_score) / sum(multiplier); tiers: B=0.75, C=1.0, D=1.25",
    tasks,
    weighted_sum: weighted,
    multiplier_sum: total,
    suite_pct: Math.round((100 * weighted / total) * 100) / 100,
    passed: Object.values(tasks).filter((t) => t.admitted_score === 1).length,
    finished_at: new Date().toISOString(),
  }
  fs.writeFileSync(resultsRoot + "/suite.json", JSON.stringify(suite, null, 2) + "\n")
  console.log(JSON.stringify(suite, null, 2))
' "$RESULTS_ROOT"
