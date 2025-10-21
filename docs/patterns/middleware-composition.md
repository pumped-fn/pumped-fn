---
title: Middleware Composition
description: Composing extensions for request/response pipelines
keywords: [middleware, extensions, composition, pipeline]
---

# Middleware Composition

Build request/response pipelines with composed extensions: authentication, logging, error handling, and business logic.

## Architecture

Extensions run in order: outer -> inner -> operation -> inner -> outer

```
[Auth] -> [Logging] -> [Error Handler] -> [Business Logic]
```

## Complete Pipeline

```ts twoslash
import { extension, flow, createScope, tag, custom } from '@pumped-fn/core-next'

const userId = tag(custom<string>(), { label: 'user.id' })
const requestId = tag(custom<string>(), { label: 'request.id' })

const authMiddleware = extension({
  name: 'auth',
  wrap: async (ctx, next, operation) => {
    const id = userId.find(ctx)

    if (!id) {
      throw new Error('Unauthorized: Missing user ID')
    }

    console.log(`Auth: User ${id}`)
    return next()
  }
})

const loggingMiddleware = extension({
  name: 'logging',
  wrap: async (ctx, next, operation) => {
    const reqId = requestId.find(ctx) || 'no-id'
    console.log(`[${reqId}] Start ${operation.kind}`)

    const start = Date.now()
    const result = await next()

    console.log(`[${reqId}] End ${operation.kind} (${Date.now() - start}ms)`)
    return result
  }
})

const errorMiddleware = extension({
  name: 'error-handler',
  wrap: async (ctx, next, operation) => {
    try {
      return await next()
    } catch (error) {
      const reqId = requestId.find(ctx) || 'no-id'
      console.error(`[${reqId}] Error:`, (error as Error).message)

      return {
        error: (error as Error).message,
        requestId: reqId,
        timestamp: Date.now()
      }
    }
  }
})

const scope = createScope({
  extensions: [
    authMiddleware,
    loggingMiddleware,
    errorMiddleware
  ]
})
```

## Execution Order

```typescript
// Request enters
-> authMiddleware start
  -> loggingMiddleware start
    -> errorMiddleware start
      -> business logic
    <- errorMiddleware end
  <- loggingMiddleware end
<- authMiddleware end
// Response exits
```

## Conditional Middleware

Filter by operation kind:

```ts twoslash
import { extension } from '@pumped-fn/core-next'

const flowOnlyMiddleware = extension({
  name: 'flow-only',
  wrap: async (ctx, next, operation) => {
    if (operation.kind !== 'execute') {
      return next()
    }

    console.log('Flow-specific middleware')
    return next()
  }
})
```

## Request/Response Transform

```ts twoslash
import { extension, tag, custom } from '@pumped-fn/core-next'

const responseHeaders = tag(custom<Record<string, string>>(), {
  label: 'response.headers',
  default: {}
})

const headersMiddleware = extension({
  name: 'headers',
  wrap: async (ctx, next, operation) => {
    const headers = responseHeaders.get(ctx)
    headers['X-Request-ID'] = `req-${Date.now()}`
    headers['X-Powered-By'] = 'pumped-fn'

    const result = await next()

    return {
      ...result,
      headers
    }
  }
})
```

## Rate Limiting

```ts twoslash
import { extension, tag, custom } from '@pumped-fn/core-next'

const userId = tag(custom<string>(), { label: 'user.id' })

const rateLimits = new Map<string, number[]>()

const rateLimitMiddleware = extension({
  name: 'rate-limit',
  wrap: async (ctx, next, operation) => {
    const id = userId.find(ctx)
    if (!id) return next()

    const now = Date.now()
    const timestamps = rateLimits.get(id) || []
    const recentRequests = timestamps.filter(t => now - t < 60000)

    if (recentRequests.length >= 100) {
      throw new Error('Rate limit exceeded')
    }

    recentRequests.push(now)
    rateLimits.set(id, recentRequests)

    return next()
  }
})
```

## Complete Example

<<< @/../examples/http-server/middleware-chain.ts

## Production Middleware Stack

```typescript
const productionExtensions = [
  requestIdMiddleware,    // Generate request ID
  loggingMiddleware,      // Log requests
  authMiddleware,         // Authenticate
  rateLimitMiddleware,    // Rate limiting
  validationMiddleware,   // Input validation
  metricsMiddleware,      // Collect metrics
  errorMiddleware         // Error handling (outermost)
]
```

## Checklist

- ✅ Order extensions outer -> inner
- ✅ Error handler as outermost extension
- ✅ Auth before business logic
- ✅ Logging early in pipeline
- ✅ Conditional execution by operation.kind
- ✅ Transform request/response as needed

## See Also

- [Extensions](../guides/09-extensions.md)
- [Error Handling](../guides/10-error-handling.md)
- [HTTP Server Setup](./http-server-setup.md)
