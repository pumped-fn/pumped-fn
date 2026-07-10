# Task T-10: Ferry-terminal departure board

Build the display layer for a harbor ferry terminal's departure board. Use
`@pumped-fn/lite` (provided in the workspace) for composition. Everything else is plain
TypeScript — no other runtime dependencies.

## Domain rules

- **R1 Board hardware client.** Opening a session against the physical board is
  expensive. Start from this scaffold, placed in `src/board-link.ts` (you may extend it,
  but keep these shapes):

  ```ts
  export type Departure = { vessel: string; at: string }

  export interface BoardSession {
    readonly address: string
    render(departures: Departure[]): void
    close(): void
  }

  export interface BoardLink {
    open(address: string): BoardSession
  }
  ```

  The production `BoardLink` renders by printing JSON to stdout. Tests must swap the
  `BoardLink` for a call-logging fake **at wiring only** — no module mocks, no
  conditionals in product code.

- **R2 One live session.** The process holds at most ONE live board session at a time.
  It is opened lazily — the first time something actually renders, not at startup, not
  when the address changes — and it stays open across renders.

- **R3 Address.** The board's network address lives in process state. The initial
  address is `"harbor-main"`.

- **R4 Retarget.** An operator can retarget the board at runtime via a `retarget`
  operation with input `{ address: string }`, returning `{ address: string }`. After a
  retarget to a DIFFERENT address:
  - the live session (if any) is closed immediately;
  - no new session is opened until the next render (see R2 — lazy);
  - the next render opens a session against the new address and renders to it; the old
    session's `close` must precede the new session's `open`.
  A retarget to the CURRENT address must leave the live session untouched — no close, no
  reopen. The render path must not know retargeting exists, and the retarget path must
  not touch the session: the re-establishment happens through your composition, not by
  hand in either operation.

- **R5 Render.** A `renderDepartures` operation: input
  `{ departures: { vessel: string; at: string }[] }`, renders the departures to the
  current session (opening it first if needed per R2), returns
  `{ rendered: number }` — the number of departures rendered.

- **R6 Shutdown.** Closing the execution context closes the live session (exactly once).
  If a retarget happened and nothing rendered afterwards, shutdown must not open a
  session just to close it.

- **R7 Process isolation.** Nothing may leak between two independently wired boards: a
  fresh scope starts back at `"harbor-main"` with no session, regardless of what an
  earlier scope did. Deterministic tests — no timers, no sleeps.

## Deliverables (fixed paths — the grader imports these)

- `src/board-link.ts` — exports the `Departure`, `BoardSession`, `BoardLink` shapes
  above and `boardLink`, the swap point for the hardware client (this is what tests and
  the grader replace at wiring).
- `src/board.ts` — exports `displayAddress` (the address state), `displayFeed` (the
  active feed the session tracks), `displaySession` (the live board session),
  `renderDepartures`, `retarget`. The grader drives them as:

  ```ts
  const scope = createScope({ presets: [preset(boardLink, fakeLink)] })
  const ctx = scope.createContext()
  await ctx.exec({ flow: renderDepartures, input: { departures } })
  await ctx.exec({ flow: retarget, input: { address: "north-quay" } })
  await ctx.close()
  ```

- `tests/` — vitest tests proving: renders reach the session; a retarget closes the old
  session before a subsequent render's new open (assert open/close/render ORDER on a
  fake BoardLink's call log); a same-address retarget keeps the session; shutdown closes
  the live session.
- `bin/board.ts` — runnable demo (`npx tsx bin/board.ts`): wires the real BoardLink,
  renders one canned frame, shuts down cleanly, exit 0.

## Gates your submission must pass

1. `node <lint-cli> --max-warnings 0 src bin tests` — zero diagnostics.
2. `tsgo --noEmit` (strict).
3. `vitest run` — your tests pass.
4. `npx tsx bin/board.ts` — renders one frame, exits 0.
5. The behavioral grading harness (real execution of your exports against R1–R7).
