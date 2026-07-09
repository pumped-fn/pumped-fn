# How do I test TypeScript code without `vi.mock`?

Replace the graph edge at `createScope`, then execute the same public flow the app uses.

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

The test replaces the `db` atom with `preset(db, fake)` and supplies the clock through a tag. The flow body does not know it is running in a test.

For a real database test, use the same pattern with the canonical invoice example's PGlite database.

```ts
const scope = createScope({
  presets: [preset(database, await pgliteDatabase())],
  tags: [
    provider(scripted([json()])),
    clock({ now: () => now }),
  ],
})
```

The helper builds a Drizzle database, runs migrations, and returns the same `Database` type as production.

```ts
export async function pgliteDatabase(): Promise<Database> {
  const client = new PGlite()
  const db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder })
  return db as Database
}
```

`createScope` accepts presets, tags, and extensions. `preset` can replace atoms, flows, and resources. Required tag deps are declared in the `deps` object with `tags.required(tag)`.

> **Note:** External `vi.mock` pain points such as hoisting, type loss, and per-file setup are not covered here. This page shows the pumped-fn seam.

## Source

- [Scope options](../pkg/core/lite/src/types.ts)
- [Preset API](../pkg/core/lite/src/preset.ts)
- [Flow typing](../pkg/core/lite/src/flow.ts)
- [Required tag deps](../pkg/core/lite/src/tag.ts)
- [Invoice triage tests](../examples/invoice-triage/tests/invoice-triage.test.ts)
- [PGlite database helper](../examples/invoice-triage/tests/support/database.ts)

## Next

- [Mental model](mental-model.md)
- [Code review guide](code-review-guide.md)
