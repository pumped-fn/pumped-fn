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
    await ctx.exec({ fn: () => hose.water(ctx.input.ml), name: "hose.water" })
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

## Controllers, select, and scope

```ts
import { atom, controller, createScope, preset, select } from "@pumped-fn/lite"

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
