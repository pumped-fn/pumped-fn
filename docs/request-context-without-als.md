# Why is AsyncLocalStorage `getStore()` undefined, and what should I use instead?

Reader question: "My ALS request context disappeared; how do I avoid that class of bug?"

Pillar proven: explicit request context.

Entry arena: ALS long-tail, `AsyncLocalStorage getStore undefined`.

Use an explicit `ExecutionContext`. Middleware creates it, stores it in the framework context, seeds request tags, and closes it after the request.

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

## Why This Answers the ALS Query

The request state is not discovered from ambient storage inside product code. It is declared as a tag dependency and supplied by the request boundary.

The flow can run in a test with the same API:

```ts
const scope = createScope()
const ctx = scope.createContext({ tags: [requestId("test-request")] })
const id = await ctx.exec({ flow: readRequest })
await ctx.close()
await scope.dispose()

if (id !== "test-request") throw new Error("unexpected request id")
```

## Claim -> Citation

`ExecutionContext` is a public interface with `input`, `scope`, `parent`, `data`, `resolve`, `release`, `controller`, `exec`, `execStream`, `changes`, `onClose`, `close`, and `fail`: `[pkg/core/lite/src/types.ts:233-254](../pkg/core/lite/src/types.ts#L233-L254)`.

Context data supports raw keys and tag methods, including parent-chain lookup through `seekTag`: `[pkg/core/lite/src/types.ts:166-218](../pkg/core/lite/src/types.ts#L166-L218)`, `[pkg/core/lite/src/scope.ts:42-115](../pkg/core/lite/src/scope.ts#L42-L115)`.

`scope.createContext({ tags, parent })` seeds context tags and then scope tags: `[pkg/core/lite/src/scope.ts:1814-1842](../pkg/core/lite/src/scope.ts#L1814-L1842)`.

The Hono adapter creates the execution context from the request and stores it in `context.var`: `[pkg/framework/hono/src/index.ts:49-71](../pkg/framework/hono/src/index.ts#L49-L71)`.

The Hono test proves separate request IDs, per-call tag override, JSON input execution, and context close settlement: `[pkg/framework/hono/tests/hono.test.ts:22-80](../pkg/framework/hono/tests/hono.test.ts#L22-L80)`.

Do not use this page to make uncited claims about Node ALS internals. The repo-backed claim is the alternative control surface: explicit execution contexts plus declared tag deps.
