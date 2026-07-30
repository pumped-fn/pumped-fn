The plan-file/Write tool isn't available in this read-only review context, so I'll deliver the verdict directly — the JSON is the requested artifact.

I read all eight sources and verified the load-bearing Lite mechanics (current-ownership resolution `scope.ts:1916-1933`, `execStream`/`aborted`/`Flow stream aborted` `2154-2326`, close ordering `2410-2434`) and the SDK provider boundaries in source rather than trusting the probe's hardcoded `cases` map.

```json
{
  "verdict": "GO",
  "confidence": 0.86,
  "closed_findings": [
    {
      "id": "P0-AUTHORITY-REBIND-UNPROVEN",
      "status": "closed",
      "how": "Real store->load->bind->compare->use path exists. seedSession persists a protected record; loadAndBindSession/forkBoundSession run authorityNarrows before returning a seed; resume-mismatch and fork-widening fail closed with protectedEffects unchanged; a fresh-fingerprint rebind resolves the runtime and executes protected work. Fork narrowing enforced by rejecting widening.",
      "evidence": [
        ".okra/runs/session-kernel-20260714/replay/dkr-session-probe.ts:1063-1075 (loadAndBindSession: load + authorityNarrows)",
        ".okra/runs/session-kernel-20260714/replay/dkr-session-probe.ts:1077-1100 (forkBoundSession: narrows-or-reject, child re-scoped)",
        ".okra/runs/session-kernel-20260714/replay/dkr-session-probe.ts:1231-1255 (resume-mismatch + fork-widen rejected, protectedEffects unchanged)",
        ".okra/runs/session-kernel-20260714/replay/dkr-session-probe.ts:1256-1276 (fresh fingerprint rebound, protected work runs)",
        ".okra/runs/session-kernel-20260714/replay/dkr-session-probe.ts:526-528 (session factory re-checks narrows at bind)",
        ".okra/runs/session-kernel-20260714/replay/dkr-session-probe.ts:558-560 (ready re-checks fingerprint before effect)"
      ]
    },
    {
      "id": "P0-ACTIVE-TURN-JOIN-UNPROVEN",
      "status": "closed",
      "how": "finishSession fences admission (status=finishing), interrupts every active attempt, awaits attempt.settled before checkpoint. contextE case runs a genuinely in-flight model invocation, calls finishSession while live, proves zero checkpoint + finishing status during the join, observes abort inside the live invocation, then checkpoints exactly once after settlement with abort-settled ordered before checkpoint. Join is SDK-owned; Lite close runs only after finish.",
      "evidence": [
        ".okra/runs/session-kernel-20260714/replay/dkr-session-probe.ts:1044-1050 (fence, interrupt active, await settled, then checkpoint)",
        ".okra/runs/session-kernel-20260714/replay/dkr-session-probe.ts:656-666 (finish-slow observes abort in-flight then throws)",
        ".okra/runs/session-kernel-20260714/replay/dkr-session-probe.ts:1415-1431 (checkpoint==0 + finishing during join, abort observed, checkpoint==1 after settle, order asserted)",
        "pkg/core/lite/src/scope.ts:2410-2434 (close runs registered cleanups then resource cleanups; join not delegated to Lite)"
      ]
    },
    {
      "id": "P0-STEERING-FENCE-IS-QUARANTINE-ONLY",
      "status": "closed",
      "how": "invokeModel registers an abort listener; steerWork interrupts, awaits attempt.settled (join), then restarts a new attempt. Test proves abort observed on a live invocation, restart does not run before the interrupted attempt settles, late output is quarantined out of committed evidence, restart runs at a new epoch with a distinct snapshot identity.",
      "evidence": [
        ".okra/runs/session-kernel-20260714/replay/dkr-session-probe.ts:646-654 (slow invocation observes abort)",
        ".okra/runs/session-kernel-20260714/replay/dkr-session-probe.ts:1020-1023 (interrupt -> await settled -> restart)",
        ".okra/runs/session-kernel-20260714/replay/dkr-session-probe.ts:1391-1403 (abort observed, no restart before settle, late output quarantined, new epoch new snapshot)"
      ]
    },
    {
      "id": "P1-READINESS-FAIL-CLOSED-UNTESTED",
      "status": "closed",
      "how": "Three distinct zero-model readiness walls: missing provider binding, unreachable backend, validation-engine failure, each asserting providerCalls unchanged.",
      "evidence": [
        ".okra/runs/session-kernel-20260714/replay/dkr-session-probe.ts:1280-1291 (missing binding, zero model)",
        ".okra/runs/session-kernel-20260714/replay/dkr-session-probe.ts:1294-1311 (unreachable backend, zero model)",
        ".okra/runs/session-kernel-20260714/replay/dkr-session-probe.ts:1314-1331 (validation failure before first model call)"
      ]
    },
    {
      "id": "P1-FAIL-FAST-UNTESTED",
      "status": "closed",
      "how": "Failing child throws after sibling starts; parent interrupts the unsettled sibling, awaits allSettled, emits fail-fast.joined; sibling observes its abort. Asserts group joined and no sibling left active.",
      "evidence": [
        ".okra/runs/session-kernel-20260714/replay/dkr-session-probe.ts:899-931 (fence sibling, interrupt, allSettled, join)",
        ".okra/runs/session-kernel-20260714/replay/dkr-session-probe.ts:728-747 (sibling observes abort and settles)",
        ".okra/runs/session-kernel-20260714/replay/dkr-session-probe.ts:1361-1368 (rejects, fail-fast.joined present, no sibling active)"
      ]
    },
    {
      "id": "P1-STREAMING-UNTESTED",
      "status": "closed",
      "how": "Generator turn drained scalar via ctx.exec vs execStream: identical final result, both neutral events yielded. Consumer break makes result reject with 'Flow stream aborted' and closes child context aborted. Verified against Lite execStream machinery.",
      "evidence": [
        ".okra/runs/session-kernel-20260714/replay/dkr-session-probe.ts:1478-1488 (parity, consumer break, aborted-true close)",
        "pkg/core/lite/src/scope.ts:2154-2164 (execStream result + single-consume)",
        "pkg/core/lite/src/scope.ts:2282-2284 (close result aborted:true)",
        "pkg/core/lite/src/scope.ts:2316-2324 (consumer break -> 'Flow stream aborted')"
      ]
    },
    {
      "id": "P1-SNAPSHOT-SINGLE-ROUND",
      "status": "closed",
      "how": "Normal turn runs two rounds asserting every round identity equals the advertised snapshot; steering proves a new epoch yields a distinct snapshot and never mutates the previously supplied one.",
      "evidence": [
        ".okra/runs/session-kernel-20260714/replay/dkr-session-probe.ts:792-807 (two-round dispatch under one snapshot)",
        ".okra/runs/session-kernel-20260714/replay/dkr-session-probe.ts:1208 (every round identity == snapshot identity)",
        ".okra/runs/session-kernel-20260714/replay/dkr-session-probe.ts:1400-1401 (new epoch distinct snapshot, old unmutated)"
      ]
    },
    {
      "id": "P1-COMMIT-FAILURE-UNTESTED",
      "status": "closed",
      "how": "session-C checkpoint forced to fail; finishSession rejects, runtime stays 'finishing' (not sealed), no snapshot published.",
      "evidence": [
        ".okra/runs/session-kernel-20260714/replay/dkr-session-probe.ts:1512-1521 (commit failure -> finishing, no durable seal, no snapshot)"
      ]
    },
    {
      "id": "P1-MEMORY-ARTIFACT-SCHEDULER-UNTESTED",
      "status": "closed",
      "how": "Memory: candidate proposed, single-reviewer acceptance rejected, quorum acceptance promotes to accepted. Artifact: unpublished reference rejected; publish precedes reference and checkpoint. Scheduler: waiting work enqueued, wake claims it and starts a new attempt.",
      "evidence": [
        ".okra/runs/session-kernel-20260714/replay/dkr-session-probe.ts:1433-1449 (candidate vs quorum-accepted)",
        ".okra/runs/session-kernel-20260714/replay/dkr-session-probe.ts:1490-1503 (content-before-reference-before-checkpoint)",
        ".okra/runs/session-kernel-20260714/replay/dkr-session-probe.ts:1377-1380 (scheduler enqueue + wake -> new attempt)"
      ]
    }
  ],
  "open_findings": [
    {
      "id": "R1-INTERRUPT-DURING-TOOL-EXEC",
      "severity": "residual",
      "blocking": false,
      "finding": "Abort+join+restart is proven during a model invocation, not literally during an in-flight tool (database borrow) invocation. Same attempt-signal fence covers both; the contract's exact interrupt-during-tool clause is exercised only by analogy.",
      "evidence": [
        ".okra/runs/session-kernel-20260714/replay/dkr-session-probe.ts:645-654 (abort observed in model, not tool)",
        ".okra/runs/session-kernel-20260714/artifacts/dkr-session-contract.md:330 (interrupt-during-tool-execution clause)"
      ]
    },
    {
      "id": "R2-POSITIVE-FORK-NARROW-EXEC",
      "severity": "residual",
      "blocking": false,
      "finding": "Fork narrowing proven fail-closed (widening rejected) and rebind executes protected work; a positive narrower-schema fork that then runs is not separately executed. Mechanism identical to the demonstrated rebind path.",
      "evidence": [
        ".okra/runs/session-kernel-20260714/replay/dkr-session-probe.ts:1242-1254 (widening rejected; narrower fork run not exercised)"
      ]
    }
  ],
  "lite_change_needed": {
    "for_first_pr": false,
    "confidence": 0.85,
    "reason": "The prior REVISE conditioned this on whether the SDK could join in-flight invocations on finish/close without reaching into Lite. The revised probe shows the join is cooperative and SDK-owned: the runtime attempt registry aborts via its own AbortController and awaits attempt.settled inside finishSession, and Lite context.close runs only after finish completes. None of the enumerated Lite-reopen triggers fire: no hard parent cancellation beyond SDK-owned attempts, no joinable context close outside the session runner, and attempt identity is carried as flow input rather than requiring an owner-bound handle. Current-owned pre-resolution reuse and onClose-before-resource-cleanup remain the verified basis for the smallest graph.",
    "evidence": [
      ".okra/runs/session-kernel-20260714/replay/dkr-session-probe.ts:1044-1050 (SDK-owned fence + await settled inside a named flow)",
      ".okra/runs/session-kernel-20260714/replay/dkr-session-probe.ts:1415-1431 (in-flight join completed without Lite reach; close after finish)",
      "pkg/core/lite/src/scope.ts:1916-1933 (current-owned resolution + boundary walk)",
      "pkg/core/lite/src/scope.ts:2410-2434 (close: registered cleanups then resource cleanups)",
      ".okra/runs/session-kernel-20260714/artifacts/dkr-session-contract.md:404-409 (enumerated Lite-reopen triggers, none fired)"
    ]
  },
  "migration_dkr_boundary": {
    "verdict": "clean",
    "deferred": [
      "Concrete public naming and the compatibility bridge from session()/agent()/currentAgent/currentTool to the resource-native kernel.",
      "Provider parity: claudeSession and acp are ownership:'boundary' with child-process-killing cleanup; DKR-MIGRATION-1/CKR-PROVIDERS must root-own them (or add a shared-lifetime wrapper) so one session close cannot kill a shared transport, and must classify native streaming/steering/continuation/overlap per transport with the abort signal as neutral fallback."
    ],
    "does_not_alter_kernel": "The stand-in invokeModel exercises the cooperative fence/cancel/settle/restart seam the kernel actually requires. Real transports drive cancellation through their own boundary-owned AbortController (still SDK-owned, not a Lite join), so provider parity sits behind the accepted seam and does not change the accepted kernel.",
    "evidence": [
      "pkg/sdk/core/src/index.ts:1145-1152 (stable model tag + complete flow seam preserved)",
      "pkg/sdk/core/src/index.ts:1155-1162 (session() material atom = deprecation surface)",
      "pkg/sdk/claude/src/index.ts:79-81 (claudeSession ownership:'boundary')",
      "pkg/sdk/codex/src/index.ts:115-117 (acp ownership:'boundary')",
      ".okra/runs/session-kernel-20260714/artifacts/dkr-session-contract.md:358 (shared transports must stay live across session close)",
      ".okra/runs/session-kernel-20260714/tree/tree.v3.json:24-30 (CKR-PROVIDERS sourced from DKR-MIGRATION-1)"
    ]
  },
  "evidence": [
    ".okra/runs/session-kernel-20260714/replay/dkr-session-probe.ts:1044-1050,1415-1431 — in-flight finish fence + SDK-owned join + ordered checkpoint (closes P0-ACTIVE-TURN).",
    ".okra/runs/session-kernel-20260714/replay/dkr-session-probe.ts:646-666,1020-1023,1391-1403 — live-invocation abort observation, join before restart, new-epoch quarantine (closes P0-STEERING).",
    ".okra/runs/session-kernel-20260714/replay/dkr-session-probe.ts:1063-1100,1231-1276 — store-backed load/fork, fail-closed resume/fork, fresh-fingerprint rebind executes protected work (closes P0-AUTHORITY).",
    ".okra/runs/session-kernel-20260714/replay/dkr-session-probe.ts:1280-1331 — three zero-model readiness walls (closes P1-READINESS).",
    ".okra/runs/session-kernel-20260714/replay/dkr-session-probe.ts:899-931,1361-1368,1478-1488,1490-1521 — fail-fast join, streaming parity/consumer-break, commit-failure-unfinished, artifact ordering (closes P1-FAIL-FAST, P1-STREAMING, P1-COMMIT, artifact).",
    "pkg/core/lite/src/scope.ts:1916-1933,2154-2326,2410-2434 — verified current-ownership resolution, execStream result/aborted/'Flow stream aborted', close ordering underpinning the probe's claims.",
    "pkg/sdk/core/src/index.ts:1145-1162; pkg/sdk/claude/src/index.ts:79-81; pkg/sdk/codex/src/index.ts:115-117 — preserved model/complete seam and boundary-owned transports scoping provider parity to DKR-MIGRATION-1.",
    ".okra/runs/session-kernel-20260714/frame/frame.v2.json:40-65,184-201; tree/tree.v3.json:83-107 — AG-ACTIVE-TURN, AG-TOOLS-READY, AG-TOOL-SNAPSHOT, AG-AUTHORITY, AG-LIFECYCLE-EFFECT walls and stop rule now satisfied by executable evidence."
  ]
}
```

**One-line rationale:** All three prior P0 gaps (authority load/rebind + fork narrowing, in-flight active-turn abort+join before checkpoint, real steering fence/abort/join/restart) and all six P1 gaps are now closed by executable probe cases built on verified real Lite mechanics; the active-turn join is demonstrably cooperative and SDK-owned, so no Lite change is needed for the first PR, and provider parity plus concrete naming remain cleanly scoped to DKR-MIGRATION-1 without altering the accepted kernel — DKR-SESSION-1 can be accepted and implementation planning may descend.

Two residuals (interrupt shown during model rather than tool invocation; positive narrowing-fork execution not separately run) are non-blocking — both reuse already-proven mechanisms and can be folded into PKR conformance.
