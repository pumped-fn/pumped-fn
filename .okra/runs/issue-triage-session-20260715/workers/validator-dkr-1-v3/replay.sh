#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "$0")/../../../../.." && pwd)"
cd "$repo"

node .okra/runs/issue-triage-session-20260715/workers/validator-dkr-1-v3/independent-check.mjs
