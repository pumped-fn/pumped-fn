# Cold-Build Eval Suite — CANDIDATE v2 (DKR-3b)

run: pumped-fn-skill-20260710 / worker dkr-3b
status: CANDIDATE — pending re-challenge by gpt-5.6-sol (AG-3) and human ratification. Nothing here is final.
upstream:
- v1 suite (salvage source): `.okra/runs/pumped-fn-skill-20260710/workers/dkr-3/eval-suite-candidate.md` sha256 `883a55983abfae88971c5fd76bc4168692bf9ff6f30678088fc00358c0d9992e`
- challenger verdicts (requirements list): `.okra/runs/pumped-fn-skill-20260710/workers/chal-1/verdicts.md` sha256 `4ed619df1130bee793514496adbdd96eabad9591b8d32fc64e7a83ab992e5218` — 0 intact, 1 drifted, 11 dead
- idiom register (accepted): `.okra/runs/pumped-fn-skill-20260710/workers/dkr-1/idiom-register.md` sha256 `32b6c2f0ceb7455f404b92bbcf69be4fd2215bba57ae7cf152224f2a21dd6b3f`
- lint-gate note: `.okra/runs/pumped-fn-skill-20260710/workers/dkr-4/lint-gate-note.md` (ambient-name allowance, `atom(fn)` shorthand escape, `--max-warnings 0` requirement)

Salvaged from v1 unchanged: task domains (except T-10, killed), tier ladder (A/B/C/D), rubric dimensions R1–R8 and weights, gates G1–G5 skeleton, score-formula skeleton, AG-3 grading protocol roles (terra writes / script gates / sol grades / claude replays), scope exclusion of React and Hono, per-task cold-prompt conventions and preamble (v1 sec.1 conventions block applies verbatim to every B/C/D task below).

## 0. What changed vs v1 (verdict → change map)

| Verdict | Structural failure | v2 change |
|---|---|---|
| H-RUBRIC dead | "R1+R2 gating" was prose, not an executable gate; shallow-semantic vector scored 92.70% | New per-task gate **G6: differentiator pass-gate** (sec.2). Every task's answer key names 2–4 differentiators; any absent ⇒ task = 0. Recompute in sec.6 shows the same vector now scores 15.0%. |
| H-T1 dead | 7/8 survey rows example-borne | T-1 rebuilt: resource-ownership survey (current-vs-boundary, result-dependent release, resource watch) |
| H-T2 dead (92.8% transplant) | queue+signal shell is the example's | T-2 amended: boundary-resource printer session paired with queue+signal; G6 gates session lifecycle + post-commit signal |
| H-T3 dead | scheduler/test/root shell > half weight | T-3: opposite overlap/catchUp policies proven by manual ticks become G6 differentiators |
| H-T4 dead (85% exactly) | surrounding shell transplantable | T-4: G6 gates hand-rolled wrapExec extension, ring eviction, nested failure outcomes |
| H-T5 dead (86.7%) | mechanism replay of importBatch | T-5 amended: pull-driven export; abandonment must prevent the NEXT side-effect; close result G6-gated |
| H-T6 dead | rubric paid >half before eq/diff correct | T-6 amended: requires `select(atom, selector, { eq })` + `ctrl.set`, controller-derived atom explicitly wrong |
| H-T7/T8/T9 dead | novel construct missable while scoring >50% | resource / tags.all+optional / prepare become G6 differentiators (miss ⇒ 0) |
| H-T10 dead + self-contradiction | required-`at` vs missing-`at`-default; shell transplant | T-10 KILLED. Replaced by T-10v2 (resource-watch re-establishment — an unexamined register surface) |
| H-COVERAGE drifted | select/eq, resource-watch, GC/flush, adoption, parent-chain neither examined nor ratified out | sec.4: select/eq and resource-watch now examined (mapping shown); GC/flush, incremental adoption, parent-chain tag reads proposed OUT of exam scope — explicit ratification line item |
| G3 name-counting permits shallow green tests | — | G3 upgraded: manifests name REQUIRED ASSERTION SEMANTICS, grader verifies each with quotes (sec.5) |
| dkr-4 lint escapes | ambient-name allowance, `atom(fn)` shorthand | deterministic lint-escape side-check added to G1 (sec.5) |

---

## 1. Gate G6 — differentiator pass-gate (the structural fix)

Each task's hidden answer key names **2–4 DIFFERENTIATOR REQUIREMENTS**: the specific behaviors/constructs that separate skill-taught competence from an invoice-triage transplant. Semantics:

