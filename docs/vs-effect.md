# Should I use pumped-fn instead of Effect for DI and typed errors?

Use pumped-fn when the adoption unit should stay a normal TypeScript function behind one scope. Use Effect when you want the Effect program model, typed effect combinators, services, layers, and fibers as the center of the app.

## 1. Footguns

Start by moving hidden throws into a flow boundary.

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

The expected failure is not a surprise throw buried in business code. It is declared on the flow and raised with `ctx.fail`, then handled at the same execution boundary that ran the flow.

> **Note:** `isFault` narrows by `FlowFault` plus flow name. It does not check exact flow-instance identity.

Effect also makes effects explicit. Its docs describe `Effect<Success, Error, Requirements>` as a lazy workflow that can succeed, fail, or require context, and its expected-error docs put expected errors in the Effect error channel: [Effect type](https://effect.website/docs/getting-started/the-effect-type/), [expected errors](https://effect.website/docs/error-management/expected-errors/). That is the stronger fit when you want Effect's error combinators across the codebase.

## 2. Async DI

Put handshake work in an async atom or resource, then depend on the handle.

```ts
import { atom, createScope, flow, typed } from "@pumped-fn/lite"

type Client = {
  query(sql: string): Promise<string>
  close(): Promise<void>
}

const client = atom({
  factory: async (ctx): Promise<Client> => {
    const connected: Client = {
      query: async (sql) => `rows:${sql}`,
      close: async () => undefined,
    }
    ctx.cleanup(() => connected.close())
    return connected
  },
})

const countRows = flow({
  parse: typed<{ table: string }>(),
  deps: { client },
  factory: (ctx, { client }) => client.query(`count:${ctx.input.table}`),
})

const scope = createScope()
const ctx = scope.createContext()
const result = await ctx.exec({ flow: countRows, input: { table: "invoice" } })

if (result !== "rows:count:invoice") throw new Error("unexpected result")

await ctx.close()
await scope.dispose()
```

Async resolution is part of the graph. The first consumer awaits the dependency through the same `ctx.exec` path, and cleanup hangs off the resolving context.

Effect's official path is services and layers. The services docs show service requirements in the Effect type and service provisioning, while the layers docs cover building dependency graphs for implementations: [managing services](https://effect.website/docs/requirements-management/services/), [managing layers](https://effect.website/docs/requirements-management/layers/). Pick that path when acquisition, release, and dependency composition should all live inside Effect.

## 3. One Scope

Keep the graph's access point at `createScope({ presets, tags, extensions })`.

```ts
import { atom, createScope, flow, preset } from "@pumped-fn/lite"

const clock = atom({
  factory: () => ({ now: () => new Date("2026-07-09T00:00:00.000Z") }),
})

const readTime = flow({
  deps: { clock },
  factory: (_, { clock }) => clock.now().toISOString(),
})

const scope = createScope({
  presets: [preset(clock, { now: () => new Date("2026-07-10T00:00:00.000Z") })],
  tags: [],
  extensions: [],
})
const ctx = scope.createContext()
const value = await ctx.exec({ flow: readTime })

if (value !== "2026-07-10T00:00:00.000Z") throw new Error("unexpected time")

await ctx.close()
await scope.dispose()
```

Tests and alternate roots replace graph edges at the scope seam. Product code still imports the same flow and runs it through the same execution context.

Effect has its own single-entry story: the Effect type docs say effects are executed by the runtime and ideally from one app entry point, and service implementations can be provided before running the program: [Effect type](https://effect.website/docs/getting-started/the-effect-type/), [managing services](https://effect.website/docs/requirements-management/services/). If that runtime is already your app boundary, Effect's entry point is coherent.

## 4. Static and Dynamic Dependencies

Use `deps` when the dependency is known, and use tags when the shape is known but the value belongs to a request, tenant, or role choice.

```ts
import { atom, createScope, flow, tag, tags, typed } from "@pumped-fn/lite"

const tenant = tag<string>({ label: "tenant" })

const prefix = atom({
  factory: () => "invoice",
})

const key = flow({
  parse: typed<{ id: string }>(),
  deps: {
    prefix,
    tenant: tags.required(tenant),
  },
  factory: (ctx, { prefix, tenant }) => `${tenant}:${prefix}:${ctx.input.id}`,
})

const scope = createScope()
const ctx = scope.createContext({ tags: [tenant("acme")] })
const value = await ctx.exec({ flow: key, input: { id: "42" } })

if (value !== "acme:invoice:42") throw new Error("unexpected key")

await ctx.close()
await scope.dispose()
```

The atom is a static edge. The tenant tag is a dynamic edge: the graph knows the shape, and the request supplies the value. If the request forgets it, resolution fails before the factory runs.

Effect tracks required context in the `Requirements` type parameter: [Effect type](https://effect.website/docs/getting-started/the-effect-type/). For request facts in your Effect code, check the convention you actually use and ask where a missing tenant, user, or role fails: at construction, before run, or inside the first consumer.

## Pick Effect When

Pick Effect when you want its typed effect combinators, ecosystem, and fiber model as app architecture, not just as a DI substitute. The official docs describe Effect as an ecosystem and document fiber-based concurrency: [Why Effect?](https://effect.website/docs/getting-started/why-effect/), [fibers](https://effect.website/docs/concurrency/fibers/).

Pick pumped-fn when the target is smaller: make side effects visible as graph edges, keep tests on the scope seam, and leave product code in ordinary `async` TypeScript.

## Source

- [Flow implementation](../pkg/core/lite/src/flow.ts)
- [Flow fault tests](../pkg/core/lite/tests/flow-fault.test.ts)
- [Scope execution](../pkg/core/lite/src/scope.ts)
- [Effect type](https://effect.website/docs/getting-started/the-effect-type/)
- [Effect services](https://effect.website/docs/requirements-management/services/)
- [Effect fibers](https://effect.website/docs/concurrency/fibers/)

## Next

- [TypeScript DI without decorators](vs-di-containers.md)
- [Mental model](mental-model.md)
