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
    tags: [requestId(request.headers.get("x-request-id") ?? "missing")],
  })

  try {
    const user = await ctx.exec({ flow: loadUser, input: { id: "u1" } })
    return Response.json(user)
  } finally {
    await ctx.close()
  }
}
```

The route owns the request context. It seeds request facts as tags, runs one flow, and closes the context in `finally`.

> **Note:** Express and Nest examples are not covered here yet. This page shows a plain handler and Hono.

If you are using Hono, put the adapter on the scope and let middleware create the context for each request.

```ts
import { Hono } from "hono"
import { createScope, flow, tag, tags } from "@pumped-fn/lite"
import { hono } from "@pumped-fn/lite-hono"

const requestId = tag<string>({ label: "request.id" })

const readRequest = flow({
  deps: { requestId: tags.required(requestId) },
  factory: (_ctx, { requestId }) => requestId,
})

type BaseEnv = { Variables: { user: string } }
type AppEnv = hono.Env<BaseEnv>

const lite = hono.adapter()
const app = new Hono<AppEnv>()

const scope = createScope({ extensions: [lite] })

app.use(
  "*",
  lite.middleware<BaseEnv>({
    tags: (request) => [requestId(request.headers.get("x-request-id") ?? "missing")],
  })
)

app.get("/id", async (context) =>
  context.json({ id: await context.var.lite.exec({ flow: readRequest }) })
)

export async function closeApp(): Promise<void> {
  await scope.dispose()
}
```

The adapter keeps the app scope in the extension, writes the request execution context to `context.var`, and closes it after request handling. Application scope construction still belongs to your composition root.

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

Avoid shared scope factories, global registries, framework-shaped copies of Lite primitives, public helpers that accept `scope`, and hidden framework request reads inside units. Those shapes make the seam harder to test and harder to replace one route at a time.

## Source

- [Framework package rules](../pkg/framework/README.md)
- [Hono adapter](../pkg/framework/hono/src/index.ts)
- [Hono adapter tests](../pkg/framework/hono/tests/hono.test.ts)
- [Lite README boundary rules](../pkg/core/lite/README.md)
- [Preset API](../pkg/core/lite/src/preset.ts)
- [Scope implementation](../pkg/core/lite/src/scope.ts)

## Next

- [Request context without AsyncLocalStorage](request-context-without-als.md)
- [Test without mocking modules](test-without-mocks.md)
