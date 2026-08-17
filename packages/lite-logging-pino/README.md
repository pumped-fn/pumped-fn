# @pumped-fn/lite-logging-pino

Pino sink adapter for `@pumped-fn/lite-logging`.

The logging extension owns execution-scoped records and runtime tag policy. This package only adapts
those records to a Pino logger; applications still choose the Pino destination, transport, and
serializer setup.

## Migration to 1.0.0

Replace `@pumped-fn/lite-extension-logging-pino` with `@pumped-fn/lite-logging-pino` in the install command and imports. The sink API is unchanged.

```ts
import createPino from "pino"
import { createScope } from "@pumped-fn/lite"
import { logging } from "@pumped-fn/lite-logging"
import { pino } from "@pumped-fn/lite-logging-pino"

const logger = createPino()
const records = pino.sink(logger)

const scope = createScope({
  extensions: [logging.extension()],
  tags: logging.runtime({ sinks: [records], flow: "errors" }),
})
```

Use `map` when a Pino schema needs different field names. Use `flush` or `close` when the selected
Pino destination needs explicit lifecycle handling.

---
Part of [pumped-fn](https://github.com/pumped-fn/pumped-fn) — start with the [docs](https://github.com/pumped-fn/pumped-fn/tree/main/docs) or the [mental model](https://github.com/pumped-fn/pumped-fn/blob/main/docs/mental-model.md).
