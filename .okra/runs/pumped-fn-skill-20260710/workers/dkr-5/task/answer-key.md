# T-7 answer key — atomic differentiators, each mapped to a deterministic checker assertion

Grading is EXECUTABLE: `harness/check-t7.mjs` (run inside the instantiated workspace via
`node --import tsx check-t7.mjs`) prints `{checks: {id: pass|fail}, errors, failed}` and
exits non-zero on any fail. No LLM judges behavior; no quote grading. A differentiator is
"present" iff every checker ID mapped to it passes.

## Expected topology (verified against the library, not assumed)

- Round record: scope-lived state (atom or boundary resource) — `p1` proves it outlives a
  session context.
- Per-operation unit of work: `resource({ ownership: "current" })` resolved as a dep of
  `generateRound`'s execution, with `ctx.onClose((result) => result.ok && opened && publish())`
  registered in the resource factory. Publication assigns the round number at commit time
  (`ledger.rounds.length + 1` inside onClose), which is what makes concurrent siblings
  serialize to consecutive numbers (`b8`).
- Sub-flows composed via `deps: { child: controller(childFlow) }` + `child.exec(...)`
  (the lint rule `no-direct-flow-composition` forbids `ctx.exec({flow: child})` inside a
  flow factory) — they resolve the same `workspace` dep and, because the parent execution
  already owns the current-owned instance, nested executions share it (verified:
  pkg/core/lite/tests/scope.test.ts:1185-1208).
- Semantics correction vs the original T-7 draft (chal-2 H2-T7): ownership must be
  `current`, NOT `boundary`. Verified against pkg/core/lite/tests/scope.test.ts:1151-1239:
  current-owned misses store on the resolving execution context; siblings on one parent
  reset; nested share; explicit child boundaries do not share.

## Differentiators → atomic checks

| Diff | Claim | Kind | Checker IDs |
|---|---|---|---|
| D1 | Each generation operation has a private unit of work; sibling executions on ONE parent context observe distinct instances | behavior | `b3-sibling-staging-reset`, `b8-concurrent-siblings-distinct` |
| D2 | Nested sub-operations share the parent operation's unit of work; the pairing details reach the published round even though `pairEntrants` returns only a count (staging is the only channel) | behavior + reachability | `b1-basic-pairing`, `b2-bye-staged-with-round`, `b5-standalone-pairing-no-publish` (return-shape half) |
| D3 | Publication is bound to the operation's close result: success publishes exactly once, immediately at operation end (not at session end); a standalone sub-operation's successful close publishes nothing | behavior | `b4-commit-before-session-close`, `b5-standalone-pairing-no-publish`, `b5b-standalone-bye-no-publish` |
| D4 | Crash path discards: a failure AFTER pairing staging (bye exhaustion is spec-ordered phase 2) leaves the record untouched and no phantom staged state leaks into the next generation | behavior + negative | `b6-crash-path-discard`, `b6b-no-phantom-state-after-crash` |
| D5 | Declarations exist and are executable flows at the prescribed paths | declaration | `decl-exports` |
| D6 | Input contract failures publish nothing | negative | `n1-invalid-entrants` |
| D7 | Record is scope-lived, not context-lived | behavior | `p1-record-outlives-session-context` |

## Why the known attacks fail (executed proofs in adversarial/*/verdict.json)

- Transplant (inline `db.transaction`, module-level state, no unit of work): fails 10/12 —
  eager writes leak partial rounds (`b6*`), state bleeds across scopes (`p1`, `n1`, `b2+`),
  sub-flow returns pairing details (`b5`).
- Syntax mimicry (verbatim `ownership: "current"` resource + `onClose` present but
  detached; module-level staging drained on success): passes the happy paths but fails
  exactly the unit-of-work checks — `b6-crash-path-discard`, `b6b-no-phantom-state-after-crash`,
  `b8-concurrent-siblings-distinct`.

## Residual gaming risk (recorded, not hidden)

A solver could hand-roll per-operation isolation without `resource()` (e.g. thread a
locally-created buffer through nested calls implemented as plain functions behind flow
facades, keeping exported sub-flows as behavioral twins). The checker measures behavior,
not vocabulary, so such a solution is functionally correct but not idiomatic; the lint
gate (`no-direct-flow-composition`, `no-module-state`, composition rules) narrows this
path but does not close it. Chal-3 should attack here.
