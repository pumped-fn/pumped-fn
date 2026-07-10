# Task T-2: Library hold-slip printing

Build the hold-slip pipeline for a public library in TypeScript. When a reserved book is
returned, a hold is recorded; a long-running dispatcher prints pickup slips for pending
holds. Use `@pumped-fn/lite` (provided in the workspace) for composition. Everything else
is plain TypeScript — no other runtime dependencies.

## Domain rules

The shelf record tracks holds, each `{ holdId, isbn, copyId, status }`. Statuses visible
at rest are `pending`, `printed`, and `rejected`.

- **R1 Recording.** `recordReturn` takes `{ isbn, copyId }`, commits one hold with status
  `pending`, and returns `{ holdId }`. Hold ids are numbered consecutively from 1 in
  commit order for the life of the shelf record. A `copyId` that already has an
  unfulfilled hold (recorded but not yet printed) must fail with code `HOLD_EXISTS` and
  commit nothing — including when two calls for the same `copyId` race: exactly one wins.
  Once a hold's slip is printed, the same `copyId` may be held again.
- **R2 Batch recording.** `recordReturns` takes `{ returns: [{ isbn, copyId }, ...] }` and
  commits ALL of them or NONE of them, returning `{ holdIds }`. A duplicate — against the
  shelf or within the batch — fails the whole batch with `HOLD_EXISTS`.
- **R3 New-work signal.** Committed holds must become drainable without polling: no
  timers, no periodic checks. The "there is new work" signal must fire only once a
  commit is complete. A batch that fails must never be acted on: even a dispatcher that
  is ALREADY awake and draining concurrently must never print a slip for, or otherwise
  observe, a hold from a failing batch.
- **R4 Drain pass.** `drainPass` (no input) is one drain: it takes every hold currently
  `pending` from the shelf record — the shelf record is the source of work, whatever
  the notification carried — prints one slip per hold, and returns
  `{ session, printed }`. Concurrent or sequential drain passes on the same daemon
  runtime must each print every taken hold exactly once: a hold taken by one pass must
  never be printed by another.
- **R5 Printer sessions.** Printing goes through a printer session. Every drain pass —
  including a pass that finds nothing pending — opens its OWN fresh session and the
  session ends exactly when that pass ends. Two passes must never share a session, no
  matter how they overlap. Sessions are numbered consecutively from 1 in open order for
  the life of the shelf record.
- **R6 Session close is outcome-bound.** Only when a pass ends successfully are its
  effects committed: its slips are flushed to the printer audit as one record
  `{ session, slips: [{ holdId, copyId }, ...], closed: "clean" }` (slips in print
  order) and its taken holds become `printed`. Both effects must be visible to the next
  operation on the same runtime immediately after the pass resolves — not at daemon
  shutdown.
- **R7 Jam.** The print head cannot render an `isbn` longer than 13 characters. Hitting
  one jams the printer and fails the ENTIRE pass with code `PRINTER_JAM`. The jammed
  session is recorded as `{ session, slips: [], closed: "dirty" }` — every slip it had
  printed so far is discarded. The offending hold becomes `rejected` (never retried);
  every other hold the pass had taken becomes `pending` again, so a later pass can
  print it (exactly once, on a fresh session).
- **R8 Dispatcher.** `runDispatcher` (no input) runs until stopped: it drains pending
  holds whenever the new-work signal fires (bursts may coalesce — nothing may be lost),
  performing each drain as a drain pass per R4–R6. It resolves to
  `{ passes, printed }` totals.
- **R9 Shutdown.** `requestStop` asks the dispatcher to stop. The dispatcher finishes
  the drain it is performing — and drains holds already committed at stop time — before
  resolving. After stop, every committed hold is `printed` (or `rejected`), none lost.
- **R10 Read model.** `listHolds` (no input) returns
  `Array<{ holdId, isbn, copyId, status }>` in holdId order. `printerReport` (no input)
  returns the session records in close order. Both reflect all committed effects, and
  the shelf record persists across daemon contexts for the life of the process run.

## Failure contract

A failed operation rejects with an error from which the code string (`HOLD_EXISTS`,
`PRINTER_JAM`) is recoverable by inspecting the error's `message`, its `fault` property
(JSON-stringified), or the same on any link of its `cause` chain.

## Deliverables (fixed paths — the grader imports these)

- `src/holdshelf.ts` — exports `recordReturn`, `recordReturns`, `drainPass`,
  `runDispatcher`, `requestStop`, `listHolds`, `printerReport`. Each export must be
  executable by the grading harness as:

  ```ts
  const scope = createScope()
  const daemon = scope.createContext()
  const result = await daemon.exec({ flow: recordReturn, input: { isbn, copyId } })
  ```

  (no-input flows: `daemon.exec({ flow: drainPass })`.)
- `tests/` — vitest tests covering the rules above. Deterministic — no sleeps, no
  retries-until-green.
- `bin/daemon.ts` — runnable demo (`npx tsx bin/daemon.ts`): starts the dispatcher,
  records at least three returns (single and batch), stops cleanly via `requestStop`,
  handles SIGINT the same way, prints the final holds and printer report as JSON to
  stdout, and exits 0.

## Gates your submission must pass

1. `node <lint-cli> --max-warnings 0 src bin tests` — zero diagnostics.
2. `tsgo --noEmit` (strict).
3. `vitest run` — your tests pass.
4. `npx tsx bin/daemon.ts` — prints a report where every hold is printed and every
   session closed clean.
5. The behavioral grading harness (real execution of your exports against R1–R10).
