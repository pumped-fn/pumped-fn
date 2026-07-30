# DKR-LIFECYCLE-1 — Session lifecycle contract

## Candidate decision

Use no Lite change in the first session-kernel PR.

Give each semantic session a private owner context. Resolve the current-owned session resource there before turns start. Keep dependency-using finalization in that context's `onClose`. Add an SDK-local active-turn registry and one memoized close promise. Session close cancels active turns, waits for them, runs context finalization while dependencies are live, then lets resource cleanup release own state.

This is candidate learning, not acceptance. The wall gate stays blocked.

```text
session handle
  -> private owner context
      -> pre-resolved current session resource
      -> active-turn registry
      -> memoized close promise

close()
  -> cancel every active turn
  -> await every turn
  -> owner context onClose       dependencies live
  -> resource cleanup            own state only
```

## What the replay proved

| Case | Direct observation | Design consequence |
|---|---|---|
| Cold `session -> access -> pool` | Cleanup was `pool -> access -> session` | Resource cleanup order is not dependent-first. |
| Dependencies pre-resolved | Cleanup was `session -> access -> pool` | Cleanup order depends on resolution history. |
| Cold diamond | Cleanup was `right -> pool -> left -> session` | Global dependency topology is not encoded in cleanup order. |
| Context close | Session finalization ran before cleanup and saw access live | Existing `onClose` is the dependency-live phase for normal close. |
| `release(session)` | Session cleanup ran, `onClose` did not, shared access stayed live | Do not expose release as semantic session shutdown. |
| Current ownership | Nested flows reused one resource; explicit contexts isolated it | A private owner context gives the session the right lifetime boundary. |
| Parent close during child stream | Parent close returned while the query remained active | The SDK must own an active-turn registry and join it. |
| Repeated close and release | The second caller returned while the first settlement was pending | Semantic session close needs one memoized joinable promise. |

The focused existing Lite lifecycle suite also replayed at `156 passed`. The full Lite suite reported `200 passed` and one docs-example timeout at five seconds. The timeout is disclosed, not treated as lifecycle evidence.

## Why cleanup order is the wrong wall

Resource entries are inserted before their dependencies resolve. Cleanup walks those entries in reverse insertion order. A cold graph and a pre-resolved graph therefore produce different resource cleanup order.

The invariant we need is narrower:

`dependency_using_finalization_after_dependency_close_count == 0`

That means code which must still use a dependency runs before that dependency closes. Existing context `onClose` provides this on context close. Resource cleanup remains free to release only the resource's own state.

The recorded frame instead uses:

`dependent_cleanup_after_dependency_count == 0`

The replay contradicts that metric, and the arbiter already rejected the invariant it encodes. Only the human may rename or redefine AG-LIFECYCLE-ORDER. This DKR proposes the correction but does not edit the frame.

## Claude review synthesis

The independent Claude review and the replay agree on the first-PR placement:

- No global topological cleanup.
- No Lite lifecycle phase in the first PR.
- Use context `onClose` for dependency-live work.
- Do not use `ctx.release(session)` as semantic shutdown.
- Keep a later resource-local finalization primitive evidence-gated.

The replay adds two concrete SDK requirements that the review called out but did not execute: parent close does not join an active child stream, and repeated close or release does not join an in-progress settlement.

## When a Lite primitive becomes justified

A later Lite proposal needs repeated non-session consumers that require the same symmetric phase on both close and manual release. Examples are:

- rollback or flush before a database connection closes;
- unsubscribe before a message-bus connection closes;
- release a lease before its client disconnects;
- flush a buffered writer before its file handle closes.

The proposal would be a resource-local dependency-live finalizer, not global graph ordering. This DKR does not choose or implement that primitive.

## Replay

```bash
pkg/core/lite/node_modules/.bin/tsx .okra/runs/session-kernel-20260714/replay/dkr-lifecycle-probe.ts .okra/runs/session-kernel-20260714/artifacts/dkr-lifecycle-contract.md
pnpm --filter @pumped-fn/lite exec vitest run tests/scope.test.ts tests/exec-stream.test.ts
```

The saved probe checks this artifact's checkpoint id, proposed wall correction, and blocked downstream gate before it runs the lifecycle cases.

## Wall gate

