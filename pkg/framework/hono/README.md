# @pumped-fn/lite-hono

Hono middleware for carrying a request-local `@pumped-fn/lite` execution context through Hono's
typed `Variables`.

```ts
import { createScope, flow, tag, tags } from "@pumped-fn/lite"
import { Hono } from "hono"
import { hono } from "@pumped-fn/lite-hono"

const requestId = tag<string>({ label: "request.id" })
const readRequest = flow({
  deps: { requestId: tags.required(requestId) },
  factory: (_ctx, deps) => deps.requestId,
})

type AppEnv = hono.Env

const lite = hono.adapter()
const scope = createScope({ extensions: [lite] })
const app = new Hono<AppEnv>()

app.use(
  "*",
  lite.middleware({
    tags: (request) => [requestId(request.headers.get("x-request-id") ?? "missing")],
  })
)

app.get("/request-id", async (context) => {
  return context.json({
    requestId: await context.var.lite.exec({ flow: readRequest }),
  })
})
```

## API

`hono.adapter(options)` creates a Lite extension with Hono middleware methods. Install the adapter
object in `createScope({ extensions })`, then mount `lite.middleware(options)` in Hono.

The middleware creates a fresh execution context per request and stores it in `context.var.lite`.
Route handlers run flows from that framework-owned request surface.

Use `tags.required(...)` for framework-provided request tags that a flow needs. This keeps tag
requirements visible to dependency analysis instead of hiding them in ad hoc context reads.
Flows and resources that consume request-derived values should declare those values in `deps`; route
handlers seed tags at the framework boundary and then execute public Lite units.

Pass `key` to use another Hono variable name. Pass `close: false` if an outer framework boundary owns
`ctx.close(...)`.

---
Part of [pumped-fn](https://github.com/pumped-fn/pumped-fn) — start with the [docs](https://github.com/pumped-fn/pumped-fn/tree/main/docs) or the [mental model](https://github.com/pumped-fn/pumped-fn/blob/main/docs/mental-model.md).
