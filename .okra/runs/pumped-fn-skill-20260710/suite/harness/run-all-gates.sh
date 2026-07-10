#!/usr/bin/env bash
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
WS="${1:?usage: run-all-gates.sh <workspace> <entrypoint e.g. bin/main.ts> <checker e.g. check-t7.mjs>}"
ENTRY="${2:?usage: run-all-gates.sh <workspace> <entrypoint> <checker>}"
CHECKER="${3:?usage: run-all-gates.sh <workspace> <entrypoint> <checker>}"
WS="$(cd "$WS" && pwd)"
GATES_JSON="$WS/gates.json"

LITE_TGZ="$HERE/tarballs/pumped-fn-lite-4.0.0.tgz"
LINT_TGZ="$HERE/tarballs/pumped-fn-lite-lint-1.0.0.tgz"
LITE_SHA="$(sha256sum "$LITE_TGZ" | cut -d' ' -f1)"
LINT_SHA="$(sha256sum "$LINT_TGZ" | cut -d' ' -f1)"
LINT_CLI="$WS/node_modules/@pumped-fn/lite-lint/dist/cli.mjs"
LINT_CLI_SHA="$(sha256sum "$LINT_CLI" | cut -d' ' -f1)"
LITE_MJS="$WS/node_modules/@pumped-fn/lite/dist/index.mjs"
LITE_MJS_SHA="$(sha256sum "$LITE_MJS" | cut -d' ' -f1)"

RESULTS="{}"
add_gate() {
  RESULTS="$(node -e '
    const [results, gate, exit, shas] = process.argv.slice(1)
    const r = JSON.parse(results)
    r[gate] = { exit: Number(exit), sha256s: JSON.parse(shas) }
    console.log(JSON.stringify(r))
  ' "$RESULTS" "$1" "$2" "$3")"
}
write_json() {
  node -e '
    const [results, lintSha, liteSha, lintCliSha, liteMjsSha, ws, out] = process.argv.slice(1)
    const doc = {
      lint_tarball_sha256: lintSha,
      lite_tarball_sha256: liteSha,
      installed_lint_cli_sha256: lintCliSha,
      installed_lite_mjs_sha256: liteMjsSha,
      workspace: ws,
      finished_at: new Date().toISOString(),
      gates: JSON.parse(results),
    }
    require("fs").writeFileSync(out, JSON.stringify(doc, null, 2) + "\n")
  ' "$RESULTS" "$LINT_SHA" "$LITE_SHA" "$LINT_CLI_SHA" "$LITE_MJS_SHA" "$WS" "$GATES_JSON"
}

run_gate() {
  local name="$1"; shift
  local shas="$1"; shift
  echo "=== gate: $name ==="
  (cd "$WS" && "$@") 2>&1 | tee "$WS/gate-$name.log"
  local exit="${PIPESTATUS[0]}"
  add_gate "$name" "$exit" "$shas"
  if [ "$exit" -ne 0 ]; then
    write_json
    echo "GATE_FAILED: $name (exit $exit)" >&2
    exit 1
  fi
}

run_gate lint "{\"lint_tarball\":\"$LINT_SHA\",\"installed_cli\":\"$LINT_CLI_SHA\"}" \
  npx pumped-lite-lint --max-warnings 0 src bin tests
run_gate tsgo "{}" npx tsgo --noEmit
run_gate vitest "{}" npx vitest run
run_gate smoke "{}" npx tsx "$ENTRY"
run_gate checker "{\"lite_tarball\":\"$LITE_SHA\",\"installed_lite\":\"$LITE_MJS_SHA\"}" \
  node --import tsx "$CHECKER"

write_json
echo "ALL_GATES_PASSED"
cat "$GATES_JSON"
