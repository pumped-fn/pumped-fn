#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "$0")/../../../../.." && pwd)"
cd "$repo"

node .okra/runs/issue-triage-session-20260715/workers/dkr-4-v4/audit.mjs
python3 /home/lagz0ne/dev/pumped-fn/.agents/skills/reverse-tornado-okr/scripts/okra-verify-artifact.py \
  .okra/runs/issue-triage-session-20260715/workers/dkr-4-v4/checkpoint.v4.json \
  --contract /home/lagz0ne/dev/pumped-fn/.agents/skills/reverse-tornado-okr/contracts/executable-dkr-checkpoint.v1.json \
  --json
