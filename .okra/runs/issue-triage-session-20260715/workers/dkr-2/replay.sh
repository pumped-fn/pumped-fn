#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "$0")/../../../../.." && pwd)"
cd "$repo"

printf '%s\n' \
  '54460581177fc2c6e0d17718a11b1a3b7910e364d04277cdfc79be867590630a  /home/lagz0ne/dev/pumped-fn/.agents/skills/reverse-tornado-okr/contracts/executable-dkr-checkpoint.v1.json' \
  '30858c146118a23be1e942cc5e4adba683a7f517c8daef02537b0d643146249f  .okra/runs/issue-triage-session-20260715/workers/dkr-2/cancellation-probe.mjs' \
  '267674e4a35a3164f3e2a686dce592de00234d1951bec04a6e7acff1e9c9f5d7  .okra/runs/issue-triage-session-20260715/workers/dkr-2/cancellation-probe.json' \
  'a208869ca9eeb3d8f2407d399d01394ed01c86dda46ee2df0b41899f72b86b34  pkg/core/lite/src/types.ts' \
  '549e6b4096698a433f5a843dc4851d2ab9743c7b5e77e7497e0205c7d9aa3b0b  pkg/core/lite/src/scope.ts' \
  '8aa3127afe09d23506868d906dd778dd6cc55ebc6ed129781504c9b7c08a408d  .okra/runs/issue-triage-session-20260715/workers/dkr-2/checkpoint.json' \
  | sha256sum --check --strict

node .okra/runs/issue-triage-session-20260715/workers/dkr-2/replay-cancellation.mjs
node .okra/runs/issue-triage-session-20260715/workers/dkr-2/validate-checkpoint-v2.mjs
