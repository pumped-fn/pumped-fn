# How do I get OpenTelemetry spans without editing business functions?

Install the extension at the scope and pass the sink through runtime tags. Your business flow stays plain.

```ts
import { createScope, flow, typed } from "@pumped-fn/lite"
import { observability } from "@pumped-fn/lite-observability"
import { otel, type Otel } from "@pumped-fn/lite-observability-otel"

function recorder(): Otel.Tracer {
  return {
    startSpan() {
      const span: Otel.Span = {
        setAttributes() {
          return span
        },
        setStatus() {
          return span
        },
        recordException() {},
        end() {},
      }
      return span
    },
  }
}

const checkout = flow({
  name: "checkout",
  parse: typed<{ id: string }>(),
  factory: (ctx) => ({ accepted: ctx.input.id }),
})

const scope = createScope({
  extensions: [observability.extension()],
  tags: observability.runtime({ sinks: [otel.sink({ tracer: recorder() })] }),
})

const ctx = scope.createContext()
await ctx.exec({ flow: checkout, input: { id: "order-1" } })
await ctx.close()
await scope.dispose()
```

The observability extension sees atom and resource resolution, flow and function execution, and each
root execution context from creation to its close outcome. The OpenTelemetry sink turns those events
into spans. Child spans link through `parentId`, errors set failure status, and terminal events end
their spans.

Name an outside client call with inline execution so the trace has a useful edge.

```ts
import { atom, flow, typed } from "@pumped-fn/lite"

const notifier = atom({
  factory: () => ({ send: async (message: string) => `sent:${message}` }),
})

const notify = flow({
  name: "notify",
  parse: typed<{ message: string }>(),
  factory: (ctx) => ctx.exec({
    name: "notifier.send",
    deps: { notifier },
    params: [ctx.input.message],
    fn: ({ notifier }, message) => notifier.send(message),
  }),
})
```

Inputs and outputs are private by default. Turn capture on only after adding a `redact` policy for the
data your application handles.

## Source

- [Extension types](../packages/lite/src/types.ts)
- [Scope extension setup](../packages/lite/src/scope.ts)
- [Observability extension](../packages/lite-observability/src/index.ts)
- [OpenTelemetry sink](../packages/lite-observability-otel/src/index.ts)
- [OpenTelemetry tests](../packages/lite-observability-otel/tests/otel.test.ts)

## Next

- [Code review guide](code-review-guide.md)
- [Mental model](mental-model.md)
