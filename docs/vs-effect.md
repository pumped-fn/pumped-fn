# Should I use pumped-fn instead of Effect for DI and typed errors?

Use pumped-fn when the unit of adoption should stay a plain TypeScript function behind a scope. Scalar flows return `MaybePromise<Output>`; streaming flows use async generators only when the result is a stream.

```ts
import { createScope, flow, isFault, typed } from "@pumped-fn/lite"

type Fault = { kind: "out-of-stock"; sku: string }

const reserve = flow({
  name: "reserve",
  parse: typed<{ sku: string }>(),
  faults: typed<Fault>(),
  factory: (ctx) => ctx.fail({ kind: "out-of-stock", sku: ctx.input.sku }),
})

const scope = createScope()
const ctx = scope.createContext()

try {
  await ctx.exec({ flow: reserve, input: { sku: "sku-1" } })
} catch (error) {
  if (!isFault(reserve, error)) throw error
  if (error.fault.sku !== "sku-1") throw new Error("unexpected fault")
}

await ctx.close()
await scope.dispose()
```

## Decision Table

| Pick | Cost | When to Pick |
| --- | --- | --- |
| pumped-fn | Learn scopes, lifetimes, and dependency kinds | You want graph seams, presets, tags, and extension hooks while product code remains ordinary `async` TypeScript. |
| Effect | Detailed Effect claims are not covered here | Pick it when you want Effect's own typed effect combinators, ecosystem, and fiber concurrency model. This page does not document Effect internals. |

## Proven in the source

- Flow factories are normal functions returning `MaybePromise<Output>` or async generators: [pkg/core/lite/src/flow.ts:146-212](../pkg/core/lite/src/flow.ts#L146-L212), [pkg/core/lite/src/types.ts:586-594](../pkg/core/lite/src/types.ts#L586-L594).

- `typed<T>()` is a type marker for flow input and faults: [pkg/core/lite/src/flow.ts:4-20](../pkg/core/lite/src/flow.ts#L4-L20), [pkg/core/lite/src/flow.ts:260-284](../pkg/core/lite/src/flow.ts#L260-L284).

- `ctx.fail` throws a `FlowFault` carrying a fault payload: [pkg/core/lite/src/types.ts:25-35](../pkg/core/lite/src/types.ts#L25-L35), [pkg/core/lite/src/types.ts:233-254](../pkg/core/lite/src/types.ts#L233-L254), [pkg/core/lite/tests/flow-fault.test.ts:8-21](../pkg/core/lite/tests/flow-fault.test.ts#L8-L21).

- `isFault` narrows by `FlowFault` plus flow name. It does not prove exact flow-instance identity: [pkg/core/lite/src/flow.ts:260-290](../pkg/core/lite/src/flow.ts#L260-L290).

- The scope seam is still available with typed faults because `ctx.exec({ flow, input })` runs the same flow object through the execution context: [pkg/core/lite/src/types.ts:233-245](../pkg/core/lite/src/types.ts#L233-L245), [pkg/core/lite/src/scope.ts:2084-2131](../pkg/core/lite/src/scope.ts#L2084-L2131).

This page makes no performance or bundle-size claim.
