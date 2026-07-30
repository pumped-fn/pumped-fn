# Independent Architecture Review — Pi-shaped Semantic Session Resource

## Context

The managed-tools / managed-agent-sessions work wants a durable "semantic session"
(the database-analysis case: retained evidence, schema-version pin, authority
fingerprint, branch tree, provider continuation) plus correct teardown ordering —
active query cancelled *before* the database-access resource closes. The open
decision is **where dependency-live cleanup ordering belongs**: SDK-only via existing
`ctx.onClose`, a new Lite global topological cleanup order, a new Lite resource-local
lifecycle phase, or something smaller. This document is a review verdict, not an
implementation plan; the actionable output is the successor goal/anti-goal changes and
the conformance gate.

---

## 1. Verdict: **GO WITH CONDITIONS**

- The semantic session resource is justified **only** when it owns retained cross-turn
  state with invariants (the DB proof case does). A pure messages+tools wrapper does
  not justify a resource.
- For the **close** path, Lite needs **no** change and **no** new lifecycle phase.
  `ctx.onClose` inside a resource factory already provides a dependency-live teardown
  phase that strictly precedes all resource-owned cleanup in the same context.
- **Reject** global topological cleanup (Option 2) — it conflicts with the real
  ordering authority (context nesting + ownership).
- **One real gap** blocks an unconditional GO: `ctx.release(resource)` does **not** run
  `onClose`. The prompt requires "explicit session release" coverage, and that trigger
  bypasses the only safe place for dependency-live teardown. This must be closed by SDK
  contract now, with a resource-local `onFinalize` (Option 3) held as an evidence-gated
  Lite proposal — not bundled into the session work.

---

## 2. Verified source semantics (file:line evidence)

All five "facts to verify" **confirmed**:

1. **Resource entry inserted before its deps resolve.**
   `scope.ts:1523` `createResourceEntry(resource)` runs before `scope.ts:1528`
   `resolveResourceValue(...)`, which resolves deps (each creating its own entry
   afterward). → In a shared owner Map, insertion order is **dependent-before-dependency**.

2. **Context close runs `onClose` before resource-local cleanups.**
   `runCloseCleanups` `scope.ts:2410-2437`: phase 1 (`2412`) runs `this.cleanups`
   (onClose) in reverse; phase 2 (`2417-2434`) runs resource cleanups. Test
   `scope.test.ts:1370-1393` asserts `["rollback","release"]`.

3. **Resource-local cleanups run reverse Map-insertion order.**
   `scope.ts:2418` `for (i = resources.length-1; i>=0; i--)`. Combined with (1), within
   one owner context this cleans a **dependency before its dependent**. Matches the
   design doc's documented probe `tool-sandbox-lifecycle.md:254-259`
   (`cleanup: workspace → tool → agent`).

4. **Manual `ctx.release(resource)` cleans only that entry, immediately.**
   `scope.ts:2072-2082`: deletes only that key, runs only `entry.cleanups`, emits idle.
   No dependency/dependent traversal. **Crucially, it never runs `onClose`.**

5. **`onClose` is context-scoped and covers success/failure/abort.**
   `CloseResult = {ok:true}|{ok:false,error,aborted?}` (`types.ts:227`). Stream-break →
   `{ok:false,aborted:true}` (`exec-stream.test.ts:36,77-79`). `close()` is idempotent
   (`scope.ts:2401`). A resource factory's `ctx.onClose` binds to the **owner** context
   (`scope.ts:2045` `onClose: owner.onClose.bind(owner)`), so a boundary-owned session
   resource's onClose fires at the **session** context close, correctly persisting across
   per-turn child exec contexts.

### The asymmetry the design docs missed

Neither hook is correct for **both** triggers when a resource A (dependent) and its dep
B share an owner context:

| A's teardown registered in | on `ctx.close()` (same-ctx siblings) | on `ctx.release(A)` |
|---|---|---|
| `ctx.cleanup` (entry) | phase 2, reverse-insert → **B dead** ✗ | only A cleaned, B untouched → **B live** ✓ |
| `ctx.onClose` (context) | phase 1, all resources live → **B live** ✓ | **onClose not run at all** ✗ |

The docs (`OVERALL-DESIGN.md:224`, `tool-sandbox-lifecycle.md:261-263`) reason only about
the close path and correctly pick `onClose`. They never analyze `ctx.release`. That is
the gap.

---

## 3. Decision table

