---
title: Extensions
description: Cross-cutting concerns with extension wrapping
keywords: [extensions, middleware, wrapping]
---

# Extensions

Extensions provide cross-cutting concerns like logging, timing, transactions, and authentication. They wrap operations without modifying business logic.

## Core Pattern

```ts twoslash
import { extension, flow, createScope } from '@pumped-fn/core-next'

const logger = extension({
  name: 'logging',
  wrap: async (ctx, next, operation) => {
    console.log(`Starting ${operation.kind}`)
    const result = await next()
    console.log(`Finished ${operation.kind}`)
    return result
  }
})

const scope = createScope({
  extensions: [logger]
})
```

## Extension Composition

Extensions run in order, outer to inner:

```ts twoslash
import { extension, createScope } from '@pumped-fn/core-next'

const auth = extension({
  name: 'auth',
  wrap: async (ctx, next, operation) => {
    console.log('Auth check')
    return next()
  }
})

const timing = extension({
  name: 'timing',
  wrap: async (ctx, next, operation) => {
    const start = Date.now()
    const result = await next()
    console.log(`Took ${Date.now() - start}ms`)
    return result
  }
})

const scope = createScope({
  extensions: [auth, timing]
})
```

Execution order: `auth → timing → operation → timing → auth`

## Context Access

Extensions access flow context:

```ts twoslash
import { extension, tag, custom } from '@pumped-fn/core-next'

const requestId = tag(custom<string>(), { label: 'request.id' })

const logger = extension({
  name: 'logging',
  wrap: async (ctx, next, operation) => {
    const reqId = requestId.find(ctx) || 'no-id'
    console.log(`[${reqId}] ${operation.kind}`)
    return next()
  }
})
```

## Error Handling

Extensions can catch and transform errors:

```ts twoslash
import { extension } from '@pumped-fn/core-next'

const errorHandler = extension({
  name: 'error-handler',
  wrap: async (ctx, next, operation) => {
    try {
      return await next()
    } catch (error) {
      console.error(`Error in ${operation.kind}:`, error)
      throw error
    }
  }
})
```

## Operation Filtering

Extensions can filter by operation type:

```ts twoslash
import { extension } from '@pumped-fn/core-next'

const executeOnly = extension({
  name: 'execute-only',
  wrap: async (ctx, next, operation) => {
    if (operation.kind !== 'execute') {
      return next()
    }

    console.log('Execute-specific logic')
    return next()
  }
})
```

## Complete Example

<<< @/../examples/http-server/extension-logging.ts

## Middleware Example

<<< @/../examples/http-server/middleware-chain.ts

## Key Points

- Extensions wrap all operations
- Run in order: outer → inner → operation
- Access context for tags
- Filter by operation.kind
- Handle errors centrally

## See Also

- [Flow Basics](./05-flow-basics.md)
- [Error Handling](./10-error-handling.md)
- [Middleware Composition](../patterns/middleware-composition.md)
