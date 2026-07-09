# How do I get OpenTelemetry spans without editing business functions?

Install the extension at the scope. Put the sink in a runtime tag. Business flows stay plain.

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

Foreign SDK call shape:

```ts
import { step } from "@pumped-fn/sdk"

await ctx.exec({
  fn: () => notifier.send(message),
  params: [],
  name: "notifier.send",
  tags: [step({ workflow: true, kind: "email" })],
})
```

## Proven in the source

- Extensions expose `wrapResolve` and `wrapExec`: [pkg/core/lite/src/types.ts:500-520](../pkg/core/lite/src/types.ts#L500-L520).

- `createScope` stores extension instances and separates resolve wrappers from exec wrappers: [pkg/core/lite/src/scope.ts:441-456](../pkg/core/lite/src/scope.ts#L441-L456).

- The observable extension wraps atom/resource resolution and flow/function execution, emitting lifecycle events through tag-injected sinks: [pkg/ext/observable/src/index.ts:80-109](../pkg/ext/observable/src/index.ts#L80-L109), [pkg/ext/observable/src/index.ts:185-240](../pkg/ext/observable/src/index.ts#L185-L240).

- The OTel sink starts spans on start events, links child spans through `parentId`, records errors, sets status, and ends spans on terminal events: [pkg/ext/observable-otel/src/index.ts:38-64](../pkg/ext/observable-otel/src/index.ts#L38-L64), [pkg/ext/observable-otel/src/index.ts:66-105](../pkg/ext/observable-otel/src/index.ts#L66-L105).

- The OTel test proves runtime-tag setup and parent-linked nested spans: [pkg/ext/observable-otel/tests/otel.test.ts:60-121](../pkg/ext/observable-otel/tests/otel.test.ts#L60-L121), [pkg/ext/observable-otel/tests/otel.test.ts:215-236](../pkg/ext/observable-otel/tests/otel.test.ts#L215-L236).

- The invoice example proves span coverage over intake, store, model, review, and reminder edges after adding `observable.extension()` at scope creation: [examples/invoice-triage/tests/invoice-triage.test.ts:1113-1164](../examples/invoice-triage/tests/invoice-triage.test.ts#L1113-L1164).

- Foreign calls need named `ctx.exec({ fn, params, name, tags })` edges; the notifier call in invoice triage uses that shape: [pkg/core/lite/PATTERNS.md:19-19](../pkg/core/lite/PATTERNS.md#L19-L19), [examples/invoice-triage/src/flows.ts:260-262](../examples/invoice-triage/src/flows.ts#L260-L262).

- `step` is the SDK workflow step tag and is imported from `@pumped-fn/sdk` in the invoice example: [pkg/sdk/core/src/index.ts:28-52](../pkg/sdk/core/src/index.ts#L28-L52), [examples/invoice-triage/src/flows.ts:1-4](../examples/invoice-triage/src/flows.ts#L1-L4).

This page makes no performance or bundle-size claim.
