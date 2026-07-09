# @pumped-fn/lite-extension-scheduler-nats

A distributed `SchedulerBackend` for `@pumped-fn/lite-extension-scheduler`, built on NATS JetStream
KV. Multiple process instances can register the same schedule and coordinate through a shared KV
bucket: only one instance runs any given scheduled tick, and a `last:` key lets late-joining or
restarted instances catch up on what they missed.

## Install

Install the NATS backend next to Lite, the scheduler extension, and the NATS client packages: `pnpm add @pumped-fn/lite @pumped-fn/lite-extension-scheduler @pumped-fn/lite-extension-scheduler-nats @nats-io/kv @nats-io/transport-node`.

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

## Semantics

| What NATS gives | What stays local |
| --- | --- |
| Exactly-once execution per scheduled tick **while the lock holder finishes within `lockTtlMs`**, via KV `create` (exclusive — fails if the run key already exists); the winner runs the tick, losers skip silently. If the holder is still running past `lockTtlMs`, another contender is allowed to take the lock over and also runs the tick — see "Stale-lock takeover" below, this degrades the guarantee to at-least-once across a lease expiry. | Timing: each instance runs its own `croner` job (or interval) for the cadence, exactly like `scheduler.inProcess()` — NATS adds distributed coordination on top, it does not replace the clock. |
| Catch-up on restart/rejoin, via a `last:<name>` key updated after every completed tick; `catchUp: "last"`/`"all"` derive missed scheduled times from croner's run enumeration and replay them through the **same overlap chain** as timer ticks (see below). | `overlap: "skip"`/`"queue"` — governs successive ticks piling up **on one instance** (e.g. a slow tick still running when the next timer fires). The KV lock already makes cross-instance overlap for the *same* scheduled tick a non-issue. |
| A run history/audit trail in the KV: each run key holds a JSON marker (`startedAt`, `host`, then `completedAt` or `failedAt`/`error`) that `history` (`kv.history()`/`kv.get()`) can inspect after the fact. | `trigger(dedupKey?)` — a manual, immediate tick (`scheduledAt = now`). With an explicit `dedupKey`, cluster-wide exactly-once for that key while the holder completes within `lockTtlMs` (see below); without one, only locally deduped (see below). |

### Overlap chain and catch-up

Catch-up ticks are replayed through the identical `fire()`/overlap-chain path used for timer ticks —
they are never fired directly against the lock, so `overlap: "skip"`/`"queue"` bookkeeping and
ordering apply to catch-up ticks exactly as they do to live ones. For `overlap: "queue"`, the
internal chain always settles fulfilled even when a tick throws (see the scheduler core's `onError`
docs) — a failed tick does not stop the next queued tick, whether that next tick came from the timer
or from catch-up.

### `last.<name>` monotonicity

`last.<name>` is only ever advanced, never regressed: writing it does a read-compare-write (`get`
then `create`/`update` with the observed revision) and only proceeds when the new `scheduledAt` is
strictly newer than what's currently stored, retrying on a revision conflict. This is a
**best-effort CAS loop, not a distributed lock** — under adversarial concurrent writers there is a
narrow TOCTOU window between the `get` and the `update` where a competing writer could win the race
in between; the retry loop handles the conflict by re-reading and re-comparing, so the field never
regresses, but a stale writer's *timestamp being current* at read time can still be superseded before
its write lands. This is acceptable here because `last.<name>` only ever moves forward from
`recordLast`, called after each successfully completed tick under the run lock.

### Stale-lock takeover (crash recovery)

If a process crashes between claiming a run's lock (`startedAt` written) and completing it
(`completedAt`/`failedAt` never written), that lock would otherwise block the run forever. Each
`nats()` backend has a `lockTtlMs` (default `300000` = 5 minutes, configurable via
`nats({ ..., lockTtlMs })`). A contender that finds a `startedAt`-only marker older than `lockTtlMs`
attempts a takeover via NATS KV's revision-based `update` (compare-and-swap on the observed
revision) — exactly one contender's takeover succeeds; the rest see a revision conflict and back off
without running the tick.

**This takeover is age-based, not liveness-based**: it cannot distinguish a crashed holder from one
that is simply slow. If the original holder is still alive and still executing the tick past
`lockTtlMs`, a contender takes the lock over anyway and runs the tick again — both instances end up
running the same scheduled tick concurrently. Cluster-wide execution is therefore **exactly-once per
run key only while the holder completes within `lockTtlMs`**; across a lease expiry it degrades to
**at-least-once**. Choose `lockTtlMs` comfortably above the worst-case tick duration to keep this rare
in practice. There is no heartbeat/lease-renewal mechanism today — a holder cannot extend its lock by
signaling it is still alive; adding one (so a live holder renews before `lockTtlMs` elapses and a
takeover only ever targets a truly dead holder) is possible future work.

## `nats(options)`

- `connection` — a `NatsConnection` the caller owns. This backend never connects or closes it; it
  only opens/creates a KV bucket on top of the connection you give it.
- `bucket` — KV bucket name, defaults to `"scheduler"`.
- `history.ttlMs` — if given, applied as the bucket's TTL **only when the bucket is created for the
  first time**. If the bucket already exists, its existing stream config (including any TTL) is left
  alone — this backend never attempts to alter an existing bucket's limits.
- `lockTtlMs` — how long a `startedAt`-only lock marker (no `completedAt`/`failedAt`) is honored
  before another contender is allowed to take it over, in case the process that claimed it crashed.
  Defaults to `300000` (5 minutes).

## Manual triggers and `trigger(dedupKey?)`

- `registration.trigger()` (no argument) derives its lock key from `scheduledAt` the same way timer
  ticks do. This is **local dedup only** — two replicas each calling `trigger()` a few milliseconds
  apart will very likely get distinct `scheduledAt` values and therefore distinct lock keys, so there
  is **no cross-replica dedup** without an explicit `dedupKey`.
- `registration.trigger(dedupKey)` uses the KV key `run.<name>.manual.<dedupKey>`, giving cluster-wide
  exactly-once semantics for that key while the winning replica completes within `lockTtlMs`:
  whichever replica's `trigger(dedupKey)` call claims the key first runs it, and every other replica
  calling `trigger()` with the same `dedupKey` is a no-op. The same stale-lock takeover described
  above applies here too — a manual trigger that runs longer than `lockTtlMs` can be taken over and
  re-run by another contender.

## Keys

- `run.<name>.<scheduledAt, colon-free ISO>` — one key per scheduled tick. Written by `create` (the
  lock), then updated by `put` on completion or failure.
- `last.<name>` — the ISO timestamp of the most recently *completed* tick, updated after every
  successful run. Read once at `register()` time to derive missed ticks for `catchUp`.

`catchUp: "skip"` never reads `last.<name>` at all. With no `last.<name>` key present (first
deployment), `catchUp: "last"`/`"all"` run nothing — there is nothing to catch up from.

---
Part of [pumped-fn](https://github.com/pumped-fn/pumped-fn) — start with the [docs](https://github.com/pumped-fn/pumped-fn/tree/main/docs) or the [mental model](https://github.com/pumped-fn/pumped-fn/blob/main/docs/mental-model.md).
