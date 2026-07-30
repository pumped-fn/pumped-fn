I've read all specified files and verified the load-bearing claims against `scope.ts` mechanics and the SDK/provider sources. Here is my independent architecture review as strict JSON.

```json
{
  "verdict": "REVISE",
  "confidence": 0.8,
  "p0_findings": [
    {
      "id": "P0-AUTHORITY-REBIND-UNPROVEN",
      "claim_reviewed": "Authority is rebound before protected capability resolution and effects; forks only narrow it (checkpoint questions_answered #5; DKR-SESSION-1 stop rule requires proven 'authority rebinding').",
      "finding": "The executable probe never loads or forks a session. SessionRuntime is constructed in-factory, not loaded from a store, so there is no authenticate->load->bind->compare sequence and no resume/fork narrowing. The only authority check is an in-flow fingerprint compare on fresh runs. Resume/fork authority rebinding before protected effects is asserted in prose but not demonstrated, so acceptance would breach AG-AUTHORITY + AG-INDEPENDENCE.",
      "evidence": [
        ".okra/runs/session-kernel-20260714/replay/dkr-session-probe.ts:176-278 (createRuntime builds runtime in-memory; no loadSession/forkSession)",
        ".okra/runs/session-kernel-20260714/replay/dkr-session-probe.ts:659-663 (only in-flow fingerprint compare on runWork)",
        ".okra/runs/session-kernel-20260714/tree/tree.v2.json:100 (stop rule requires proven authority rebinding)",
        ".okra/runs/session-kernel-20260714/artifacts/dkr-session-contract.md:173-188,447 (fixed resume order and required resume/fork read)"
      ]
    },
    {
      "id": "P0-ACTIVE-TURN-JOIN-UNPROVEN",
      "claim_reviewed": "An SDK-owned active-turn registry cancels and joins every in-flight attempt with no Lite change; finishSession fences, cancels, and awaits active attempts.",
      "finding": "Lite baseline is shown BREACHED: parent.close() leaves an active stream running (active:true, no close events). The session probe never closes a context during live model/db work; finishSession runs only after all work already settled, and settleInterrupted is synchronous bookkeeping that awaits no in-flight exec promise. Thus the load-bearing claim that in-flight invocations can be joined on finish/close without a Lite change is unproven — and this is one of the contract's own enumerated Lite-reopen triggers.",
      "evidence": [
        ".okra/runs/session-kernel-20260714/replay/dkr-lifecycle-probe.ts:257-259,380 (afterParentClose active:true, events:[])",
        ".okra/runs/session-kernel-20260714/artifacts/dkr-lifecycle-validation.md:44-53,124 (AG-ACTIVE-TURN breached in baseline, blocked)",
        ".okra/runs/session-kernel-20260714/replay/dkr-session-probe.ts:255-262,735-739 (settleInterrupted synchronous; finishPromise does not await live exec)",
        ".okra/runs/session-kernel-20260714/replay/dkr-session-probe.ts:860 (finishSession invoked only after all prior work awaited)",
        ".okra/runs/session-kernel-20260714/artifacts/dkr-session-contract.md:405-406 (active-turn joining is a Lite-reopen trigger)"
      ]
    },
    {
      "id": "P0-STEERING-FENCE-IS-QUARANTINE-ONLY",
      "claim_reviewed": "Interrupt fences and aborts the active invocation, joins it, then restarts; interrupt during tool execution cancels that invocation before a replacement runs (DKR stop rule 'steering fencing').",
      "finding": "The probe's interrupt only increments epoch and quarantines model output AFTER the model flow completes on its own via a deferred; attempt.signal.abort() is never observed by any invocation (invokeModel ignores the signal). This proves post-hoc epoch-based quarantine, not abort+join of a live invocation. Queued steering at safe points and cancel-of-subtree are not exercised at all.",
      "evidence": [
        ".okra/runs/session-kernel-20260714/replay/dkr-session-probe.ts:246-254 (interrupt bumps epoch, aborts signal, no join)",
        ".okra/runs/session-kernel-20260714/replay/dkr-session-probe.ts:463-487 (invokeModel never reads any abort signal)",
        ".okra/runs/session-kernel-20260714/replay/dkr-session-probe.ts:633-641 (accepts()/quarantine runs after model resolves)",
        ".okra/runs/session-kernel-20260714/artifacts/dkr-session-contract.md:322-330,426 (contract claims fence/abort/join and cancel-before-replacement)"
      ]
    }
  ],
  "p1_findings": [
    {
      "id": "P1-READINESS-FAIL-CLOSED-UNTESTED",
      "finding": "AG-TOOLS-READY not exercised: no missing-binding, unreachable-backend, or validation-engine-failure case asserting zero model calls. The only zero-model-call proof is authority mismatch, which is a different wall.",
      "evidence": [
        ".okra/runs/session-kernel-20260714/replay/dkr-session-probe.ts:788-798 (only authority-mismatch zero-call proof)",
        ".okra/runs/session-kernel-20260714/artifacts/dkr-session-contract.md:444-446 (required missing-tool/role/model/backend and validation-engine reads)"
      ]
    },
    {
      "id": "P1-FAIL-FAST-UNTESTED",
      "finding": "Only the 'all' policy (Promise.all) is exercised; fail-fast sibling fencing/cancellation/await is not demonstrated despite being a required conformance read.",
      "evidence": [
        ".okra/runs/session-kernel-20260714/replay/dkr-session-probe.ts:581-608 (Promise.all only)",
        ".okra/runs/session-kernel-20260714/artifacts/dkr-session-contract.md:141-148,448 (fail-fast contract + required read)"
      ]
    },
    {
      "id": "P1-STREAMING-UNTESTED",
      "finding": "The probe uses only scalar ctx.exec. No execStream, consumer-break, timeout, or scalar-drain-equals-stream equivalence is exercised, so the entire streaming section is unvalidated.",
      "evidence": [
        ".okra/runs/session-kernel-20260714/replay/dkr-session-probe.ts:775-887 (all calls are contextX.exec, no execStream)",
        ".okra/runs/session-kernel-20260714/artifacts/dkr-session-contract.md:238-261,450 (streaming contract + required read)"
      ]
    },
    {
      "id": "P1-SNAPSHOT-SINGLE-ROUND",
      "finding": "Snapshot advertised==dispatched is proven only for a single round; AG-TOOL-SNAPSHOT requires identity across every round, and 'a new epoch never mutates a snapshot already supplied' is not demonstrated.",
      "evidence": [
        ".okra/runs/session-kernel-20260714/replay/dkr-session-probe.ts:551-572,782 (single-round identity check)",
        ".okra/runs/session-kernel-20260714/frame/frame.v2.json:58-65 (AG-TOOL-SNAPSHOT: every round)"
      ]
    },
    {
      "id": "P1-COMMIT-FAILURE-UNTESTED",
      "finding": "Only the finishSession happy path (checkpoint once, seal) is exercised. Commit failure leaving the runtime visibly unfinished is a required read and is not demonstrated.",
      "evidence": [
        ".okra/runs/session-kernel-20260714/replay/dkr-session-probe.ts:724-747,860-871 (happy-path seal only)",
        ".okra/runs/session-kernel-20260714/artifacts/dkr-session-contract.md:347,454 (commit-failure-unfinished required)"
      ]
    },
    {
      "id": "P1-MEMORY-ARTIFACT-SCHEDULER-UNTESTED",
      "finding": "Memory (candidate vs accepted), artifact content-before-reference ordering, and scheduler wake have zero probe coverage; these contract sections are asserted but unexercised. Resume is triggered manually, not by a scheduler.",
      "evidence": [
        ".okra/runs/session-kernel-20260714/artifacts/dkr-session-contract.md:263-292,310-317 (memory/artifact/scheduler sections)",
        ".okra/runs/session-kernel-20260714/replay/dkr-session-probe.ts:834-839 (resume is a manual second exec, no scheduler/artifact/memory)"
      ]
    },
    {
      "id": "P1-PROVIDER-PARITY-STANDIN",
      "finding": "Claude/Codex compatibility is asserted from source but not demonstrated: the probe uses a stand-in invokeModel, not the model/complete seam. Both real transports are ownership:'boundary', so the required root-lifetime enclosure (one session close must not close a shared transport) is a concrete migration constraint, correctly deferred to DKR-MIGRATION-1/CKR-PROVIDERS but not yet proven.",
      "evidence": [
        ".okra/runs/session-kernel-20260714/replay/dkr-session-probe.ts:463-487 (stand-in model, not complete)",
        "pkg/sdk/claude/src/index.ts:79-81,221-225,247 (claudeSession boundary-owned; cleanup kills child; claude=model(claudeTurn))",
        "pkg/sdk/codex/src/index.ts:115-117,191-235,294 (acp boundary-owned; cleanup kills child)",
        ".okra/runs/session-kernel-20260714/artifacts/dkr-session-contract.md:358 (shared transports must stay live across session close)"
      ]
    }
  ],
  "accepted_boundaries": [
    {
      "boundary": "No Lite change is required for the smallest database-analysis graph.",
      "why_accepted": "Current-owned pre-resolution reuse and onClose-before-resource-cleanup dependency-live finalization are real Lite semantics, verified in source; the probe's reuse of the pre-resolved contextA runtime is consistent with them.",
      "evidence": [
        "pkg/core/lite/src/scope.ts:1916-1933 (resourceOwner + findResourceEntry current-ownership/boundary walk)",
        "pkg/core/lite/src/scope.ts:1888,2114,2193 (createContext boundary:true default; exec child contexts boundary:false)",
        "pkg/core/lite/src/scope.ts:2410-2437 (runCloseCleanups: onClose cleanups reverse-first, then resource entry cleanups)",
        ".okra/runs/session-kernel-20260714/replay/dkr-session-probe.ts:772-778 (pre-resolve session in contextA, then execs reuse it)"
      ]
    },
    {
      "boundary": "Record / runtime / physical-resource split with admission-before-effects and root-owned physical lifetime is pumped-fn-native and sound.",
      "why_accepted": "Probe admits work before role/tool/model resolution, keeps every effect in a named flow, and shows one session close leaving the shared root backend live with a single root cleanup.",
      "evidence": [
        ".okra/runs/session-kernel-20260714/replay/dkr-session-probe.ts:651-676 (admit before turn/tool/model)",
        ".okra/runs/session-kernel-20260714/replay/dkr-session-probe.ts:779-781 (work.admitted precedes tool.ready)",
        ".okra/runs/session-kernel-20260714/replay/dkr-session-probe.ts:878-892 (session A close leaves backend live; root close cleans once)"
      ]
    },
    {
      "boundary": "Bounded DB borrowing, wait-without-live-lease, execution-join-vs-CAS-merge, and memoized finish join are genuinely demonstrated.",
      "why_accepted": "Borrow released before model reasoning; waiting asserts zero live leases; join does not mutate revision while explicit CAS merge advances it and rejects stale; repeated finish joins one checkpoint.",
      "evidence": [
        ".okra/runs/session-kernel-20260714/replay/dkr-session-probe.ts:783-784 (no borrow across model round)",
        ".okra/runs/session-kernel-20260714/replay/dkr-session-probe.ts:827-833 (waiting zero borrow, attempt released)",
        ".okra/runs/session-kernel-20260714/replay/dkr-session-probe.ts:806-825 (join no-merge, then CAS merge + stale rejection)",
        ".okra/runs/session-kernel-20260714/replay/dkr-session-probe.ts:860-871 (memoized finish, single checkpoint)"
      ]
    },
    {
      "boundary": "Finish-before-close ordering and lifecycle-hook effect-free placement are demonstrated (placement is partly self-fulfilling but directionally sound).",
      "why_accepted": "Checkpoint index precedes host-close index; the business-effect-in-hook counter stays 0 because all effects live in flows, not in onClose/cleanup.",
      "evidence": [
        ".okra/runs/session-kernel-20260714/replay/dkr-session-probe.ts:872-876 (checkpoint before close; hook effect count 0)",
        ".okra/runs/session-kernel-20260714/replay/dkr-session-probe.ts:300-303,383-395 (lifecycle wrappers only push trace)"
      ]
    },
    {
      "boundary": "The existing simple provider seam is preserved and MCP is correctly absent.",
      "why_accepted": "model tag + complete flow remain the seam; tools are already inert flows executed via ctx.exec; session() is a thin material atom; Codex sends empty mcpServers.",
      "evidence": [
        "pkg/sdk/core/src/index.ts:1145-1152 (model tag + complete flow)",
        "pkg/sdk/core/src/index.ts:1155-1162,1655 (session=material; tool run via ctx.exec)",
        "pkg/sdk/codex/src/index.ts:258 (mcpServers: [])"
      ]
    }
  ],
  "rejected_overclaims": [
    {
      "overclaim": "checkpoint questions_answered #5: 'Authority is rebound before protected capability resolution and effects; forks only narrow it.'",
      "reason": "No load/fork path exists in the probe; only same-session fingerprint compares. Resume/fork rebinding is unproven.",
      "evidence": ".okra/runs/session-kernel-20260714/artifacts/dkr-session-checkpoint-candidate.json:39; contradicted by replay/dkr-session-probe.ts:176-278"
    },
    {
      "overclaim": "Contract 'Required conformance reads' presented as though within DKR-SESSION-1's proven scope.",
      "reason": "The probe demonstrates ~11 of 17 required reads; authority resume/fork, validation-engine fail-closed, fail-fast, streaming/consumer-break, commit-failure-unfinished, and unexpected-close-during-active-work are not exercised — including two stop-rule items (authority rebinding, steering fencing).",
      "evidence": ".okra/runs/session-kernel-20260714/artifacts/dkr-session-contract.md:438-457; coverage gap vs replay/dkr-session-probe.ts:749-923"
    },
    {
      "overclaim": "checkpoint questions_answered #2/#10 implying full interrupt/active-turn joining and fenced steering.",
      "reason": "Interrupt is post-hoc quarantine, not abort+join; finishSession never joins a genuinely in-flight attempt.",
      "evidence": ".okra/runs/session-kernel-20260714/artifacts/dkr-session-checkpoint-candidate.json:36,44; contradicted by replay/dkr-session-probe.ts:246-262,633-641"
    }
  ],
  "lite_change_needed": {
    "for_first_pr": false,
    "confidence": 0.7,
    "reason": "The smallest graph verifiably needs no Lite change (current-owned pre-resolution + onClose dependency-live finalization confirmed in scope.ts). However this is CONDITIONAL: the SDK-owned active-turn cancel+join and finish-time joining of in-flight ctx.exec invocations are unproven, and 'arbitrary nested execution needs hard parent cancellation and joining beyond SDK-owned attempts' plus 'joinable context close outside the session runner' are explicitly listed Lite-reopen triggers. If an extended probe shows the SDK cannot join in-flight invocations on finish/close without reaching into Lite, a Lite change becomes required.",
    "evidence": [
      "pkg/core/lite/src/scope.ts:2400-2437 (close does not join in-flight exec; only registered cleanups)",
      ".okra/runs/session-kernel-20260714/replay/dkr-lifecycle-probe.ts:257-259 (parent close leaves active stream running)",
      ".okra/runs/session-kernel-20260714/artifacts/dkr-session-contract.md:404-409 (enumerated Lite-reopen triggers)"
    ]
  },
  "migration_dkr_questions": [
    "Public names and compatibility bridge from the current thin facade (agent()/session()/tool(), currentAgent/currentTool) to the resource-native kernel; confirm session() material atom and agent.turn flow are the deprecation surface (pkg/sdk/core/src/index.ts:1155-1162,1217-1241).",
    "claudeSession and acp are ownership:'boundary' and their cleanups kill the child process (pkg/sdk/claude/src/index.ts:81,221; pkg/sdk/codex/src/index.ts:117,191-235). The kernel requires transports pre-resolved in a root owner enclosing all session contexts (contract:358) — decide whether these become root-owned or gain a shared-lifetime wrapper.",
    "Classify per-transport native support for streaming, steering acknowledgement, continuation, and overlapping attempts (Claude stdin-jsonl prompt/abort vs Codex ACP session/prompt + session/cancel) and confirm the abortSignal tag is the neutral fallback (pkg/sdk/claude/src/index.ts:191-236; pkg/sdk/codex/src/index.ts:244-285).",
    "Bounded event/backpressure policy and concrete artifact-store adapter selection (contract:495)."
  ],
  "evidence": [
    "pkg/core/lite/src/scope.ts:1888,1916-1933,2114,2193 — boundary/current-ownership resolution proving pre-resolved runtime reuse.",
    "pkg/core/lite/src/scope.ts:2400-2437 — close runs registered cleanups reverse-first then resource cleanups; does not join in-flight exec.",
    "pkg/sdk/core/src/index.ts:1145-1162,1655 — model/complete seam, material session, inert-flow tools (migration base).",
    "pkg/sdk/claude/src/index.ts:79-247 and pkg/sdk/codex/src/index.ts:115-294 — boundary-owned transports with abort-driven cancellation; empty MCP.",
    ".okra/runs/session-kernel-20260714/replay/dkr-session-probe.ts:749-923 — session probe: proves admission-first, single-round snapshot identity, bounded borrow, join-vs-CAS-merge, wait, memoized finish, finish-before-close, shared-backend isolation; does NOT prove resume/fork rebinding, readiness fail-closed, real interrupt join, fail-fast, streaming, commit-failure, memory, artifacts, scheduler.",
    ".okra/runs/session-kernel-20260714/replay/dkr-lifecycle-probe.ts:257-384 — Lite baseline: active stream survives parent close; non-joinable close/release; current-owned boundary behavior.",
    ".okra/runs/session-kernel-20260714/tree/tree.v2.json:99-101 — DKR-SESSION-1 stop rule requires proven authority rebinding and steering fencing.",
    ".okra/runs/session-kernel-20260714/artifacts/dkr-session-checkpoint-candidate.json:311-320 — writer's own wall_gate: blocked, pending independent validation (candidate unaccepted, consistent with this REVISE)."
  ]
}
```

**Verdict rationale (one line each):**
- Not STOP — the architecture is sound and pumped-fn-native; the load-bearing Lite mechanics (pre-resolved current-ownership reuse, onClose-before-cleanup finalization, no Lite change for the smallest graph) are verified against `scope.ts`, and the probe genuinely proves the core.
- Not GO — the executable probe does not prove three stop-rule/checkpoint claims (authority resume/fork rebinding, real interrupt abort+join, active-turn joining on close), and the active-turn joining risk is itself an enumerated Lite-reopen trigger left unresolved.
- REVISE — extend the probe to cover the P0/P1 reads (or explicitly re-scope them into named PKR conformance) before the candidate checkpoint is accepted and before implementation descends.

Note: I performed a static read-only review and did not execute either probe (`plan mode` / read-only); the coverage findings are from reading the probe source against the contract's required reads, not from a fresh run.
