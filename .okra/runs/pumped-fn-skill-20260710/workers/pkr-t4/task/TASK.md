# Task T-4: Scooter-fleet telemetry daemon with audit trail

Build a telemetry daemon for a shared e-scooter fleet. Use `@pumped-fn/lite` (provided in
the workspace) for composition. `zod` is also provided for wire-input validation.
Everything else is plain TypeScript — no other runtime dependencies.

## Domain rules

Scooters report their position over an untrusted wire; operations staff sweep the fleet
for low batteries and dispatch pickups through a foreign fleet-ops HTTP client. Every
operation the process runs — and every unit the library resolves to run it — must land in
one bounded, queryable audit trail installed once, where the process is wired.

- **R1 Position reports.** `reportPosition` accepts one untrusted JSON value in one of two
  wire shapes:
  - `{ "kind": "gps", "scooterId": string, "lat": number, "lng": number, "batteryPct": number }`
  - `{ "kind": "cell", "scooterId": string, "cellId": string, "batteryPct": number }`

  A malformed value must be rejected with an error that names the offending field
  (recoverable from the error's message/fault/cause chain) and must leave the stored fleet
  state untouched. An accepted report replaces that scooter's stored telemetry wholesale.
  Validation happens once, at the wire; internal handoffs are typed and never re-validated.
- **R2 Low-battery sweep.** `lowBatterySweep` dispatches a pickup for every scooter whose
  last reported `batteryPct` is below 15, by calling `dispatchPickup(scooterId)` on the
  fleet-ops client. The client is a capability
  `{ dispatchPickup: (scooterId: string) => Promise<{ accepted: boolean }> }` supplied at
  process wiring time — product code must not construct or import a concrete client.
  Pickups are dispatched in the order the positions were reported. Each client call must
  be visible to any installed observer as a distinct execution named
  `fleetops.dispatchPickup`. If a dispatch is rejected by the client, the sweep itself
  fails with a structured failure carrying the scooter id; dispatches already made stay
  made. On success the sweep returns `{ dispatched: string[] }`.
- **R3 Audit trail.** Ship `auditTrail`, a factory returning `{ extension, entries }`:
  `extension` observes the process when installed at wiring time; `entries()` returns the
  recorded trail. Each entry is
  `{ kind: "exec" | "resolve", name: string, parent: string | null, ok: boolean, durationMs: number }`:
  - one `"exec"` entry per executed operation or named client call, `ok` reflecting
    whether it succeeded, `parent` naming the operation it ran inside (`null` at the top
    level). Operations appear under the names `report-position` and `low-battery-sweep`;
    client calls under `fleetops.dispatchPickup`.
  - one `"resolve"` entry per unit the library resolves while running operations (for
    example the fleet state store), with a non-empty `name` and `parent: null`.
  - entries appear in completion order: an inner execution's entry precedes the entry of
    the operation it ran inside.
  - a sweep in which one dispatch succeeds and a later one is rejected must leave BOTH
    failure entries: a failed `fleetops.dispatchPickup` entry (parent
    `low-battery-sweep`) and a failed `low-battery-sweep` entry — plus the succeeding
    dispatch's `ok: true` entry.
  - the trail is a ring buffer holding exactly the last 100 entries; older entries are
    evicted oldest-first.
  - durations are measured with a clock `() => number` supplied at wiring time — never a
    literal clock in product code.
- **R4 One shipped composition root.** The process is wired in exactly one exported
  function, `createApp`, and `bin/daemon.ts` must build its app through it — the same
  root the grading harness drives. `createApp` receives the fleet-ops client and the
  clock, installs the audit trail, and exposes the trail's query:

  ```ts
  import { createApp } from "./src/wire.ts"
  import { lowBatterySweep, reportPosition } from "./src/telemetry.ts"

  const app = createApp({ fleetOps: myClient, now: myClock })
  const session = app.scope.createContext()
  await session.exec({ flow: reportPosition, rawInput: JSON.parse(line) })
  await session.exec({ flow: lowBatterySweep })
  await session.close()
  const entries = app.trail()
  ```

  The grading harness composes apps exactly like this — its own scripted client, its own
  counter clock — and then asserts that the very operations it drove are what `app.trail()`
  observed. An audit trail that is only installed inside your tests cannot satisfy this.
- **R5 Daemon.** `bin/daemon.ts` (`npx tsx bin/daemon.ts`): builds the app via
  `createApp` with a locally-defined canned client, reads JSON lines from stdin, feeds
  each line to `reportPosition` (a malformed line prints one structured rejection naming
  the offending field to stderr and does not crash the daemon), on stdin end runs one
  `lowBatterySweep`, dumps the audit trail as JSON to stdout, and exits 0.
- **R6 Determinism.** No clocks, timers, randomness, or environment reads in product code
  or tests; tests supply a counter clock and a scripted client at wiring.

## Deliverables (fixed paths — the grader imports these)

- `src/telemetry.ts` — exports the flows `reportPosition` and `lowBatterySweep`, the
  wiring point `fleetOps`, and the `FleetOps` type.
- `src/audit.ts` — exports the `auditTrail` factory and the `AuditEntry` type.
- `src/wire.ts` — exports `createApp(options: { fleetOps: FleetOps; now: () => number })`
  returning `{ scope, trail }` as shown above.
- `bin/daemon.ts` — the runnable daemon (R5).
- `tests/` — vitest tests proving, with a scripted client and counter clock swapped in at
  wiring (never by patching modules): both wire shapes are accepted and drive the sweep
  correctly; a malformed report yields the field-naming error and stores nothing; the
  sweep dispatches exactly the under-15% scooters in report order; the dual
  nested-failure trail entries of R3; ring eviction after driving more than 100 entries
  (assert what remains AND what was evicted); resolve entries and exec entries both
  present and distinct.

## Gates your submission must pass

1. `node <lint-cli> --max-warnings 0 src bin tests` — zero diagnostics.
2. `tsgo --noEmit` (strict).
3. `vitest run` — your tests pass.
4. `printf '<json lines>' | npx tsx bin/daemon.ts` — daemon smoke, exit 0.
5. The behavioral grading harness: real execution of `createApp` and the public flows
   against R1–R6 with a scripted client, a counter clock, and a source-level scan for the
   wire-validation boundary.
