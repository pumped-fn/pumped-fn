# pumped-fn

[![npm version](https://img.shields.io/npm/v/@pumped-fn/lite)](https://www.npmjs.com/package/@pumped-fn/lite)
[![npm downloads](https://img.shields.io/npm/dm/@pumped-fn/lite)](https://www.npmjs.com/package/@pumped-fn/lite)
[![license](https://img.shields.io/npm/l/@pumped-fn/lite)](LICENSE)
[![minzip](https://img.shields.io/bundlephobia/minzip/@pumped-fn/lite)](https://bundlephobia.com/package/@pumped-fn/lite)

Build TypeScript applications around one explicit graph seam. Production roots choose dependencies,
request facts, logging, and tracing. Tests replace the same graph edges without mocking modules.

```text
@pumped-fn/lite
  |-- @pumped-fn/lite-react
  |-- @pumped-fn/lite-lint
  |-- @pumped-fn/lite-logging -------- @pumped-fn/lite-logging-pino
  `-- @pumped-fn/lite-observability -- @pumped-fn/lite-observability-otel

createScope({ presets, tags, extensions })
  `-- atom / flow / resource / tag
        `-- run or createContext -> execute -> cleanup
```

## Quickstart

```bash
npm install @pumped-fn/lite
```

```ts
import { createScope, flow, typed } from "@pumped-fn/lite"

const greet = flow({
  parse: typed<{ name: string }>(),
  factory: (ctx) => `hello ${ctx.input.name}`,
})

const scope = createScope()
console.log(await scope.run({ flow: greet, input: { name: "Ada" } }))
await scope.dispose()
```

`scope.run` creates and closes one execution context. Use `scope.createContext()` when several flows
or resources must share a longer lifetime.

## Test at the scope seam

Production code declares its edges. A test replaces only the edge it controls.

```ts
import { atom, createScope, flow, preset, tag, tags, typed } from "@pumped-fn/lite"

interface Store {
  save(id: string, at: Date): Promise<string>
}

const clock = tag<{ now(): Date }>({ label: "clock" })

const store = atom({
  factory: (): Store => ({
    save: async (id, at) => `${id}:${at.toISOString()}`,
  }),
})

const saveInvoice = flow({
  parse: typed<{ id: string }>(),
  deps: { store, clock: tags.required(clock) },
  factory: (ctx, { store, clock }) => store.save(ctx.input.id, clock.now()),
})

const fake: Store = {
  save: async (id, at) => `${id}:fake:${at.toISOString()}`,
}

const scope = createScope({
  presets: [preset(store, fake)],
  tags: clock({ now: () => new Date("2026-07-05T12:00:00.000Z") }),
})

const result = await scope.run({ flow: saveInvoice, input: { id: "inv-1" } })
if (!result.startsWith("inv-1:fake:")) throw new Error("unexpected save")
await scope.dispose()
```

The flow is unchanged. The test controls the store and clock where the scope is composed.

## React

`@pumped-fn/lite-react` lets React observe a Lite graph. The graph owns logic and state. Components
subscribe and run flows.

```tsx
import { createScope, flow } from "@pumped-fn/lite"
import { ExecutionContextProvider, ScopeProvider, useFlow } from "@pumped-fn/lite-react"

const saveProfile = flow({
  name: "profile.save",
  factory: () => "saved",
})

const scope = createScope()

function SaveButton() {
  const save = useFlow(saveProfile)
  return <button onClick={() => save.execute()}>Save</button>
}

export function App() {
  return (
    <ScopeProvider scope={scope}>
      <ExecutionContextProvider>
        <SaveButton />
      </ExecutionContextProvider>
    </ScopeProvider>
  )
}
```

## Logging and tracing

Logging and observability are optional extensions. The scope installs the extension. A runtime tag
chooses sinks and policy. Business flows stay ordinary TypeScript.

```ts
import { createScope } from "@pumped-fn/lite"
import { logging } from "@pumped-fn/lite-logging"
import { observability } from "@pumped-fn/lite-observability"

const scope = createScope({
  extensions: [logging.extension(), observability.extension()],
  tags: [
    logging.runtime({ sinks: [logging.memory()], flow: "errors" }),
    observability.runtime({ sinks: [observability.memory()], input: false, output: false }),
  ],
})
```

Use `@pumped-fn/lite-logging-pino` to send log records to Pino. Use
`@pumped-fn/lite-observability-otel` to turn lifecycle events into OpenTelemetry spans.

## Package inventory

| Package | Purpose | Source |
| --- | --- | --- |
| `@pumped-fn/lite` | Core graph runtime | [README](packages/lite/README.md) |
| `@pumped-fn/lite-react` | React bindings | [README](packages/lite-react/README.md) |
| `@pumped-fn/lite-lint` | Boundary-rule scanner | [README](packages/lite-lint/README.md) |
| `@pumped-fn/lite-logging` | Structured execution logging | [README](packages/lite-logging/README.md) |
| `@pumped-fn/lite-logging-pino` | Pino logging sink | [README](packages/lite-logging-pino/README.md) |
| `@pumped-fn/lite-observability` | Structured lifecycle events | [README](packages/lite-observability/README.md) |
| `@pumped-fn/lite-observability-otel` | OpenTelemetry span sink | [README](packages/lite-observability-otel/README.md) |

## Documentation

- [Docs index](docs/README.md)
- [Mental model](docs/mental-model.md)
- [Test without mocking modules](docs/test-without-mocks.md)
- [Request context without ambient storage](docs/request-context-without-als.md)
- [OpenTelemetry spans](docs/observability.md)
- [Adopt one route at a time](docs/adopt-incrementally.md)
- [Code review guide](docs/code-review-guide.md)
- [Lite patterns](packages/lite/PATTERNS.md)
- [Lite Lint](packages/lite-lint/README.md)

## What this is not

pumped-fn is not an application framework, ORM, queue, or telemetry backend. It provides the graph,
execution lifetime, React bindings, static checks, and optional logging and tracing seams. Your app
still chooses its server, database, queue, logger destination, and OpenTelemetry pipeline.

## License

[MIT](LICENSE)
