---
title: Tags
description: Type-safe runtime data access
keywords: [tag, type safety, context, metadata]
---

# Tags

Tags provide compile-time type safety for runtime data access across scopes, flows, and extensions.

```ts twoslash
import { tag, custom, createScope, flow } from '@pumped-fn/core-next'

type AppConfig = { port: number; env: string }

const appConfig = tag(custom<AppConfig>(), { label: 'app.config' })
const userId = tag(custom<string>(), { label: 'user.id' })

const scope = createScope({
  tags: [appConfig({ port: 3000, env: 'prod' })]
})

const config = appConfig.get(scope)
const port = config.port

const handler = flow((ctx, input: string) => {
  ctx.set(userId, input)
  const id = ctx.get(userId)
  return { userId: id }
})
```

Type flows from tag definition. No casting. No generics.

## Create Tags

```ts twoslash
import { tag, custom } from '@pumped-fn/core-next'

const requestId = tag(custom<string>(), { label: 'request.id' })
const retryCount = tag(custom<number>(), { label: 'retry.count', default: 3 })
```

Define once in shared module. Import everywhere.

## Use Tags

**`.get()`** - Required values. Throws if missing.

```ts twoslash
import { tag, custom, createScope } from '@pumped-fn/core-next'

type AppConfig = { port: number }
const appConfig = tag(custom<AppConfig>(), { label: 'app.config' })

const scope = createScope({
  tags: [appConfig({ port: 3000 })]
})

const config = appConfig.get(scope)
```

**`.find()`** - Optional values. Returns undefined if missing.

```ts twoslash
import { tag, custom, flow } from '@pumped-fn/core-next'

const userId = tag(custom<string>(), { label: 'user.id' })

const handler = flow((ctx) => {
  const id = userId.find(ctx)
  if (id) {
    return { userId: id }
  }
  return { userId: 'anonymous' }
})
```

## Flow Context

Primary use case: request-scoped data.

```ts twoslash
import { flow, tag, custom } from '@pumped-fn/core-next'

const requestId = tag(custom<string>(), { label: 'request.id' })
const userId = tag(custom<string>(), { label: 'user.id' })

const authenticate = flow((ctx, token: string) => {
  const id = extractUserId(token)
  ctx.set(userId, id)
  return id
})

const handleRequest = flow(async (ctx, req: { token: string }) => {
  ctx.set(requestId, crypto.randomUUID())

  const uid = await ctx.exec('authenticate', authenticate, req.token)
  const reqId = ctx.get(requestId)

  return { requestId: reqId, userId: uid }
})

function extractUserId(token: string): string {
  return 'user-123'
}
```

Subflows inherit parent context. `userId` set in `authenticate` accessible in `handleRequest`.

## Scope Configuration

Initialize long-lived resources with tags.

```ts twoslash
import { createScope, tag, custom } from '@pumped-fn/core-next'

type DbConfig = { host: string; port: number }
const dbConfig = tag(custom<DbConfig>(), { label: 'db.config' })

const scope = createScope({
  tags: [
    dbConfig({ host: 'localhost', port: 5432 })
  ]
})

const config = dbConfig.get(scope)
```

## Common Mistakes

**Don't create tags inline:**

```ts
// ❌ New instance each call - won't find value
function handler(ctx) {
  const userId = tag(custom<string>(), { label: 'user.id' })
  return ctx.get(userId)
}

// ✅ Define once, import everywhere
// shared/tags.ts
export const userId = tag(custom<string>(), { label: 'user.id' })
```

**Don't use any:**

```ts
// ❌ Loses type safety
const config = tag(custom<any>(), { label: 'config' })

// ✅ Proper type
type AppConfig = { port: number }
const config = tag(custom<AppConfig>(), { label: 'config' })
```

## See Also

- [Flow](./05-flow.md) - Tag-based context in flows
- [Scope Lifecycle](./03-scope-lifecycle.md) - Tag initialization at scope creation
- [Extensions](./09-extensions.md) - Tags in cross-cutting concerns
