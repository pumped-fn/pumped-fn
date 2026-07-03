# @pumped-fn/lite-extension-scheduler-nats

A distributed `SchedulerBackend` for `@pumped-fn/lite-extension-scheduler`, built on NATS JetStream
KV. Multiple process instances can register the same schedule and coordinate through a shared KV
bucket: only one instance runs any given scheduled tick, and a `last:` key lets late-joining or
restarted instances catch up on what they missed.

## Semantics

| What NATS gives | What stays local |
| --- | --- |
| Exactly-once execution per scheduled tick, via KV `create` (exclusive — fails if the run key already exists); the winner runs the tick, losers skip silently. | Timing: each instance runs its own `croner` job (or interval) for the cadence, exactly like `scheduler.inProcess()` — NATS adds distributed coordination on top, it does not replace the clock. |
| Catch-up on restart/rejoin, via a `last:<name>` key updated after every completed tick; `catchUp: "last"`/`"all"` derive missed scheduled times from croner's run enumeration and replay them through the same lock path. | `overlap: "skip"`/`"queue"` — governs successive ticks piling up **on one instance** (e.g. a slow tick still running when the next timer fires). The KV lock already makes cross-instance overlap for the *same* scheduled tick a non-issue. |
| A run history/audit trail in the KV: each run key holds a JSON marker (`startedAt`, `host`, then `completedAt` or `failedAt`/`error`) that `history` (`kv.history()`/`kv.get()`) can inspect after the fact. | `trigger()` — a manual, immediate tick (`scheduledAt = now`) that goes through the identical lock path, so concurrent manual triggers across instances are also exactly-once. |

## Usage

```ts
import { connect } from "@nats-io/transport-node"
import { createScope } from "@pumped-fn/lite"
import { scheduler } from "@pumped-fn/lite-extension-scheduler"
import { nats } from "@pumped-fn/lite-extension-scheduler-nats"
import { sweepExpired } from "./flows"

const connection = await connect({ servers: "nats://localhost:4222" })

const nightlySweep = scheduler.schedule({
  name: "nightly-sweep",
  cadence: { cron: "0 2 * * *" },
  catchUp: "last",
  flow: sweepExpired,
  input: () => undefined,
})

const scope = createScope({
  tags: [scheduler.backend(nats({ connection, bucket: "scheduler", history: { ttlMs: 7 * 24 * 60 * 60 * 1000 } }))],
})
await scope.resolve(nightlySweep)
```

## `nats(options)`

- `connection` — a `NatsConnection` the caller owns. This backend never connects or closes it; it
  only opens/creates a KV bucket on top of the connection you give it.
- `bucket` — KV bucket name, defaults to `"scheduler"`.
- `history.ttlMs` — if given, applied as the bucket's TTL **only when the bucket is created for the
  first time**. If the bucket already exists, its existing stream config (including any TTL) is left
  alone — this backend never attempts to alter an existing bucket's limits.

## Keys

- `run.<name>.<scheduledAt, colon-free ISO>` — one key per scheduled tick. Written by `create` (the
  lock), then updated by `put` on completion or failure.
- `last.<name>` — the ISO timestamp of the most recently *completed* tick, updated after every
  successful run. Read once at `register()` time to derive missed ticks for `catchUp`.

`catchUp: "skip"` never reads `last.<name>` at all. With no `last.<name>` key present (first
deployment), `catchUp: "last"`/`"all"` run nothing — there is nothing to catch up from.
