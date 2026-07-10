All gates pass. Summary:

**Files written:**
- `src/climate.ts` — `readings` atom (`keepAlive: true`), `ingestReading` flow (wholesale replace via `controller(readings).update`), `atRiskOf`/`sameRoomSet` pure selector/equality functions, `alertChannel` tag (port for the alert flow), `watchAtRisk` flow (edge-triggered alerting over `ctx.changes(view)`, coalescing-safe).
- `bin/main.ts` — wires a console alert, starts the monitor, ingests at-risk + churn readings, prints the final at-risk list as JSON, shuts down cleanly.
- `tests/climate.test.ts` — 12 tests covering derivation/sortedness, set-content equality (incl. same-size swap in one replacement), wholesale replacement, notification suppression/triggering, edge-triggered alert semantics (entry/churn/re-entry), burst coalescing, and state surviving a zero-observer lull.

**Gate outputs (verbatim):**

```
$ npx pumped-lite-lint --max-warnings 0 src bin tests
pumped-lite-lint: 3 files scanned, 0 diagnostics

$ npx tsgo --noEmit
(no output — clean)

$ npx vitest run
 ✓ tests/climate.test.ts (12 tests) 12ms

 Test Files  1 passed (1)
      Tests  12 passed (12)

$ npx tsx bin/main.ts
ALERT: gallery "west" is at risk
["west"]
EXIT: 0
```
