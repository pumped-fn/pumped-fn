# Extensions, scheduling, and request context

Extensions own cross-cutting behavior. Install them at every composition root, never inside a feature factory. `wrapResolve` sees atom/resource materialization; `wrapExec` sees flows and named `ctx.exec({ fn })` calls. Register `ctx.onClose` inside the wrapper to end a span or apply outcome policy.

```ts
import { createScope, type Lite } from "@pumped-fn/lite"

const logging: Lite.Extension = {
  name: "logging",
  wrapExec(next, target, ctx) {
    console.log("start", target.name)
    ctx.onClose((result) => console.log("end", target.name, result.ok))
    return next
  },
  wrapResolve(next) {
    return next
  },
}

const scope = createScope({ extensions: [logging] })
```

Use package extensions such as `logging.extension()` / `observable.extension()` and supply their sinks/runtime tags at the root. A business factory names each foreign SDK call:

```ts
await ctx.exec({ fn: () => client.send(message), name: "client.send", tags: [] })
```

## Scheduler

The scheduler backend is a tag. `scheduler.schedule(...)` returns a keep-alive atom. Resolve it at the root; production supplies a durable backend, tests supply a manual backend and drive ticks without timers.

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
await scope.dispose()
```

Choose and state `overlap` and `catchUp`. `inProcess()` is dev/test grade and only supports `catchUp: "skip"`; use a manual `Scheduler.Backend` fake in tests.

## Request context, without ALS

At the framework boundary create one context with request tags, store/pass that explicit context in framework-owned request variables, execute public flows, then close it honestly. Product nodes declare `tags.required(requestId)`; they do not read AsyncLocalStorage or `ctx.data` implicitly. A background scheduler tick creates its own context and must not borrow a request context.
