# Can I adopt pumped-fn one route at a time in my existing server?

Yes. Start at one composition boundary and leave the rest of the server alone.

```ts
import { createScope, flow, tag, tags, typed } from "@pumped-fn/lite"

const requestId = tag<string>({ label: "request.id" })

const loadUser = flow({
  parse: typed<{ id: string }>(),
  deps: { requestId: tags.required(requestId) },
  factory: (ctx, { requestId }) => ({ id: ctx.input.id, requestId }),
})

const scope = createScope()

export async function closeApp(): Promise<void> {
  await scope.dispose()
}

export async function handleUser(request: Request): Promise<Response> {
  const ctx = scope.createContext({
    tags: requestId(request.headers.get("x-request-id") ?? "missing"),
  })

  try {
    const user = await ctx.exec({ flow: loadUser, input: { id: "u1" } })
    return Response.json(user)
  } finally {
    await ctx.close()
  }
}
```

The route owns the request context. It seeds request facts as tags, runs one flow, and closes the
context in `finally`. The server only needs to call this plain handler. Lite does not need a
server-specific adapter.

## Move One Leaf

```ts
import { atom, createScope, flow, preset, typed } from "@pumped-fn/lite"

interface Db {
  query<T>(sql: string, values: readonly unknown[]): Promise<T[]>
}

const legacyDb: Db = {
  async query<T>(_sql: string, _values: readonly unknown[]) {
    return [] as T[]
  },
}

export async function legacyLoadUser(id: string): Promise<{ id: string } | undefined> {
  const [row] = await legacyDb.query<{ id: string }>("select id from users where id = $1", [id])
  return row
}

export const db = atom({
  factory: () => legacyDb,
})

export const loadUser = flow({
  parse: typed<{ id: string }>(),
  deps: { db },
  factory: async (ctx, { db }) => {
    const [row] = await db.query<{ id: string }>("select id from users where id = $1", [ctx.input.id])
    return row
  },
})

const scope = createScope()

export async function legacyRoute(id: string): Promise<{ id: string } | undefined> {
  return legacyLoadUser(id)
}

export async function pumpedRoute(id: string): Promise<{ id: string } | undefined> {
  const ctx = scope.createContext()
  try {
    return await ctx.exec({ flow: loadUser, input: { id } })
  } finally {
    await ctx.close()
  }
}

const testDb: Db = {
  async query<T>(_sql: string, values: readonly unknown[]) {
    return [{ id: String(values[0]) }] as T[]
  },
}

const testScope = createScope({ presets: [preset(db, testDb)] })

export async function testRoute(id: string): Promise<{ id: string } | undefined> {
  const ctx = testScope.createContext()
  try {
    return await ctx.exec({ flow: loadUser, input: { id } })
  } finally {
    await ctx.close()
  }
}
```

Add an atom beside the old module singleton first. Existing callers can keep importing the old function, while new graph code depends on the atom. Tests and new roots can preset that atom without changing the legacy export.

Then repeat with the next leaf dependency. The route boundary does not have to move again; each leaf moves when a graph consumer needs it.

## Keep The Boundary Thin

Create scopes, root contexts, route mounts, job mounts, and disposal at composition roots. Keep feature units declared in the graph, or keep helpers pure and call them from declared graph units.

Avoid shared scope factories, global registries, server-shaped copies of Lite primitives, public
helpers that accept `scope`, and hidden request reads inside units. Those shapes make the seam harder
to test and harder to replace one route at a time.

## Source

- [Lite boundary rules](../packages/lite/README.md#boundary-ownership)
- [Preset API](../packages/lite/src/preset.ts)
- [Scope implementation](../packages/lite/src/scope.ts)

## Next

- [Request context without ambient storage](request-context-without-als.md)
- [Test without mocking modules](test-without-mocks.md)
