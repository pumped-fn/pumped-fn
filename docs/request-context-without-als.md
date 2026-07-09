# Why is AsyncLocalStorage `getStore()` undefined, and what should I use instead?

Use an explicit `ExecutionContext`. Middleware creates it, seeds request tags, stores it in the framework context, and closes it after the request.

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

The request state is not discovered from ambient storage inside product code. It is declared as a tag dependency and supplied by the request boundary.

The same flow can run in a test with the same API.

```ts
const scope = createScope()
const ctx = scope.createContext({ tags: [requestId("test-request")] })
const id = await ctx.exec({ flow: readRequest })
await ctx.close()
await scope.dispose()

if (id !== "test-request") throw new Error("unexpected request id")
```

The public execution context carries `input`, `scope`, `parent`, `data`, `resolve`, `release`, `controller`, `exec`, `execStream`, `changes`, close hooks, and failure helpers. Context data supports raw keys and tag methods, including parent-chain tag lookup. `scope.createContext({ tags, parent })` seeds context tags and then scope tags.

> **Note:** AsyncLocalStorage internals are not covered here. The supported control surface is explicit execution contexts plus declared tag deps.

## Source

- [ExecutionContext types](../pkg/core/lite/src/types.ts)
- [Context tag lookup](../pkg/core/lite/src/scope.ts)
- [Hono adapter](../pkg/framework/hono/src/index.ts)
- [Hono adapter tests](../pkg/framework/hono/tests/hono.test.ts)

## Next

- [Adopt one route at a time](adopt-incrementally.md)
- [Test without mocking modules](test-without-mocks.md)
