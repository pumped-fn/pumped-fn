# Task T-1: Greenhouse control wiring

Build a small TypeScript library that wires the control plane of an automated greenhouse.
Use `@pumped-fn/lite` (provided in the workspace) for composition. Everything else is
plain TypeScript — no other runtime dependencies, no real network or hardware IO
(simulate devices in memory).

## Domain rules

A greenhouse deployment monitors temperature and adjusts roof vents. One codebase serves
many deployments; deployments differ only in how the composition root assembles them.

- **R1 Controller-bus connection.** All device commands go through one shared connection
  to the greenhouse controller bus. The connection is established once per running
  composition and must be released when the composition shuts down. Its value exposes
  `send(command: string): void`, `sent(): string[]` (commands so far, copies), and
  `isOpen(): boolean`. After the composition root shuts down, a previously obtained
  connection must report `isOpen() === false`. Tests and the grading harness must be able
  to substitute the whole connection with a recording double at composition time — every
  feature's commands must then arrive at the double.
- **R2 Site configuration.** Each deployment supplies
  `{ siteName: string; ventTargetC: number; alertThresholdC: number }` at composition
  time. It is ambient: features consume it without it being threaded through call
  parameters. Materializing any feature that needs it in a composition that did not
  supply it must fail immediately with an error that identifies the missing site
  configuration — never proceed with `undefined`.
- **R3 Readings.** `captureReading` — input `{ temperatureC: number }` — records the
  latest temperature for the running composition and returns `{ temperatureC }`.
- **R4 At-a-glance status.** `status` is a resolvable node giving
  `{ siteName: string; level: "no-data" | "ok" | "alert"; temperatureC: number | null }`.
  `no-data` before any reading; `alert` iff the latest `temperatureC >=
  alertThresholdC`; otherwise `ok`. When a new reading is captured, a subsequent resolve
  of `status` (after settling, e.g. `await scope.flush()`) must reflect it — status stays
  derived; it is never imperatively rebuilt by the features that capture readings.
- **R5 Vent drivers.** Two interchangeable drivers exist, both exported:
  - `servoDriver` (kind `"servo"`): applies the exact aperture — command
    `servo:set:<applied>`, `applied` = aperture rounded to an integer, clamped 0–100.
  - `stepperDriver` (kind `"stepper"`): moves in steps of 10 — command
    `stepper:step:<applied>`, `applied` = clamped aperture rounded to the nearest
    multiple of 10 (max 100).
  The composition root chooses the driver for a deployment at composition time via your
  exported `ventDriver` entry — switching drivers must require zero edits to any feature
  code. Running a vent adjustment in a composition that supplied no driver must fail
  loudly.
- **R6 Vent adjustment operation.** `runVentAdjustment` — input `{ temperatureC:
  number }` — is one operation composed of two sub-steps, each also independently
  executable:
  - `planVentChange` — input `{ temperatureC: number }` — computes the target aperture:
    `0` if `temperatureC <= ventTargetC`, else `min(100, round((temperatureC -
    ventTargetC) * 10))`; appends `plan:<aperturePct>` to the operation's work record and
    returns `{ recorded: number }` — the number of entries in that work record. The
    planned aperture is NOT part of the return value; the work record is the only
    channel that carries it to the apply step.
  - `applyVentChange` — no input — reads the latest planned aperture from the operation's
    work record; if none exists it fails with code `NO_PLAN` and sends nothing.
    Otherwise it asks the deployment's vent driver for `{ command, applied }`, sends the
    command on the controller-bus connection, appends `apply:<applied>` to the work
    record, and returns `{ applied: number; recorded: number }`.
- **R7 Work-record semantics.** Each execution of `runVentAdjustment` owns a private
  work record shared with the sub-steps it executes: `runVentAdjustment` returns
  `{ applied: number; log: string[] }` where `log` is exactly that operation's entries in
  order (`["plan:<n>", "apply:<n>"]`). Operations executed on the same session —
  sequentially or concurrently — must never observe each other's entries. A sub-step
  executed standalone (outside any adjustment) gets a fresh, empty work record of its
  own: a standalone `planVentChange` always returns `recorded: 1`, no matter what ran
  before it on the same session.
- **R8 Observability.** Sub-steps of an adjustment must be visible to observability
  tooling (extensions installed at composition time) as child executions named
  `vent.plan` and `vent.apply`.
- **R9 Weather outlook.** `fetchDailyOutlook` — no input — asks a foreign weather
  service for the day's forecast for the deployment's site and returns
  `{ siteName: string; highC: number }`. The weather service is a simulated client owned
  by your graph (default may return any fixed forecast) and must be substitutable at
  composition time. Every outbound forecast call must be visible to observability
  tooling as an execution named `weather.fetchForecast`.

## Failure contract

A failed operation rejects with an error from which the code or cause (`NO_PLAN`, the
missing site configuration) is recoverable by inspecting the error's `message`, its
`fault` property (JSON-stringified), or the same on any link of its `cause` chain. The
missing-site-configuration error text must identify the site configuration (contain
"site").

## Deliverables (fixed paths — the grader imports these)

- `src/greenhouse.ts` — exports `siteConfig`, `ventDriver`, `servoDriver`,
  `stepperDriver`, `connection`, `weatherService`, `readings`, `status`,
  `captureReading`, `planVentChange`, `applyVentChange`, `runVentAdjustment`,
  `fetchDailyOutlook`. The grading harness composes and executes them as:

  ```ts
  const scope = createScope({
    presets: [preset(connection, recordingBus), preset(weatherService, fakeWeather)],
    tags: [siteConfig({ siteName, ventTargetC, alertThresholdC }), ventDriver(stepperDriver)],
    extensions: [tracingExtension],
  })
  const session = scope.createContext()
  const result = await session.exec({ flow: runVentAdjustment, input: { temperatureC: 23.4 } })
  const glance = await scope.resolve(status)
  ```

  Any subset of the presets/tags shown may be omitted by the harness (that is how R2 and
  R5's loud-failure requirements are exercised).
- `tests/` — vitest tests covering the rules above. All substitution goes through scope
  creation (presets/tags/extensions) — no module mocks, no test-only branches.
- `bin/main.ts` — runnable demo (`npx tsx bin/main.ts`): composes one deployment,
  captures a reading, resolves `status`, runs one adjustment, fetches the outlook, and
  prints the results as JSON to stdout.

## Gates your submission must pass

1. `node <lint-cli> --max-warnings 0 src bin tests` — zero diagnostics.
2. `tsgo --noEmit` (strict).
3. `vitest run` — your tests pass.
4. `npx tsx bin/main.ts` — prints JSON containing a `status` with a `level`.
5. The behavioral grading harness (real execution of your exports against R1–R9).