1. **Every differentiator must be verifiably present.** The grader (gpt-5.6-sol) must produce, per differentiator, at least one verbatim quote with `file:line` from the solution snapshot showing the named mechanism.
2. **The orchestrator spot-replays every quote mechanically** (script: quote exists verbatim at that location). Fabricated/mislocated quote ⇒ re-grade once with the discrepancy named; second fabrication ⇒ differentiator marked absent and incident logged (AG-3, AG-5).
3. **A differentiator implemented by a different mechanism = absent.** The differentiator names the mechanism (e.g. "`resource()` with `ownership: "boundary"`"); an "equivalent" achieved another way (tx-as-atom, repeated direct exec instead of `prepare()`) scores absent. No grader judgment call, no partial credit.
4. **Any absent differentiator ⇒ task score = 0** (G6 is a gate multiplier like G1–G5, recorded in `gates+grading` output as `g6: { pass, differentiators: [{ id, present, quote|absent-reason }] }`).
5. G6 is evaluated from the grader's quoted evidence, after deterministic gates G1–G5; a G1–G5 failure already zeroes the task but G6 evidence is still collected for learning signal.

This makes the register's "R1+R2 are gating" claim executable: the differentiators ARE the task-specific R1/R2/R4/R5 requirements, and they gate before any additive scoring.

---

## 2. Task set v2

Conventions, preamble, and "prompts never name idioms" rule: salvaged verbatim from v1 sec.1. Each task below states: prompt (full where amended; "v1 verbatim" where salvaged), differentiators (hidden answer key), applicable dims, and a rescore line (one per task) addressing the v1 challenger's transplant sketch.

### T-1 — Community greenhouse: resource ownership survey (Tier A) — REBUILT

Domain: hydroponic greenhouse automation (salvaged). The v1 eight-row construct survey is replaced (verdicts H-T1 proposed_next): seven of eight rows were example-borne. The survey is now four scenarios that all hinge on `resource()` judgment — the construct invoice-triage never uses.

**Prompt (verbatim, cold session receives this + the skill only):**

> You are designing (not implementing) parts of a controller for a community greenhouse using `@pumped-fn/lite`. Four scenarios:
> 1. A misting run must acquire a water-line lease before starting and release it whether the run succeeds or fails; if the run failed, the release must mark the line "needs inspection". Several sub-steps of one misting run must share the same lease; two concurrent misting runs must never share one.
> 2. A serial connection to the sensor bus is opened once per process and closed on shutdown — but when the site's port configuration is changed at runtime by an operator, the connection must be torn down and re-established against the new port without restarting the process.
> 3. A pump-calibration session object is created fresh for each calibration operation, is used by every sub-step of that operation's call tree, must not be constructible or reachable outside an operation, and finalizes differently depending on whether the calibration succeeded.
> 4. The target humidity band is per-site configuration read by many features.
>
> For each scenario: name the pumped-fn construct and (where applicable) its ownership/lifecycle configuration; one sentence on why, and one sentence on why the nearest alternative is wrong; what its dependencies are and how release/teardown is triggered. Then state where in the codebase `createScope` may be called, and why. Deliverable: a single markdown file `DESIGN.md`. No implementation code.

**Differentiators (hidden; G6 quotes from DESIGN.md):**
- T1-D1: scenario 1 answered with `resource()`, ownership `boundary`, and release behavior bound to the close/execution result (needs-inspection on failure) — not cleanup-atom, not lease-inside-flow.
- T1-D2: scenario 2 answered with a scope-owned (`current`-ownership) resource whose deps include a watched controller on the port-config atom, so a config change re-establishes it — not "restart the process" and not manual event wiring.
- T1-D3: scenario 3 answer states both properties: shared by the execution's call tree via deps, AND distinct/unreachable across concurrent executions.
- T1-D4: scenario 4 answered with tag (or config atom) and explicitly rejects `resource()` for plain config.

Dims: R1, R2. Gates: G5 (format), G6.

`transplant_rescore`: the v1 challenger's T-1 sketch mapped serial connection→cleanup atom and had "only the water-line resource absent" (verdicts H-T1 kill_attempt). Against v2 it misses T1-D1 (no boundary resource), T1-D2 (no watched-dep re-establishment — cleanup atom cannot re-establish), and T1-D3; G6 fails ⇒ task = 0 (was 73.7%).

---

### T-2 — Library hold-shelf pipeline (Tier C) — AMENDED

Domain: public-library reservation holds (salvaged). Amendment per verdicts H-T2 proposed_next: the slip printer becomes a session-scoped boundary resource paired with the queue+signal machinery; the example's shell no longer earns the task.

**Prompt (v1 verbatim, plus this replacement/addition to the dispatcher and deliverables bullets):**

> - The slip printer is session-based: printing requires an open printer session. A session must be opened fresh for each drain pass, be used by every print in that pass, and be closed when the pass ends — and the close must record whether the pass completed or failed (a failed pass releases the session as "dirty" so the next pass knows to reset the print head). A slip must never be printed on a session left over from a previous pass, and two overlapping drain passes (if your design ever allows them) must never share a session.
> - Tests must additionally prove: the session open/close pairing per pass, the dirty-close on a failing pass, and printed-exactly-once when returns race the dispatcher.

