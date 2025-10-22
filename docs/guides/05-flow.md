---
title: Flow
description: Execution context for short-lived operations
keywords: [flow, context, execution, promised]
---

# Flow

Flow is an isolated execution environment bridging reusable scope resources with one-off request lifecycles. Not a function wrapper - it's dependency resolution + error boundary + lifecycle management.

## Architecture

**Scope**: Retains long-running resources (database connections, servers, config). Lives for application lifetime.

**Flow**: Isolated execution for short-lived operations (HTTP request, background job, transaction). Bridges scope resources with ephemeral execution.

**Context**: Flow-scoped storage for execution details. Snapshot captured at flow completion, then discarded.

```ts twoslash
import { flow, provide, createScope } from '@pumped-fn/core-next'

const db = provide(() => ({ query: async (sql: string) => [] }))

const handler = flow({ db }, async (deps, ctx, userId: string) => {
  const rows = await deps.db.query(`SELECT * FROM users WHERE id = ${userId}`)
  return rows[0]
})

const scope = createScope()
const result = await flow.execute(handler, 'user-123', { scope })
await scope.dispose()
```

Scope `db` persists across executions. Flow context isolated per request.

## Context Operations

### ctx.exec - Sequential Subflow Execution

Returns `Promised` for composition. Subflows inherit parent context.

```ts twoslash
import { flow } from '@pumped-fn/core-next'

const validate = flow((ctx, id: string) => {
  if (id.length < 3) throw new Error('Invalid ID')
  return id
})

const fetchData = flow((ctx, id: string) => ({ id, data: 'value' }))

const handler = flow(async (ctx, input: string) => {
  const validId = await ctx.exec(validate, input)
  const data = await ctx.exec(fetchData, validId)
  return data
})
```

### ctx.parallel - Concurrent Execution

Execute multiple flows concurrently. Results array preserves order.

```ts twoslash
import { flow } from '@pumped-fn/core-next'

const getUser = flow((ctx, id: string) => ({ id, name: 'User' }))
const getPosts = flow((ctx, userId: string) => [{ id: '1', title: 'Post' }])

const handler = flow(async (ctx, userId: string) => {
  const { results } = await ctx.parallel([
    ctx.exec(getUser, userId),
    ctx.exec(getPosts, userId)
  ])
  const [user, posts] = results
  return { user, posts }
})
```

### ctx.set / ctx.get - Flow-Scoped Data

Store execution metadata in context. See [Tags](./02-tags-the-type-system.md).

```ts twoslash
import { flow, tag, custom } from '@pumped-fn/core-next'

const requestId = tag(custom<string>(), { label: 'request.id' })

const handler = flow((ctx, input: string) => {
  ctx.set(requestId, `req-${Date.now()}`)
  const id = ctx.get(requestId)
  return { requestId: id }
})
```

## Production Error Handling

**Primary pattern**: Discriminated unions. Errors are values.

```ts twoslash
import { flow } from '@pumped-fn/core-next'

type Result<T, E = string> =
  | { ok: true; data: T }
  | { ok: false; error: E }

const riskyOperation = flow((ctx, input: string): Result<number> => {
  const parsed = parseInt(input, 10)
  if (isNaN(parsed)) {
    return { ok: false, error: 'Invalid number' }
  }
  return { ok: true, data: parsed }
})

const handler = flow(async (ctx, input: string) => {
  const result = await ctx.exec(riskyOperation, input)

  if (!result.ok) {
    return { status: 'error', message: result.error }
  }

  return { status: 'success', value: result.data * 2 }
})
```

**Convert infrastructure errors with Promised.catch()**:

```ts twoslash
import { flow, provide, Promised } from '@pumped-fn/core-next'

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

const externalApi = provide(() => ({
  fetch: async (id: string) => {
    throw new Error('Network failure')
  }
}))

const handler = flow({ externalApi }, async (deps, ctx, id: string): Promise<Result<{ id: string }>> => {
  const result = await Promised.create(deps.externalApi.fetch(id))
    .map(data => ({ ok: true as const, data: { id } }))
    .catch(error => ({ ok: false as const, error: (error as Error).message }))

  return result
})
```

Reserve `throw` for truly exceptional conditions (programming errors, unrecoverable states).

## Promised Composition

`ctx.exec()` returns `Promised`. Chain operations without premature await.

```ts twoslash
import { flow, Promised } from '@pumped-fn/core-next'

const transform = flow((ctx, n: number) => n * 2)
const validate = flow((ctx, n: number) => {
  if (n > 100) throw new Error('Too large')
  return n
})

const handler = flow(async (ctx, input: number) => {
  const result = await ctx.exec(transform, input)
    .map(n => n + 10)
    .switch(n => ctx.exec(validate, n))
    .catch(error => -1)

  return { result }
})
```

## Complete Example

<<< @/../examples/http-server/basic-handler.ts

## See Also

- [Promised API](./07-promised-api.md) - Lazy composition primitives
- [Tags: The Type System](./02-tags-the-type-system.md) - Context storage mechanism
- [Error Handling](./10-error-handling.md) - Comprehensive error strategies
