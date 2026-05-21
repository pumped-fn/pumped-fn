#!/usr/bin/env bash
# Benchmark driver for autoresearch sessions. Runs:
#   1. microbench (no React/JSDOM) — primary signal for profile-guided work
#   2. React vitest bench — real-world reference
# Emits METRIC name=value lines that scripts/parse-metrics.sh consumes.

set -u
cd "$(cd "$(dirname "$0")/.." && pwd)"

# Build dependent workspace packages so the bench sees latest dist.
pnpm -s -F '@pumped-fn/lite' build >/dev/null
pnpm -s -F '@pumped-fn/lite-react' build >/dev/null
pnpm -s -F '@pumped-fn/lite-legend' build >/dev/null

echo "--- microbench (no React) ---" >&2
node prof/micro.mjs 2>&1

echo "--- React bench (vitest bench) ---" >&2
OUT=$(pnpm -s vitest bench --run 2>&1)
echo "$OUT" >&2

strip_ansi() { sed -r 's/\x1b\[[0-9;]*[mGK]//g'; }
PLAIN=$(printf '%s\n' "$OUT" | strip_ansi)

extract() {
  local section="$1" row="$2"
  printf '%s\n' "$PLAIN" | awk -v sec="$section" -v row="$row" '
    $0 ~ sec { in_sec = 1; next }
    /BENCH Summary/ { in_sec = 0 }
    in_sec && $0 ~ row {
      for (i = 1; i <= NF; i++) {
        if ($i ~ /^[0-9]+(\.[0-9]+)?$/) { print $i; exit }
      }
    }'
}

LEGEND_LARGE=$(extract "Large scale" "lite-legend / observer")
SELECT_LARGE=$(extract "Large scale" "lite-react / useSelect")
USEATOM_LARGE=$(extract "Large scale" "lite-react / useAtom")
LEGEND_SMALL=$(extract "Granular updates" "lite-legend / observer")
SELECT_SMALL=$(extract "Granular updates" "lite-react / useSelect")
USEATOM_SMALL=$(extract "Granular updates" "lite-react / useAtom")

emit() { [ -n "$2" ] && printf 'METRIC %s=%s\n' "$1" "$2"; }

emit legend_large_hz  "$LEGEND_LARGE"
emit select_large_hz  "$SELECT_LARGE"
emit useatom_large_hz "$USEATOM_LARGE"
emit legend_small_hz  "$LEGEND_SMALL"
emit select_small_hz  "$SELECT_SMALL"
emit useatom_small_hz "$USEATOM_SMALL"
