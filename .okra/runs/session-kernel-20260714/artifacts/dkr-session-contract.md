# DKR-SESSION-1 — Rich session kernel contract

## Candidate decision

Use a durable `SessionRecord` and a current-owned `SessionRuntime` as the mediation point for work, tools, authority, branches, files, memory, scheduling, and steering. Keep every external effect in a named flow. The host owns the execution context and physical root resources.

This is candidate learning. It does not accept itself or promote implementation.

```text
root resources
  database pool | provider transports | stores | sandbox engine | scheduler
        |
        v
host-owned session context
  -> loadSession flow
  -> pre-resolved SessionRuntime resource
       -> WorkRecord / WorkAttempt registry
       -> tool permits and immutable snapshots
       -> branches, steering, and owned cancellation state
       -> no physical backend ownership
        |
        v
runWork flow
  -> admit attempt before role or tool resolution
  -> role resource
  -> ready tool resources
  -> turn flow
       -> model, tool, database, sandbox, and subagent invocation flows
        |
        v
finishSession flow -> durable commit flow -> host closes context
```

## Prime boundary

```text
session owns when, why, identity, policy, and semantic state
resources own physical lifetime and readiness
flows own external effects
extensions own execution observation
adapters translate protocols
```

The session is deliberately rich. It is not a service locator. Its methods may mutate session-owned state, issue or revoke permits, admit work, register settlements, choose safe points, and build immutable records. They may not perform model, database, filesystem, artifact-store, memory-store, sandbox, scheduler, or provider effects.

## Records and runtime

### SessionRecord

`SessionRecord` is durable and serializable. It contains no live handles or secrets.

```text
SessionRecord
  id
  version
  status: open | finishing | finished | abandoned
  authority fingerprint and non-secret constraints
  current branch and branch lineage
  work records and attempt summaries
  tool snapshot references and epochs
  artifact references
  governed memory references
  schedule and wake intents
  provider continuation references
  event and checkpoint positions
  schema version and retention policy
```

### SessionRuntime

`SessionRuntime` is a current-owned resource pre-resolved in a dedicated host-owned context. It contains only session-owned live state:

```text
SessionRuntime
  bound live authority
  status and admission gate
  active WorkAttempt settlements
  owned AbortControllers
  tool permit epochs
  immutable snapshot cache
  branch admission state
  steering inbox and sequence fences
  one memoized finish settlement
```

It does not own or close its execution context. It does not own database pools, borrowed clients, provider transports, sandbox engines, file descriptors, scheduler workers, clocks, or durable stores.

### SessionStore

Durable I/O remains visible:

```text
loadSession flow   -> session store implementor flow
commitSession flow -> session store implementor flow
forkSession flow   -> load + authority check + commit
```

Provider choice and storage engine are required tags grouped under their namespaces. There is no built-in store.

## Work and structured concurrency

One semantic mechanism covers turns, roles, subagents, long-running tasks, scheduled work, and human waits without calling all of them turns.

```text
WorkRecord
  durable intent, causal parent, branch, policy, and status

WorkAttempt
  one leased execution of a WorkRecord
  attempt number, snapshot epoch, deadline, settlement, and lease

Invocation
  one model, tool, database, sandbox, memory, artifact, or adapter effect

ControlEvent
  sequenced queue, interrupt, cancel, input, or policy message
```

An agent role is a resource selected for a work attempt. A turn is a flow that uses the role. A subagent is a child `WorkRecord`, a selected role resource, a child or shared branch chosen by policy, and authority no wider than its parent.

### Admission order

Lite resolves flow and resource dependencies before entering a resource factory. Therefore the outer work flow must admit work before it invokes the role-specific turn.

```text
runWork flow
  deps: SessionRuntime + lazy controller(turn flow)
  factory:
    admit WorkRecord and WorkAttempt
    invoke turn controller with attempt tags

turn flow
  deps: SessionRuntime + role resource + model controller
  role resource
    deps: SessionRuntime + statically declared tool resources
```

No model, tool, sandbox, database, or provider effect may occur before work and branch admission.

### Parallelism

- Every attempt has `sessionId`, `workId`, `attempt`, `branchId`, `snapshotEpoch`, and causal parent identity.
- A declared concurrency policy controls sibling work. The first kernel needs `all` and `fail-fast` only.
- `all` waits for all required children and collects their settlements.
- `fail-fast` fences the sibling set, cancels unsettled siblings, and waits for all cancellations to settle.
- Required children settle before their parent settles.
- Detached work is allowed only as an explicit durable scheduled relation. Structural ownership persists even when no runtime is resident.
- Parallel reasoning and read-only invocations are allowed. Branch commits and mutable logical-name publication are serialized by version checks.

### Waiting

Waiting is durable work state, not a held execution context.

Before `working -> waiting` completes, a named flow persists the continuation and expected versions. The attempt then settles and releases all borrowed clients, transactions, provider streams, sandbox leases, timers, and child contexts. A scheduler wake or human input starts a new `WorkAttempt`.

### Fork, join, and merge

```text
execution fork != state fork
execution join != state merge
```

- Execution fork starts child work.
- State fork creates divergent semantic lineage. A speculative read-only analyst may need a branch even though it performs no external write.
- Execution join waits for settlement only.
- State merge is an explicit flow. It checks session identity, authority compatibility, branch lineage, source settlement, target expected version, and merge strategy.
- A merge never promotes privileged action. Database proposals remain evidence with `applied: false`.

## Authority and resume

The durable record stores an authority fingerprint and non-secret constraints, never credentials or live grants.

Resume order is fixed:

