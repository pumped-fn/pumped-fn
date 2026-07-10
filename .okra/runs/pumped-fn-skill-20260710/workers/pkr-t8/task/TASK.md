# Task T-8: Severe-weather alert fan-out

Build the alert fan-out for a mountain weather station. Use `@pumped-fn/lite` (provided in
the workspace) for composition. Everything else is plain TypeScript — no other runtime
dependencies.

## Domain rules

An alert is `{ severity: "watch" | "warning"; text: string; hour: number }`, where `hour`
is the station's local hour 0–23 at which the alert is issued (supplied by the caller —
never read a clock).

- **R1 Delivery channels.** A delivery channel is a named capability
  `{ name: string; send: (alert) => Promise<{ delivered: boolean }> | { delivered: boolean } }`.
  Channels are registered at process wiring time — one deployment registers radio + siren,
  another only radio, a third radio + siren + valley-SMS. Feature code must not know,
  name, or enumerate concrete channels; adding a channel to a deployment must require
  touching only that deployment's wiring.
- **R2 Fan-out.** `issueAlert` delivers the alert through EVERY registered channel — each
  registered channel's `send` is invoked exactly once with the issued alert.
- **R3 Accounting.** `issueAlert` resolves to
  `{ attempted: number; delivered: number; suppressed: boolean }`: `attempted` counts all
  registered channels it tried, `delivered` counts those whose receipt was
  `{ delivered: true }`. A channel returning `{ delivered: false }` counts attempted but
  not delivered. With zero channels registered the result is
  `{ attempted: 0, delivered: 0, suppressed: false }`.
- **R4 Failure isolation.** A channel whose `send` throws still counts as attempted (its
  `send` is genuinely invoked) and as not delivered, and it must not prevent or delay any
  other channel's delivery. The result still resolves (never rejects for a channel
  failure).
- **R5 Failure visibility.** Each channel attempt must run as a distinct traced execution
  whose name contains that channel's `name`. A throwing channel's attempt must surface
  through the execution pipeline as exactly one failed traced execution carrying that
  channel's name — visible to any installed observer extension, not swallowed invisibly.
  (Catching the failure for R4's accounting is required; making the edge itself invisible
  is not allowed.)
- **R6 Quiet hours (optional wiring-time setting).** A deployment MAY configure a quiet
  window `{ startHour: number; endHour: number }` (no wrap; `startHour < endHour`) at
  wiring time. When configured and `startHour <= alert.hour < endHour`, a `"watch"` is
  suppressed: result `{ attempted: 0, delivered: 0, suppressed: true }` and NO channel is
  invoked. A `"warning"` always goes out. When the setting is absent, everything goes out
  — feature code must handle absence through declared optionality, not defaults sprinkled
  inline and not a required setting.
- **R7 Determinism.** No clocks, timers, randomness, or environment reads anywhere in
  product code or tests.

## Deliverables (fixed paths — the grader imports these)

- `src/alerts.ts` — exports `issueAlert` plus the two wiring points `channel` and
  `quietHours`. The grading harness composes deployments and executes exactly like this:

  ```ts
  import { channel, issueAlert, quietHours } from "./src/alerts.ts"

  const scope = createScope({
    tags: [
      channel({ name: "radio", send: (alert) => ({ delivered: true }) }),
      channel({ name: "siren", send: (alert) => ({ delivered: true }) }),
      quietHours({ startHour: 1, endHour: 5 }),   // optional — some deployments omit it
    ],
  })
  const session = scope.createContext()
  const outcome = await session.exec({
    flow: issueAlert,
    input: { severity: "watch", text: "light snow", hour: 3 },
  })
  ```

  The harness registers two OR three channels, or none, and runs with and without
  `quietHours` — same `issueAlert`, different `createScope` wiring only.
- `tests/` — vitest tests proving, with fake channels that keep call logs: full fan-out
  count AND per-channel receipt of the alert, one-throwing-channel accounting with the
  failure observed in traces, and both quiet-hours wirings (configured and absent) —
  swapping only wiring, never patching modules.
- `bin/main.ts` — runnable demo (`npx tsx bin/main.ts`): wires two console-backed channels
  plus a quiet window, issues one warning and one watch inside the window, prints the two
  outcomes as JSON to stdout.

## Gates your submission must pass

1. `node <lint-cli> --max-warnings 0 src bin tests` — zero diagnostics.
2. `tsgo --noEmit` (strict).
3. `vitest run` — your tests pass.
4. `npx tsx bin/main.ts` — prints a delivered warning outcome and a suppressed watch outcome.
5. The behavioral grading harness (real execution of your exports against R1–R7, with
   call-logging fake channels and an observer extension).
