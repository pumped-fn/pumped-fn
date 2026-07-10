# Task T-6: Museum gallery climate watch

Build the state core for a museum's gallery climate monitor. Use `@pumped-fn/lite`
(provided in the workspace) for composition. Everything else is plain TypeScript — no
other runtime dependencies.

## Domain rules

Each gallery reports readings `{ tempC: number; rh: number; note?: string }` (relative
humidity in percent; `note` is an optional technician annotation). A gallery is **at
risk** when its humidity is strictly outside the 40–55% band (`rh < 40 || rh > 55`;
exactly 40 or 55 is safe).

- **R1 Readings state.** The latest reading per gallery is held in process state, keyed
  by gallery id. The state must survive periods with zero observers — a lull in
  monitoring must never reset it.
- **R2 Ingestion.** `ingestReading` — input `{ galleryId: string; tempC: number;
  rh: number; note?: string }` — replaces that gallery's reading **wholesale**. Set
  semantics, not merge: after re-ingesting a gallery without `note`, no `note` from an
  earlier reading may remain.
- **R3 Derived at-risk view.** The at-risk gallery ids (`string[]`, sorted ascending)
  are a **selected slice of the readings state** — not a separately-declared derived
  atom holding its own state, and no manual subscription or event-emitter code. The
  slice is defined by two pure exported functions:
  - `atRiskOf(state): string[]` — the selector: at-risk ids, sorted ascending.
  - `sameRoomSet(prev, next): boolean` — equality over at-risk lists **by set
    contents**: `true` exactly when both contain the same ids, regardless of listing
    order; never by reference, length, or element position.
  Consumers subscribed to the slice must NOT be re-notified when a new reading leaves
  the at-risk set unchanged (churn on safe galleries, or new values for a gallery that
  stays at risk), and MUST be notified when the set's membership changes — including a
  same-size membership swap in a single state replacement.
- **R4 Monitor loop.** `watchAtRisk` — input `{ view }`, where `view` is the live
  at-risk slice handle built at the composition root — wakes when the at-risk set
  changes and asks a conservator-alert capability to send one alert per newly at-risk
  gallery. It is wake-driven, not polling. Alert semantics:
  - Galleries already at risk when the monitor starts are alerted once.
  - A gallery entering the at-risk set is alerted exactly once; it is NOT re-alerted
    while it stays at risk, whatever reading churn occurs.
  - A gallery that recovers and later re-enters the at-risk set is alerted again.
  - Rapid reading bursts may coalesce wakeups — that must be safe: no missed
    newly-at-risk gallery, no duplicate alert.
  - The loop ends when the scope is disposed; `watchAtRisk` then resolves.
- **R5 Alert capability.** The conservator-alert operation is supplied at wiring time
  (deployments differ; tests and the grader supply a recording implementation). Export
  `alertChannel`, the wiring point a deployment fills when it creates its scope.
- **R6 State writes.** All readings-state writes replace the whole state value in one
  step (build the next map, then store it) — no in-place mutation of the stored value.

## Deliverables (fixed paths — the grader imports these)

- `src/climate.ts` — exports `readings` (the state), `ingestReading`, `watchAtRisk`,
  `alertChannel`, `atRiskOf`, `sameRoomSet`. The grading harness drives them as:

  ```ts
  const scope = createScope({ tags: [alertChannel(recordingAlertFlow)] })
  await scope.resolve(readings)
  const view = scope.select(readings, atRiskOf, { eq: sameRoomSet })
  const session = scope.createContext()
  const monitor = session.exec({ flow: watchAtRisk, input: { view } })
  await session.exec({ flow: ingestReading, input: { galleryId: "west", tempC: 20, rh: 62 } })
  ```

  (`recordingAlertFlow` is a grader-supplied flow with input `{ galleryId: string }`.)
- `tests/` — vitest tests proving: derivation and sortedness; notification suppression
  when the set is unchanged plus notification on membership change; wholesale reading
  replacement; edge-triggered alerting (once on entry, silent on churn, re-alert on
  re-entry); burst coalescing safety (drive many updates, assert the exact alert set);
  the alert capability swapped in tests; state surviving a zero-observer period.
- `bin/main.ts` — runnable demo (`npx tsx bin/main.ts`): wires a console alert, starts
  the monitor, ingests a few readings (at least one at-risk gallery and one churn
  update), prints the final at-risk list as JSON to stdout, and shuts down cleanly.

Deterministic throughout: no wall-clock or randomness in behavior; timers only as
settle-waits in tests.

## Gates your submission must pass

1. `node <lint-cli> --max-warnings 0 src bin tests` — zero diagnostics.
2. `tsgo --noEmit` (strict).
3. `vitest run` — your tests pass.
4. `npx tsx bin/main.ts` — prints the at-risk list, exits 0.
5. The behavioral grading harness (real execution of your exports against R1–R6).