```text
authenticate principal
  -> authorize minimal session lookup
  -> load protected SessionRecord
  -> bind live authority to SessionRuntime
  -> compare fingerprint and constraints
  -> admit branch and work
  -> resolve tools
  -> call model or backend
```

Protected payload, capability resolution, and every effect fail closed before use when the authority cannot be rebound. A fork may only narrow tenant, roots, tools, permissions, sandbox policy, budget, and retention. A lower layer has no union or grant operation.

Raw file paths, database identifiers, provider session ids, and MCP inventories are not authority. The session issues scoped permits from host-bound authority.

## Tools and roles

### Tool placement

The static graph decides which tools can exist. Session policy decides which of those tools are permitted. Resource resolution proves readiness. The model sees only the intersection.

```text
statically declared tools
  intersect ready tool resources
  intersect session permits
  = immutable ResolvedToolSnapshot
```

A tool resource depends on `SessionRuntime` and its explicit readiness dependencies. It returns metadata and an inert flow definition, not an owner-context `FlowHandle` and not a method that performs an effect. The turn executes the selected named flow through its current attempt context.

The session tool registry contains permits, epochs, and snapshot identities. It is not a global executable lookup table and never scans tags.

### Snapshot identity

Every resolved tool snapshot carries:

```text
tool id and version
model-visible name and description
input schema digest
validation engine and validator identity
readiness/backend identity
invocation flow identity
authority fingerprint
permit epoch
branch and snapshot epoch
```

All declared tools resolve before the first model call. A missing binding, unreachable backend, denied permit, or validation-engine failure produces zero model calls. Advertised and dispatched identities are identical. A capability-changing steering event creates a new epoch; it never mutates a snapshot already supplied to a model invocation.

### Role and turn

```text
role resource
  identity, instructions, policy, ready tool snapshots, model requirements

turn flow
  rounds, streaming, model calls, tool dispatch, subagent work, result
```

The runtime role value has no `.turn()` method. Consumers execute the exported turn flow.

## Streaming and provider compatibility

The durable event envelope is provider-neutral:

```text
SessionEvent
  sessionId
  workId
  attempt
  invocationId?
  branchId
  sequence
  snapshotEpoch
  type
  payload reference or normalized payload
  observedAt
```

Stable event types cover work admission and settlement, model progress, tool progress, branch changes, steering, waiting, checkpoints, and finish. Provider wire payloads remain adapter-private unless stored as an opaque evidence reference.

The turn is one streaming flow. Scalar execution drains it and returns the same final result. Streaming execution yields bounded events and returns that result. Consumer break, timeout, interrupt, and close propagate cancellation and wait for settlement. Output that arrives after an attempt fence is retained only as quarantined evidence and cannot mutate branch state or the accepted result.

The existing `model` tag plus `complete` flow remains the simple provider seam. Claude and Codex may continue as `Model` providers. A richer harness adapter may optionally expose provider-native streaming, steering, continuation, and parallel capabilities. Unsupported capabilities use the provider-neutral cancel, settle, and restart path.

Provider continuation is an opaque optional reference owned by a branch or work attempt. It is not canonical history. Transport loss marks the attempt detached, unknown, failed, or recoverable according to direct evidence; it does not close the semantic session.

## Shared files and storage

Separate three concerns:

```text
session store     records, events, branches, continuations
artifact store    immutable content and versioned references
scratch workspace attempt- or branch-scoped temporary files
```

The kernel requires abstract atomic publication, not one physical blob or manifest layout.

`ArtifactRef` carries logical identity, immutable version or digest, media type, authority fingerprint, creator work, branch, and provenance. Shared readers use immutable refs. Mutable logical names use compare-and-swap. Content publication completes before a session checkpoint may reference it. A failed checkpoint may leave unreachable content for later collection, but never a durable dangling reference.

A scratch workspace is a session-issued permit plus an injected sandbox or filesystem resource. No live descriptor or physical path is serialized as authority. Export and publication are named flows.

## Memory

Storage says where information lives. Memory says what information is retained, accepted, and recalled.

```text
working memory     one model invocation
session memory     one session or branch
episodic memory    governed cross-session records
procedural memory  versioned skills and policies
```

Skills are procedural resources, not memory records. Cross-session recall and commit are explicit flows. A durable memory record carries provenance, source type, authority, confidence, acceptance status, retention, creator work, and evidence refs.

Model output may create a candidate memory. It cannot promote durable truth. A named acceptance flow may accept evidence from a model, human, policy, or imported governed source. Forked branches write candidates locally; execution join does not promote them, and state merge promotes only explicitly selected records.

## Hook placement

Do not add a generic session callback bus.

| Meaning | Pumped-fn placement |
|---|---|
| Observe an execution | Lite extension |
| Guard or transform a semantic operation | Named flow dependency |
| Durable follow-up | Scheduled `WorkRecord` |
| Mid-turn input | `ControlEvent` |
| Owned-state teardown | resource cleanup |
| Lifecycle-only abort, unsubscribe, or lease release | context lifecycle phase |

Checkpoint, persistence, sealing, model, database, filesystem, sandbox, and scheduler business effects always remain named flow edges. Hook order is therefore graph order, not an undeclared callback convention.

## Scheduling

The session stores durable schedule and wake intent. A root scheduler resource owns clocks, queues, claims, worker leases, heartbeats, quotas, and concurrency.

```text
scheduled -> ready -> claimed -> working -> waiting | terminal
```

A retry is a new `WorkAttempt` for the same `WorkRecord`. External invocations use idempotency identities derived from work, attempt, and invocation ids. The scheduler starts a fresh host context, reloads and rebinds the session, pre-resolves `SessionRuntime`, admits the attempt, and closes the context after explicit finish or wait settlement.

