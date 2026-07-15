#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "$0")/../../../../.." && pwd)"
cd "$repo"

printf '%s\n' \
  '54460581177fc2c6e0d17718a11b1a3b7910e364d04277cdfc79be867590630a  /home/lagz0ne/dev/pumped-fn/.agents/skills/reverse-tornado-okr/contracts/executable-dkr-checkpoint.v1.json' \
  '14073c31806a973d38aea92a9b9232ad7f63f9ed3e51ff007878f06ae5a37282  .okra/runs/issue-triage-session-20260715/workers/dkr-2-v3/cancellation-probe.mjs' \
  '4e7f888f854b2925b1963557bbad768e928261ef7a76febaf9781d1cfc0c3058  .okra/runs/issue-triage-session-20260715/workers/dkr-2-v3/cancellation-contract.json' \
  'aaeee332a526e3fa93048f708e5d19930eb10d2b0d82bc76e08b5aee87edb4f8  .okra/runs/issue-triage-session-20260715/workers/dkr-2-v3/replay-contract.mjs' \
  'a208869ca9eeb3d8f2407d399d01394ed01c86dda46ee2df0b41899f72b86b34  pkg/core/lite/src/types.ts' \
  '549e6b4096698a433f5a843dc4851d2ab9743c7b5e77e7497e0205c7d9aa3b0b  pkg/core/lite/src/scope.ts' \
  '6c3a183edd003175c839ada032c98a64accacc8d5a977f26f522c1c94dd456e0  .okra/runs/issue-triage-session-20260715/workers/dkr-2/checkpoint.v2.json' \
  '9312e5d572e0718577c5ecebf5f5cf97fe75c4cba03e341f8e957141ccf3d27b  .okra/runs/issue-triage-session-20260715/workers/validator-dkr-2/verification.json' \
  | sha256sum --check --strict

node .okra/runs/issue-triage-session-20260715/workers/dkr-2-v3/replay-contract.mjs
node .okra/runs/issue-triage-session-20260715/workers/dkr-2-v3/validate-checkpoint-v3.mjs
