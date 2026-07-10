# Task T-7: Chess tournament round generation

Build a small TypeScript library that generates pairing rounds for a Swiss-style chess
tournament. Use `@pumped-fn/lite` (provided in the workspace) for composition. Everything
else is plain TypeScript — no other runtime dependencies.

## Domain rules

A tournament session tracks a growing record of published rounds. A round is generated
from a list of entrants, each `{ id: string; points: number }`.

- **R1 Seeding.** Entrants are seeded by `points` descending; ties break by `id` ascending
  (`localeCompare`).
- **R2 Pairing.** Adjacent seeds are paired: seed 1 vs seed 2, seed 3 vs seed 4, and so
  on. A pairing is a two-element array `[higherSeedId, lowerSeedId]`.
- **R3 Bye.** With an odd number of entrants, the lowest seed receives the bye. A player
  may receive at most one bye per tournament (across all published rounds of the session).
  If the bye candidate already had one, the ENTIRE generation fails — no partial data of
  any kind may become visible in the tournament record. The failure must be identifiable
  by the code string `BYE_EXHAUSTED`.
- **R4 Validation.** A generation with fewer than 2 entrants, or with duplicate entrant
  ids, fails with code `INVALID_ENTRANTS` and publishes nothing.
- **R5 Round numbers.** Published rounds are numbered consecutively from 1 in the order
  they are published. Round numbers are assigned at publication, never earlier.
- **R6 Atomicity and isolation.** Each generation call is one atomic operation with its
  own private staging workspace. It either publishes one complete round or nothing.
  Multiple generation calls may run concurrently on the same session; they must never
  observe or disturb each other's staging, and each call's `staged` count (see R8)
  reflects only that call's own staged records.
- **R7 Sub-operations.** Round generation proceeds in two phases, each an independently
  executable operation that stages records into the current generation's workspace:
  - `pairEntrants` — input `{ entrants }`, pairs the given (even-sized) field per R1/R2,
    stages the pairings, and returns exactly `{ pairingCount: number }` — the pairing
    details themselves must NOT be part of the return value.
  - `assignBye` — input `{ candidate: string }`, enforces R3 against the published
    record, stages the bye, and returns `{ bye: string }`.
  Both must also work when executed standalone (outside any generation); a standalone
  execution never publishes anything to the tournament record.
- **R8 Generation result.** A successful generation resolves to
  `{ pairingCount: number; bye: string | null; staged: number }` where `staged` is the
  number of records (pairings + bye) staged by this operation. The result carries no
  round number (per R5 the number exists only at publication).
- **R9 Publication timing.** A successful generation's round is visible to any subsequent
  read on the same session immediately after the generation call resolves — before the
  session ends.
- **R10 Read model.** `listRounds` returns the published rounds in order:
  `Array<{ round: number; pairings: [string, string][]; bye: string | null }>`.
  The record persists for the life of the process run across session contexts.

## Failure contract

A failed operation rejects with an error from which the code string (`BYE_EXHAUSTED`,
`INVALID_ENTRANTS`) is recoverable by inspecting the error's `message`, its `fault`
property (JSON-stringified), or the same on any link of its `cause` chain.

## Deliverables (fixed paths — the grader imports these)

- `src/tournament.ts` — exports `generateRound`, `pairEntrants`, `assignBye`,
  `listRounds`. Each export must be executable by the grading harness as:

  ```ts
  const scope = createScope()
  const session = scope.createContext()
  const result = await session.exec({ flow: generateRound, input: { entrants } })
  ```

  (`listRounds` takes no input: `session.exec({ flow: listRounds })`.)
- `tests/` — vitest tests covering the rules above.
- `bin/main.ts` — runnable demo (`npx tsx bin/main.ts`): generates at least two rounds on
  one session and prints the round record as JSON to stdout.

## Gates your submission must pass

1. `node <lint-cli> --max-warnings 0 src bin tests` — zero diagnostics.
2. `tsgo --noEmit` (strict).
3. `vitest run` — your tests pass.
4. `npx tsx bin/main.ts` — prints a record containing a round 2.
5. The behavioral grading harness (real execution of your exports against R1–R10).
