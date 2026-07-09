# How do I review pumped-fn code?

## Review Rules

| If You See | Flag | Fix |
| --- | --- | --- |
| `new Date()`, `Date.now()`, `Math.random()`, `process.env`, `fetch`, timers, or raw platform modules inside a factory | Hidden side effect | Move it to a tag, transport atom, resource, or composition root |
| Module-level DB/client singleton used by a flow | Unsubstitutable edge | Wrap the client in an atom and preset that atom in tests |
| Exported shared scope or helper that accepts `scope` | Service-locator shape | Create scopes at composition roots and run flows through contexts |
| Child flow called through hidden same-file `ctx.exec({ flow })` | Invisible graph edge | Put child flow in `deps`, usually with `controller(child)` |
| Awaited foreign call on a dep without `ctx.exec({ fn, name })` or a workflow step tag | Unattributed effect | Give the call a named execution edge |

Bad shape:

```ts
import { flow, typed } from "@pumped-fn/lite"

const db = {
  save: async (id: string, at: Date) => ({ id, at }),
}

const save = flow({
  parse: typed<{ id: string }>(),
  factory: (ctx) => db.save(ctx.input.id, new Date()),
})
```

Good shape:

```ts
import { atom, createScope, flow, tag, tags, typed } from "@pumped-fn/lite"

interface Client {
  send(id: string, at: Date): Promise<string>
}

interface Clock {
  now(): Date
}

const clock = tag<Clock>({ label: "review.clock" })

const client = atom({
  factory: () => ({
    send: async (id: string, at: Date) => `${id}:${at.toISOString()}`,
  }),
})

const send = flow({
  parse: typed<{ id: string }>(),
  deps: { client, clock: tags.required(clock) },
  factory: (ctx, { client, clock }) => client.send(ctx.input.id, clock.now()),
})

const scope = createScope({
  tags: [clock({ now: () => new Date("2026-07-05T12:00:00.000Z") })],
})

const ctx = scope.createContext()
await ctx.exec({ flow: send, input: { id: "a" } })
await ctx.close()
await scope.dispose()
```

## Proven in the source

- The boundary checklist says scope is owned at composition/test boundaries, raw IO belongs in transport atoms, and composition roots stay thin: [pkg/core/lite/PATTERNS.md:5-19](../pkg/core/lite/PATTERNS.md#L5-L19).

- The README says a test needing module mocks, global patches above raw transport wrappers, internal reaches, or test-only product branches means the boundary leaked: [pkg/core/lite/README.md:38-48](../pkg/core/lite/README.md#L38-L48).

- The lint rule list covers module mocks, shared scope factories, helpers accepting scope, scope reach, naked globals, implicit tag reads, module state, unattributed awaits, and swallowed errors: [pkg/tool/lint/README.md:23-48](../pkg/tool/lint/README.md#L23-L48).

- The rule implementation includes `pumped/no-module-mocks`, `pumped/no-naked-globals`, `pumped/no-shared-scope-factory`, `pumped/no-scope-argument`, and `pumped/no-unattributed-await`: [pkg/tool/lint/src/index.ts:5-29](../pkg/tool/lint/src/index.ts#L5-L29), [pkg/tool/lint/src/index.ts:1160-1179](../pkg/tool/lint/src/index.ts#L1160-L1179), [pkg/tool/lint/src/index.ts:1389-1464](../pkg/tool/lint/src/index.ts#L1389-L1464), [pkg/tool/lint/src/index.ts:1591-1660](../pkg/tool/lint/src/index.ts#L1591-L1660).

- Foreign calls should be adapter atoms plus `ctx.exec({ fn, name, tags })` so the call is named and taggable: [pkg/core/lite/PATTERNS.md:19-19](../pkg/core/lite/PATTERNS.md#L19-L19), [examples/invoice-triage/src/flows.ts:260-262](../examples/invoice-triage/src/flows.ts#L260-L262).

- This guide does not replace `@pumped-fn/lite-lint`; the scanner exposes diagnostics through `scanPaths` and `scanText`: [pkg/tool/lint/README.md:88-95](../pkg/tool/lint/README.md#L88-L95).
