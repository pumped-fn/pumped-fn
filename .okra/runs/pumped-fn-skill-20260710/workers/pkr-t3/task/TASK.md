# Task T-3: Observatory nightly capture + archive upload

Build the scheduled-jobs core of a remote observatory station in TypeScript. The station
runs two recurring jobs with deliberately opposite delivery guarantees: a nightly
instrument capture (best-effort — a missed or busy window is simply lost) and an archive
upload (guaranteed — every window eventually runs). Use `@pumped-fn/lite` and
`@pumped-fn/lite-extension-scheduler` (both provided in the workspace) for composition
and scheduling. Everything else is plain TypeScript — no other runtime dependencies.

## Domain rules

### Capture job (`nightly-capture`)

- **R1 One exposure per run.** Each run takes exactly one exposure from the instrument
  and retains it locally as an unsent frame.
- **R2 Never two at once, never a backlog.** If a capture run is still going when the
  next one is due (or an operator fires one manually), the new run must be dropped
  outright — it must not start, and it must not run later. Once the station is idle
  again, the next due run proceeds normally.
- **R3 Missed windows are lost.** A capture window that passed while the station was
  offline is gone: on startup the job marks all such windows handled and does NOT run
  them. Capture must take zero exposures at startup.

### Upload job (`archive-upload`)

- **R4 Ship a manifest every run.** Each run collects ALL currently unsent frames, in
  capture order, and ships ONE manifest `{ readings: number[] }` to the archive — even
  when there are no frames (an empty manifest is still shipped). Frames count as sent
  only once the archive accepted the manifest; if the archive rejects it, every frame in
  it stays unsent and ships with the next run.
- **R5 Missed windows all run.** Every upload window that passed while the station was
  offline must run at startup: one run per missed window, oldest first, strictly one
  after another, before normal operation continues.
- **R6 Overlaps queue.** Upload runs never execute concurrently: a run that becomes due
  (or is manually fired) while another is executing waits and then runs. A failed run
  must not prevent queued or later runs from executing.

### Station platform

- **R7 Schedule history is durable and injected.** How far each job has progressed must
  survive a process restart. Persistence goes through a store handed to you; the wall
  clock and the recurring timer are handed to you the same way — `src/` must not touch
  ambient `Date`/timers. The exact interfaces (your module must export them):

  ```ts
  export interface ScheduleStore {
    load(name: string): { lastRunMs: number } | undefined
    save(name: string, state: { lastRunMs: number }): void
  }
  export interface BackendClock {
    nowMs(): number
    every(ms: number, onTick: () => void): () => void // returns cancel
  }
  ```

- **R8 History bookkeeping.** A window counts as handled the moment its run is attempted
  — or the moment it is deliberately dropped (R2) or lost (R3). The persisted state for
  a job always points at the latest handled window. A job registering with NO persisted
  state records "now" as its baseline and runs nothing.
- **R9 Scheduling goes through the scheduler extension.** Both jobs must be declared
  with the extension's `schedule()` (they are resolvable atoms), and the recurring
  machinery must be your own implementation of the extension's `Scheduler.Backend`
  contract, wired in as the extension prescribes. Job cadences use the `{ every }`
  (milliseconds) form; your backend only needs to support `{ every }`.
- **R10 Stopping is clean.** A registration's `stop()` — and disposing the scope —
  resolves only after every in-flight and queued run has settled. After stop, no further
  runs start and `next()` returns `undefined`.

## Deliverables (fixed paths — the grader imports these)

- `src/observatory.ts` — exports:
  - `instrument` — atom, value shape `{ read(): Promise<number> }` (one exposure)
  - `archive` — atom, value shape `{ send(manifest: { readings: number[] }): Promise<void> }`
  - `nightlyCapture`, `archiveUpload` — the two flows
  - `captureJob`, `uploadJob` — the two scheduled-job atoms (named `nightly-capture`
    and `archive-upload`)
- `src/backend.ts` — exports `createObservatoryBackend(deps: { store: ScheduleStore;
  clock: BackendClock }): Scheduler.Backend` plus the `ScheduleStore` and `BackendClock`
  interfaces above.
- `tests/` — vitest tests covering the rules above. Deterministic — no sleeps against
  real time, no retries-until-green.
- `bin/daemon.ts` — runnable demo (`npx tsx bin/daemon.ts`): runs the station through
  two phases sharing one persisted schedule state — a first boot, then a simulated
  restart three upload windows later — and prints as JSON evidence that upload ran once
  per missed window while capture replayed nothing; exits 0.

The grader builds `createObservatoryBackend({ store, clock })` itself — with its own
store contents and a frozen clock — wires it in as the scheduler backend, presets
`instrument`/`archive` with recorders, then resolves YOUR `captureJob`/`uploadJob` and
drives them through `trigger()`, registration-time behavior, and `stop()`/dispose. Your
jobs pass only if the runs the grader observes are produced by your production flows.

## Gates your submission must pass

1. `node <lint-cli> --max-warnings 0 src bin tests` — zero diagnostics.
2. `tsgo --noEmit` (strict).
3. `vitest run` — your tests pass.
4. `npx tsx bin/daemon.ts` — the two-phase demo prints its evidence and exits 0.
5. The behavioral grading harness (real execution of your exports against R1–R10).