## Mid-turn steering

A `ControlEvent` is durable, addressed, sequenced, and authority checked.

```text
queue     consume at the next safe point
interrupt fence and abort the active invocation, join it, then restart
cancel    terminate the addressed work subtree
input     resume waiting work in a new attempt
```

Safe points are before model dispatch, before tool dispatch, after invocation settlement, and between rounds. A dispatched tool's arguments never mutate. Interrupt during tool execution cancels that invocation before a replacement can run. Provider-native steering is an adapter optimization; the kernel contract remains fence, cancel, settle, and restart.

## Finish and context close

`finishSession` is the semantic completion flow:

```text
finishSession
  1. memoize one finish settlement
  2. mark finishing and reject new work
  3. fence, cancel, and await active attempts
  4. require every required child to settle
  5. build a pure finished SessionRecord candidate
  6. commit it through the declared session-store flow
  7. record the committed version and mark runtime finished
```

Repeated finish callers join the same settlement. Commit failure leaves the runtime visibly unfinished and does not claim a durable seal.

The host owns this sequence:

```text
await owner.exec(finishSession)
await owner.close()
```

Unexpected context close may perform lifecycle-only cancellation, joining, unsubscribe, lease release, and owned-memory cleanup. It performs no checkpoint, persistence, sealing, model, database, filesystem, sandbox, or scheduler business effect. Recovery reads the durable record and direct invocation evidence rather than assuming the session finished.

Physical backends are scope atoms or resources explicitly pre-resolved in a host/root owner whose lifetime encloses all session contexts. Closing one session must not close a shared database pool, provider process pool, sandbox engine, store, or scheduler.

## Adapter boundary

```text
session kernel
  -> Claude Model adapter
  -> Codex Model adapter
  -> optional rich Claude/Codex/Pi harness adapters
  -> local IPC adapter
  -> later MCP adapter
```

IPC may carry work, invocation, event, and control messages while preserving kernel ids and authority. MCP is not part of this PR. A later MCP adapter may map an authorized tool snapshot to tools, a `WorkRecord` to a task, and cancellation to a control event. MCP discovery, protocol version, state handles, roots, and transport lifetime remain adapter details. MCP inventory never grants session authority.

## Pumped-fn-native graph shape

The smallest graph needs no Lite change:

```text
sessionRuntime resource
  ownership: current
  deps: required live authority tag

ready database tool resources
  ownership: current
  deps: sessionRuntime + policy/backend readiness
  value: frozen snapshot fields + inert named flow definition

database analyst role resource
  ownership: current
  deps: sessionRuntime + statically declared ready tools

database analyst turn flow
  deps: sessionRuntime + analyst role + controller(model.complete)

run database analysis flow
  deps: sessionRuntime + controller(database analyst turn)
  factory: admit first, then invoke turn with attempt tags

finishSession flow
  deps: sessionRuntime + controller(commitSession)
```

The tool invocation uses the current attempt context's `ctx.exec` with the selected inert flow definition. It does not call an owner-bound `FlowHandle`. Every provider, database, sandbox, memory, artifact, scheduler, and apply operation remains a named flow or resource edge and stays replaceable through `createScope({ presets, tags, extensions })`.

Lite reopens only if executable evidence proves one of these reusable gaps:

- arbitrary nested execution needs hard parent cancellation and joining beyond SDK-owned attempts;
- repeated non-session resources need dependency-live finalization on both close and manual release;
- joinable context close is required outside the session runner;
- current-context invocation cannot preserve attempt tags without an owner-bound handle.

## Database-analysis acceptance trace

```text
1. Host resolves root database pool, stores, provider transport, and scheduler.
2. Principal authenticates and receives minimal session-lookup authority.
3. loadSession reads the protected record; live authority is rebound and checked.
4. Host creates a dedicated context and pre-resolves SessionRuntime.
5. runAnalysis admits parent work and its branch before role or tool resolution.
6. inspect_schema and explain_query resources prove policy, validation, and backend readiness.
7. One immutable authorized tool snapshot is supplied to the model.
8. The model requests inspect_schema with the advertised tool identity.
9. The invocation validates name, version, schema digest, validator, permit epoch, and authority.
10. A database flow borrows one client, performs a bounded read, records evidence, and returns it before model reasoning resumes.
11. Parent work forks schema-analysis and query-plan child work on divergent branches.
12. Children run in parallel under a declared all or fail-fast policy; no client or transaction crosses a model round.
13. An interrupt fences one attempt, aborts and joins its invocation, quarantines late output, and starts a new snapshot epoch.
14. Parent execution joins settled children without changing branch state.
15. An explicit merge flow checks lineage, authority, and target version, then appends selected evidence with applied=false.
16. Artifact content publishes before its reference enters the session checkpoint.
17. Any long-term memory remains candidate until a named acceptance flow promotes it.
18. Waiting persists a continuation, settles the attempt, and leaves zero live leases; scheduler wake starts a new attempt.
19. finishSession rejects admission, joins all required work, commits the finished record, and settles once.
20. Host closes the session context; the root database pool and provider resources stay live for another session.
21. Resume or fork under changed tenant, roots, or permissions fails before tool advertisement or model execution.
22. DDL apply remains a separate externally approved flow and never follows model output directly.
```

## Required conformance reads

The implementation checkpoint must replay at least:

