# @pumped-fn/lite-observability

Structured lifecycle events for `@pumped-fn/lite`.

The extension is static composition. Runtime backend choice is a tag. Install
`observability.extension()` once in `createScope({ extensions })`, then pass sinks and policy with
`observability.runtime(...)` at the scope, request context, or flow execution boundary. Root execution
contexts emit `context` events from creation to their close outcome, so every span traced inside a
context nests under one umbrella span; `only` excludes them like any other kind.

## Migration to 1.0.0

Replace `@pumped-fn/lite-extension-observable` with `@pumped-fn/lite-observability` in package installs and imports. Rename the public `observable` and `Observable` namespaces to `observability` and `Observability`.

Install 1.0 with Lite 6.6 or newer:

```bash
npm install @pumped-fn/lite@^6.6.0 @pumped-fn/lite-observability@^1.0.0
```

```ts
import { createScope, flow } from "@pumped-fn/lite"
import { observability } from "@pumped-fn/lite-observability"

const events = observability.memory()
const scope = createScope({
  extensions: [observability.extension()],
  tags: observability.runtime({
    sinks: [events],
    only: ["flow", "resource"],
    input: false,
    output: false,
  }),
})

const run = flow({
  name: "run",
  factory: () => "ok",
})

const ctx = scope.createContext()
await ctx.exec({ flow: run })
await ctx.close()
await scope.dispose()
```

## Runtime

`observability.runtime(...)` carries backend policy:

| Option | Role |
| --- | --- |
| `sinks` | Event destinations. A backend package should adapt to this interface. |
| `only` | Optional target filter: `atom`, `resource`, `flow`, `function`, or `context`. |
| `input` / `output` | Opt-in payload capture. Defaults stay private. |
| `redact` | Payload mapper used when capture is enabled. |
| `filter` | Final event filter. |
| `failure` | `isolate` keeps app execution moving; `throw` makes sink failure fail execution. |
| `onError` | Observes sink failures without hidden swallowed errors. |
| `now` / `id` | Deterministic clock and id hooks for tests and runtimes. Override `id` for scoped ids. |
| `mapError` | Error serialization policy. |

The built-in `observability.memory()` sink is for tests and local inspection; `size()` returns buffered
event count. Production backends stay outside this package and inject their sink through the tag.
OpenTelemetry and OTLP collectors are adapter targets for `Observability.Sink`; this package does not
import or ship those backends. Use
`@pumped-fn/lite-observability-otel` when the runtime sink should map events to
OpenTelemetry spans. The OTEL adapter stays backend-generic: Grafana, Victoria, and Jaeger
compatibility comes from standard OTLP configuration.

---
Part of [pumped-fn](https://github.com/pumped-fn/pumped-fn) — start with the [docs](https://github.com/pumped-fn/pumped-fn/tree/main/docs) or the [mental model](https://github.com/pumped-fn/pumped-fn/blob/main/docs/mental-model.md).
