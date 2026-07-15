#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "$0")/../../../../.." && pwd)"
cd "$repo"

run_dir=".okra/runs/issue-triage-session-20260715"
scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT

bash "$run_dir/replay/dkr-0-inventory.sh" > "$scratch/dkr-0.json"
bash "$run_dir/workers/dkr-1/replay.sh" > "$scratch/dkr-1.json"

jq -e '.status == "pass" and .checks_passed == 39 and .checks_total == 39' "$scratch/dkr-0.json" >/dev/null
jq -e '.pass == true and .claims.execTagsVisibleToEntryAndDescendants == true and .claims.currentResourceReusedByNestedExec == true and .claims.siblingExecResourcesIsolated == true and .claims.extensionSeesActivationAndDescendantTags == true and .claims.closeAvoidsStoreCommit == true and .claims.closeAvoidsRuntimeBusinessStateMutation == false and .claims.checkpointCloseLoadResumeWithoutContextRetention == true' "$scratch/dkr-1.json" >/dev/null

check_hash() {
  local expected="$1"
  local file="$2"
  [[ "$(sha256sum "$file" | cut -d' ' -f1)" == "$expected" ]]
}

check_hash e15c246ff2ec7a28d5189a9c2f7561a0c9003c02d572cefd2f1b189807931b1e "$run_dir/artifacts/dkr-0-current-pr-inventory.json"
check_hash 64e75cefcfae132c02bd93c98358f20a8bd538cee2afbddec655e09146bf082f "$run_dir/replay/dkr-0-inventory.sh"
check_hash 78b6500dee31b501644f3a528149e2efb3cb8f684a59373071cf9fdc5f5cfe06 pkg/sdk/core/src/session.ts
check_hash 622f7bb212cb9274338eac3613101345b5a4031db47e58e981e76d9c359255b0 pkg/sdk/core/src/agent.ts
check_hash d5a0798557a9af2f261844e041bb2059a2160892d98ef03d96c7ac1843e8aa33 pkg/sdk/core/README.md
check_hash 7fb45a842db6233d61ee7f2d81e886c4ac2c8b5fc77549ff4db8bc41df8a725f pkg/sdk/core/tests/session-kernel.test.ts
check_hash 968e24c435354941623acbb29f7f84e68f9cb3722fed68928375192f5f3e6361 pkg/sdk/core/tests/database-analysis.test.ts
check_hash a53abbb36058e5f8f49845b3f0daa5fec05a3fad004ecbd8afdba9ac7394211f pkg/sdk/bash/tests/just-bash.test.ts
check_hash bfe48c95db05653cb444c48f9e95082b713b5ce61901a8266f6b48d00e5f4ead pkg/sdk/core/package.json
check_hash 752e0fa95b753fec49b5b85b991524b0b28d52ea5576f2edd3db7178d4a5edd3 "$run_dir/workers/dkr-1/activation-probe.mjs"
check_hash 074d3aa0948b21e2fc404c80af0a39dce917945ed309cb8d6434991993fa3ef7 "$run_dir/workers/dkr-1/probe-result.json"
check_hash 549e6b4096698a433f5a843dc4851d2ab9743c7b5e77e7497e0205c7d9aa3b0b pkg/core/lite/src/scope.ts

jq -n \
  --slurpfile dkr0 "$scratch/dkr-0.json" \
  --slurpfile dkr1 "$scratch/dkr-1.json" \
  '{dkr_0: $dkr0[0], dkr_1: $dkr1[0], cited_hashes_match: true, expected_dispositions: {dkr_0: "rejected", dkr_1: "blocked"}}'