| Option | What it does | Cost | Correct? | When to pick |
|---|---|---|---|---|
| **1. SDK + existing onClose** | dependency-live work in `onClose`; `cleanup` = own state only; forbid `ctx.release` of dep-owning resources | zero Lite change; honors `lite_package_change_count==0` | ✓ close path; ✗ manual release unless release is banned by contract | **Now.** Covers DB proof case. |
| 2. Global topo cleanup (dependent-before-dependency) | Lite reorders phase-2 by dep graph | large; must track edges, recompute per preset | ✗ conflicts with cross-boundary ownership, shared deps, manual release; undefined on partial failure | Never — wrong invariant. |
| 3. Resource-local `onFinalize`/`beforeRelease` | runs before the resource's own `cleanup`, deps-live, on **both** close and release | small, opt-in, no runtime topo | ✓ fixes the release/close asymmetry (its real justification) | Later, **only** if conformance test #3/#7 proves the gap bites. |
| 4. Smaller (chosen) | Option 1 now + Option 3 gated behind conformance | minimal | ✓ | **Recommended.** |

### Why Option 2 is the wrong invariant (Q4)

- **Shared deps**: B used by A and C in different contexts closing at different times; a
  single global order can't serialize them. Context nesting already puts B in a common
  ancestor cleaned last.
- **Cross-boundary ownership**: boundary deps hoist to parent (`scope.ts:1916-1920`);
  parent closes after child. Global topo ignores who owns what.
- **Presets/substitutes**: a value preset has no deps; a resource preset changes edges
  (`types.ts:466-472`). Edges aren't statically known → topo must be recomputed per scope.
- **Failed resolution**: partial graph → topo undefined; phase-split degrades gracefully.
- **Manual release**: today single-entry/immediate; a topo invariant forces it to cascade
  (surprising, kills shared deps) or contradict close order.
- **Error aggregation** already exists (`AggregateError` on ok:true `scope.ts:2435-2436`).

Context nesting + ownership is the ordering authority. Topo fights it. (Q5: a
resource-local pre-release hook is both smaller and safer, and fixes the gap topo does not.)

---

## 4. Recommended lifecycle contract (existing primitives)

```
physical pool         atom OR scope/root boundary resource      (lives = scope)
durable session       boundary resource, owner = named session ctx
                        holds: evidence, schemaVersion, authorityFP, branches, providerCont
   onClose(result)      cancel in-flight query + seal/persist evidence   [deps LIVE]
   cleanup()            drop own buffers/handles                         [own state only]
session-bound access  boundary resource, dep of session, owner = session ctx
   cleanup()            close read handle / return borrowed client
individual query      current-owned resource in TURN ctx (or a flow)
   onClose(aborted)     cancel query                                     [access LIVE]
model turn            flow exec = child ctx (ephemeral, per turn)
   onClose(result)      commit/rollback turn-local state
```

Sequence at session end:

```
per-turn:   turn child ctx closes each turn (query cancelled, access still live)
session:    session ctx.close(result)
  phase 1   onClose (dependent-first): session.cancelQuery + seal   [access + pool LIVE]
  phase 2   cleanup (reverse insert):  access.closeHandle -> session.dropBuffers
  later:    parent/scope close:        pool.drain
```

Query cancellation-before-access-close holds because the query lives in the turn child
(closes first) and session.onClose (phase 1) runs while access is still resolved.

### Q2/Q3 scenario coverage of existing `onClose`

