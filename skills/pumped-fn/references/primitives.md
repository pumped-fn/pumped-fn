# Primitives

## Atoms, flows, and generators

```ts
import { atom, createScope, flow, typed } from "@pumped-fn/lite"

const hose = atom({
  keepAlive: true,
  factory: (ctx) => {
    const client = { water: async (_ml: number) => {} }
    ctx.cleanup(() => {})
    return client
  },
})

const waterPlant = flow({
  name: "water-plant",
  parse: typed<{ ml: number }>(),
  deps: { hose },
  factory: async (ctx, { hose }) => {
    await ctx.exec({ fn: () => hose.water(ctx.input.ml), params: [], name: "hose.water" })
    return { watered: ctx.input.ml }
  },
})

const pulse = flow({
  name: "pulse",
  parse: typed<void>(),
  factory: async function* () {
    yield { phase: "opening" }
    return { done: true }
  },
})

const scope = createScope()
const ctx = scope.createContext()
const stream = ctx.execStream({ flow: pulse })
for await (const progress of stream) console.log(progress.phase)
const result = await stream.result
await ctx.close({ ok: true })
await scope.dispose()
```

`ctx.exec` drains a generator and returns its final value. `execStream` exposes yields; consume it before `.result`. Breaking iteration aborts it, runs cleanup/finally, and closes with `{ ok: false, aborted: true }`. Do not return an async iterable from a non-generator flow.

Use `parse: (raw) => schema.parse(raw)` at wire boundaries. Use `typed<T>()` for trusted calls; it has no runtime parsing cost. Planned failure is typed:

```ts
type EmptyTank = { kind: "empty-tank"; plantId: string }
const checkTank = flow({
  parse: typed<{ plantId: string }>(),
  faults: typed<EmptyTank>(),
  factory: (ctx) => ctx.fail({ kind: "empty-tank", plantId: ctx.input.plantId }),
})
```

## Resources and ownership

```ts
import { resource } from "@pumped-fn/lite"

const wateringLog = resource({
  name: "watering-log",
  ownership: "current",
  factory: (ctx) => {
    const log = { commit: async () => {}, rollback: async () => {}, close: async () => {} }
    ctx.onClose((result) => result.ok ? log.commit() : log.rollback())
    ctx.cleanup(() => log.close())
    return log
  },
})
```

| Ownership | Sharing |
|---|---|
| `current` | Sibling executions get distinct values; nested `ctx.exec()` children share the current pocket. An explicit nested boundary gets a new pocket. |
| `boundary` | One value is shared across the whole boundary context and descendants. |

Resources are not `ctx.data`. `ctx.release(resource)` runs its cleanup for that owner; its registered `onClose` still runs later. Do not release then close a resource whose close side effect must occur once.

## Tags, ports, and child flows

```ts
import { controller, flow, tag, tags, typed, type Lite } from "@pumped-fn/lite"

const zone = tag<string>({ label: "garden.zone", default: "north" })
const reporter = tag<Lite.Flow<void, { text: string }>>({ label: "garden.reporter" })

const announce = flow({
  parse: typed<{ text: string }>(),
  deps: { zone: tags.required(zone), reporters: tags.all(reporter) },
  factory: async (ctx, { zone, reporters }) => {
    for (const report of reporters) await report.exec({ input: { text: `${zone}:${ctx.input.text}` } })
  },
})

const optionalReporter = flow({
  deps: { report: tags.optional(reporter) },
  factory: async (_ctx, { report }) => report?.exec({ input: { text: "optional" } }),
})

const record = flow({ parse: typed<{ ml: number }>(), factory: (ctx) => ctx.input.ml })
const water = flow({
  parse: typed<{ ml: number }>(),
  deps: { record: controller(record, { name: "record-water" }) },
  factory: (ctx, { record }) => record.exec({ input: ctx.input }),
})
```

A tag carrying a flow becomes a context-bound `FlowHandle` in deps. `required` fails loud; `optional` is handle-or-undefined; `all` collects every matching role. `controller(flow, { name, tags, key })` configures a child handle only. `prepare({ input })` stages a re-executable invocation; `step.ready` may be awaited, and `step.exec()` performs the child execution.

### Tag resolution order, precisely

For a flow's `tags.required/optional/all` dep, resolution reads `ctx.data.seekTag(tag)`, which checks the current context's data first, then walks `ctx.parent` up to the root context — so nearer contexts win. That per-context data is seeded at two points, in this order: `scope.createContext({ tags })`/`ctx.exec({ tags })` write directly (win outright); `flow({ tags })`'s own declared tags and the scope's `createScope({ tags })` only fill keys not already set (`ctx.data.has`/`seekHas` guard). Net order, highest precedence first: exec-site tags → flow's own declared tags → nearest ancestor context tags → scope tags → tag's own `default`.

For an atom's tag dep, there is no `ctx` — resolution calls `tag.find(this.tags)` directly against the scope's own tag list. Exec-site and context tags never reach an atom; only `createScope({ tags })` and the tag's `default` matter. This is because atoms are scope-singletons: one resolved value shared by the whole scope, not re-evaluated per context.

A required tag with no binding anywhere throws `Tag "<label>" not found` (or, for an atom mid-sync-resolution, causes that resolution attempt to bail and retry on the async path, which then throws) the first time the declaring node resolves — never at `createScope()` itself. Optional returns `undefined` at that same lazy point instead of throwing.

### Params traceability

`ctx.exec({ fn, params, name })` calls `fn(ctx, ...params)` — `params` are real call arguments, not documentation. The child execution context's `ctx.input` is set to exactly the `params` array, so any installed extension's `wrapExec(next, target, ctx)` can read `ctx.input` to see what was actually passed. A closure that captures a local instead of threading it through `params` still runs correctly, but that value is absent from `ctx.input` — tracing/audit extensions cannot record what the call actually used:

```ts
// Untraceable: extensions see target + ctx.input === [], never `orderId`.
await ctx.exec({ fn: () => billing.charge(orderId), params: [], name: "billing.charge" })

// Traceable: ctx.input === [orderId]; wrapExec/audit can record it.
await ctx.exec({ fn: (_ctx, orderId) => billing.charge(orderId), params: [orderId], name: "billing.charge" })
```

## Controllers, select, and scope

```ts
import { atom, controller, createScope, preset } from "@pumped-fn/lite"

const moisture = atom({ factory: () => ({ percent: 40, sensorAt: 1 }) })
const display = atom({
  deps: { moisture: controller(moisture, { resolve: true, watch: true, eq: (a, b) => a.percent === b.percent }) },
  factory: (_ctx, { moisture }) => `${moisture.get().percent}%`,
})
const scope = createScope({ presets: [preset(moisture, { percent: 50, sensorAt: 2 })] })
await scope.resolve(display)
const percent = scope.select(moisture, (value) => value.percent, { eq: Object.is })
percent.subscribe(() => {})
percent.dispose()
await scope.dispose()
```

Atom controllers resolve/watch/set/update/invalidate. Put atom `watch: true` only in an atom's deps. Resource controllers are resolve/release/observe infrastructure handles; put resource `watch: true` only in resource deps. A `select` selector always recomputes after source change; `eq` only decides whether subscribers are notified.

`createScope({ presets, tags, extensions, gc })` composes the graph. `preset(target, value)` replaces an atom, flow, or resource. Use `keepAlive: true` for signals that must survive GC; `scope.drain(feed, { take })` is bounded—never drain an infinite producer without `take`.