**Differentiators:**
- T2-D1: the printer session is a `resource()` with `ownership: "boundary"`, acquired per drain execution through deps, with `onClose` behavior bound to the close result (clean vs dirty).
- T2-D2: the queue signal is updated strictly after the hold-insert transaction commits, proven by a test where a failing transaction produces no printed slip (signal-after-commit as a tested invariant, not just code order).
- T2-D3: the dispatcher drains from state (queries pending holds), not from stream payloads; test asserts printed-exactly-once for an N-burst including under a duplicate-`copyId` race.

Dims: R1, R2, R3, R4, R5, R6.

`transplant_rescore`: the v1 challenger's rename-transplant (enqueue→recordReturn etc., retaining queueSignal/state-drain/stop choreography, 92.8%) has no printer-session resource — invoice-triage's notifier is a directly-invoked port. It misses T2-D1 outright and supplies no dirty-close evidence for T2-D2's failing-tx proof; G6 fails ⇒ 0.

---

### T-3 — Observatory imaging windows (Tier C) — REWEIGHTED VIA G6

Domain: robotic telescope scheduling. **Prompt: v1 verbatim** (it already demands the right proofs; the failure was rubric weight, not the prompt — verdicts H-T3 proposed_next is a reweight).

**Differentiators:**
- T3-D1: the capture job is declared with no-overlap AND no-catch-up policies (the OPPOSITE pair from the skill's worked example), and a manual-backend test drives a slow capture across 2+ slots proving exactly one run and no makeup run afterwards.
- T3-D2: the upload job is declared with catch-up enabled, and a manual-backend test advances hours and proves the missed uploads run, in order.
- T3-D3: frame timestamps come from a swappable clock tag; tests fix it (no `Date.now` in tests or factories).

Dims: R1, R2, R3, R4, R6, R7.

`transplant_rescore`: the v1 challenger copied both example job declarations + ManualBackend shell for 61.0% while "awarding zero for R1 policy correctness". Zero policy correctness = T3-D1 and T3-D2 absent (the example's single policy shape cannot supply the opposite pair or the ordered catch-up proof); G6 fails ⇒ 0.

---

### T-4 — Scooter-fleet telemetry daemon (Tier D) — HARD-GATED

Domain: shared e-scooter fleet. **Prompt: v1 verbatim, plus these additions to the auditTrail and deliverables bullets** (verdicts H-T4 proposed_next: hard-gate wrapResolve/wrapExec ordering, nested failure outcomes, ring eviction):

> - The auditTrail extension must also record entries for atom resolutions (name + durationMs), and entries must appear in completion order; a failing fleet-ops call inside a succeeding-then-failing sweep must produce BOTH a failed entry for the named client call and a failed entry for the sweep operation itself.
> - Tests must additionally prove: the ring buffer holds exactly the last 100 entries after more than 100 executions (drive 105, assert the first 5 evicted); the nested-failure case above; and that resolution entries and execution entries both appear.

**Differentiators:**
- T4-D1: `auditTrail` is a hand-written extension implementing `wrapExec` (and `wrapResolve` for resolution entries) with the outcome taken from the wrapped result/close — not console logging, not wrapper functions around flows.
- T4-D2: ring eviction proven: test drives >100 executions and asserts length 100 and eviction of the oldest.
- T4-D3: nested failure outcomes: the named fleet-ops call failure and the parent sweep failure are recorded as two distinct entries with `ok: false`, proven by test.
- T4-D4: boundary parse of the two wire shapes yields a structured error naming the offending field; internal handoff is typed, not re-validated.

Dims: R1–R8 (all).

`transplant_rescore`: the v1 challenger's 85.0% adaptation reused the example's prebuilt-extension consumption and inline wrapExec test snippet. It has no hand-rolled wrapResolve+wrapExec extension recording resolutions (T4-D1), no eviction proof (T4-D2), and no dual nested-failure entries (T4-D3); G6 fails ⇒ 0.

---

### T-5 — Recipe-archive export with live progress (Tier C) — AMENDED

Domain: home-cooking recipe archive (salvaged). Amendment per verdicts H-T5 proposed_next: the collection operation becomes a pull-driven export where abandonment must prevent the next side-effect, and the abandoned close result is gated.

**Prompt (amended; replaces v1's importCollection and abandonment bullets):**

> Build a migration tool for a legacy recipe archive. Requirements:
> - `exportRecipe`: given `{ slug }`, fetches the legacy record via a scaffolded `LegacyArchive` client, converts units, writes it to a scaffolded `ShareTarget`, and while running reports progress as typed events `{ stage: "fetched" } | { stage: "converted" } | { stage: "shared", id: string }` — a caller must be able to either just await the final shared id, or consume the progress events as they happen, from the same operation (no duplicate implementations, no callback parameters).
> - `exportCollection`: given `{ slugs: string[] }`, exports recipes strictly on consumer demand: the fetch for recipe k+1 must not begin until the consumer has consumed recipe k's final event. Every child progress event is forwarded upward prefixed with the slug. A failed recipe must not abort the collection; the result is `{ exported: number, failedSlugs: string[] }`.
> - If a consumer abandons the progress stream after recipe k, the run must stop: recipe k+1's fetch must never be issued, and the run's recorded outcome must state it was aborted, observably from outside the flow (the entrypoint or an installed observer can see it).
> - `bin/export.ts <slug...>` runs a collection export printing progress lines.
> Deliverables: `src/`, `bin/export.ts`, tests proving: awaiting-only and streaming consumption of `exportRecipe` both work and yield identical stored results; `exportCollection` forwards prefixed child events in order and survives one failing slug; abandonment after recipe k leaves the LegacyArchive fetch count at exactly k and the recorded outcome aborted. Deterministic tests.

**Differentiators:**
- T5-D1: abandonment prevents the next side-effect: test abandons after recipe k and asserts the legacy-client fetch counter is exactly k (pull-driven generator — work happens on pull, not eagerly).
- T5-D2: the abandoned run's close result is observed from outside (onClose/extension recording an aborted/not-ok outcome) and asserted in a test.
- T5-D3: per-child failure isolation: one failing slug lands in `failedSlugs` while the collection continues — not the example's abort-the-batch behavior.
- T5-D4: child progress events are transformed (slug-prefixed) while forwarding — a mapped re-yield loop over the child stream, not a bare `yield*`.

Dims: R1, R2, R3, R4, R5, R6.

`transplant_rescore`: the v1 challenger's rename of `importBatch` (retaining `yield*`, stream.result, abandonment close recorder; 86.7%) fails T5-D4 (bare `yield*` cannot prefix), T5-D3 (the example aborts on child failure), and supplies no fetch-counter-at-k proof for T5-D1; G6 fails ⇒ 0.

---

### T-6 — Gallery climate watch (Tier C) — AMENDED

Domain: museum conservation monitoring (salvaged). Amendment per verdicts H-T6 proposed_next: the derived value must be a `select(atom, selector, { eq })` slice, and state writes go through `ctrl.set` — the example's controller-derived-atom shape is explicitly the wrong mechanism here.

**Prompt (v1 verbatim, with the derived-value bullet replaced by):**

> - A derived value `atRisk: string[]` — gallery ids whose humidity is outside 40–55% — expressed as a selected slice of the readings state (not a separately-declared derived atom holding its own state), that recomputes automatically whenever readings change, does not recompute when a new reading leaves the at-risk set unchanged (prove this with a recompute counter), and compares by set contents, not reference.
> - `ingestReading` replaces a gallery's reading wholesale (set semantics, not merge).

**Differentiators:**
- T6-D1: `atRisk` is `select(readings, selector, { eq })` with a custom `eq` implementing set equality — not `controller(dep, { resolve, watch })` inside another atom's deps, not a manually-updated second atom.
- T6-D2: state writes use `ctrl.set` (whole-value replacement) in `ingestReading`.
- T6-D3: no-recompute-on-equal proven by an explicit recompute/selector-call counter in a test.
- T6-D4: coalesced-burst safety via diff-against-last-alerted: many rapid updates yield exactly the newly-at-risk alert set, no duplicates, no misses.

Dims: R1, R2, R3, R5, R6.

`transplant_rescore`: the v1 challenger's copy of keepAlive atoms + watched controller-derived atom + changes-loop (57.7% with R1=R5=0) uses precisely the mechanism T6-D1 forbids and `update` instead of `ctrl.set` (T6-D2); different mechanism = absent; G6 fails ⇒ 0.

---

### T-7 — Chess-club pairing engine (Tier C) — REWEIGHTED VIA G6

Domain: chess tournament pairing. **Prompt: v1 verbatim** (the prompt already demands the construct; verdicts H-T7 proposed_next is a reweight — resource R1 and result-bound R4 become independent pass-gates).

**Differentiators:**
- T7-D1: the unit-of-work is a `resource()` with `ownership: "boundary"` — not an atom, not an inline `db.transaction` in the flow, not a value threaded through parameters.
- T7-D2: commit/rollback is bound to the close result via `onClose(result => ...)`, and the `pairing_audit` append records which occurred — proven by both the commit-path and rollback-path tests.
- T7-D3: two concurrent `generateRound` executions observe distinct unit-of-work instances (test asserts distinct identities).
- T7-D4: the `writePairing` sub-operation reaches the same unit-of-work through deps (call-tree sharing), not via arguments.

Dims: R1, R2, R3, R4, R6.

`transplant_rescore`: the v1 challenger's inline-`db.transaction` transplant (56.2% with R1=R4=0) misses T7-D1, T7-D2, and T7-D3 by construction — the verdict itself says it "fails the central resource ownership requirement"; G6 fails ⇒ 0.

---

### T-8 — Summit weather alerts, multi-channel (Tier C) — REWEIGHTED VIA G6

Domain: mountain-hut weather alerting. **Prompt: v1 verbatim** (verdicts H-T8 proposed_next: tags.all fan-out and tags.optional absence behavior become pass-gates).

**Differentiators:**
- T8-D1: channels are resolved via `tags.all(...)` over a channel port tag; feature code iterates the resolved list and never names a concrete channel; deployments differ only in wiring.
- T8-D2: quiet hours read via `tags.optional(...)`; the absent case is handled by the declared optionality, proven by tests running both the configured and unconfigured wiring.
- T8-D3: a throwing channel still yields attempts on all channels with correct `{ attempted, delivered }` accounting, and the failure is visible in traces via a named per-channel exec.

Dims: R1, R2, R3, R6, R7, R8.

`transplant_rescore`: the v1 challenger's single-required-notifier transplant (64.1% with R1=R8=0) "retain[s] one required notifier and therefore fail[s] multiplicity" — T8-D1 and T8-D2 absent by construction; G6 fails ⇒ 0.

---

### T-9 — Podcast transcript backfill with retry (Tier D) — REWEIGHTED VIA G6

Domain: podcast archive transcription. **Prompt: v1 verbatim** (verdicts H-T9 proposed_next: prepare-stage-once and error-class-gated retry become pass-gates).

**Differentiators:**
- T9-D1: each episode's invocation is staged ONCE via `prepare()` and re-executed across attempts — the grader quotes the single staging site and the re-execution loop; repeated direct `.exec` per attempt = absent.
- T9-D2: retry is gated on the error class (`VendorBusy` retries; any other error fails that episode immediately with `attempts: 1`) — proven by the non-busy test.
- T9-D3: backoff delay comes from a swappable source (tag/preset); tests run with zero real delay.
- T9-D4: `attemptLedger` extension counts `{ started, succeeded, failed }` per operation name and matches the scripted vendor scenario exactly.

Dims: R1, R2, R3, R4, R6, R7, R8.

`transplant_rescore`: the v1 challenger's transplant "implement[s] retry with repeated direct exec rather than prepare" (55.6% with R1=R4=R8=0) — T9-D1 absent by its own description, and its scripted-fake shell supplies no attempts=1 error-class proof (T9-D2); G6 fails ⇒ 0.

---

### T-10v2 — Ferry-terminal departure board (Tier C) — NEW (replaces killed T-10)

v1 T-10 is KILLED per verdicts H-T10 (required-`at` vs missing-`at`-default self-contradiction; stdin/parse shell fully example-borne). The replacement examines a register surface the challenger flagged as unexamined (H-COVERAGE): **resource controllers with `watch` in resource deps** (register sec.3 gap 2) plus current-vs-boundary ownership contrast with T-7.

Domain: harbor ferry terminal departure boards.

**Prompt:**

> Build the display layer for a ferry terminal's departure board using `@pumped-fn/lite`. Requirements:
> - A board connection: opening a session against the board hardware is expensive (a scaffolded `BoardLink` client exposes `open(address): Session` and `Session.close()`/`Session.render(frame)`). The process needs exactly one live session at a time, opened when first needed and closed on shutdown.
> - The board's network address lives in process state and can be changed at runtime by an operator via a `retarget` operation (`{ address: string }`). When the address changes, the live session must be closed and a new session opened against the new address — automatically, without the render path knowing retargeting exists, and without restarting the process. Renders issued after a retarget must go to the new session; the old session must be closed before the new one serves a render.
> - A `renderDepartures` operation: given `{ departures: { vessel: string, at: string }[] }`, renders a frame to the current session and returns `{ rendered: number }`.
> - `bin/board.ts` wires everything, renders one canned frame, and shuts down cleanly (session closed, exit 0).
> Deliverables: `src/`, `bin/board.ts`, tests proving: renders reach the session; a retarget closes the old session and subsequent renders reach a session opened against the new address (assert open/close/render order on a fake BoardLink); shutdown closes the live session; the BoardLink is swapped in tests at wiring only. Deterministic tests.

**Differentiators:**
- T10-D1: the session is a scope-owned (`current`-ownership) `resource()` whose deps include a watched controller on the address atom — the retarget re-establishment is graph-driven (watch), not manual close/open calls inside `retarget`.
- T10-D2: teardown ordering proven: the fake BoardLink's call log shows `close(old)` before `render` on the new session, asserted in a test.
- T10-D3: `retarget` only updates the address state; it does not touch the session (the render path and retarget path are decoupled through the graph).

Dims: R1, R2, R3, R4, R6.

`transplant_rescore`: invoice-triage contains no `resource()` and no watched-dep re-establishment anywhere (register sec.3 gaps 1–2); its nearest shapes (cleanup atom for the DB pool, keepAlive atoms) cannot re-establish on state change — a transplant either hand-wires close/open inside `retarget` (T10-D1 absent: different mechanism) or cannot pass the ordering test (T10-D2); G6 fails ⇒ 0.

---

## 3. Tier distribution and coverage matrix v2

Distribution: A×1 (T-1), C×7 (T-2,3,5,6,7,8,10v2), D×2 (T-4,9). Σ tier_mult = 0.5 + 7×1.0 + 2×1.25 = **10.0** (was 9.75; T-10 moved B→C because resource-watch re-establishment needs test proof). Sensitivity: one fully-zeroed C task now costs exactly 10.0 points.

| Required coverage | Task (differentiator) |
|---|---|
| resource-centric (ownership boundary, result-bound close) | T-7 (D1/D2), T-2 (D1), T-1 (D1/D3) |
| resource watch (re-establish on dep change) | **T-10v2 (D1/D2)** primary, T-1 (D2) design-level |
| select/eq derived slices + ctrl.set | **T-6 (D1/D2/D3)** |
| port multiplicity (tags.all / tags.optional) | T-8 (D1/D2) |
| prepare/retry | T-9 (D1/D2) |
| state-backed queue + signal | T-2 (D2/D3) |
| scheduler policies + manual backend | T-3 (D1/D2) |
| graceful shutdown | T-2, T-4, T-10v2 |
| derived state | T-6 |
| parse-at-boundary + error taxonomy | T-4 (D4), T-8 (D3 partially) |
| observability + custom extension | T-4 (D1–D3), T-9 (D4) |
| streaming/generator flows + abandonment | T-5 (D1–D4) |

**Ratification line item (H-COVERAGE resolution) — proposed OUT of eval scope v1, taught in skill references but not examined:**
- GC options (`gc: { enabled, graceMs }`) and `scope.flush()` (register sec.3 gap 6)
- Incremental adoption / legacy-leaf migration shapes (gap 9)
- Parent-chain tag reads (`ctx.data.seekTag`/`getTag`, gap 10)
- React (`@pumped-fn/lite-react`) and Hono adapter (gaps 7–8) — carried over from v1

Rationale: each is either environment-dependent (GC timing), migration-context-dependent (adoption), or a narrow API read the differentiator model over-weights relative to its footprint. This is an explicit exclusion for the human to ratify or veto — not a silent drop. Veto path: T-10v2 could absorb a parent-chain tag read (terminal id seeded at exec, read in a child) as a fifth differentiator if the human wants it examined.

---

## 4. Rubric scoring sheet (salvaged, unchanged weights)

Weights, quote requirements, 0/0.5/1 scoring, and per-task applicability renormalization: **salvaged verbatim from v1 sec.2** — R1 20 · R2 18 · R3 15 · R4 12 · R5 10 · R6 8 · R7 9 · R8 8 (=100). The rubric is now the SECOND filter: it only differentiates among solutions that already passed G1–G6. Wrong-mechanism solutions no longer collect shell points, because they never reach additive scoring.

## 5. Gates v2

| Gate | Check | Applies to |
|---|---|---|
| G1 lint-zero | `node pkg/tool/lint/dist/cli.mjs --json --max-warnings 0 <workspace>` — zero diagnostics INCLUDING warn-tier (AG-1; dkr-4 invocation), **plus the lint-escape side-check below** | B, C, D |
| G2 typecheck | `tsc --noEmit` exit 0 | B, C, D |
| G3 tests-green + assertion semantics | `vitest run` exit 0, AND the per-task manifest of REQUIRED ASSERTION SEMANTICS is satisfied (below) | C, D |
| G4 entrypoint-runs | scripted smoke: canned input, exit code + stdout contract per task | B, C, D |
| G5 format (tier A) | `DESIGN.md` exists, covers all 4 scenarios + the createScope question | A |
| **G6 differentiators** | every answer-key differentiator present with replayed quotes (sec.1) | **all tiers** |

**G3 semantics (upgraded — verdicts H-RUBRIC: name counting permits shallow green tests):** each task's manifest names REQUIRED ASSERTION SEMANTICS — what must be asserted, not test names. Examples: T-2 "asserts printed-exactly-once across two concurrent drains" and "asserts zero slips after a failing transaction"; T-5 "asserts legacy fetch count == k after abandonment at k"; T-4 "asserts entries length == 100 after 105 executions"; T-6 "asserts selector recompute count unchanged on an equal update". The deterministic script still checks vitest exit 0; the grader verifies each manifest item with a verbatim quote of the asserting expression (file:line), spot-replayed like all quotes. A green suite missing a manifest assertion fails G3.

**Lint-escape side-check (deterministic, from dkr-4):** the lint gate alone is gameable via the ambient-name allowance (any handle name containing `id`/`env`/`clock`/... suppresses ambient rules) and the `atom(fn)` shorthand (escapes object-config rules). Side-check script over eval solutions: (a) any `atom(`/`flow(`/`resource(` call whose argument is not an object literal ⇒ G1 fail; (b) any declaration whose name matches the ambientNamePattern AND whose body contains ambient IO (`Date.now|process\.env|Math\.random|setTimeout|fetch\(`) outside the task's designated adapter/composition files ⇒ G1 fail. Flagged for ratification as part of G1 strictness.

**Gate semantics:** any applicable gate failure ⇒ task score = 0 (strict-zero, salvaged default). Alternative for ratification, carried over from v1: G4-only failure caps the task at 0.4 instead of 0. G6 is never softened — a missing differentiator is the exact signal the suite exists to catch.

## 6. Score formula and anti-gaming recompute

Formula (salvaged skeleton, G6 added, Σ updated):

```
gate(t)       = 1 if G1–G6 all pass, else 0     (or 0.4 if G4-only-fail alternative ratified)
rubric(t)     = Σ applicable weight(d) × score(d) / Σ applicable weight(d)
task_score(t) = gate(t) × rubric(t)
suite_%       = 100 × Σ_t tier_mult(t) × task_score(t) / 10.0        pass ⇔ suite_% ≥ 85
```

**Recompute of the challenger's shallow-semantic vector** (verdicts H-RUBRIC kill_attempt: gate-clean, full R1/R2/R3/R6/R7/R8, half R4/R5 — i.e. materially deviating on lifecycle and state semantics while keeping declarations, visible deps, seam-shaped tests, lint cleanliness, named edges, error classes; scored 92.70% under v1):

The vector's defining deviation — half-credit R4/R5 — is a material deviation the grader names on lifecycle/state semantics. Under v2, every task's differentiators pin the SPECIFIC lifecycle/state semantics; a material deviation there = a differentiator absent = G6 fail = 0. Per task:

| Task | Differentiators in R4/R5 territory hit by the half-R4/R5 deviation | G6 | task_score × tier_mult |
|---|---|---|---|
| T-1 (A, 0.5) | none applicable (R1/R2 only; vector claims full R1) | pass | 1.0 × 0.5 = 0.50 |
| T-2 (C) | D1 session close-result, D2 post-commit signal, D3 exactly-once | fail | 0 |
| T-3 (C) | D1/D2 policy behavior under manual ticks (R4) | fail | 0 |
| T-4 (D) | D2 eviction, D3 nested failure outcomes (R4) | fail | 0 |
| T-5 (C) | D1 abandonment-prevents-next-effect, D2 aborted close result | fail | 0 |
| T-6 (C) | D3 no-recompute proof, D4 coalescing diff (R5) | fail | 0 |
| T-7 (C) | D2 result-bound commit/rollback, D3 concurrent distinctness (R4) | fail | 0 |
| T-8 (C) | none in R4/R5 (dims R1/R2/R3/R6/R7/R8; full-R1 claim implies tags.all present) | pass | 1.0 × 1.0 = 1.00 |
| T-9 (D) | D1 stage-once re-exec, D2 error-class gating (R4) | fail | 0 |
| T-10v2 (C) | D1 watch re-establishment, D2 teardown ordering (R4) | fail | 0 |

`suite_% = 100 × (0.50 + 1.00) / 10.0 = 15.0%` — versus 92.70% under v1. Even the most charitable reading of the same vector cannot recover: to reach 85 it needs `Σ tier_mult × task ≥ 8.5`, so at most 1.5 tier-mult may be lost — i.e. at most ONE C task may fail G6 even with perfect rubric everywhere else; and any task where it does pass G6 with genuine half-R4/R5 deviations still scores below 1.0 (e.g. T-2 rubric = (20+18+15+6+5+8)/83 = 86.7% of that task). A solution that passes G6 on ≥9 tasks has, by the replayed-quote requirement, verifiably implemented the specific lifecycle/state semantics on ≥9 tasks — at which point it is no longer the shallow vector.

## 7. Grading protocol (AG-3) — salvaged with two changes

v1 sec.3 salvaged in full: cold writer gpt-5.6-terra (skill + prompt + workspace only, prompt-level isolation per precedent, 40-turn budget proposed), deterministic gate script, grader gpt-5.6-sol with mandatory verbatim quotes and machine-parseable JSON, orchestrator claude spot-replays quotes and aggregates, roles fixed and disjoint. Changes:

1. Grader JSON gains a `differentiators` array per task (`{ id, present, evidence: [{file, lines, quote}] }`); spot-replay covers these quotes with the same fabrication rules; G6 is computed by the orchestrator from replayed evidence, never self-declared by the grader.
2. G3 manifest verification (assertion-semantics quotes) is graded in the same pass, same replay rules.

## 8. Ratification sheet v2 (the two-minute table)

| # | Title | Tier | Domain | Differentiators (5 words) | Mult |
|---|---|---|---|---|---|
| T-1 | Greenhouse resource-ownership design | A | hydroponics | boundary/current ownership, result-release, watch | 0.5 |
| T-2 | Library hold-shelf pipeline | C | library holds | session resource, post-commit, exactly-once | 1.0 |
| T-3 | Observatory imaging windows | C | telescope jobs | opposite policies proven by ticks | 1.0 |
| T-4 | Scooter telemetry daemon | D | e-scooter fleet | wrapResolve/wrapExec, eviction, nested failures | 1.25 |
| T-5 | Recipe export, live progress | C | recipe archive | pull-driven, abandonment stops next fetch | 1.0 |
| T-6 | Gallery climate watch | C | museum sensors | select+eq slice, ctrl.set, coalescing | 1.0 |
| T-7 | Chess pairing engine | C | tournament pairing | boundary resource, result-bound commit/rollback | 1.0 |
| T-8 | Summit weather alerts | C | weather station | tags.all fan-out, tags.optional absence | 1.0 |
| T-9 | Podcast transcript backfill | D | podcast archive | prepare stage-once, error-class retry | 1.25 |
| T-10v2 | Ferry departure board | C | ferry terminal | watched-dep resource re-establishment, ordering | 1.0 |

- Weights: R1 20 · R2 18 · R3 15 · R4 12 · R5 10 · R6 8 · R7 9 · R8 8, renormalized per task over applicable dims.
- Gates: G1 lint-0-incl-warn (`--max-warnings 0`, stricter than the repo's own `pnpm lint`) + lint-escape side-check (ambient-name allowance and `atom(fn)` shorthand rejected in eval solutions — dkr-4); G2 typecheck; G3 tests-green + required-assertion-semantics manifests; G4 entrypoint-runs; G5 format (A); **G6 per-task differentiators, quoted + spot-replayed, any absent ⇒ 0**.
- Gate semantics: strict-zero (default) vs G4-only-fail ⇒ ×0.4 — pick one. G6 is never softened.
- Formula: task = gate × Σ(w·s)/Σw; suite_% = 100 × Σ(mult × task)/**10.0**; pass ⇒ ≥ 85. One zeroed C task now costs 10.0 pts.
- Turn budget: 40 per cold session. Isolation: prompt-level per precedent (skill + prompt + workspace only).
- Scope exclusions to ratify: React/Hono (carried over); GC/`scope.flush`, incremental adoption, parent-chain tag reads OUT of exam scope, taught in skill references only (sec.3 line item; veto path noted).

Decisions requested: (1) ratify/edit task set incl. T-10v2 replacement and T-1 rebuild, (2) ratify G6 semantics (different-mechanism = absent, any absent ⇒ 0), (3) pick G1 side-check strictness and gate semantics, (4) ratify Σ=10.0 formula + 85%, (5) ratify the out-of-scope list, (6) confirm 40-turn budget.

## 9. Self-check appendix — transplant kill-attempt sketches (challenger style)

These sketches show each task's v1-style transplant now gates to 0. Whether the suite survives challenge is gpt-5.6-sol's call, not this worker's claim.

- **T-1:** Map connection→cleanup atom, lease→flow-internal try/finally, config→tag. DESIGN.md then contains no `resource()`/ownership vocabulary for scenarios 1–3; grader cannot quote T1-D1/D2/D3; G6 ⇒ 0.
- **T-2:** Rename invoice nouns, keep queueSignal + state drain + stop choreography, print via a directly-bound notifier port. No `resource()` session declaration exists to quote for T2-D1; no dirty-close path for the failing pass; G6 ⇒ 0.
- **T-3:** Copy both example job declarations verbatim. Capture job then makes up missed slots and upload job doesn't catch up in order; the manual-tick tests demanded by the prompt fail (G3) or the policy quotes for T3-D1/D2 don't exist; G6 ⇒ 0.
- **T-4:** Consume prebuilt observability extensions and add console dumps. No hand-written wrapResolve/wrapExec extension site to quote (T4-D1); no 105-execution eviction assertion (T4-D2, also G3 manifest); G6 ⇒ 0.
- **T-5:** Rename importBatch→exportCollection, keep bare `yield*` and eager sequential loop. Prefix quotes absent (T5-D4); abandonment test shows fetch counter k+1 because the loop pre-fetched (T5-D1 counter-evidence); G6 ⇒ 0.
- **T-6:** Keep controller(readings,{resolve,watch}) derived atom + `update`. That is the named wrong mechanism for T6-D1 and T6-D2 (different mechanism = absent); G6 ⇒ 0.
- **T-7:** Inline `db.transaction` per flow. No resource declaration (T7-D1), no onClose commit/rollback site (T7-D2), concurrent-distinctness test has nothing to compare (T7-D3); G6 ⇒ 0.
- **T-8:** Single `tags.required` notifier renamed "channel". `tags.all` iteration site absent (T8-D1); quiet-hours inline default instead of `tags.optional` (T8-D2); G6 ⇒ 0.
- **T-9:** Retry loop calling `.exec` per attempt with scripted fakes. No `prepare()` staging site to quote (T9-D1 — different mechanism = absent); G6 ⇒ 0.
- **T-10v2:** Cleanup atom for the session + `retarget` flow that closes/reopens manually. Manual re-establishment is the named wrong mechanism for T10-D1; ordering test may even pass, but the watched-controller-in-resource-deps quote does not exist; G6 ⇒ 0.

Residual exposure to flag for the challenger: T-8 and T-1 are the tasks where the shallow vector still passes G6 in sec.6's table — their differentiators are construct-presence (R1) rather than behavior-under-test. If sol finds a way to fake `tags.all`/ownership vocabulary presence without competence, tightening their differentiators to behavior proofs (T8-D3 accounting already partially does this) is the prepared amendment.
