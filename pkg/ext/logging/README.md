# @pumped-fn/lite-extension-logging

Execution-scoped logging for `@pumped-fn/lite`.

The extension is static composition. Runtime backend choice is a tag. Install
`logging.extension()` to get automatic flow logs when requested, and resolve the `logging.logger`
resource when application code needs explicit logs.

## Migration to 1.0.0

Install 1.0 with Lite 6:

```bash
npm install @pumped-fn/lite@^6.0.0 @pumped-fn/lite-extension-logging@^1.0.0
```

```ts
import { createScope, flow } from "@pumped-fn/lite"
import { logging } from "@pumped-fn/lite-extension-logging"

const records = logging.memory()
const scope = createScope({
  extensions: [logging.extension()],
  tags: [
    logging.runtime({
      sinks: [records],
      level: "info",
      flow: "errors",
      fields: { service: "worker" },
    }),
  ],
})

const run = flow({
  name: "run",
  deps: { logger: logging.logger },
  factory: (_ctx, { logger }) => {
    logger.info("run.accepted")
  },
})
```

## Runtime

`logging.runtime(...)` carries backend policy:

| Option | Role |
| --- | --- |
| `sinks` | Log destinations. A backend package should adapt to this interface. |
| `level` | Minimum level: `debug`, `info`, `warn`, or `error`. |
| `flow` | Automatic flow logs: `none`, `errors`, or `all`; payloads stay out of log records. |
| `fields` | Runtime fields merged into every record. |
| `source` | Source override for records created inside this runtime. |
| `redact` | Field mapper before a record reaches sinks. |
| `failure` | `isolate` keeps app execution moving; `throw` makes sink failure fail execution. |
| `onError` | Observes sink failures without hidden swallowed errors. |
| `now` / `id` | Deterministic clock and id hooks for tests and runtimes. Override `id` for scoped ids. |

The `logging.logger` resource is execution-owned and flushes sinks on context close.
`logger.child(fields)` adds local fields without changing the runtime tag. The built-in
`logging.memory()` sink is for tests and local inspection; `size()` returns buffered record count.
OpenTelemetry logs and OTLP collectors are adapter targets for `Logging.Sink`; this package does not
import or ship those backends. Use `@pumped-fn/lite-extension-logging-pino` when the runtime sink
should write records to Pino.

---
Part of [pumped-fn](https://github.com/pumped-fn/pumped-fn) — start with the [docs](https://github.com/pumped-fn/pumped-fn/tree/main/docs) or the [mental model](https://github.com/pumped-fn/pumped-fn/blob/main/docs/mental-model.md).