Active anti-goals: AG-LIFECYCLE-ORDER, AG-LIFECYCLE-JOIN, AG-ACTIVE-TURN, AG-PERFORMANCE, AG-INDEPENDENCE, AG-LEVEL, AG-STORAGE.

Anti-goal coverage: AG-LIFECYCLE-ORDER -> readable but contradicted metric; AG-LIFECYCLE-JOIN -> readable; AG-ACTIVE-TURN -> readable; AG-PERFORMANCE -> readable; AG-INDEPENDENCE -> readable; AG-LEVEL -> readable; AG-STORAGE -> readable. `anti_goal_coverage_gap_count == 0`.

`downstream_advance = blocked` because AG-LIFECYCLE-ORDER still needs human correction, the current baseline exposes join and active-turn gaps, and independent deterministic validation has not accepted this checkpoint.

No product source, branch, commit, push, PR, or frame was changed.

## Executable DKR Checkpoint Contract

Objective: `executable_dkr_checkpoint_contract_acceptance_rate >= 0.90`.

Tripwires: `unsupported_checkpoint_acceptance_count == 0`; `superficial_checkpoint_acceptance_count == 0`; `tautological_checkpoint_acceptance_count == 0`; `false_positive_checkpoint_acceptance_count == 0`; `single_llm_truth_acceptance_count == 0`; `fabricated_conclusion_acceptance_count == 0`.

A checkpoint carries `checkpoint_id`, `conclusion_id`, `decision_target`, `source_of_truth`, `read_method`, `observed_at`, `recorded_at`, `max_age`, `freshness_status`, `confidence`, `evidence_refs_or_hashes`, `replay_command_or_checker`, `questions_answered`, `questions_unanswered`, `decision`, `flag_if_missing_or_stale`, `reviewer_audit_status`, `active_anti_goals`, `active_anti_goal_verification`, and `wall_gate`.

An empty result is a valid non-accepted decision only when it still carries a replayable probe trace. Superficial, tautological, false-positive, fabricated, unsupported, and single-LLM-truth checkpoints are rejected. Missing, stale, wrong-source, non-replayable, or contradicted evidence fails closed and opens a blocking flag.

### Worked Executable DKR Checkpoint Trace

The `metric_read` for `active_turn_after_session_close_count` was `1`, backed by `sha256:d38eb725f8c502e69737a8f81a46631bbb81f634b1020b372c3bb48b07b7c795`. The wall is rejected as held, so the checkpoint saves learning with downstream work blocked.

