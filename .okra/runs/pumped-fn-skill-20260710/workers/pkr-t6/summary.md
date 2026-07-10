# T-6 "museum climate watch" — build summary (worker pkr-t6)

One page: what the task examines, how it is checked, gate results, and what stays open.

## What the task examines (idiom IDs)

Derived-state discipline over `@pumped-fn/lite`:

- select-slice derived state with custom set-equality (register sec.3 gap 5 —
  `select(atom, selector, { eq })`, the surface invoice-triage never touches; I-11's
  select-side complement)
- whole-value state replacement through the controller (`ctrl.set`; probed
  behaviorally indistinguishable from `update` for resolved atoms — recorded honestly,
  D2 demoted to preference-tier DO + wholesale-replacement behavior check)
- wake-on-changes monitor loop over the select handle with diff-against-last-alerted
  (I-6 applied to a state view, I-31 conflation, I-10 dispose-driven loop end)
- `keepAlive: true` state survival (I-32), tag-port alert capability (I-4/I-5),
  scope-as-seam testing (I-20/I-21)

Chal-2 H2-T6 amendments applied: no selector-call-count assertions anywhere (selector
always recomputes; eq suppresses notification only, scope.ts:213-258); all
differentiators are notification/alert-count behavioral checks.

## Checker check-list (harness/check-t6.mjs — 13 checks)

`decl-exports`, `d1-eq-set-semantics`, `b1-derive-sorted`, `b2-boundary-values-safe`,
`b3-notification-suppressed-on-set-preserving-updates`,
`b4-swap-at-same-cardinality-notifies` (whole-value controller swap — kills length/
cardinality eq), `b5-wholesale-reading-replacement`, `b6-monitor-edge-triggered`,
`b6b-monitor-alerts-preexisting-at-start`, `b7-monitor-sees-swap`,
`b8-realert-on-reentry`, `b9-burst-coalesced-exact-alert-set`,
`p1-state-survives-zero-observers` (gc graceMs 10). Fresh scope per scenario; monitor
promises awaited under timeout after dispose (no-hang proof built in).

## Gate results

| Gate | Reference | Transplant | Fake |
|---|---|---|---|
| lint --max-warnings 0 | exit 0 (0 diagnostics) | exit 0 (lint-clean, recorded) | exit 0 (lint-clean, recorded) |
| tsgo --noEmit | exit 0 | — | — |
| vitest run | exit 0 (7/7) | — | — |
| smoke `tsx bin/main.ts` | exit 0 | — | — |
| checker | exit 0 (13/13) | exit 1 (5 fail: d1, b3, b5, b7, b8) | exit 1 (4 fail: d1, b4, b7, b8) |

Verbatim outputs: `gates/reference-gates.log`, `gates/checker-reference.json`,
`adversarial/{transplant,fake}/verdict.json`. Lint dist sha256 recorded in the gate log
(shared-mutable-dist mitigation). Tarball: pinned dkr-5 pumped-fn-lite-4.0.0.tgz
(sha256 16001d13…). Contribution metric: **admitted** — reference passes all 5 gates,
both adversarials fail the checker.

## API findings worth feeding the skill

1. `pumped/no-scope-argument` flags EXPORTED scope-taking functions even in
   composition-path filenames — a `wire.ts` exporting `atRiskView(scope)` is
   un-lintable. Idiom: export pure selector + eq; every root builds the select handle
   inline.
2. `bin/monitor.ts` is NOT a composition path (`main|bootstrap|wire|...` filename list);
   ambient IO and scope wiring under bin/ must live in `bin/main.ts`.
3. `ctx.changes(selectHandle)` works inside a flow when the handle arrives via input;
   the conflating stream closes on `scope.dispose()`, cleanly ending the loop and
   resolving the exec — the bounded no-polling monitor shape.
4. `shallowEqual` (lib export) rejects arrays entirely (isPlainObject guard) — a
   plausible transplant eq that silently never suppresses.
5. keepAlive is behaviorally decidable in-checker via `createScope({ gc: { graceMs: 10 } })`.

## Residual attack classes not closed (honesty)

- Hand-rolled select-behavior twin (handle-shaped object over controller
  subscriptions): passes the checker; only G6 quote-grading kills it.
- Tag-smuggled polling monitor: passes alert checks; lint narrows, does not close.
- `ctrl.set` vs `ctrl.update`: not separable from outside; mechanism half of T6-D2 is
  review-only (preference DO), by measurement, not choice.

## Cut lines (budget)

- No third-tier adversarial (behavior-twin) built — described in answer-key residual
  section instead.
- Adversarials carry src/ only (checker needs nothing else); no adversarial tests/bin.