- two isolated sessions sharing one root backend;
- pre-resolved current-owned runtime reuse through nested turns;
- work admission before missing tool, role, model, and backend failures;
- advertised and dispatched tool snapshot identity equality;
- validation engine failure before the first model call;
- authority mismatch on resume and fork before protected effects;
- all and fail-fast sibling settlement;
- wait with zero live clients, transactions, streams, leases, and child contexts;
- execution join without merge, then explicit CAS merge;
- queued steering, interrupt fencing, cancellation, and late-output quarantine;
- scalar drain and streaming consumer-break behavior;
- repeated `finishSession` callers joining one commit settlement;
- commit failure leaving the runtime visibly unfinished;
- unexpected context close producing zero business lifecycle effects;
- one session close leaving shared root backends live;
- database proposal ending with `applied: false` and no DDL invocation.

## Lifecycle learning disposition

Retain from `DKR-LIFECYCLE-1`:

- resource cleanup order changes with resolution history;
- global topological cleanup is not a Lite invariant;
- manual release skips context `onClose`;
- parent close does not join an active child stream;
- current Lite close and release are effect-idempotent but not joinable;
- current-owned pre-resolution gives the needed runtime boundary;
- resource cleanup releases owned state only;
- the first PR needs no Lite change.

Supersede:

- the thin active-turn-only session;
- the semantic session owning or closing its context;
- broad placement of dependency-using business finalization in `onClose`;
- checkpoint or sealing during context close;
- the single lifecycle-order metric rename.

The recorded replacement walls are both required:

```text
dependency_use_after_dependency_close_count == 0
business_effect_in_lifecycle_hook_count == 0
```

## Decision and unknowns

Candidate decision: use this rich record/runtime/work model as the input to independent validation and the migration DKR. Do not promote CKRs or implementation PKRs until an independent validator replays the source refs and the orchestrator accepts the checkpoint.

Questions still open:

- The migration DKR must choose the public names and compatibility bridge from legacy `Agent`, `session()`, and temporary `currentAgent`/`currentTool` surfaces.
- Provider probes must state which Claude and Codex transports support native streaming, steering acknowledgement, continuation, and overlapping attempts. Unsupported features use the kernel fallback.
- The implementation must choose a bounded event/backpressure policy and artifact-store adapter without changing this semantic contract.
- A later MCP DKR is needed only after the kernel has meaningful explicit tool and work surfaces to expose.

## Source and replay evidence

- `pkg/core/lite/src/scope.ts:992-995,1107-1134` — resolved flow handles capture their resolving context.
- `pkg/core/lite/src/scope.ts:1564-1605` — resource dependencies resolve before the resource factory.
- `pkg/core/lite/src/scope.ts:1916-1931` — current-owned lookup and explicit boundary behavior.
- `pkg/core/lite/src/scope.ts:2072-2081,2400-2436` — release asymmetry, close ordering, and non-joinable repeated close.
- `pkg/sdk/core/src/index.ts:1089-1161` — current session is only a material atom and the event buffer is boundary-owned.
- `pkg/sdk/core/src/index.ts:1145-1152` — stable provider-neutral `model` and `complete` seam.
- `pkg/sdk/core/src/index.ts:1217-1255,1500-1712` — current agent facade, turn loop, tool and subagent execution.
- `pkg/sdk/claude/src/index.ts:79-247` and `pkg/sdk/codex/src/index.ts:115-294` — provider resource/flow boundaries and cancellation behavior.
- `.okra/runs/session-kernel-20260714/artifacts/dkr-lifecycle-contract.md` and `dkr-lifecycle-validation.md` — replayed empirical lifecycle facts.
- `.okra/runs/managed-tool-context-20260713/OVERALL-DESIGN.md`, `tool-placement-use-cases.md`, and `tool-sandbox-lifecycle.md` — earlier tool, role, streaming, database, and sandbox placement evidence.

Replay the public completeness contract:

```bash
python3 .agents/skills/reverse-tornado-okr/scripts/okra-verify-artifact.py \
  .okra/runs/session-kernel-20260714/artifacts/dkr-session-contract.md \
  --contract .agents/skills/reverse-tornado-okr/contracts/executable-dkr-checkpoint.v1.json
```

Semantic acceptance still requires an independent validator to replay the cited sources and required conformance reads. The completeness checker is not acceptance evidence.

## Executable DKR Checkpoint Contract

Objective: `executable_dkr_checkpoint_contract_acceptance_rate >= 0.90`.

Tripwires: `unsupported_checkpoint_acceptance_count == 0`; `superficial_checkpoint_acceptance_count == 0`; `tautological_checkpoint_acceptance_count == 0`; `false_positive_checkpoint_acceptance_count == 0`; `single_llm_truth_acceptance_count == 0`; `fabricated_conclusion_acceptance_count == 0`.

A checkpoint carries `checkpoint_id`, `conclusion_id`, `decision_target`, `source_of_truth`, `read_method`, `observed_at`, `recorded_at`, `max_age`, `freshness_status`, `confidence`, `evidence_refs_or_hashes`, `replay_command_or_checker`, `questions_answered`, `questions_unanswered`, `decision`, `flag_if_missing_or_stale`, `reviewer_audit_status`, `active_anti_goals`, `active_anti_goal_verification`, and `wall_gate`.

An empty result is a valid non-accepted decision only when it still carries a replayable probe trace. Superficial, tautological, false-positive, fabricated, unsupported, and single-LLM-truth checkpoints are rejected. Missing, stale, wrong-source, non-replayable, or contradicted evidence fails closed and opens a blocking flag.

### Worked Executable DKR Checkpoint Trace

The candidate `metric_read` for `business_effect_in_lifecycle_hook_count` is not accepted from writer prose. Source hash `sha256:549e6b4096698a433f5a843dc4851d2ab9743c7b5e77e7497e0205c7d9aa3b0b` proves Lite lifecycle placement but not the proposed product contract. The checkpoint is therefore recorded as candidate, reviewer audit remains pending, and downstream work is rejected until independent replay.

