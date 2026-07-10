# Extensions, scheduling, and request context

Extensions own cross-cutting behavior. Install them at every composition root, never inside a feature factory. `wrapResolve` sees atom/resource materialization; `wrapExec` sees flows and named `ctx.exec({ fn })` calls. Register `ctx.onClose` inside the wrapper to end a span or apply outcome policy.

```ts
import { createScope, type Lite } from "@pumped-fn/lite"

const logging: Lite.Extension = {
  name: "logging",
  wrapExec(next, target, ctx) {
    const name = ctx.name ?? target.name
    console.log("start", name)
    ctx.onClose((result) => console.log("end", name, result.ok))
    return next()
  },
  wrapResolve(next) {
    return next()
  },
}

const scope = createScope({ extensions: [logging] })
```

Use package extensions such as `logging.extension()` / `observable.extension()` and supply their sinks/runtime tags at the root. A business factory names each foreign SDK call:

```ts
await ctx.exec({ fn: () => client.send(message), params: [], name: "client.send", tags: [] })
```

## Scheduler

The scheduler backend is a tag. `scheduler.schedule(...)` returns a keep-alive atom. Resolve it at the root; production supplies a durable backend, tests supply a manual backend and drive ticks without timers.

Install caveat: today the published scheduler package peers on Lite 3 and its npm tarball retains `catalog:` dependencies. In a cold Lite-4 workspace, pnpm-pack the scheduler from this repository, then add that tarball with `--legacy-peer-deps`; a plain registry install does not resolve.

```ts
import { createScope, flow, typed } from "@pumped-fn/lite"
import { scheduler } from "@pumped-fn/lite-extension-scheduler"

const inspectBeds = flow({ name: "inspect-beds", parse: typed<void>(), factory: () => undefined })
const hourly = scheduler.schedule({
  name: "hourly-bed-check",
  cadence: { every: "3600000" },
  overlap: "skip",
  catchUp: "skip",
  flow: inspectBeds,
  input: () => undefined,
})
const scope = createScope({ tags: [scheduler.backend(scheduler.inProcess())] })
const registration = await scope.resolve(hourly)
await registration.trigger()
await registration.stop()
await scope.dispose()
```

Choose and state `overlap` and `catchUp`. `inProcess()` is dev/test grade and accepts only `catchUp: "skip"`. Queued/catch-up ticks create contexts through `ctx.scope.createContext`, so await `registration.stop()` before `scope.dispose()`.

For durable `"last"`/`"all"`, implement `Scheduler.Backend` with injected persistence and a clock. This minimal every-cadence backend records the last scheduled tick, replays missed ticks under the same overlap policy, and exposes the exact backend contract.

```ts
import type { Scheduler } from "@pumped-fn/lite-extension-scheduler"

type ScheduleStore = {
  load(name: string): { lastRunMs: number } | undefined
  save(name: string, state: { lastRunMs: number }): void
}

type BackendClock = {
  nowMs(): number
  every(ms: number, tick: () => void): () => void
}

export function durableBackend(deps: { store: ScheduleStore; clock: BackendClock }): Scheduler.Backend {
  const { store, clock } = deps
  return {
    register(spec, tick) {
      if ("cron" in spec.cadence) throw new Error("durableBackend accepts { every } only")
      const everyMs = Number(spec.cadence.every)
      let inFlight: Promise<void> | undefined
      let chain: Promise<void> | undefined
      let nextAtMs: number | undefined = clock.nowMs() + everyMs
      const fire = (scheduledAt: Date): Promise<void> => {
        const key = `${spec.name}:${scheduledAt.toISOString()}`
        store.save(spec.name, { lastRunMs: scheduledAt.getTime() })
        if (spec.overlap === "skip") {
          if (inFlight) return inFlight
          inFlight = tick({ key, scheduledAt }).catch(error => {
            spec.onError?.(error, { key, scheduledAt })
            throw error
          }).finally(() => {
            inFlight = undefined
          })
          return inFlight
        }
        const current = (chain ?? Promise.resolve()).then(() => tick({ key, scheduledAt }))
        chain = current.catch(error => {
          spec.onError?.(error, { key, scheduledAt })
        })
        return current
      }
      const saved = store.load(spec.name)
      if (!saved) {
        store.save(spec.name, { lastRunMs: clock.nowMs() })
      } else {
        const missed: number[] = []
        for (let at = saved.lastRunMs + everyMs; at <= clock.nowMs(); at += everyMs) missed.push(at)
        const replay = spec.catchUp === "last" ? missed.slice(-1) : spec.catchUp === "all" ? missed : []
        if (spec.catchUp === "skip" && missed.length) store.save(spec.name, { lastRunMs: missed.at(-1)! })
        for (const at of replay) void fire(new Date(at)).catch(() => {})
      }
      const cancel = clock.every(everyMs, () => {
        nextAtMs = clock.nowMs() + everyMs
        void fire(new Date(clock.nowMs())).catch(() => {})
      })
      return {
        trigger: () => fire(new Date(clock.nowMs())),
        next: () => nextAtMs === undefined ? undefined : new Date(nextAtMs),
        stop: async () => {
          cancel()
          nextAtMs = undefined
          await Promise.all([inFlight?.catch(() => {}), chain])
        },
      }
    },
  }
}
```

## Request context, without ALS

At the framework boundary create one context with request tags, store/pass that explicit context in framework-owned request variables, execute public flows, then close it honestly. Product nodes declare `tags.required(requestId)`; they do not read AsyncLocalStorage or `ctx.data` implicitly. A background scheduler tick creates its own context and must not borrow a request context.
