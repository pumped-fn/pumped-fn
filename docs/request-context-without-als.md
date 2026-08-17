# Why is AsyncLocalStorage `getStore()` undefined, and what should I use instead?

Use an explicit Lite execution context. The transport boundary reads request facts and supplies them
as tags. Product code declares the tags it needs.

```ts
import { createScope, flow, tag, tags } from "@pumped-fn/lite"

const requestId = tag<string>({ label: "request.id" })

const readRequest = flow({
  deps: { requestId: tags.required(requestId) },
  factory: (_ctx, { requestId }) => requestId,
})

const scope = createScope()

export async function handle(request: Request): Promise<Response> {
  const id = await scope.run({
    flow: readRequest,
    tags: requestId(request.headers.get("x-request-id") ?? "missing"),
  })

  return Response.json({ id })
}

export async function closeApp(): Promise<void> {
  await scope.dispose()
}
```

There is no hidden request lookup in `readRequest`. A missing required tag fails during dependency
resolution, before the flow factory runs.

The same flow runs in a test through the same API.

```ts
const testScope = createScope()

const id = await testScope.run({
  flow: readRequest,
  tags: requestId("test-request"),
})

if (id !== "test-request") throw new Error("unexpected request id")
await testScope.dispose()
```

Use `scope.createContext({ tags })` when several operations must share request resources, tags, or
cancellation.

```ts
const ctx = scope.createContext({ tags: requestId("request-42") })

try {
  const first = await ctx.exec({ flow: readRequest })
  const second = await ctx.exec({ flow: readRequest })
  console.log(first, second)
} finally {
  await ctx.close()
}
```

The boundary owns the context and closes it. Feature code receives request facts through declared
dependencies, not through an ambient store.

## Source

- [Execution context types](../packages/lite/src/types.ts)
- [Context tag lookup](../packages/lite/src/scope.ts)
- [Tag dependencies](../packages/lite/src/tag.ts)

## Next

- [Adopt one route at a time](adopt-incrementally.md)
- [Test without mocking modules](test-without-mocks.md)