```json
{
  "contract_version": "okra.executable-dkr-checkpoint.v1",
  "type": "dkr_checkpoint_candidate",
  "unit_id": "DKR-SESSION-1",
  "checkpoint_id": "checkpoint.DKR-SESSION-1.round-1",
  "conclusion_id": "rich-session-record-runtime-work-kernel-no-lite-change",
  "decision_target": "Define and replay the rich SessionRecord plus SessionRuntime kernel with explicit work, authority, tool, branch, storage, memory, scheduling, steering, finish, and adapter boundaries.",
  "source_of_truth": "Frame v2, Lite and SDK source, accepted empirical lifecycle evidence, and retained managed-tool placement artifacts.",
  "read_method": "Run the saved public completeness checker against this artifact, then independently replay every cited source range and required conformance read before acceptance.",
  "observed_at": "2026-07-14T07:34:39Z",
  "recorded_at": "2026-07-14T07:34:39Z",
  "max_age": "10m",
  "freshness_status": "fresh",
  "confidence": 0.94,
  "confidence_probability_update": {
    "before": 0.7,
    "after": 0.94,
    "reason": "Three adversarial architecture angles converged on the record/runtime/work split, explicit effect flows, immutable tool snapshots, root-owned physical lifetime, and adapter-only protocol placement; source reads confirmed the key Lite and current SDK constraints."
  },
  "evidence_refs_or_hashes": [
    "sha256:4fabdff43b4868fbbbeabcbb300dcf8814073ca4490328ebc9bd245baa6f5ecc",
    "sha256:746bab24796bed07b27c6fc9a6ee4d855034d3fc8c882fc59c70eeeb8e367294",
    "sha256:549e6b4096698a433f5a843dc4851d2ab9743c7b5e77e7497e0205c7d9aa3b0b",
    "sha256:e96b5a1328a9eb673959dfe80ad23c42e568395cf936b90a6b665c5059d3deb2",
    "sha256:58218c2c494c8ce8b3a27f8f0f11d2b2ad5b8dd832b96e1e8f195106100faa73",
    "sha256:e96935fad2d2f80e73bc63d197cb6ef4d3b12f35afaeb522918d24984ba211b7",
    "sha256:aa85b8a6dd0aaa2ac3b2de317382e61603b3337be83ef4c9321decef7959b6e9",
    "sha256:3561028fbe87117343da38d1cbde661a4ee5ff7e41c51c5116f0eda8585d2658",
    "sha256:d6990b0f1ff11b6e71a3ad2a8645b7d24cd351c8c1a04b9c6fd5320a6581bc83",
    "sha256:5a70ced67346086434c16eb5b56e233d53c2530fc82ad95f29b90207cfe5c625",
    "sha256:d9d8bc298f64a8725cb9654c044ffc67690896abaecb23d7a5aac4c055012b52"
  ],
  "replay_command_or_checker": "python3 .agents/skills/reverse-tornado-okr/scripts/okra-verify-artifact.py .okra/runs/session-kernel-20260714/artifacts/dkr-session-contract.md --contract .agents/skills/reverse-tornado-okr/contracts/executable-dkr-checkpoint.v1.json",
  "questions_answered": [
    "A durable SessionRecord is separate from the current-owned SessionRuntime and from physical root resources.",
    "WorkRecord, WorkAttempt, Invocation, and ControlEvent provide one structured mechanism for turns, subagents, waiting, retries, scheduling, and steering without conflating their lifetimes.",
    "An outer runWork flow admits work before lazy role and tool resolution.",
    "Tool readiness is a current-owned resource contract while invocation remains a named flow executed in the attempt context; the session registry stores permits and identities, not executable lookup.",
    "Authority is rebound before protected capability resolution and effects; forks only narrow it.",
    "Execution join and state merge are separate, and branch forks follow divergent semantic lineage rather than external writes alone.",
    "Files, memory, hooks, schedules, and steering each have explicit placement without hidden business effects.",
    "finishSession is the explicit commit and seal flow; context close is lifecycle-only.",
    "The existing Claude and Codex Model seam remains compatible while richer harness, IPC, and later MCP behavior stays in adapters.",
    "The database-analysis trace exercises the full model without holding a client or transaction across model reasoning and without allowing model-authorized DDL."
  ],
  "questions_unanswered": [
    "The migration DKR must choose final public names and the compatibility bridge.",
    "Provider probes must classify native streaming, steering acknowledgement, continuation, and overlap support for each Claude and Codex transport.",
    "Implementation must choose bounded event backpressure and concrete artifact storage adapters.",
    "Independent validation must replay the source refs and conformance reads before this checkpoint can be accepted."
  ],
  "decision": "candidate_rich_session_record_runtime_work_kernel_no_lite_change_pending_independent_validation",
  "flag_if_missing_or_stale": "Fail closed, open a blocking flag, and do not promote CKR or PKR work when source hashes drift, the checker fails, independent review is missing, or any active wall is stale, contradicted, or not replayed.",
  "reviewer_audit_status": "pending_independent_validator_and_challenger",
  "active_anti_goals": [
    "AG-LIFECYCLE-USE",
    "AG-LIFECYCLE-EFFECT",
    "AG-LIFECYCLE-JOIN",
    "AG-ACTIVE-TURN",
    "AG-TOOLS-READY",
    "AG-TOOL-SNAPSHOT",
    "AG-AUTHORITY",
    "AG-IMPLICIT",
    "AG-HIDDEN-EDGE",
    "AG-SCOPE-SEAM",
    "AG-MCP",
    "AG-INDEPENDENCE",
    "AG-LEVEL",
    "AG-STORAGE"
  ],
  "active_anti_goal_verification": [
    {"anti_goal_id":"AG-LIFECYCLE-USE","metric_id":"dependency_use_after_dependency_close_count","source_of_truth":"Lifecycle conformance tests and ordered teardown traces","read_method":"Replay close, release, cancellation, failure, and shared-lifetime cases","observed_at":"2026-07-14T07:34:39Z","recorded_at":"2026-07-14T07:34:39Z","max_age":"10m","freshness_status":"fresh","value":null,"threshold":0,"comparator":"==","verdict":"pending_independent_validation","evidence_ref":"sha256:3561028fbe87117343da38d1cbde661a4ee5ff7e41c51c5116f0eda8585d2658","replay_command_or_checker":"pkg/core/lite/node_modules/.bin/tsx .okra/runs/session-kernel-20260714/replay/dkr-lifecycle-probe.ts .okra/runs/session-kernel-20260714/artifacts/dkr-lifecycle-contract.md","verification_record_ref":"workers/DKR-SESSION-CONTRACT/progress.jsonl#pending"},
    {"anti_goal_id":"AG-LIFECYCLE-EFFECT","metric_id":"business_effect_in_lifecycle_hook_count","source_of_truth":"Graph traces, lifecycle callback audit, and explicit finishSession tests","read_method":"Count business effects outside named flows","observed_at":"2026-07-14T07:34:39Z","recorded_at":"2026-07-14T07:34:39Z","max_age":"10m","freshness_status":"fresh","value":null,"threshold":0,"comparator":"==","verdict":"pending_independent_validation","evidence_ref":"sha256:549e6b4096698a433f5a843dc4851d2ab9743c7b5e77e7497e0205c7d9aa3b0b","replay_command_or_checker":"python3 .agents/skills/reverse-tornado-okr/scripts/okra-verify-artifact.py .okra/runs/session-kernel-20260714/artifacts/dkr-session-contract.md --contract .agents/skills/reverse-tornado-okr/contracts/executable-dkr-checkpoint.v1.json","verification_record_ref":"workers/DKR-SESSION-CONTRACT/progress.jsonl#pending"},
    {"anti_goal_id":"AG-LIFECYCLE-JOIN","metric_id":"unjoined_close_or_release_count","source_of_truth":"Concurrent close and release tests plus future finishSession tests","read_method":"Assert repeated callers await one settlement and one external teardown","observed_at":"2026-07-14T07:34:39Z","recorded_at":"2026-07-14T07:34:39Z","max_age":"10m","freshness_status":"fresh","value":null,"threshold":0,"comparator":"==","verdict":"pending_independent_validation","evidence_ref":"sha256:3561028fbe87117343da38d1cbde661a4ee5ff7e41c51c5116f0eda8585d2658","replay_command_or_checker":"pkg/core/lite/node_modules/.bin/tsx .okra/runs/session-kernel-20260714/replay/dkr-lifecycle-probe.ts .okra/runs/session-kernel-20260714/artifacts/dkr-lifecycle-contract.md","verification_record_ref":"workers/DKR-SESSION-CONTRACT/progress.jsonl#pending"},
    {"anti_goal_id":"AG-ACTIVE-TURN","metric_id":"active_turn_after_session_close_count","source_of_truth":"Session stream cancellation harness","read_method":"Close during model and database work and count unsettled attempts","observed_at":"2026-07-14T07:34:39Z","recorded_at":"2026-07-14T07:34:39Z","max_age":"10m","freshness_status":"fresh","value":null,"threshold":0,"comparator":"==","verdict":"pending_independent_validation","evidence_ref":"sha256:3561028fbe87117343da38d1cbde661a4ee5ff7e41c51c5116f0eda8585d2658","replay_command_or_checker":"pkg/core/lite/node_modules/.bin/tsx .okra/runs/session-kernel-20260714/replay/dkr-lifecycle-probe.ts .okra/runs/session-kernel-20260714/artifacts/dkr-lifecycle-contract.md","verification_record_ref":"workers/DKR-SESSION-CONTRACT/progress.jsonl#pending"},
    {"anti_goal_id":"AG-TOOLS-READY","metric_id":"advertised_but_unresolved_tool_count","source_of_truth":"Managed tool resolution tests","read_method":"Remove one binding or fail readiness and count model calls","observed_at":"2026-07-14T07:34:39Z","recorded_at":"2026-07-14T07:34:39Z","max_age":"10m","freshness_status":"fresh","value":null,"threshold":0,"comparator":"==","verdict":"pending_independent_validation","evidence_ref":"sha256:5a70ced67346086434c16eb5b56e233d53c2530fc82ad95f29b90207cfe5c625","replay_command_or_checker":"python3 .agents/skills/reverse-tornado-okr/scripts/okra-verify-artifact.py .okra/runs/session-kernel-20260714/artifacts/dkr-session-contract.md --contract .agents/skills/reverse-tornado-okr/contracts/executable-dkr-checkpoint.v1.json","verification_record_ref":"workers/DKR-SESSION-CONTRACT/progress.jsonl#pending"},
    {"anti_goal_id":"AG-TOOL-SNAPSHOT","metric_id":"tool_snapshot_drift_within_turn_count","source_of_truth":"Turn trace","read_method":"Compare advertised and dispatched snapshot identities for every epoch","observed_at":"2026-07-14T07:34:39Z","recorded_at":"2026-07-14T07:34:39Z","max_age":"10m","freshness_status":"fresh","value":null,"threshold":0,"comparator":"==","verdict":"pending_independent_validation","evidence_ref":"sha256:d6990b0f1ff11b6e71a3ad2a8645b7d24cd351c8c1a04b9c6fd5320a6581bc83","replay_command_or_checker":"python3 .agents/skills/reverse-tornado-okr/scripts/okra-verify-artifact.py .okra/runs/session-kernel-20260714/artifacts/dkr-session-contract.md --contract .agents/skills/reverse-tornado-okr/contracts/executable-dkr-checkpoint.v1.json","verification_record_ref":"workers/DKR-SESSION-CONTRACT/progress.jsonl#pending"},
    {"anti_goal_id":"AG-AUTHORITY","metric_id":"undeclared_root_or_permission_grant_count","source_of_truth":"Denied-root, cross-tenant, read-only, and missing-policy tests","read_method":"Replay fail-closed authority cases and audit provider arguments","observed_at":"2026-07-14T07:34:39Z","recorded_at":"2026-07-14T07:34:39Z","max_age":"10m","freshness_status":"fresh","value":null,"threshold":0,"comparator":"==","verdict":"pending_independent_validation","evidence_ref":"sha256:4fabdff43b4868fbbbeabcbb300dcf8814073ca4490328ebc9bd245baa6f5ecc","replay_command_or_checker":"python3 .agents/skills/reverse-tornado-okr/scripts/okra-verify-artifact.py .okra/runs/session-kernel-20260714/artifacts/dkr-session-contract.md --contract .agents/skills/reverse-tornado-okr/contracts/executable-dkr-checkpoint.v1.json","verification_record_ref":"workers/DKR-SESSION-CONTRACT/progress.jsonl#pending"},
    {"anti_goal_id":"AG-IMPLICIT","metric_id":"unrequested_builtin_binding_count","source_of_truth":"Missing-binding scope tests","read_method":"Resolve every public composition with one required binding removed","observed_at":"2026-07-14T07:34:39Z","recorded_at":"2026-07-14T07:34:39Z","max_age":"10m","freshness_status":"fresh","value":null,"threshold":0,"comparator":"==","verdict":"pending_independent_validation","evidence_ref":"sha256:e96b5a1328a9eb673959dfe80ad23c42e568395cf936b90a6b665c5059d3deb2","replay_command_or_checker":"python3 .agents/skills/reverse-tornado-okr/scripts/okra-verify-artifact.py .okra/runs/session-kernel-20260714/artifacts/dkr-session-contract.md --contract .agents/skills/reverse-tornado-okr/contracts/executable-dkr-checkpoint.v1.json","verification_record_ref":"workers/DKR-SESSION-CONTRACT/progress.jsonl#pending"},
    {"anti_goal_id":"AG-HIDDEN-EDGE","metric_id":"hidden_execution_edge_count","source_of_truth":"Graph traces and API-shape audit","read_method":"Require every model, tool, subagent, sandbox, database, storage, memory, scheduler, and apply effect through a named edge","observed_at":"2026-07-14T07:34:39Z","recorded_at":"2026-07-14T07:34:39Z","max_age":"10m","freshness_status":"fresh","value":null,"threshold":0,"comparator":"==","verdict":"pending_independent_validation","evidence_ref":"sha256:e96b5a1328a9eb673959dfe80ad23c42e568395cf936b90a6b665c5059d3deb2","replay_command_or_checker":"python3 .agents/skills/reverse-tornado-okr/scripts/okra-verify-artifact.py .okra/runs/session-kernel-20260714/artifacts/dkr-session-contract.md --contract .agents/skills/reverse-tornado-okr/contracts/executable-dkr-checkpoint.v1.json","verification_record_ref":"workers/DKR-SESSION-CONTRACT/progress.jsonl#pending"},
    {"anti_goal_id":"AG-SCOPE-SEAM","metric_id":"scope_seam_escape_count","source_of_truth":"Test import and setup audit","read_method":"Reject internal reaches, module mocks, and global patches outside adapter tests","observed_at":"2026-07-14T07:34:39Z","recorded_at":"2026-07-14T07:34:39Z","max_age":"10m","freshness_status":"fresh","value":null,"threshold":0,"comparator":"==","verdict":"pending_independent_validation","evidence_ref":"sha256:e96b5a1328a9eb673959dfe80ad23c42e568395cf936b90a6b665c5059d3deb2","replay_command_or_checker":"python3 .agents/skills/reverse-tornado-okr/scripts/okra-verify-artifact.py .okra/runs/session-kernel-20260714/artifacts/dkr-session-contract.md --contract .agents/skills/reverse-tornado-okr/contracts/executable-dkr-checkpoint.v1.json","verification_record_ref":"workers/DKR-SESSION-CONTRACT/progress.jsonl#pending"},
    {"anti_goal_id":"AG-MCP","metric_id":"premature_mcp_or_automatic_collection_surface_count","source_of_truth":"Changed-path, dependency, and public export audit","read_method":"Count MCP, native tool, and automatic collection additions","observed_at":"2026-07-14T07:34:39Z","recorded_at":"2026-07-14T07:34:39Z","max_age":"10m","freshness_status":"fresh","value":null,"threshold":0,"comparator":"==","verdict":"pending_independent_validation","evidence_ref":"sha256:4fabdff43b4868fbbbeabcbb300dcf8814073ca4490328ebc9bd245baa6f5ecc","replay_command_or_checker":"python3 .agents/skills/reverse-tornado-okr/scripts/okra-verify-artifact.py .okra/runs/session-kernel-20260714/artifacts/dkr-session-contract.md --contract .agents/skills/reverse-tornado-okr/contracts/executable-dkr-checkpoint.v1.json","verification_record_ref":"workers/DKR-SESSION-CONTRACT/progress.jsonl#pending"},
    {"anti_goal_id":"AG-INDEPENDENCE","metric_id":"single_llm_truth_acceptance_count","source_of_truth":"Independent validator and challenger records","read_method":"Require separate replay and review before acceptance","observed_at":"2026-07-14T07:34:39Z","recorded_at":"2026-07-14T07:34:39Z","max_age":"10m","freshness_status":"fresh","value":null,"threshold":0,"comparator":"==","verdict":"pending_independent_validation","evidence_ref":"sha256:746bab24796bed07b27c6fc9a6ee4d855034d3fc8c882fc59c70eeeb8e367294","replay_command_or_checker":"python3 .agents/skills/reverse-tornado-okr/scripts/okra-verify-artifact.py .okra/runs/session-kernel-20260714/artifacts/dkr-session-contract.md --contract .agents/skills/reverse-tornado-okr/contracts/executable-dkr-checkpoint.v1.json","verification_record_ref":"workers/DKR-SESSION-CONTRACT/progress.jsonl#pending"},
    {"anti_goal_id":"AG-LEVEL","metric_id":"abstraction_level_jump_count","source_of_truth":"Run tree and accepted checkpoint references","read_method":"Count promoted CKR or PKR work before DKR acceptance","observed_at":"2026-07-14T07:34:39Z","recorded_at":"2026-07-14T07:34:39Z","max_age":"10m","freshness_status":"fresh","value":null,"threshold":0,"comparator":"==","verdict":"pending_orchestrator_validation","evidence_ref":"sha256:746bab24796bed07b27c6fc9a6ee4d855034d3fc8c882fc59c70eeeb8e367294","replay_command_or_checker":"python3 .agents/skills/reverse-tornado-okr/scripts/okra-verify-artifact.py .okra/runs/session-kernel-20260714/artifacts/dkr-session-contract.md --contract .agents/skills/reverse-tornado-okr/contracts/executable-dkr-checkpoint.v1.json","verification_record_ref":"workers/DKR-SESSION-CONTRACT/progress.jsonl#pending"},
    {"anti_goal_id":"AG-STORAGE","metric_id":"ungoverned_write_or_read_count","source_of_truth":"Content hashes, append-only records, and store verification","read_method":"Verify assigned artifacts have target paths and hashes and the orchestrator records them","observed_at":"2026-07-14T07:34:39Z","recorded_at":"2026-07-14T07:34:39Z","max_age":"10m","freshness_status":"fresh","value":null,"threshold":0,"comparator":"==","verdict":"pending_orchestrator_store_record","evidence_ref":"sha256:4fabdff43b4868fbbbeabcbb300dcf8814073ca4490328ebc9bd245baa6f5ecc","replay_command_or_checker":".agents/skills/reverse-tornado-okr/scripts/okra-store.sh verify .okra/runs/session-kernel-20260714","verification_record_ref":"workers/DKR-SESSION-CONTRACT/progress.jsonl#pending"}
  ],
  "wall_gate": {
    "verdict": "blocked",
    "downstream_advance": "blocked",
    "decided_at": "2026-07-14T07:34:39Z",
    "reasons": [
      "This writer cannot validate or accept its own architecture checkpoint.",
      "The public checker proves field completeness only, not semantic conformance.",
      "Every active anti-goal still needs independent replay against this candidate and later implementation evidence."
    ]
  },
  "risk_or_anti_goal_implications": [
    "The rich session boundary removes business persistence from lifecycle hooks and keeps dependency use explicit.",
    "Admission-first work and frozen tool snapshots provide testable fail-closed points before model and backend effects.",
    "Root-owned physical resources and finish-before-close prevent one session from accidentally closing shared backends.",
    "MCP and automatic collection remain outside the first PR."
  ],
  "candidate_ckrs": [
    {"id":"CKR-SESSION","metric_id":"session_kernel_conformance_pass_rate","target":1,"status":"candidate"},
    {"id":"CKR-DATABASE","metric_id":"database_analysis_end_to_end_pass_rate","target":1,"status":"candidate"},
    {"id":"CKR-LIFECYCLE","metric_id":"lifecycle_conformance_pass_rate","target":1,"status":"candidate_reframed"}
  ],
  "candidate_pkrs": [
    {"id":"PKR-SESSION-CORE","contribution":"Implement SessionRecord, SessionRuntime, authority rebind, explicit load/commit/finish flows, and scope-seam conformance tests.","status":"candidate"},
    {"id":"PKR-WORK","contribution":"Implement WorkRecord, WorkAttempt, Invocation, ControlEvent, parallel, waiting, scheduling intent, and steering fencing.","status":"candidate"},
    {"id":"PKR-TOOLS","contribution":"Implement role resources, readiness-only tool resources, immutable snapshots, and current-attempt invocation flows.","status":"candidate"},
    {"id":"PKR-DATABASE","contribution":"Implement the bounded database-analysis acceptance case with branch fork, join, merge, files, memory candidate acceptance, and applied=false output.","status":"candidate"},
    {"id":"PKR-PROVIDER-BRIDGE","contribution":"Preserve the simple Model seam and adapt Claude and Codex into the session event and cancellation contract without MCP.","status":"candidate"}
  ]
}
```

CKRs are measurable contribution context, not worker work.

DKRs are discovery-worker scopes; PKRs are progression-worker execution units; there is no CKR worker.

Candidate CKRs and candidate PKRs are not promoted until the orchestrator accepts the supporting DKR learning checkpoint.
