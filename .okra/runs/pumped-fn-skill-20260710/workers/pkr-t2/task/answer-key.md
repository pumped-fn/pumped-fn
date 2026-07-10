# T-2 answer key — atomic differentiators, each mapped to a deterministic checker assertion

Grading is EXECUTABLE: `harness/check-t2.mjs` (run inside the instantiated workspace via
`node --import tsx check-t2.mjs`) prints `{checks: {id: pass|fail}, errors, failed}` and
exits non-zero on any fail. No LLM judges behavior; no quote grading. A differentiator is
"present" iff every checker ID mapped to it passes.

## Expected topology (verified against the library, not assumed)

- Shelf record + printer audit: scope-lived atoms (`p1` proves they outlive a daemon
  context).
- Printer session: `resource({ ownership: "current" })` resolved as a dep of `drainPass`.
  Verified against pkg/core/lite/tests/scope.test.ts:1151-1239: current-owned misses
  store on the resolving execution context, so SIBLING drain passes on ONE parent daemon
  context each get a fresh instance (1151-1183), nested sub-executions of the pass share
  it (1185-1208), and explicit child context boundaries do not (1214-1239). This is the
  chal-2 H2-T2 amendment: `ownership: "boundary"` (the v2 answer key) would share ONE
  session across all sibling passes and defer its close to daemon shutdown — the checker
  kills that topology twice (`b3`/`b4` session identity, `b2`/`b3` flush-visible-while-
  daemon-open).
- Close-result binding: the session resource registers
  `ctx.onClose((result) => result.ok ? flush : discard)` — clean close flushes slips to
  the audit and flips claimed holds to `printed`; dirty close discards slips, restores
  non-offending holds to `pending`, marks the jam offender `rejected`. Because a flow
  exec resolves only after its context fully closes (dkr-5 template note 5), flush
  effects are visible immediately after `await exec` returns while the daemon context is
  still open.
- Exactly-once: `drainPass` claims its batch synchronously (status flip before any await)
  inside the factory; the print loop composes a child flow via
  `deps: { print: controller(printSlip) }` (lint forbids `ctx.exec({flow})` in factories)
  and the child shares the pass's current-owned session.
- Signal-after-commit: `holdSignal` is a keepAlive counter atom bumped only after the
  shelf mutation completes (single and batch commit alike); the dispatcher is
  `for await (const _ of ctx.changes(holdSignal))` — conflated wakeups, state is the work
  source. A failing batch commits nothing and never signals.
- Shutdown: `requestStop` flips a stopping atom AND bumps the signal; the dispatcher
  drains until nothing is pending on each wake, then exits if stopping.

## Differentiators → atomic checks

| Diff | Claim | Kind | Checker IDs |
|---|---|---|---|
| D1 | Per-pass printer session is `current`-owned: sibling passes on ONE parent daemon context (sequential, concurrent, and empty) own distinct sessions, each closed at its own pass end — not at daemon shutdown | behavior | `b3-fresh-session-per-sequential-sibling-pass`, `b4-concurrent-sibling-passes-exactly-once` (session-identity half), `b5-empty-pass-still-isolated-session` |
| D2 | Session close is outcome-bound: clean close flushes slips + hold statuses visible immediately after the pass resolves; dirty close discards every staged slip, restores non-offenders to pending, rejects the offender | behavior + negative | `b2-drain-prints-and-flushes-at-close`, `b7-jam-closes-dirty-and-discards`, `b7b-recovery-pass-after-jam` |
| D3 | Post-commit signaling proven by ORDER: an ALREADY-AWAKE dispatcher racing a failing batch never observes (prints or leaves committed) any hold from it | behavior + negative | `b6-failing-batch-invisible-to-awake-dispatcher` |
| D4 | State-drain + exactly-once: work comes from the shelf record, not notification payloads; every hold printed by exactly one pass across two concurrent same-parent passes and across a coalesced burst | behavior | `b4-concurrent-sibling-passes-exactly-once` (slip-union half), `b8-stop-finishes-current-drain-exactly-once` (burst half) |
| D5 | Shutdown finishes the current drain: after stop, all committed holds printed, dispatcher resolved, nothing lost | behavior | `b8-stop-finishes-current-drain-exactly-once` |
| D6 | Declarations exist and are executable flows at the prescribed path | declaration | `decl-exports` |
| D7 | Duplicate-hold contract: single, batch-internal, and racing duplicates commit nothing; printed holds free the copy | negative | `n1-duplicate-hold-and-refulfil`, `n2-racing-duplicates-single-winner`, `b1-record-commits-pending` |
| D8 | Shelf record is scope-lived, not context-lived | behavior | `p1-shelf-outlives-daemon-context` |

