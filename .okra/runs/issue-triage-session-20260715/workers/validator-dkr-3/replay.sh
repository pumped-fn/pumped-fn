#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "$0")/../../../../.." && pwd)"
cd "$repo"

printf '%s\n' \
  'a208869ca9eeb3d8f2407d399d01394ed01c86dda46ee2df0b41899f72b86b34  pkg/core/lite/src/types.ts' \
  '549e6b4096698a433f5a843dc4851d2ab9743c7b5e77e7497e0205c7d9aa3b0b  pkg/core/lite/src/scope.ts' \
  'c6c71ffe27787683e4429f5f397d417d6774b46cd8603630c31110e7fa5a8366  pkg/ext/observable/src/index.ts' \
  '338ffdc5a07df4b7e534612069aa1fd83eca1c1ab63a0ba9e46e356ea3984c09  pkg/ext/logging/src/index.ts' \
  '78b6500dee31b501644f3a528149e2efb3cb8f684a59373071cf9fdc5f5cfe06  pkg/sdk/core/src/session.ts' \
  'cba03a82b701d8d91911333f1c699e1456f8f60b99ba420d621c6949af568c4e  .okra/runs/issue-triage-session-20260715/workers/dkr-3/probes/context-observation-probe.mjs' \
  '1f3d4f982ed331d4d3ec5a7c93f3676a58a745b0ebb71103da65d4e41d117e57  .okra/runs/issue-triage-session-20260715/workers/dkr-3/probes/replay-context-observation.mjs' \
  '1dccc7f0a197eb8aed10902f213427c45eed857701bc9896d6ac997961ec80ed  .okra/runs/issue-triage-session-20260715/workers/dkr-3/artifacts/context-observation-probe.v1.json' \
  '2a8be8f49a82d3c95be6ba6045c5f6b9d5a8615e402b51225a4eb7c4eeeb23a1  .okra/runs/issue-triage-session-20260715/workers/dkr-3/artifacts/context-observation-trace-contract.v1.json' \
  '63445cc2eac49031d3b076c8c6fb402fae038f56b89339090d1368c8153643ab  .okra/runs/issue-triage-session-20260715/workers/dkr-3/checkpoint.candidate.v1.json' \
  | sha256sum --check --strict

node .okra/runs/issue-triage-session-20260715/workers/dkr-3/probes/replay-context-observation.mjs \
  .okra/runs/issue-triage-session-20260715/workers/dkr-3/artifacts/context-observation-probe.v1.json

node .okra/runs/issue-triage-session-20260715/workers/validator-dkr-3/same-scope-probe.mjs

node .okra/runs/issue-triage-session-20260715/workers/validator-dkr-3/seam-probe.mjs

node .okra/runs/issue-triage-session-20260715/workers/validator-dkr-3/checkpoint-evidence-probe.mjs
