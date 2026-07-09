# Can I adopt pumped-fn one route at a time in my existing server?

Pattern shown with a plain handler and Hono; Express/Nest examples pending.

Start at one composition boundary. Keep the existing server. Create or reuse a scope in the route module, create one execution context for the request, pass request facts as tags, and execute one flow.

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

Use the Hono adapter as the template for framework integration:

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

## Phase 2: Move One Leaf Dependency At A Time

Start by adding an atom beside the old module singleton. Existing consumers keep importing the old function. New graph consumers depend on the atom. Tests or new roots can preset that atom without changing the legacy export.

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

Then repeat with the next leaf dependency. The route boundary does not have to move again; each leaf moves when a graph consumer needs it.

## Proven in the source

- Framework packages do not own application scope construction; adapters install through `createScope({ extensions })` and pass execution contexts through framework-native surfaces: [pkg/framework/README.md:3-11](../pkg/framework/README.md#L3-L11).

- The Hono adapter stores the scope during extension init, creates a request execution context in middleware, writes it to `context.var`, and closes it after request handling: [pkg/framework/hono/src/index.ts:41-76](../pkg/framework/hono/src/index.ts#L41-L76).

- The Hono test creates one execution context per request and injects `requestId` from headers through tags: [pkg/framework/hono/tests/hono.test.ts:22-80](../pkg/framework/hono/tests/hono.test.ts#L22-L80).

- Framework rules reject shared scope factories, global registries, framework-shaped copies of Lite primitives, public helpers accepting `scope`, and hidden framework request reads inside units: [pkg/framework/README.md:18-27](../pkg/framework/README.md#L18-L27).

- Composition roots should create scopes, root contexts, route/job mounts, and disposal; feature units should stay declared in the graph or stay pure helpers called by declared graph units: [pkg/core/lite/README.md:38-48](../pkg/core/lite/README.md#L38-L48), [README.md:129-133](../README.md#L129-L133).

- The incremental leaf-dependency snippet uses the repo-exported `atom`, `flow`, `typed`, `preset`, and `createScope` APIs: [pkg/core/lite/src/index.ts:17-21](../pkg/core/lite/src/index.ts#L17-L21), [pkg/core/lite/src/atom.ts:29-44](../pkg/core/lite/src/atom.ts#L29-L44), [pkg/core/lite/src/flow.ts:18-20](../pkg/core/lite/src/flow.ts#L18-L20), [pkg/core/lite/src/flow.ts:200-212](../pkg/core/lite/src/flow.ts#L200-L212), [pkg/core/lite/src/preset.ts:25-28](../pkg/core/lite/src/preset.ts#L25-L28), [pkg/core/lite/src/scope.ts:2452-2478](../pkg/core/lite/src/scope.ts#L2452-L2478).

- Scope presets are stored on scope construction and atom preset values are returned during atom resolution: [pkg/core/lite/src/scope.ts:441-449](../pkg/core/lite/src/scope.ts#L441-L449), [pkg/core/lite/src/scope.ts:819-853](../pkg/core/lite/src/scope.ts#L819-L853).

- Execution contexts are created from scopes and execute flows through `ctx.exec({ flow, input })`: [pkg/core/lite/src/scope.ts:1814-1842](../pkg/core/lite/src/scope.ts#L1814-L1842), [pkg/core/lite/src/types.ts:233-245](../pkg/core/lite/src/types.ts#L233-L245), [pkg/core/lite/src/scope.ts:2084-2101](../pkg/core/lite/src/scope.ts#L2084-L2101).

Express and Nest examples are not yet covered here. This page covers a plain handler and Hono.
