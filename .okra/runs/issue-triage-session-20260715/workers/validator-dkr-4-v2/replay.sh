#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "$0")/../../../../.." && pwd)"
cd "$repo"

bash .okra/runs/issue-triage-session-20260715/workers/dkr-4-v2/replay.sh
node .okra/runs/issue-triage-session-20260715/workers/validator-dkr-4-v2/independent-probe.mjs
