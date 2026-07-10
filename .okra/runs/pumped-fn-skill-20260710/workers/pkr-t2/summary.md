# T-2 "library hold-slip printing" — worker pkr-t2 summary

Tier C. State-backed hold queue + wake-on-signal drain loop + per-drain-pass printer
session. All chal-2 H2-T2 amendments applied: session ownership corrected to `current`
(verified against pkg/core/lite/tests/scope.test.ts:1151-1239), signal-after-commit
proven by ORDER with a checker-driven awake-dispatcher interleave, exactly-once proven
across two concurrent same-parent sibling drain passes, shutdown finishes the current
drain.

## What the task examines (idiom IDs, workers/dkr-1/idiom-register.md)

- I-6 state-drain (work from the shelf atom, never stream payloads)
- I-7 signal-after-commit, I-8 batch atomicity — upgraded to an ORDER proof (b6)
- resource ownership `current` + `onClose(result)` flush/discard — register sec.3 gap 1
  (the surface invoice-triage never exercises), PATTERNS.md L177-230
- I-10 graceful shutdown as graph choreography (b8)
- I-3 controller-composed child flows, I-2 composition roots, I-9/I-29 typed
  inputs/faults, I-32 keepAlive signal atoms

## Checker check-list (harness/check-t2.mjs — 13 checks, pure node, AG-3)

decl-exports · b1-record-commits-pending · b2-drain-prints-and-flushes-at-close ·
b3-fresh-session-per-sequential-sibling-pass · b4-concurrent-sibling-passes-exactly-once ·
b5-empty-pass-still-isolated-session · b6-failing-batch-invisible-to-awake-dispatcher ·
b7-jam-closes-dirty-and-discards · b7b-recovery-pass-after-jam ·
b8-stop-finishes-current-drain-exactly-once · n1-duplicate-hold-and-refulfil ·
n2-racing-duplicates-single-winner · p1-shelf-outlives-daemon-context

## Gate results (workspace instantiated from dkr-5 pinned tarball, sha256 16001d13…)

| Gate | Reference | Transplant | Fake |
|---|---|---|---|
| lint --max-warnings 0 | 0 diagnostics (exit 0) | 0 diagnostics | 0 diagnostics |
| tsgo --noEmit | exit 0 | exit 0 | exit 0 |
| vitest run | exit 0 (9 tests) | n/a | n/a |
| tsx bin/daemon.ts smoke | exit 0 | n/a | n/a |
| checker | exit 0, 13/13 pass | exit 1, fails b4/b6/b7/b7b | exit 1, fails b4/b7/b7b |

Verbatim logs: gates/reference-gates.log, gates/checker-reference.json,
adversarial/{transplant,fake}/verdict.json. Both adversarials are lint-clean and
tsgo-clean — the checker kills them on behavior alone, on the differentiator checks
(session unit-of-work, post-commit order, exactly-once), not trivia. AG-2 held for both
attack classes; contribution metric: **admitted**.

Lint dist sha256 at gate time: 7ae4e6f7ff276490f80f7f49ddcced98331e9b628c188821844ece85c1d7ac79
(recorded in gates/reference-gates.log; shared-mutable-dist mitigation).

Note: harness/instantiate.sh extends the dkr-5 workspace template with
`@types/node` + `"types": ["node"]` because bin/daemon.ts must handle SIGINT
(`process.once`) — recorded so the cold workspace matches the graded one.

## Residual attack classes not closed (honesty)

1. Hand-rolled per-pass isolation without `resource()` (plain session object + claim
   flags) is functionally correct and admitted — behavior-not-vocabulary limit, same as
   dkr-5/T-7. Chal-3 should attack here.
2. "No polling" (R3) is not machine-checked; a polling drainer with atomic commits
   survives the checker.
3. b6 proves observed order, not internal code order, for implementations whose commit
   is already atomic (unobservable class).
4. Checker uses a 5s guard timeout only to convert a hanging dispatcher into a failure;
   correct solutions never hit it.

## Cut lines (budget)

- No second-tier adversarial (behavioral twin without resource()) — residual 1.
- Dispatcher jam behavior intentionally unspecified/untested (jam is proven via direct
  drainPass exec); documented via answer-key residuals.
