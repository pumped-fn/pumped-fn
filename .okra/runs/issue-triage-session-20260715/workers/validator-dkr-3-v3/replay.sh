#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "$0")/../../../../.." && pwd)"
cd "$repo"

sha256sum --check --strict <<'HASHES'
1dccc7f0a197eb8aed10902f213427c45eed857701bc9896d6ac997961ec80ed  .okra/runs/issue-triage-session-20260715/workers/dkr-3/artifacts/context-observation-probe.v1.json
2a8be8f49a82d3c95be6ba6045c5f6b9d5a8615e402b51225a4eb7c4eeeb23a1  .okra/runs/issue-triage-session-20260715/workers/dkr-3/artifacts/context-observation-trace-contract.v1.json
cba03a82b701d8d91911333f1c699e1456f8f60b99ba420d621c6949af568c4e  .okra/runs/issue-triage-session-20260715/workers/dkr-3/probes/context-observation-probe.mjs
1f3d4f982ed331d4d3ec5a7c93f3676a58a745b0ebb71103da65d4e41d117e57  .okra/runs/issue-triage-session-20260715/workers/dkr-3/probes/replay-context-observation.mjs
d50115adef22565d2cf86c95918854fe856a70688436ff03941ef6bc46668b5c  .okra/runs/issue-triage-session-20260715/workers/validator-dkr-3/verification.json
324ed2a33b9b7d3dfd52bb8b100ff5af00b100cb04df72b44ba0882e53b7192e  .okra/runs/issue-triage-session-20260715/workers/validator-dkr-3/same-scope-probe.mjs
9647ad58a0f61316d1daf87bd88144361c3fdd1d6795f788cffb9dd27cf2da63  .okra/runs/issue-triage-session-20260715/workers/validator-dkr-3/seam-probe.mjs
31bce0ad8de755703692b971a34fb5948c2de3ecd1ea04d452d827ae2979aae7  .okra/runs/issue-triage-session-20260715/workers/dkr-3-v3/replay.sh
9403324bf2e73588d1bb56452cd873a5f28399063c67fff4c22ab009d9ac7e2d  .okra/runs/issue-triage-session-20260715/workers/dkr-3-v3/checkpoint.v3.json
170dbd64bc9953d88de4eb0042da7777c88b3253d05f88678a948257d54f7c60  .okra/runs/issue-triage-session-20260715/workers/dkr-3-v3/progress.jsonl
8a21f143c6d009d84632c360ec1a3073a26e2caef215886c8c3ac7a50f280cd0  .okra/runs/issue-triage-session-20260715/frame/frame.v2.json
a208869ca9eeb3d8f2407d399d01394ed01c86dda46ee2df0b41899f72b86b34  pkg/core/lite/src/types.ts
549e6b4096698a433f5a843dc4851d2ab9743c7b5e77e7497e0205c7d9aa3b0b  pkg/core/lite/src/scope.ts
c6c71ffe27787683e4429f5f397d417d6774b46cd8603630c31110e7fa5a8366  pkg/ext/observable/src/index.ts
0cc8c4c6a776aa73a79f974a8a22455988769a1321d8cecdea43939db5635002  .okra/runs/issue-triage-session-20260715/workers/validator-dkr-3-v3/independent-projection.mjs
HASHES

bash .okra/runs/issue-triage-session-20260715/workers/dkr-3-v3/replay.sh
node .okra/runs/issue-triage-session-20260715/workers/validator-dkr-3-v3/independent-projection.mjs

node --input-type=module <<'NODE'
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"

const run = ".okra/runs/issue-triage-session-20260715"
const read = (path) => readFileSync(path)
const json = (path) => JSON.parse(read(path))
const hash = (path) => createHash("sha256").update(read(path)).digest("hex")
const checkpointPath = `${run}/workers/dkr-3-v3/checkpoint.v3.json`
const replayPath = `${run}/workers/dkr-3-v3/replay.sh`
const checkpoint = json(checkpointPath)
const frame = json(`${run}/frame/frame.v2.json`)
const prior = json(`${run}/workers/validator-dkr-3/verification.json`)
const progress = readFileSync(`${run}/workers/dkr-3-v3/progress.jsonl`, "utf8").trim().split("\n").map(JSON.parse)
const paths = [
  `${run}/workers/dkr-3/artifacts/context-observation-probe.v1.json`,
  `${run}/workers/dkr-3/artifacts/context-observation-trace-contract.v1.json`,
  `${run}/workers/dkr-3/probes/context-observation-probe.mjs`,
  `${run}/workers/dkr-3/probes/replay-context-observation.mjs`,
  `${run}/workers/validator-dkr-3/verification.json`,
  `${run}/workers/validator-dkr-3/same-scope-probe.mjs`,
  `${run}/workers/validator-dkr-3/seam-probe.mjs`,
  `${run}/workers/dkr-3-v3/replay.sh`,
  "pkg/core/lite/src/types.ts",
  "pkg/core/lite/src/scope.ts",
  "pkg/ext/observable/src/index.ts",
]

assert.equal(paths.filter((path) => checkpoint.evidence_refs_or_hashes.includes(`sha256:${hash(path)}`)).length, 11)
assert.equal(progress[0].payload.checkpoint_sha256, hash(checkpointPath))
assert.equal(progress[0].payload.replay_sha256, hash(replayPath))
const priorClaims = new Set(prior.audit_traces.map(({ claim_id }) => claim_id))
for (const wall of checkpoint.active_anti_goal_verification) {
  const [path, fragment] = wall.verification_record_ref.split("#")
  assert.equal(path, "workers/validator-dkr-3/verification.json")
  assert.equal(fragment === "summary" || priorClaims.has(fragment), true)
  assert.notEqual(wall.evidence_ref, wall.verification_record_ref)
}
assert.equal(frame.metric_contracts.anti_goals.max_age, "10m")
assert.equal(checkpoint.max_age, "30m")
assert.equal(checkpoint.active_anti_goal_verification.every(({ max_age }) => max_age === "30m"), true)
const ageSeconds = Math.floor((Date.now() - Date.parse(checkpoint.observed_at)) / 1000)
assert.ok(ageSeconds > 600)

process.stdout.write(`${JSON.stringify({
  evidenceHashes: "11/11",
  independentWallReferences: "6/6",
  governedProgressHashes: "2/2",
  frameWallMaxAgeSeconds: 600,
  candidateWallMaxAgeSeconds: 1800,
  checkpointAgeSeconds: ageSeconds,
  frameWallFreshnessStatus: "stale",
  disposition: "checkpoint rejected; behavior accepted",
})}\n`)
NODE
