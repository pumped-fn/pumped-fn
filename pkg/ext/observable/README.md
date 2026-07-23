# @pumped-fn/lite-extension-observable

Structured lifecycle events for `@pumped-fn/lite`.

The extension is static composition. Runtime backend choice is a tag. Install
`observable.extension()` once in `createScope({ extensions })`, then pass sinks and policy with
`observable.runtime(...)` at the scope, request context, or flow execution boundary.

## Migration to 1.0.0

Install 1.0 with Lite 6:

```bash
npm install @pumped-fn/lite@^6.0.0 @pumped-fn/lite-extension-observable@^1.0.0
```

```ts
import { createScope, flow } from "@pumped-fn/lite"
import { observable } from "@pumped-fn/lite-extension-observable"

const events = observable.memory()
const scope = createScope({
  extensions: [observable.extension()],
  tags: [
    observable.runtime({
      sinks: [events],
      only: ["flow", "resource"],
      input: false,
      output: false,
    }),
  ],
})

const run = flow({
  name: "run",
  factory: () => "ok",
})

const ctx = scope.createContext()
await ctx.exec({ flow: run })
await ctx.close()
```

## Runtime

`observable.runtime(...)` carries backend policy:

| Option | Role |
| --- | --- |
| `sinks` | Event destinations. A backend package should adapt to this interface. |
| `only` | Optional target filter: `atom`, `resource`, `flow`, or `function`. |
| `input` / `output` | Opt-in payload capture. Defaults stay private. |
| `redact` | Payload mapper used when capture is enabled. |
| `filter` | Final event filter. |
| `failure` | `isolate` keeps app execution moving; `throw` makes sink failure fail execution. |
| `onError` | Observes sink failures without hidden swallowed errors. |
| `now` / `id` | Deterministic clock and id hooks for tests and runtimes. Override `id` for scoped ids. |
| `mapError` | Error serialization policy. |

The built-in `observable.memory()` sink is for tests and local inspection; `size()` returns buffered
event count. Production backends stay outside this package and inject their sink through the tag.
OpenTelemetry and OTLP collectors are adapter targets for `Observable.Sink`; this package does not
import or ship those backends. Use
`@pumped-fn/lite-extension-observable-otel` when the runtime sink should map events to
OpenTelemetry spans. The OTEL adapter stays backend-generic: Grafana, Victoria, and Jaeger
compatibility comes from standard OTLP configuration.

---
Part of [pumped-fn](https://github.com/pumped-fn/pumped-fn) — start with the [docs](https://github.com/pumped-fn/pumped-fn/tree/main/docs) or the [mental model](https://github.com/pumped-fn/pumped-fn/blob/main/docs/mental-model.md).
