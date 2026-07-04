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
      onError?: (error: unknown, run: { key: string; scheduledAt: Date }) => void
    },
    tick: (run: { key: string; scheduledAt: Date }) => Promise<void>
  ): { trigger(dedupKey?: string): Promise<void>; next(): Date | undefined; stop(): Promise<void> }
}
```

- `scheduler.backend` — a required tag (`tags.required(scheduler.backend)`) that `schedule()` reads
  off the scope. Wire your own `SchedulerBackend` (durable, distributed, whatever) via
  `createScope({ tags: [scheduler.backend(myBackend)] })`.
- `scheduler.schedule({ name?, cadence, overlap?, catchUp?, flow, input, onError?, tags? })` —
  returns a `keepAlive` atom. Resolving it calls `backend.register(...)` once and returns the
  registration. On scope disposal, `ctx.cleanup` calls `registration.stop()`. `name` defaults to the
  flow's own `name`; if neither is set, `schedule()` throws immediately. Each tick creates a fresh
  `ctx.scope.createContext(...)` with the scope's ambient tags plus `tags()` (if given — **not**
  `app.context()`, which is request-scoped and never runs for background ticks), execs `flow` with
  `input()`, and closes the context (`ok: true` on success, `ok: false` with the error otherwise) —
  the error is rethrown after `close()` so the immediate tick promise (e.g. what `trigger()` awaits)
  rejects, while the backend's own overlap chain does not die from it (see `onError` below).
- `onError` — called once per failed tick with the raw error and its `{ key, scheduledAt }`. The
  **default** (when `onError` is omitted) is to swallow the error after the fact: the tick's context
  already closed with `ok: false` and the error attached, so observability sees it there; nothing is
  logged or thrown from the backend's internal bookkeeping. A tick you triggered explicitly via
  `registration.trigger()` still rejects that call's promise regardless of `onError` — only the
  backend's own queue/timer plumbing swallows-by-default.
- `overlap: "queue"` chains ticks through a `.then()` chain that **always settles fulfilled**
  internally (a failed tick does not poison the chain) — the next queued tick still runs. Every
  backend (`inProcess`, `nats`) is expected to uphold this.
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
  - `trigger(dedupKey?)` — `dedupKey` is accepted for contract parity with distributed backends
    but ignored: a single `inProcess` instance is trivially deduped already (there is only ever
    one process running the tick).
  - `stop()` stops the underlying `croner`/interval job first (no new ticks start), then awaits any
    in-flight or queued tick before resolving.

## Backends

- `@pumped-fn/lite-extension-scheduler-nats` — a distributed backend built on NATS JetStream KV:
  exactly-once ticks across instances via KV `create`, `catchUp` derived from a `last:` key, and a
  run history/audit trail in the KV itself.

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
