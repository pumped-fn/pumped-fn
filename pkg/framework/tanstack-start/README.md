# @pumped-fn/lite-tanstack-start

TanStack Start middleware helpers for carrying `@pumped-fn/lite` execution contexts through request
middleware, function middleware, and typed server-function handlers.

```ts
import { createServerFn } from "@tanstack/react-start"
import { createScope, flow, tag, tags, typed } from "@pumped-fn/lite"
import { tanstackStart } from "@pumped-fn/lite-tanstack-start"

const requestId = tag<string>({ label: "request.id" })
const echo = flow({
  parse: typed<{ message: string }>(),
  deps: { requestId: tags.required(requestId) },
  factory: (ctx, deps) => ({ message: ctx.input.message, requestId: deps.requestId }),
})

const lite = tanstackStart.adapter()
const scope = createScope({ extensions: [lite] })
const req = lite.request({
  tags: (request) => [requestId(request.headers.get("x-request-id") ?? "missing")],
})
const serverFn = lite.call({ middleware: [req] })

export const echoMessage = createServerFn({ method: "POST" })
  .middleware([serverFn])
  .validator((input: { message: string }) => input)
  .handler(lite.handler(echo))
```

## API

`tanstackStart.adapter(options)` creates a Lite extension with TanStack Start middleware methods.
Install the adapter object in `createScope({ extensions })`, then use `lite.request()`,
`lite.call()`, and `lite.handler(flow)`.

`lite.request(options)` creates a TanStack Start request middleware. The middleware creates a request
execution context and passes it to `next(...)` as `context.lite`.

`lite.call(options)` creates a server-function middleware. Pass native TanStack middleware through
`middleware` to let Start carry and dedupe context through its own middleware graph. The call
middleware reads the request execution context from `context.lite`, creates a child execution context
for the function call, and passes that child to `next(...)`.

`lite.handler(flow, options)` converts a typed Lite flow into a TanStack Start handler. The handler
uses the server function's validated `data` as the Lite flow input.

Use `tags.required(...)` for framework-provided request tags that a flow needs. This keeps tag
requirements visible to dependency analysis instead of hiding them in ad hoc context reads.
Flows and resources that consume request-derived values should declare those values in `deps`; Start
middleware seeds tags at the framework boundary and handlers execute public Lite units.

Pass `key` to use another context property. Pass `close: false` when another boundary owns
`ctx.close(...)`.

## Vite Boundary Guard

Use the Vite guard in TanStack Start apps to fail backend adapter leaks before they reach the
browser bundle.

```ts
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import { defineConfig } from "vite"
import { tanstackStartBoundary } from "@pumped-fn/lite-tanstack-start/vite"

export default defineConfig({
  plugins: [
    tanstackStart(),
    tanstackStartBoundary(),
  ],
})
```

Runtime imports from `@pumped-fn/lite-tanstack-start` are allowed in `src/start.ts`, `src/server.ts`,
`*.server.*`, `*.functions.*`, and `src/routes/api/**` files. Client entry files and non-API route
files cannot import the adapter directly or reach it through a mixed barrel. Type-only imports are
erased by Vite before the guard runs.

Use `*.functions.*` for `createServerFn(...)` wrappers that call `lite.handler(...)`; client modules
can import those server functions as RPC stubs. Keep backend scope, sync runtime tags, request
middleware, and transport wiring in `src/start.ts` or another server boundary file.

The guard does not inspect excluded dependency packages. A package under `node_modules` that wraps or
re-exports the adapter is trusted as dependency code; keep adapter wrappers in app source when you
want the guard to analyze reachability.
