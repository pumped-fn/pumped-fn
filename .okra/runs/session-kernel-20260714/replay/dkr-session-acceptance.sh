#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/../../../.." && pwd)"
cd "$root"

run=.okra/runs/session-kernel-20260714
output="$(pkg/core/lite/node_modules/.bin/tsx "$run/replay/dkr-session-probe.ts")"

jq -e '
  (.cases | length) == 29
  and ([.cases[]] | all)
  and .counts.lifecycleBusinessEffects == 0
  and .counts.checkpointsA == 1
  and .counts.checkpointsB == 1
  and .counts.quarantinedOutputs == 1
  and .counts.abortsObserved >= 3
  and .counts.artifactsPublished == 1
  and .counts.acceptedMemories == 1
  and .counts.streamAbortCloses == 1
  and .counts.rootSchedulerClosed == 1
' <<<"$output" >/dev/null

test "$(sha256sum "$run/replay/dkr-session-probe.ts" | cut -d' ' -f1)" = f6e664168b0dd6f3c56a80a4ec139267a0a9a35a341172e41594b495acfc3fb8
test "$(sha256sum "$run/artifacts/dkr-session-contract.md" | cut -d' ' -f1)" = 2288fd21ee2ad250e6356eaf8722710aa5754160e402b47b658d55c966fbad86
test "$(sha256sum "$run/artifacts/claude-session-review-followup.raw.json" | cut -d' ' -f1)" = 0b9abbf0bafcac48fe9be8612fbf19eb932b6ad125e571ca2b606af8e9e33ae2

python3 .agents/skills/reverse-tornado-okr/scripts/okra-verify-artifact.py \
  "$run/artifacts/dkr-session-contract.md" \
  --contract .agents/skills/reverse-tornado-okr/contracts/executable-dkr-checkpoint.v1.json >/dev/null

python3 .agents/skills/reverse-tornado-okr/scripts/check-plain-wording.py \
  "$run/artifacts/dkr-session-contract.md" >/dev/null

test -z "$(git status --porcelain=v1 -- pkg/core/lite pkg/sdk)"

jq -cn '{status:"pass",case_count:29,lite_or_sdk_changed_path_count:0,lifecycle_business_effect_count:0}'