| Scenario | Covered by onClose? | Note |
|---|---|---|
| Successful completion | ✓ | turn child `{ok:true}`; durable session onClose fires only at session ctx close (correct for persistence) |
| Failed turn | ✓ | `{ok:false}`; per-turn cancellation belongs in the turn ctx, not the session resource |
| Stream consumer break | ✓ | `{ok:false,aborted:true}` `exec-stream.test.ts:77` |
| **Explicit session release** | **✗** | `ctx.release` never runs onClose → dependency-live teardown skipped |
| Partial resolution failure | ✓ (partial) | failed resource runs its own `entry.cleanups` `scope.ts:1549`; resolved deps stay live (no rollback of B on A's failure) |
| Repeated close | ✓ | idempotent `scope.ts:2401` |

**Missing guarantee (Q3):** a trigger that runs a resource's dependency-live teardown
**with declared deps guaranteed live on manual release too**. Close this by SDK
contract (Option 1): explicit session teardown = close the owning context, never
`ctx.release(session)`. Promote to Lite `onFinalize` only on conformance evidence.

---

## 5. Required conformance tests (before any Lite change, and to lock the SDK contract)

1. **onClose-before-cleanup, 3-deep** (`session→access→pool`): assert onClose order =
   dependent-first, cleanup order = dependency-first (extends `scope.test.ts:1370`).
2. **Dependency-live proof**: in `session.onClose`, assert `accessController.state ===
   "resolved"` and `access.cleanup` has not yet run.
3. **Release-asymmetry probe (the gap)**: resolve session (dep access), then
   `ctx.release(session)`; assert whether onClose ran and whether access stayed live.
   This test is the acceptance gate for `onFinalize`.
4. **Abort/stream-break**: consumer breaks turn stream → query.onClose fires
   `{aborted:true}` before access closes; `post_close_live_resource_count == 0`
   (mirror `exec-stream.test.ts:36`).
5. **Partial resolution failure**: session factory throws after access resolves → access
   stays resolved, session's own cleanups ran, `post_close_live_resource_count == 0`.
6. **Idempotency**: double close, release-then-close — no double external effect.
7. **Shared dependency**: two sessions share one access; releasing one must NOT clean the
   shared access; only final owner close does.
8. **Preset seam**: `preset(access, fakeAccess)` → session resolves and onClose ordering
   identical; proves testability via the scope seam only (Testing Rule).

---

## 6. Findings that should alter the successor goal & anti-goals

- **Scope conflict — the durable session exceeds both current contracts.**
  DKR-2 `shared-session-contract.md:9,29,41` explicitly says *share behavior, not a
  session object*, and puts multi-turn continuity / provider continuation **out of
  scope**; `tool-sandbox-lifecycle.md:142,154` says persistence is **not a default** and
  warns against boundary-owning to get *accidental* persistence. The DB proof case
  (evidence / schemaVersion / authorityFP / branches / providerCont retained across
  turns) is therefore a **new DKR**, not an extension of the managed-tools milestone.
  Successor must either descope to provider-local boundary resources + behavioral
  contract (current direction) **or** open a named durable-session DKR with an explicit
  owner/close story.
- **New anti-goal**: "No dependency-live teardown in resource-local `cleanup`; no reliance
  on `ctx.release` for resources whose `onClose` carries dependency-live work." Make the
  release/close asymmetry an explicit conformance gate (test #3).
- **Branch is behind the design** (`pkg/sdk/core/src/index.ts@managed-tools`):
  `currentTool`/`currentAgent` (`:1335`,`:1387`) are current-owned resources with **zero**
  cleanup/onClose wiring; `events` (`:1137`) is a boundary-owned shared buffer sliced per
  turn, no consumer-break handling. It does **not** yet satisfy DKR-2 item 5
  (`:39`: zero-live-resource, abort-before-close). Successor must implement and *prove*
  `post_close_live_resource_count == 0`, not assume it.
- **Keep the Lite hard wall for the close path** (`lite_package_change_count == 0`). Reopen
  Lite (onFinalize) only if tests #3/#7 prove the release-path gap bites a real consumer.

### Q6 — non-agent use cases that justify a Lite primitive (≥2)
Enough exist; all instantiate the same *symmetric dependency-live teardown* invariant:
DB transaction with savepoints (rollback active statement before connection close);
buffered file writer over an open handle (flush before handle close); message-bus
subscriber (unsubscribe before connection close); lease/lock over a client (release
before client disconnect). This clears the "don't change Lite merely for convenience"
anti-goal — but only via test #3, not by assertion.

### Q8 — conflicts: managed-tools branch vs proposed session kernel
1. Branch `session()` is an **atom** (material/json, `:1166`), not a resource — a
   different "session" notion than the proposed lifecycle resource. Reconcile naming/owner.
2. Branch `events` is a global boundary buffer sliced per turn (`:1137`,`:1882`); a durable
   per-session evidence/branch store needs its **own** owned buffer, not the shared one.
3. Branch has **no** onClose/release/cancellation; the kernel's cancel-before-close
   ordering is unimplemented and undemonstrated.
4. `send`/`execTurn` (`:1445`,`:1431`) drive the **classic** `agent.turn` object flow, not
   the managed `turn()` (`:1419`); two execution paths coexist, so the durable-session
   ordering guarantees would not apply to the `send` path until unified.
5. DKR-2 bars a shared `ManagedSession` object this milestone; the semantic session
   resource conflicts with that boundary unless it is provider-local and explicitly owner-named.

---

## 7. Confidence & unresolved questions

**Confidence**: 0.9 on the verified core semantics (read directly, cross-checked against
the design doc's own probe and the branch). 0.85 that Option 1 + gated Option 3 is the
right call. 0.8 that the release-path gap is currently *latent* (the branch never calls
`ctx.release`), which is exactly why test #3 must run before deciding on `onFinalize`.

**Unresolved (evidence, not assumption):**
- Does any real consumer trigger dependency-live teardown via `ctx.release` rather than
  context close? (test #3 decides Option 3.)
- Does the durable semantic session get its own DKR, or does the milestone stay descoped
  to provider-local boundary resources? (DKR-2 currently says the latter.)
- Codex ACP: must cleanup await process exit vs only `kill()` (`shared-session-contract.md:86`),
  and which transport counters prove zero live resources (`:87`) — both bear on test #4/#5.
- Provider-event escape hatch and event-contract normalization remain open
  (`OVERALL-DESIGN.md:302-313`); affects where retained evidence is recorded.
