# How do I test TypeScript code without `vi.mock`?

Reader question: "How do I test code that hits DB, LLM, clock, or fetch without mocking modules?"

Pillar proven: fully testable.

Entry arena: `test without mocking modules`, `vi.mock alternative`.

The answer is the scope seam. Replace the graph edge at `createScope`, then execute the same public flow the app uses.

```ts
import { atom, createScope, flow, preset, tag, tags, typed } from "@pumped-fn/lite"

interface Db {
  save(id: string, at: Date): Promise<{ id: string; at: Date }>
}

interface Clock {
  now(): Date
}

const clock = tag<Clock>({ label: "clock" })

const db = atom({
  factory: () => ({
    save: async (id: string, at: Date) => ({ id, at }),
  }),
})

const saveInvoice = flow({
  parse: typed<{ id: string }>(),
  deps: { db, clock: tags.required(clock) },
  factory: (ctx, { db, clock }) => db.save(ctx.input.id, clock.now()),
})

const calls: string[] = []
const fake: Db = {
  async save(id, at) {
    calls.push(`${id}:${at.toISOString()}`)
    return { id, at }
  },
}

const scope = createScope({
  presets: [preset(db, fake)],
  tags: [clock({ now: () => new Date("2026-07-05T12:00:00.000Z") })],
})

const ctx = scope.createContext()
const result = await ctx.exec({ flow: saveInvoice, input: { id: "inv-1" } })

if (result.id !== "inv-1" || calls.length !== 1) throw new Error("unexpected save")

await ctx.close()
await scope.dispose()
```

Real database recipe, from the canonical invoice example:

```ts
const scope = createScope({
  presets: [preset(database, await pgliteDatabase())],
  tags: [
    provider(scripted([json()])),
    clock({ now: () => now }),
  ],
})
```

PGlite support builds a Drizzle database, runs migrations, and returns the same `Database` type as production:

```ts
export async function pgliteDatabase(): Promise<Database> {
  const client = new PGlite()
  const db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder })
  return db as Database
}
```

## Claim -> Citation

`createScope` accepts `presets`, `tags`, and `extensions`: `[pkg/core/lite/src/types.ts:78-83](../pkg/core/lite/src/types.ts#L78-L83)`.

`preset` can replace atoms, flows, and resources: `[pkg/core/lite/src/preset.ts:25-67](../pkg/core/lite/src/preset.ts#L25-L67)`.

Flow input can be typed with `typed<T>()`: `[pkg/core/lite/src/flow.ts:18-20](../pkg/core/lite/src/flow.ts#L18-L20)`, `[pkg/core/lite/src/flow.ts:164-212](../pkg/core/lite/src/flow.ts#L164-L212)`.

Required tag deps are declared in the deps object with `tags.required(tag)`: `[pkg/core/lite/src/tag.ts:253-273](../pkg/core/lite/src/tag.ts#L253-L273)`.

The invoice tests use `createScope`, `preset(database, await pgliteDatabase())`, model provider tags, and deterministic clock tags: `[examples/invoice-triage/tests/invoice-triage.test.ts:337-360](../examples/invoice-triage/tests/invoice-triage.test.ts#L337-L360)`, `[examples/invoice-triage/tests/invoice-triage.test.ts:389-408](../examples/invoice-triage/tests/invoice-triage.test.ts#L389-L408)`, `[examples/invoice-triage/tests/invoice-triage.test.ts:520-555](../examples/invoice-triage/tests/invoice-triage.test.ts#L520-L555)`.

The PGlite test database helper returns the production `Database` type after migrations: `[examples/invoice-triage/tests/support/database.ts:1-15](../examples/invoice-triage/tests/support/database.ts#L1-L15)`.

The lint rule rejects module mocks and points tests to scope presets: `[pkg/tool/lint/README.md:23-31](../pkg/tool/lint/README.md#L23-L31)`, `[pkg/tool/lint/src/index.ts:1160-1179](../pkg/tool/lint/src/index.ts#L1160-L1179)`.

Searcher pain to name on the page: `vi.mock` hoisting, type loss, and per-file setup. This repo proves the alternative seam; external `vi.mock` pain claims need external examples before publication.