## DO/DON'T design trace (ratified section — reviewer checklist, sourced from workers/dkr-1/idiom-register.md)

DOs a reviewer verifies:
- DO keep must-not-drop work in state and wake consumers with a conflated signal
  (`ctx.changes` loop) — I-6; the drain queries the shelf, never the wakeup payload.
- DO bump the signal only after the commit completes — I-7; batch commit is
  all-or-nothing before the single bump — I-8.
- DO model the per-pass unit of work as `resource({ ownership: "current" })` with
  `ctx.onClose(result => ...)` deciding flush vs discard — PATTERNS.md L177-230
  (register sec.3 gap 1: this is the surface invoice-triage never exercises).
- DO compose the per-slip child via `deps: { print: controller(printSlip) }` — I-3.
- DO make shutdown graph choreography: stop flow flips an atom + bumps the signal;
  the loop observes and returns; the root awaits the loop promise — I-10.
- DO keep `createScope`/`createContext` in bin/ and tests only — I-2.
- DO use `typed<T>()` for these trusted inputs and `ctx.fail` with a typed fault
  union — I-9, I-29.

DON'Ts:
- DON'T compose child flows via `ctx.exec({ flow })` in a factory — `lint:no-direct-flow-composition`.
- DON'T hold shelf/audit/signal state at module level — `lint:no-module-state`.
- DON'T `throw new Error(...)` from factories for domain failures — `lint:no-untyped-throw`.
- DON'T accept `scope`/`ctx` in product helpers or reach `ctx.scope` — `lint:no-scope-argument`, `lint:no-ctx-argument`, `lint:no-scope-reach`.
- DON'T read tags implicitly or touch ambient globals in features — `lint:no-implicit-tag-read`, `lint:no-naked-globals` (process.once only in bin/ composition root).
- DON'T share one printer session across sibling passes (boundary ownership or a
  session-as-atom) — `preference` (machine-checked behaviorally by `b3`/`b4`/`b5`, not by lint).
- DON'T mark holds printed or append audit slips eagerly during the pass —
  `preference` (behaviorally checked by `b2`/`b7`).
- DON'T poll (timers/sleeps) for new work — `preference` (review-only; the checker
  cannot prove absence of polling, recorded as residual).

## Why the known attacks fail (executed proofs in adversarial/*/verdict.json)

- Transplant (genuine renamed invoice ingest shell: enqueue→recordReturn with per-item
  commit+signal, intake loop→recordReturns, importBatch-style eager marking inside a
  try/finally session record, same changes-loop dispatcher; lint-clean, tsgo-clean):
  fails 4/13, all differentiator checks — `b4` (7 slips for 4 holds: no claim step),
  `b6` (c2/c3 from the failing batch committed and printed: per-item signal-before-
  batch-commit), `b7`/`b7b` (dirty session keeps its slips; eagerly-printed holds never
  restored). It passes every non-differentiator check including decl, b1-b3, b5, b8,
  n1/n2, p1 — the kill is mechanics, not trivia (AG-2 note honored).
- Syntax mimicry / fake (verbatim `ownership: "current"` resource with a result-bound
  `onClose` present but detached — onClose flips an unread flag; effects written eagerly;
  batch commit correct): fails exactly the unit-of-work checks — `b4`, `b7`, `b7b`.

## Residual gaming risk (recorded, not hidden)

- A solver could hand-roll per-pass isolation without `resource()` (locally-created
  session object threaded through plain functions, claim flags on holds) — functionally
  correct, so the checker admits it; only lint + review narrows it. Same residual as
  dkr-5/T-7; chal-3 material.
- "No polling" (R3) is asserted in the prompt but not machine-checked; a timer-based
  drainer that also honors commit atomicity would pass the checker. The b6 interleave
  makes the natural polling shells fail on ORDER, but a careful poller survives.
- `b6` proves observed order (failing batch invisible to an awake consumer), not the
  internal signal-before-commit code order of an implementation whose commit is
  atomic anyway — that residual class is unobservable by any behavioral test.
