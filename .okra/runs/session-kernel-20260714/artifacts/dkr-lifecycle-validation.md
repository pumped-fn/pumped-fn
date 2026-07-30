# DKR-LIFECYCLE-1 independent validation

Verdict: **ACCEPT**

The evidence supports the candidate lifecycle conclusion. This accepts the learning, not downstream implementation. The current frame wall remains unchanged. `downstream_advance=blocked`.

Observed at: `2026-07-14T04:04:40Z`

## Claims

### `first-pr-no-lite-change`

- Check: The first session-kernel PR can keep dependency-using finalization safe without changing Lite.
- Threshold: Existing Lite must provide a dependency-live finalization phase on owner-context close, and the focused lifecycle suite must pass.
- Value: `onClose` ran before resource cleanup and observed access live in both chain histories. The focused suite passed `156/156`. No tracked `pkg/core/lite` change was present.
- Source of truth: `pkg/core/lite/src/scope.ts`, the saved lifecycle probe, the focused Lite tests, and the independent Claude review.
- Replay: `pkg/core/lite/node_modules/.bin/tsx .okra/runs/session-kernel-20260714/replay/dkr-lifecycle-probe.ts .okra/runs/session-kernel-20260714/artifacts/dkr-lifecycle-contract.md`
- Exit code: `0`
- Decision: `accepted`
- Evidence: Both chain traces start with `finalize:session:access-live`; the review says to use existing `onClose` now and gate any later Lite finalizer on new evidence.

### `private-session-owner-context`

- Check: An explicit private context gives a semantic session an isolated lifetime boundary.
- Threshold: Current-owned resources must differ across explicit context boundaries and remain stable inside the selected boundary.
- Value: Parent session `3`; child session `4`; child flow read `4`.
- Source of truth: Saved lifecycle probe and `ExecutionContextImpl.resourceOwner` / `findResourceEntry` in `pkg/core/lite/src/scope.ts`.
- Replay: `pkg/core/lite/node_modules/.bin/tsx .okra/runs/session-kernel-20260714/replay/dkr-lifecycle-probe.ts .okra/runs/session-kernel-20260714/artifacts/dkr-lifecycle-contract.md`
- Exit code: `0`
- Decision: `accepted`
- Evidence: `explicitBoundary: { parent: 3, child: 4, childRead: 4 }`.

### `pre-resolved-current-owned-session`

- Check: Pre-resolving the current-owned session in its private owner context makes turns in that context reuse it.
- Threshold: A flow child under the owner context must resolve the already-owned session value.
- Value: The child context resolved session `4`, then its nested flow read session `4`.
- Source of truth: Saved lifecycle probe and current-ownership lookup in `pkg/core/lite/src/scope.ts`.
- Replay: `pkg/core/lite/node_modules/.bin/tsx .okra/runs/session-kernel-20260714/replay/dkr-lifecycle-probe.ts .okra/runs/session-kernel-20260714/artifacts/dkr-lifecycle-contract.md`
- Exit code: `0`
- Decision: `accepted`
- Evidence: `child: 4` equals `childRead: 4`.

### `sdk-active-turn-registry`

- Check: The semantic session must own active-turn cancellation and settlement in the SDK.
- Threshold: Session close must not finish while a child turn remains active.
- Value: After parent close, the query remained active with no close events. It settled only after iterator cancellation.
- Source of truth: Saved lifecycle probe and `iterateExecStream` in `pkg/core/lite/src/scope.ts`.
- Replay: `pkg/core/lite/node_modules/.bin/tsx .okra/runs/session-kernel-20260714/replay/dkr-lifecycle-probe.ts .okra/runs/session-kernel-20260714/artifacts/dkr-lifecycle-contract.md`
- Exit code: `0`
- Decision: `accepted`
- Evidence: `afterParentClose: { active: true, events: [] }`; after iterator return, `active: false` with `query-close:aborted-true` and `cleanup:query`.

### `one-joinable-close-promise`

- Check: Every semantic-session close caller must join one in-progress settlement.
- Threshold: A repeated caller must not settle before the first caller, and external teardown must run once.
- Value: Current Lite close and release each let the second caller settle while the first was pending; each external teardown ran once.
- Source of truth: Saved lifecycle probe and `ExecutionContextImpl.close` / `release` in `pkg/core/lite/src/scope.ts`.
- Replay: `pkg/core/lite/node_modules/.bin/tsx .okra/runs/session-kernel-20260714/replay/dkr-lifecycle-probe.ts .okra/runs/session-kernel-20260714/artifacts/dkr-lifecycle-contract.md`
- Exit code: `0`
- Decision: `accepted`
- Evidence: Both `nonjoinableClose` and `nonjoinableRelease` returned `secondSettledWhileFirstPending: true` and `teardownCalls: 1`. An SDK-memoized close promise directly closes this gap.

### `no-ctx-release-session`

