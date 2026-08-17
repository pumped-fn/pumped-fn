# How do I test TypeScript code without `vi.mock`?

Replace a graph edge at `createScope`, then execute the same public flow the app uses.

```ts
import { atom, createScope, flow, preset, tag, tags, typed } from "@pumped-fn/lite"

interface Store {
  save(id: string, at: Date): Promise<{ id: string; at: Date }>
}

interface Clock {
  now(): Date
}

const clock = tag<Clock>({ label: "clock" })

const store = atom({
  factory: (): Store => ({
    save: async (id, at) => ({ id, at }),
  }),
})

const saveInvoice = flow({
  parse: typed<{ id: string }>(),
  deps: { store, clock: tags.required(clock) },
  factory: (ctx, { store, clock }) => store.save(ctx.input.id, clock.now()),
})

const calls: string[] = []
const fake: Store = {
  async save(id, at) {
    calls.push(`${id}:${at.toISOString()}`)
    return { id, at }
  },
}

const scope = createScope({
  presets: [preset(store, fake)],
  tags: clock({ now: () => new Date("2026-07-05T12:00:00.000Z") }),
})

const result = await scope.run({ flow: saveInvoice, input: { id: "inv-1" } })

if (result.id !== "inv-1" || calls.length !== 1) throw new Error("unexpected save")
await scope.dispose()
```

The test controls the store and clock at the scope seam. The flow body does not know it is running
in a test.

## Pick the test radius

Use the same seam for small and large tests. Change only which edge you replace.

```ts
const http = atom({
  factory: () => ({
    get: async (path: string) => ({ path, name: "Ada" }),
  }),
})

const users = atom({
  deps: { http },
  factory: (_ctx, { http }) => ({
    byId: (id: string) => http.get(`/users/${id}`),
  }),
})

const loadUser = flow({
  parse: typed<{ id: string }>(),
  deps: { users },
  factory: (ctx, { users }) => users.byId(ctx.input.id),
})
```

| Test | Replace | What still runs |
| --- | --- | --- |
| Small, inside-out | `preset(users, fakeUsers)` | The public flow |
| Wider, outside-in | `preset(http, fakeHttp)` | The capability atom and public flow |

Both tests import `loadUser` and call `scope.run({ flow: loadUser, input })`. Neither test patches a
module, reaches into a private cache, or adds a test-only product branch.

`createScope` accepts presets, tags, and extensions. `preset` can replace atoms, flows, and
resources. Required tag dependencies are declared in `deps` with `tags.required(tag)`.

> **Note:** This page shows the scope seam. It does not compare test-runner module-mocking rules.

## Source

- [Scope options](../packages/lite/src/types.ts)
- [Preset API](../packages/lite/src/preset.ts)
- [Flow typing](../packages/lite/src/flow.ts)
- [Required tag dependencies](../packages/lite/src/tag.ts)
- [Lite test patterns](../packages/lite/PATTERNS.md)

## Next

- [Mental model](mental-model.md)
- [Code review guide](code-review-guide.md)
