# DKR-SESSION-1 deterministic validation

Observed at `2026-07-14T07:46:40Z` by the independent validator.

## Accepted

| Claim | Read |
| --- | --- |
| Probe cases | 12 of 12 case booleans were true |
| Lifecycle counts | business effects `0`, checkpoints `1` per session, quarantined output `1` |
| Finish order | checkpoint A, close A, checkpoint B, close B, store cleanup, database cleanup |
| Shared backend | session B borrowed the root database after session A closed |
| Determinism | two runs had byte-identical output |
| Execution fidelity | the probe uses public Lite contexts, resources, flows, controllers, and runtime assertions |
| Wall coverage | 14 active walls and 14 entries, no missing or extra entries |
| Reference separation | no evidence ref equals its verification ref |
| Freshness shape | all 14 timestamp and duration fields parse |
| Self gate | the writer left the checkpoint blocked and did not accept itself |
| Artifact completeness | 10 of 10 public checkpoint-contract requirements |
| Plain wording | `plain_wording_violation_count=0` |
| Artifact hashes | contract, checkpoint, and probe matched their dispatch packet |

## Rejected

| Claim | Reason | Disposition |
| --- | --- | --- |
| Candidate freshness value | all 14 reads were 733 seconds old against `10m` | refresh readings only in a new acceptance record |
| Store integrity | generated status was stale after dispatch records | regenerate status, then replay verify |
| Worker product-path attribution | dirty main had four pre-existing lint paths and no content-hash baseline | do not infer authorship; isolate all product work in a clean successor worktree |

The rejected reads block direct acceptance of the candidate checkpoint. They do not contradict the session architecture or probe result.

## Replay

```text
pkg/core/lite/node_modules/.bin/tsx .okra/runs/session-kernel-20260714/replay/dkr-session-probe.ts
python3 .agents/skills/reverse-tornado-okr/scripts/okra-verify-artifact.py .okra/runs/session-kernel-20260714/artifacts/dkr-session-contract.md --contract .agents/skills/reverse-tornado-okr/contracts/executable-dkr-checkpoint.v1.json
python3 .agents/skills/reverse-tornado-okr/scripts/check-plain-wording.py .okra/runs/session-kernel-20260714/artifacts/dkr-session-contract.md
.agents/skills/reverse-tornado-okr/scripts/okra-store.sh verify .okra/runs/session-kernel-20260714
```

Result: `13 accepted, 3 rejected`.
