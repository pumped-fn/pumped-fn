#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "$0")/../../../../.." && pwd)"
cd "$repo"

bash .okra/runs/issue-triage-session-20260715/workers/dkr-3-v4/replay.sh
node .okra/runs/issue-triage-session-20260715/workers/validator-dkr-3-v4/independent-v4-audit.mjs
/home/lagz0ne/dev/pumped-fn/.agents/skills/reverse-tornado-okr/scripts/okra-store.sh verify .okra/runs/issue-triage-session-20260715
