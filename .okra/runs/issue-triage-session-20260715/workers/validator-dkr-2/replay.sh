#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "$0")/../../../../.." && pwd)"
cd "$repo"

sha256sum \
  .okra/runs/issue-triage-session-20260715/workers/validator-dkr-2/independent-probe.mjs \
  .okra/runs/issue-triage-session-20260715/workers/dkr-2/checkpoint.v2.json \
  pkg/core/lite/src/types.ts \
  pkg/core/lite/src/scope.ts

node .okra/runs/issue-triage-session-20260715/workers/validator-dkr-2/independent-probe.mjs