```json
{
  "type": "dkr_checkpoint_candidate",
  "unit_id": "DKR-LIFECYCLE-1",
  "checkpoint_id": "checkpoint.DKR-LIFECYCLE-1.round-1",
  "conclusion_id": "sdk-private-session-owner-with-joinable-close-no-lite-change",
  "decision_target": "Choose the smallest reusable dependency-live finalization and cleanup contract for the first session-kernel PR.",
  "source_of_truth": "Lite source, the saved lifecycle probe, the focused Lite lifecycle suite, and the independent Claude lifecycle review.",
  "read_method": "Run the saved probe against the lifecycle artifact, then replay the focused scope and stream tests.",
  "observed_at": "2026-07-14T03:55:09Z",
  "recorded_at": "2026-07-14T03:55:09Z",
  "max_age": "10m",
  "freshness_status": "fresh",
  "confidence": 0.96,
  "confidence_probability_update": {
    "before": 0.7,
    "after": 0.96,
    "reason": "The probe reproduced resolution-history-dependent cleanup, release asymmetry, unjoined close and release, and an active child stream surviving parent close."
  },
  "evidence_refs_or_hashes": [
    "sha256:d38eb725f8c502e69737a8f81a46631bbb81f634b1020b372c3bb48b07b7c795",
    "sha256:549e6b4096698a433f5a843dc4851d2ab9743c7b5e77e7497e0205c7d9aa3b0b",
    "sha256:a208869ca9eeb3d8f2407d399d01394ed01c86dda46ee2df0b41899f72b86b34",
    "sha256:4871682282dbacbde213bd299e04ed43bd8a2d5b8f04fb0ac22e7e571ceeb387",
    "sha256:19701b2f541580c92768d9d265341e8cda9de8e1fb71b09064e27ac1ebccac25",
    "sha256:ee7b39d193eb2b5f9c05111ee927abb2dac40d89429e2a033f710338069432cd",
    "sha256:00c5fd454f90912988e6c407df6e77676e323c9316bbfd141b5c3e95480b3859"
  ],
  "replay_command_or_checker": "pkg/core/lite/node_modules/.bin/tsx .okra/runs/session-kernel-20260714/replay/dkr-lifecycle-probe.ts .okra/runs/session-kernel-20260714/artifacts/dkr-lifecycle-contract.md",
  "questions_answered": [
    "Resource cleanup order is cache insertion order in reverse, so it changes between cold and pre-resolved dependency histories and cannot carry a dependency-topology invariant.",
    "Context onClose runs before resource cleanup and sees declared dependencies live during normal context close.",
    "Manual resource release skips onClose, cleans only the selected entry, and leaves shared dependencies live.",
    "Current-owned resources reuse through nested flow execution but isolate at explicit context boundaries.",
    "Closing a parent context does not cancel or join an active child stream.",
    "Repeated close and release callers do not join an in-progress settlement promise, even though the external teardown runs once in the probe.",
    "The first PR can avoid a Lite change by giving each semantic session a private owner context and implementing the active-turn registry plus memoized joinable close in the SDK."
  ],
  "questions_unanswered": [
    "Only the human can replace AG-LIFECYCLE-ORDER's current dependent_cleanup_after_dependency_count metric with the proposed dependency_using_finalization_after_dependency_close_count metric.",
    "A later DKR must decide whether repeated non-session consumers justify a Lite resource-local finalization primitive."
  ],
  "decision": "candidate_first_pr_no_lite_change_private_session_owner_context_current_owned_pre_resolved_session_sdk_active_turn_registry_and_joinable_close",
  "flag_if_missing_or_stale": "Fail closed, keep downstream_advance blocked, and open a blocking flag before CKR or PKR promotion.",
  "reviewer_audit_status": "Independent Claude review is present. Deterministic validator acceptance is still pending.",
  "active_anti_goals": [
    "AG-LIFECYCLE-ORDER",
    "AG-LIFECYCLE-JOIN",
    "AG-ACTIVE-TURN",
    "AG-PERFORMANCE",
    "AG-INDEPENDENCE",
    "AG-LEVEL",
    "AG-STORAGE"
  ],
  "active_anti_goal_verification": [
    {
      "anti_goal_id": "AG-LIFECYCLE-ORDER",
      "metric_id": "dependent_cleanup_after_dependency_count",
      "source_of_truth": "Saved cold-chain, pre-resolved-chain, and diamond lifecycle probe",
      "read_method": "Count dependency edges whose dependent resource cleanup occurs after dependency cleanup.",
      "observed_at": "2026-07-14T03:55:09Z",
      "recorded_at": "2026-07-14T03:55:09Z",
      "max_age": "10m",
      "freshness_status": "fresh",
      "value": 5,
      "threshold": 0,
      "comparator": "==",
      "verdict": "contradicted_metric_encodes_rejected_invariant",
      "evidence_ref": "sha256:d38eb725f8c502e69737a8f81a46631bbb81f634b1020b372c3bb48b07b7c795",
      "replay_command_or_checker": "pkg/core/lite/node_modules/.bin/tsx .okra/runs/session-kernel-20260714/replay/dkr-lifecycle-probe.ts .okra/runs/session-kernel-20260714/artifacts/dkr-lifecycle-contract.md",
      "verification_record_ref": "workers/DKR-LIFECYCLE-1/progress.jsonl#seq=1"
    },
    {
      "anti_goal_id": "AG-LIFECYCLE-JOIN",
      "metric_id": "unjoined_close_or_release_count",
      "source_of_truth": "Saved repeated close and repeated release lifecycle probe",
      "read_method": "Hold the first settlement open and count later callers that settle before it.",
      "observed_at": "2026-07-14T03:55:09Z",
      "recorded_at": "2026-07-14T03:55:09Z",
      "max_age": "10m",
      "freshness_status": "fresh",
      "value": 2,
      "threshold": 0,
      "comparator": "==",
      "verdict": "breached_in_current_lite_baseline",
      "evidence_ref": "sha256:d38eb725f8c502e69737a8f81a46631bbb81f634b1020b372c3bb48b07b7c795",
      "replay_command_or_checker": "pkg/core/lite/node_modules/.bin/tsx .okra/runs/session-kernel-20260714/replay/dkr-lifecycle-probe.ts .okra/runs/session-kernel-20260714/artifacts/dkr-lifecycle-contract.md",
      "verification_record_ref": "workers/DKR-LIFECYCLE-1/progress.jsonl#seq=1"
    },
    {
      "anti_goal_id": "AG-ACTIVE-TURN",
      "metric_id": "active_turn_after_session_close_count",
      "source_of_truth": "Saved active child stream parent-close probe",
      "read_method": "Start one current-owned query stream, close its parent, and count active queries before iterator cancellation.",
      "observed_at": "2026-07-14T03:55:09Z",
      "recorded_at": "2026-07-14T03:55:09Z",
      "max_age": "10m",
      "freshness_status": "fresh",
      "value": 1,
      "threshold": 0,
      "comparator": "==",
      "verdict": "breached_in_current_lite_baseline",
      "evidence_ref": "sha256:d38eb725f8c502e69737a8f81a46631bbb81f634b1020b372c3bb48b07b7c795",
      "replay_command_or_checker": "pkg/core/lite/node_modules/.bin/tsx .okra/runs/session-kernel-20260714/replay/dkr-lifecycle-probe.ts .okra/runs/session-kernel-20260714/artifacts/dkr-lifecycle-contract.md",
      "verification_record_ref": "workers/DKR-LIFECYCLE-1/progress.jsonl#seq=1"
    },
    {
      "anti_goal_id": "AG-PERFORMANCE",
      "metric_id": "lite_lifecycle_performance_regression_count",
      "source_of_truth": "No Lite product diff and the focused Lite lifecycle suite",
      "read_method": "Confirm no Lite product edit, then run scope.test.ts and exec-stream.test.ts.",
      "observed_at": "2026-07-14T03:54:31Z",
      "recorded_at": "2026-07-14T03:55:09Z",
      "max_age": "10m",
      "freshness_status": "fresh",
      "value": 0,
      "threshold": 0,
      "comparator": "==",
      "verdict": "candidate_held_pending_independent_verification",
      "evidence_ref": "sha256:4871682282dbacbde213bd299e04ed43bd8a2d5b8f04fb0ac22e7e571ceeb387",
      "replay_command_or_checker": "pkg/core/lite/node_modules/.bin/tsx .okra/runs/session-kernel-20260714/replay/dkr-lifecycle-probe.ts .okra/runs/session-kernel-20260714/artifacts/dkr-lifecycle-contract.md",
      "verification_record_ref": "workers/DKR-LIFECYCLE-1/progress.jsonl#seq=1"
    },
    {
      "anti_goal_id": "AG-INDEPENDENCE",
      "metric_id": "single_llm_truth_acceptance_count",
      "source_of_truth": "Independent Claude review plus deterministic source-level probe",
      "read_method": "Require both the review hash and successful saved probe, without treating either as acceptance.",
      "observed_at": "2026-07-14T03:55:09Z",
      "recorded_at": "2026-07-14T03:55:09Z",
      "max_age": "10m",
      "freshness_status": "fresh",
      "value": 0,
      "threshold": 0,
      "comparator": "==",
      "verdict": "candidate_held_pending_validator",
      "evidence_ref": "sha256:ee7b39d193eb2b5f9c05111ee927abb2dac40d89429e2a033f710338069432cd",
      "replay_command_or_checker": "pkg/core/lite/node_modules/.bin/tsx .okra/runs/session-kernel-20260714/replay/dkr-lifecycle-probe.ts .okra/runs/session-kernel-20260714/artifacts/dkr-lifecycle-contract.md",
      "verification_record_ref": "workers/DKR-LIFECYCLE-1/progress.jsonl#seq=1"
    },
    {
      "anti_goal_id": "AG-LEVEL",
      "metric_id": "abstraction_level_jump_count",
      "source_of_truth": "Run tree and this candidate discovery checkpoint",
      "read_method": "Count implementation PKRs promoted before lifecycle and session DKR acceptance.",
      "observed_at": "2026-07-14T03:55:09Z",
      "recorded_at": "2026-07-14T03:55:09Z",
      "max_age": "10m",
      "freshness_status": "fresh",
      "value": 0,
      "threshold": 0,
      "comparator": "==",
      "verdict": "candidate_held_pending_orchestrator",
      "evidence_ref": "sha256:00c5fd454f90912988e6c407df6e77676e323c9316bbfd141b5c3e95480b3859",
      "replay_command_or_checker": "pkg/core/lite/node_modules/.bin/tsx .okra/runs/session-kernel-20260714/replay/dkr-lifecycle-probe.ts .okra/runs/session-kernel-20260714/artifacts/dkr-lifecycle-contract.md",
      "verification_record_ref": "workers/DKR-LIFECYCLE-1/progress.jsonl#seq=1"
    },
    {
      "anti_goal_id": "AG-STORAGE",
      "metric_id": "ungoverned_write_or_read_count",
      "source_of_truth": "Append-only worker record plus content hashes",
      "read_method": "Verify every durable DKR claim is in the worker record or paired with a target path and sha256.",
      "observed_at": "2026-07-14T03:55:09Z",
      "recorded_at": "2026-07-14T03:55:09Z",
      "max_age": "10m",
      "freshness_status": "fresh",
      "value": 0,
      "threshold": 0,
      "comparator": "==",
      "verdict": "candidate_held_pending_store_verification",
      "evidence_ref": "sha256:00c5fd454f90912988e6c407df6e77676e323c9316bbfd141b5c3e95480b3859",
      "replay_command_or_checker": "pkg/core/lite/node_modules/.bin/tsx .okra/runs/session-kernel-20260714/replay/dkr-lifecycle-probe.ts .okra/runs/session-kernel-20260714/artifacts/dkr-lifecycle-contract.md",
      "verification_record_ref": "workers/DKR-LIFECYCLE-1/progress.jsonl#seq=1"
    }
  ],
  "wall_gate": {
    "verdict": "blocked",
    "downstream_advance": "blocked",
    "decided_at": "2026-07-14T03:55:09Z",
    "reasons": [
      "AG-LIFECYCLE-ORDER uses a metric that the probe and arbiter reject as an invariant. Only the human may replace it.",
      "Current Lite close and release are not joinable, and parent close does not settle an active child stream.",
      "Independent deterministic validator acceptance is still pending."
    ]
  },
  "risk_or_anti_goal_implications": [
    "Do not add global dependency topology to Lite in the first PR.",
    "Put dependency-using finalization in session-owner context onClose and keep resource cleanup for own-state release.",
    "Do not expose ctx.release(session); close the dedicated private session owner context.",
    "The SDK session must track active turns, cancel them, await settlement, and memoize one close promise.",
    "Propose dependency_using_finalization_after_dependency_close_count == 0 as the corrected lifecycle-order wall without editing the frame."
  ],
  "candidate_ckrs": [
    {
      "id": "CKR-LIFECYCLE",
      "metric_id": "lifecycle_conformance_pass_rate",
      "target": 1,
      "status": "candidate_blocked"
    }
  ],
  "candidate_pkrs": [
    {
      "id": "PKR-SDK-SESSION-LIFECYCLE",
      "outcome": "Implement a private session owner context, active-turn registry, and memoized joinable close with no Lite core change.",
      "status": "candidate_blocked"
    }
  ],
  "commands": [
    "pkg/core/lite/node_modules/.bin/tsx .okra/runs/session-kernel-20260714/replay/dkr-lifecycle-probe.ts -> status pass",
    "pnpm --filter @pumped-fn/lite exec vitest run tests/scope.test.ts tests/exec-stream.test.ts -> 156 passed",
    "pnpm --filter @pumped-fn/lite test -> 200 passed, 1 docs example timeout"
  ],
  "status": "candidate_learning_saved_downstream_blocked"
}
```

CKRs are measurable contribution context, not worker work.

DKRs are discovery-worker scopes; PKRs are progression-worker execution units; there is no CKR worker.

Worker progress: `.okra/runs/session-kernel-20260714/workers/DKR-LIFECYCLE-1/progress.jsonl`, written at finish.

Heartbeat cadence and next_check_at: ten minutes by default; this bounded probe finished before a heartbeat.

Model phrasing: gpt-5 from system prompt; Phrasing profile id `RTM-PH6OCQ6MX4`.

Storage integrity: append-only records are the source of truth; status/progress files are generated views, and claims are accepted only on independent deterministic evidence, not one LLM's say-so.
