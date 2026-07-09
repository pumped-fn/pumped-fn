# Should I use pumped-fn instead of Effect for DI and typed errors?

Use pumped-fn when the unit of adoption should stay a plain TypeScript function behind a scope.

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

The flow returns through normal `await`, and typed faults move through `ctx.fail`. Scalar flows return `MaybePromise<Output>`; streaming flows use async generators only when the result is a stream.

> **Note:** `isFault` narrows by `FlowFault` plus flow name. It does not check exact flow-instance identity.

## Decision Table

| Pick | Cost | When to Pick |
| --- | --- | --- |
| pumped-fn | Learn scopes, lifetimes, and dependency kinds | You want graph seams, presets, tags, and extension hooks while product code remains ordinary `async` TypeScript. |
| Effect | Adopt the Effect runtime and combinator style throughout your codebase | Pick it when you want Effect's own typed effect combinators, ecosystem, and fiber concurrency model. |

The scope seam is still there when you use typed faults: `ctx.exec({ flow, input })` runs the same flow object through the execution context.


## Source

- [Flow implementation](../pkg/core/lite/src/flow.ts)
- [Flow and context types](../pkg/core/lite/src/types.ts)
- [Flow fault tests](../pkg/core/lite/tests/flow-fault.test.ts)
- [Scope execution](../pkg/core/lite/src/scope.ts)

## Next

- [TypeScript DI without decorators](vs-di-containers.md)
- [Mental model](mental-model.md)
