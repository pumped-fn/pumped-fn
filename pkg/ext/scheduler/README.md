# @pumped-fn/lite-extension-scheduler

A recurring-schedule extension for `@pumped-fn/lite`: `schedule()` returns a `keepAlive` atom whose
resolved value is a registration (`{ trigger, next, stop }`) against a pluggable `SchedulerBackend`.
This package does not import or ship a durable backend — only an in-process, non-persistent one for
dev/test.

## Contract

```ts
interface Scheduler.Backend {
  register(
    spec: {
      name: string
      cadence: { cron: string } | { every: string }
      overlap: "skip" | "queue"
      catchUp: "skip" | "last" | "all"
    },
    tick: (run: { key: string; scheduledAt: Date }) => Promise<void>
  ): { trigger(): Promise<void>; next(): Date | undefined; stop(): Promise<void> }
}
```

- `scheduler.backend` — a required tag (`tags.required(scheduler.backend)`) that `schedule()` reads
  off the scope. Wire your own `SchedulerBackend` (durable, distributed, whatever) via
  `createScope({ tags: [scheduler.backend(myBackend)] })`.
- `scheduler.schedule({ name?, cadence, overlap?, catchUp?, flow, input })` — returns a `keepAlive`
  atom. Resolving it calls `backend.register(...)` once and returns the registration. On scope
  disposal, `ctx.cleanup` calls `registration.stop()`. `name` defaults to the flow's own `name`;
  if neither is set, `schedule()` throws immediately. Each tick creates a fresh
  `ctx.scope.createContext(...)`, execs `flow` with `input()`, and closes the context (`ok: true` on
  success, `ok: false` with the error otherwise) — the error is rethrown after `close()` so the
  backend's tick promise rejects, which its own `overlap` bookkeeping depends on.
- `scheduler.inProcess()` — croner-based backend, **dev/test grade only, not durable**: no
  persistence, no distributed coordination, ticks are lost across process restarts.
  - `cadence: { cron }` — a standard cron expression, parsed by
    [`croner`](https://github.com/hexagon/croner).
  - `cadence: { every }` — a plain string of **milliseconds** (e.g. `"5000"` for every 5s). There is
    no duration-string parser here; if you need `"5m"`-style parsing, convert it yourself before
    passing `every`.
  - `overlap: "skip"` — if the previous tick's promise hasn't resolved, the next tick is dropped
    entirely (not queued).
  - `overlap: "queue"` — the next tick's `tick()` call is chained after the previous tick's promise
    settles (a simple `.then()` chain, no queue library, no backpressure limit).
  - `catchUp` — `inProcess` has no persistence to catch up *from*, so only `"skip"` is accepted;
    `"last"`/`"all"` throw immediately from `register()` pointing at "a durable backend".

## Example

```ts
import { createScope } from "@pumped-fn/lite"
import { scheduler } from "@pumped-fn/lite-extension-scheduler"
import { sweepExpired } from "./flows"

const nightlySweep = scheduler.schedule({
  name: "nightly-sweep",
  cadence: { cron: "0 2 * * *" },
  flow: sweepExpired,
  input: () => undefined,
})

const scope = createScope({ tags: [scheduler.backend(scheduler.inProcess())] })
const registration = await scope.resolve(nightlySweep)
registration.next() // next scheduled Date, or undefined
await registration.trigger() // run one tick immediately, awaiting it
await scope.dispose() // stops the registration
```
