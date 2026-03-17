#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/packages/lite-react"

OUTPUT=$(npx vitest run --coverage --coverage.provider=v8 --coverage.reporter=text --coverage.reporter=clover 2>&1)
echo "$OUTPUT"

TESTS=$(echo "$OUTPUT" | grep -oP '\d+(?= passed)' | tail -1)

COVERAGE_TEXT=$(echo "$OUTPUT" | grep "All files" || true)
if [ -n "$COVERAGE_TEXT" ]; then
  STMT=$(echo "$COVERAGE_TEXT" | awk -F'|' '{gsub(/[[:space:]]/, "", $2); print $2}')
  BRANCH=$(echo "$COVERAGE_TEXT" | awk -F'|' '{gsub(/[[:space:]]/, "", $3); print $3}')
  FN=$(echo "$COVERAGE_TEXT" | awk -F'|' '{gsub(/[[:space:]]/, "", $4); print $4}')
  LINES=$(echo "$COVERAGE_TEXT" | awk -F'|' '{gsub(/[[:space:]]/, "", $5); print $5}')
  echo "METRIC stmt_coverage=$STMT"
  echo "METRIC branch_coverage=$BRANCH"
  echo "METRIC fn_coverage=$FN"
  echo "METRIC line_coverage=$LINES"
fi

echo "METRIC test_count=$TESTS"
