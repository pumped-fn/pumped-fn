All gates pass. Summary:

**Files written:**
- `src/holdshelf.ts` — exports `recordReturn`, `recordReturns`, `drainPass`, `runDispatcher`, `requestStop`, `listHolds`, `printerReport`. State lives in four scope-singleton `keepAlive` atoms (`shelf`, `printer`, `wake`, `stopping`). Atomicity for R1–R7 comes from doing each check-then-commit as one synchronous stretch (no `await` in between) inside `atom.controller().update()`, which JS guarantees can't be interleaved by concurrent calls. `wake` is a pure signal bumped only after a commit lands (I-6/I-7); `runDispatcher` drains from `shelf` state directly rather than trusting the wake atom's value, so coalesced/conflated wakeups never lose work.
- `bin/daemon.ts` — starts the dispatcher, records 3 returns (1 single + 1 batch of 2), stops via `requestStop`, also wires `SIGINT` to the same shutdown path, prints `{ holds, sessions }` JSON, exits 0.
- `tests/holdshelf.test.ts` — 16 tests covering recording/races/batches (R1–R3), concurrent drain partitioning and session sequencing (R4–R6), the jam/recovery flow (R7), dispatcher wake/shutdown semantics including "committed exactly at stop time" and "failed batch never observed" (R3, R8–R9), and cross-context persistence (R10).

**Gate outputs (verbatim):**

```
$ npx pumped-lite-lint --max-warnings 0 src bin tests
pumped-lite-lint: 3 files scanned, 0 diagnostics

$ npx tsgo --noEmit
(no output — clean)

$ npx vitest run
 ✓ tests/holdshelf.test.ts (16 tests) 24ms
 Test Files  1 passed (1)
      Tests  16 passed (16)

$ npx tsx bin/daemon.ts; echo "EXIT: $?"
{... all 3 holds "printed", 1 session "closed":"clean" ...}
EXIT: 0
```
