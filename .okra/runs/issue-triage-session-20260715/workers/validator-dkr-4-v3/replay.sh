#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "$0")/../../../../.." && pwd)"
cd "$repo"

bash .okra/runs/issue-triage-session-20260715/workers/dkr-4-v3/replay.sh
node .okra/runs/issue-triage-session-20260715/workers/validator-dkr-4-v3/independent-same-process.mjs
/home/lagz0ne/dev/pumped-fn/.agents/skills/reverse-tornado-okr/scripts/okra-store.sh verify .okra/runs/issue-triage-session-20260715
