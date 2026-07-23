# How do I get OpenTelemetry spans without editing business functions?

Install the extension at the scope and pass the sink through runtime tags. Your business flow stays plain.

```ts
import { createScope, flow, typed } from "@pumped-fn/lite"
import { observable } from "@pumped-fn/lite-extension-observable"
import { otel, type Otel } from "@pumped-fn/lite-extension-observable-otel"

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
  extensions: [observable.extension()],
  tags: [observable.runtime({ sinks: [otel.sink({ tracer: recorder() })] })],
})

const ctx = scope.createContext()
await ctx.exec({ flow: checkout, input: { id: "order-1" } })
await ctx.close()
await scope.dispose()
```

The observable extension sees atom and resource resolution, plus flow and function execution. The OTel sink turns those lifecycle events into spans, links child spans through `parentId`, records errors, sets status, and ends spans on terminal events.

For a foreign SDK call, name the edge with `ctx.exec`.

```ts
import { step } from "@pumped-fn/sdk"

await ctx.exec({
  name: "notifier.send",
  deps: { notifier },
  params: [message],
  fn: ({ notifier }, content) => notifier.send(content),
  tags: [step({ workflow: true, kind: "email" })],
})
```

The `step` tag comes from `@pumped-fn/sdk`. In the invoice example, this shape gives intake, store, model, review, and reminder work named span edges after `observable.extension()` is added at scope creation.


## Source

- [Extension types](../pkg/core/lite/src/types.ts)
- [Scope extension setup](../pkg/core/lite/src/scope.ts)
- [Observable extension](../pkg/ext/observable/src/index.ts)
- [OTel sink](../pkg/ext/observable-otel/src/index.ts)
- [OTel tests](../pkg/ext/observable-otel/tests/otel.test.ts)
- [Invoice triage span test](../examples/invoice-triage/tests/invoice-triage.test.ts)

## Next

- [Code review guide](code-review-guide.md)
- [Mental model](mental-model.md)
