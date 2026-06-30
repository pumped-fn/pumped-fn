# @pumped-fn/lite-extension-logging-pino

Pino sink adapter for `@pumped-fn/lite-extension-logging`.

The logging extension owns execution-scoped records and runtime tag policy. This package only adapts
those records to a Pino logger; applications still choose the Pino destination, transport, and
serializer setup.

```ts
import createPino from "pino"
import { createScope } from "@pumped-fn/lite"
import { logging } from "@pumped-fn/lite-extension-logging"
import { pino } from "@pumped-fn/lite-extension-logging-pino"

const logger = createPino()
const records = pino.sink(logger)

const scope = createScope({
  extensions: [logging.extension()],
  tags: [logging.runtime({ sinks: [records], flow: "errors" })],
})
```

Use `map` when a Pino schema needs different field names. Use `flush` or `close` when the selected
Pino destination needs explicit lifecycle handling.
