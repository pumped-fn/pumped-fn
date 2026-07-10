# T-6 answer key — atomic differentiators, each mapped to a deterministic checker assertion

Grading is EXECUTABLE: `harness/check-t6.mjs` (run inside the instantiated workspace via
`node --import tsx check-t6.mjs`) prints `{checks: {id: pass|fail}, errors, failed}` and
exits non-zero on any fail. No LLM judges behavior.

## Expected topology (verified against the library, not assumed)

- Readings state: one `keepAlive: true` atom holding `Record<galleryId, Reading>`. GC
  verification: with `gc: { graceMs: 10 }`, a non-keepAlive atom is released after its
  last observer unsubscribes and its state resets (probed live; `p1` is decidable).
- At-risk slice: `scope.select(readings, atRiskOf, { eq: sameRoomSet })` built at
  composition roots (bin/main.ts, tests, checker). **Chal-2 H2-T6 amendment honored:**
  `SelectHandleImpl` (pkg/core/lite/src/scope.ts:213-258) re-runs the selector on every
  source change; `eq` suppresses NOTIFICATION only. All checks assert
  notification/alert counts, never selector-call counts.
- **Lint constraint discovered:** `pumped/no-scope-argument` flags EXPORTED scope-taking
  functions even in composition-path files ("roots stay inline, reuse lives in the
  graph"), and `no-scope-reach` forbids `ctx.scope` in graph factories. Therefore the
  public surface cannot export a view factory; it exports the pure `atRiskOf` selector
  and `sameRoomSet` eq, and every root (solution's bin/tests, and the checker) builds
  the handle inline. The checker constructs the view FROM THE SOLUTION'S exported
  selector/eq, so their semantics are what is graded.
- Monitor: `watchAtRisk` flow takes the handle as input and iterates
  `ctx.changes(ctx.input.view)` (ExecutionContext.changes accepts SelectHandle,
  src/types.ts:248; conflating `Latest` stream, initial value pushed on subscribe,
  closed on scope dispose — so the loop is wake-driven, bounded, and terminates on
  `scope.dispose()`; verified by probe). Edge-triggering = diff against last-alerted
  set, reassigned wholesale each wake (`alerted = new Set(atRisk)`).
- **ctrl.set vs ctrl.update — probed honestly:** for a resolved atom the two are
  behaviorally indistinguishable from outside (`scheduleSet`/`scheduleUpdate`,
  scope.ts:1628-1674, differ only in pendingSet composition during the `resolving`
  state, unreachable through this task's sync-factory topology). D2 is therefore a
  preference-tier DO, and the strongest expressible behavioral checks are wholesale
  reading replacement (`b5`) and whole-value swap notification (`b4`/`b7`), which any
  merge-into-stored-value implementation fails.

## Differentiators → atomic checks

| Diff | Claim | Kind | Checker IDs |
|---|---|---|---|
| D1 | At-risk view is the select slice with custom set-equality: consumers are NOT notified by set-preserving updates and ARE notified by membership changes, including same-cardinality swaps in one state replacement (kills reference-eq, length-eq, and no-eq) | behavior | `b3-notification-suppressed-on-set-preserving-updates`, `b4-swap-at-same-cardinality-notifies`, `d1-eq-set-semantics` |
| D2 | State writes are whole-value replacement; a gallery's reading is replaced wholesale, never merged | behavior (+ preference DO for `ctrl.set`) | `b5-wholesale-reading-replacement`, `b4`/`b7` (whole-state swap must be expressible in one write) |
| D3 | Alerts are edge-triggered from the notification stream: once on entry (incl. already-at-risk at start), silent on churn, re-alert on re-entry — exactly what eq buys; a no-eq solution over-wakes and a count-suppressing one misses swaps | behavior | `b6-monitor-edge-triggered`, `b6b-monitor-alerts-preexisting-at-start`, `b7-monitor-sees-swap`, `b8-realert-on-reentry` |
| D4 | Coalesced-burst safety via diff-against-last-alerted: exact newly-at-risk alert set under rapid updates, no duplicates, no misses | behavior | `b9-burst-coalesced-exact-alert-set` |
| D5 | Declarations exist at the prescribed paths with the right kinds | declaration | `decl-exports` |
| D6 | Derivation is correct and deterministic (band boundaries exact, output sorted) | behavior | `b1-derive-sorted`, `b2-boundary-values-safe` |
| D7 | Readings state survives zero-observer periods (keepAlive judgment) | behavior | `p1-state-survives-zero-observers` |

## DO/DON'T design trace (ratified section — what a reviewer verifies)

DOs:
- DO derive the at-risk view as `scope.select(readings, atRiskOf, { eq: sameRoomSet })`
  at composition roots; the slice owns no state of its own (I-11's select-side
  complement; register sec.3 gap 5). `preference` — the checker proves the eq behavior,
  not the call site.
- DO write readings state with `ctrl.set(next)` — build the next whole map, then store
  it. `preference` — probed behaviorally indistinguishable from `update(fn)` for
  resolved atoms; reviewer checks the call site, checker checks replacement semantics.
- DO put must-survive state in a `keepAlive: true` atom (I-32). Behavior-checked (`p1`).
- DO make the monitor a wake-on-changes loop over the handle
  (`for await ... ctx.changes(view)`) with diff-against-last-alerted (I-6 applied to a
  state view; I-31 conflation). Behavior-checked (`b6`-`b9`).
- DO end the loop by stream close on scope dispose (I-10 radius for this task).
  Behavior-checked (monitor promise awaited under timeout after dispose in `b6b` and
  every `monitored` scenario).
- DO receive the alert capability via the `alertChannel` tag in deps (I-4/I-5).
  Behavior-checked (checker wires a recording flow through the tag).

DON'Ts:
- DON'T declare a second atom holding the derived at-risk value via
  `controller(readings, { resolve: true, watch: true })` (the invoice-triage I-11 shape)
  — this task's derived value must not own state. `preference` (behavior twin possible;
  the transplant disproof shows the natural version fails `b3/b5/b7/b8`).
- DON'T suppress wakeups by cardinality or last-count comparison — misses same-size
  swaps. Behavior-checked (`b4`, `b7`).
- DON'T merge new readings into the stored reading. Behavior-checked (`b5`).
- DON'T keep an add-only alerted set — breaks re-entry alerts. Behavior-checked (`b8`).
- DON'T reach the scope from factories or export scope-taking view factories —
  `lint:pumped/no-scope-reach`, `lint:pumped/no-scope-argument`.
- DON'T compose module-level mutable alert logs into factories —
  `lint:pumped/no-module-state`.
- DON'T name handles with kind suffixes (`readingsAtom`, `watchFlow`) —
  `lint:pumped/no-definition-handle-suffix`.
- DON'T do ambient IO in factories outside composition paths —
  `lint:pumped/no-ambient-io-outside-boundary`.

## Why the executed attacks fail (proofs in adversarial/*/verdict.json)

- Transplant (invoice-triage mechanisms: watch-derived atom + `shallowEqual` +
  merge-style `ctrl.update` + count-suppressed changes-loop + add-only alerted set):
  fails 5/13 — `d1` (shallowEqual is order-sensitive and rejects arrays outright),
  `b3` (its eq never suppresses, 3 spurious notifications), `b5` (merge keeps stale
  `note`), `b7` (count suppression misses the swap), `b8` (add-only set never
  re-alerts).
- Fake (select consumed correctly, but `sameRoomSet` compares cardinality and the
  alerted set is add-only): fails 4/13 — `d1`, `b4`, `b7`, `b8`.
- Both adversarials are LINT-CLEAN (0 diagnostics) — recorded deliberately: the lint
  gate does not catch either attack; only the behavioral checker does.

## Residual gaming risk (recorded, not hidden)

- A hand-rolled behavior twin (own subscription bookkeeping reproducing select+eq
  semantics without `scope.select`, e.g. a module wrapping `scope.on`/controller
  subscriptions behind a handle-shaped object) would pass every behavioral check. The
  checker measures behavior, not vocabulary; G6 quote-grading (dkr-3b sec.1) is the
  layer that kills it. Lint narrows (`no-module-state`, `no-scope-argument`) but does
  not close this.
- A polling monitor (interval + set diff) would pass the alert checks; `no-naked-globals`
  /ambient-IO lint flags `setInterval` in factories, which narrows but a
  timer-smuggled-through-tag variant survives. Recorded as chal-3 material.
- `ctrl.set` vs `ctrl.update` cannot be separated behaviorally from outside (probe
  recorded above) — D2's mechanism half is review-only by necessity.