- Check: `ctx.release(session)` must not be the semantic session shutdown path.
- Threshold: Semantic shutdown must run dependency-using finalization while dependencies are live.
- Value: Release ran only `cleanup:session`; it skipped session finalization and left shared access live. Finalization ran later on owner-context close.
- Source of truth: Saved lifecycle probe and `ExecutionContextImpl.release` in `pkg/core/lite/src/scope.ts`.
- Replay: `pkg/core/lite/node_modules/.bin/tsx .okra/runs/session-kernel-20260714/replay/dkr-lifecycle-probe.ts .okra/runs/session-kernel-20260714/artifacts/dkr-lifecycle-contract.md`
- Exit code: `0`
- Decision: `accepted`
- Evidence: `afterRelease: ["cleanup:session"]`; after close, `finalize:session:access-live` and `cleanup:access` followed.

### `current-order-metric-invalid`

- Check: The frame's `dependent_cleanup_after_dependency_count == 0` metric represents the required lifecycle safety invariant.
- Threshold: A valid metric must not reject a lifecycle where dependency-using finalization completes while dependencies are live.
- Value: The recorded metric reads `5` against threshold `0`, even though session finalization ran first with access live. Cold and pre-resolved graphs also produced different cleanup order.
- Source of truth: Frame, checkpoint, saved lifecycle probe, and `runCloseCleanups` in `pkg/core/lite/src/scope.ts`.
- Replay: `pkg/core/lite/node_modules/.bin/tsx .okra/runs/session-kernel-20260714/replay/dkr-lifecycle-probe.ts .okra/runs/session-kernel-20260714/artifacts/dkr-lifecycle-contract.md`
- Exit code: `0`
- Decision: `accepted` that the current metric is invalid.
- Evidence: Cold cleanup was `pool -> access -> session`; pre-resolved cleanup was `session -> access -> pool`; cold diamond cleanup was `right -> pool -> left -> session`. The required safety read is whether dependency-using finalization runs before dependency close, not global resource cleanup order.

## Commands and results

### Lifecycle probe

```text
pkg/core/lite/node_modules/.bin/tsx .okra/runs/session-kernel-20260714/replay/dkr-lifecycle-probe.ts .okra/runs/session-kernel-20260714/artifacts/dkr-lifecycle-contract.md
exit_code=0
status=pass
coldChain=finalize:session:access-live -> cleanup:pool -> cleanup:access:pool-closed -> cleanup:session:access-closed
preResolvedChain=finalize:session:access-live -> cleanup:session:access-live -> cleanup:access:pool-live -> cleanup:pool
coldDiamond=cleanup:right -> cleanup:pool -> cleanup:left -> cleanup:session
releaseAfterRelease=cleanup:session
sharedDependencyAfterFirstRelease=cleanup:first
activeAfterParentClose=true
nonjoinableClose=true, teardownCalls=1
nonjoinableRelease=true, teardownCalls=1
```

### Focused Lite suite

```text
pnpm --filter @pumped-fn/lite exec vitest run tests/scope.test.ts tests/exec-stream.test.ts
exit_code=0
Test Files  2 passed (2)
Tests       156 passed (156)
Duration    4.28s
```

No broad test suite was run.

## Active wall evaluation

| Wall | Read | Evaluation |
|---|---:|---|
| `AG-LIFECYCLE-ORDER` | `5` vs `0` | Current metric is invalid. It encodes global cleanup order, which changes with resolution history and is not the required safety invariant. Frame change remains human-only. Blocked. |
| `AG-LIFECYCLE-JOIN` | `2` vs `0` | Breached in the current Lite baseline. The accepted SDK design requires one memoized close promise. Blocked until implementation and conformance replay. |
| `AG-ACTIVE-TURN` | `1` vs `0` | Breached in the current Lite baseline. The accepted SDK design requires an active-turn registry that cancels and joins every turn. Blocked until implementation and conformance replay. |
| `AG-PERFORMANCE` | `0` vs `0` | Held for this DKR scope because no Lite product change exists. The `156/156` suite passed. This is not a benchmark claim. |
| `AG-INDEPENDENCE` | `0` vs `0` | Held. The independent Claude review is present and the separate deterministic replay passed. |
| `AG-LEVEL` | `0` vs `0` | Held. The checkpoint and contract keep CKR/PKR work candidate-blocked, and no product implementation was made. |
| `AG-STORAGE` | `0` vs `0` | Held for this validation record: the allowed target is named, all inputs are content-addressed below, and the output hash is reported after write. |

Input hashes:

```text
00c5fd454f90912988e6c407df6e77676e323c9316bbfd141b5c3e95480b3859  frame/frame.v1.json
aa85b8a6dd0aaa2ac3b2de317382e61603b3337be83ef4c9321decef7959b6e9  artifacts/dkr-lifecycle-contract.md
158e50143bbe85c53152b040a1c7ed7f500c5fc103f39d47d2154f1531c845ba  artifacts/dkr-lifecycle-checkpoint.json
ee7b39d193eb2b5f9c05111ee927abb2dac40d89429e2a033f710338069432cd  artifacts/claude-lifecycle-review.md
d38eb725f8c502e69737a8f81a46631bbb81f634b1020b372c3bb48b07b7c795  replay/dkr-lifecycle-probe.ts
549e6b4096698a433f5a843dc4851d2ab9743c7b5e77e7497e0205c7d9aa3b0b  pkg/core/lite/src/scope.ts
```

Summary: `7 accepted, 0 rejected`. `downstream_advance=blocked`.
