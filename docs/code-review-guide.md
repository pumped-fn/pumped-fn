# How do I review pumped-fn code?

Start by looking for edges the graph cannot see. This shape hides the DB client and the clock from the scope seam.

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

Move those edges into declared dependencies. Now the clock is a tag, the client is an atom, and a test or composition root can replace either one.

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
  tags: clock({ now: () => new Date("2026-07-05T12:00:00.000Z") }),
})

const ctx = scope.createContext()
await ctx.exec({ flow: send, input: { id: "a" } })
await ctx.close()
await scope.dispose()
```

That is the review move: find the uncontrolled edge, then ask where the graph should see it.

## Review Rules

| If You See | Flag | Fix |
| --- | --- | --- |
| `new Date()`, `Date.now()`, `Math.random()`, `process.env`, `fetch`, timers, or raw platform modules inside a factory | Hidden side effect | Move it to a tag, transport atom, resource, or composition root |
| Module-level DB/client singleton used by a flow | Unsubstitutable edge | Wrap the client in an atom and preset that atom in tests |
| Exported shared scope or helper that accepts `scope` | Service-locator shape | Create scopes at composition roots and run flows through contexts |
| Child flow called through hidden same-file `ctx.exec({ flow })` | Invisible graph edge | Put child flow in `deps`, usually with `controller(child)` |
| Awaited client call without named `ctx.exec({ name, deps, params, fn })` | Unattributed effect | Give the call a named execution edge |

For an outside client call, prefer an adapter atom plus a named inline execution. Graph handles go in
`deps`. Runtime values go in `params`.

```ts
import { atom, flow, typed } from "@pumped-fn/lite"

const notifier = atom({
  factory: () => ({ send: async (message: string) => `sent:${message}` }),
})

const notify = flow({
  parse: typed<{ message: string }>(),
  factory: (ctx) => ctx.exec({
    name: "notifier.send",
    deps: { notifier },
    params: [ctx.input.message],
    fn: ({ notifier }, message) => notifier.send(message),
  }),
})
```

This gives logging and tracing a named edge instead of an anonymous promise.

> **Note:** This guide does not replace `@pumped-fn/lite-lint`. Use the scanner too; it exposes diagnostics through `scanPaths` and `scanText`.

## Source

- [Lite patterns](../packages/lite/PATTERNS.md)
- [Lite testing boundary](../packages/lite/README.md#boundary-ownership)
- [Lint rule list](../packages/lite-lint/README.md#rules)
- [Lint implementation](../packages/lite-lint/src/index.ts)

## Next

- [Test without mocking modules](test-without-mocks.md)
- [Mental model](mental-model.md)
