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

## Scope Disposal

When a scope is disposed, all flow executions automatically complete. Flow contexts are ephemeral and automatically cleaned up after execution completes.

```ts twoslash
import { flow, provide, createScope } from '@pumped-fn/core-next'

const logger = provide(() => ({
  log: (msg: string) => console.log(msg),
  close: async () => console.log('Logger closed')
}))

const handler = flow({ logger }, async (deps, ctx, msg: string) => {
  deps.logger.log(msg)
  return { logged: true }
})

const scope = createScope()

await flow.execute(handler, 'message1', { scope })
await flow.execute(handler, 'message2', { scope })

await scope.dispose()
```

**Key Points:**
- Flow contexts are discarded after each execution
- Scope disposal cleans up long-running resources
- Journal entries are scoped to individual flow executions
- Always dispose scopes to prevent resource leaks
- See [Scope Lifecycle](./03-scope-lifecycle.md) for cleanup patterns

## Flow Creation Patterns

### Inference-based (simple cases)

Use when you don't need runtime validation or RPC:

```ts twoslash
import { flow, provide } from '@pumped-fn/core-next'

// Without dependencies
const simple = flow((ctx, input: string) => input.toUpperCase())

// With dependencies
const db = provide(() => ({ query: async (sql: string) => [] }))
const withDeps = flow(db, (deps, ctx, id: string) => {
  return deps.query(`SELECT * FROM users WHERE id = ${id}`)
})
```

### Schema-based (RPC/isomorphic)

Use when you need runtime validation or type sharing across network:

::: tip Validation Guarantee
All flows with schemas validate both input and output on every execution, whether journaled or non-journaled. This ensures type safety at runtime.
:::

```ts twoslash
import { flow, custom, provide } from '@pumped-fn/core-next'

type User = { id: string; name: string }

// Two-step: reusable definition
const getDef = flow({
  name: 'getUser',
  input: custom<string>(),
  output: custom<User>()
})

const db = provide(() => ({ query: async (sql: string) => ({ id: '1', name: 'User' } as User) }))

const serverHandler = getDef.handler(db, (deps, ctx, id) => {
  return deps.query(`SELECT * FROM users WHERE id = ${id}`)
})

const clientHandler = getDef.handler((ctx, id) => {
  return fetch(`/api/users/${id}`).then(r => r.json() as Promise<User>)
})

// One-step: direct use
const handler = flow(
  { name: 'getUser', input: custom<string>(), output: custom<User>() },
  db,
  (deps, ctx, id) => deps.query(`SELECT * FROM users WHERE id = ${id}`)
)

### Spread Tags + Execution Tags

Any `flow()` overload (handler-only, deps + handler, or config) accepts spread tags after the handler arguments:

```ts twoslash
import { flow, tag, provide } from '@pumped-fn/core-next'
import { custom } from '@pumped-fn/core-next'

const auditTag = tag(custom<string>(), { label: 'audit' })
const tenantTag = tag(custom<string>(), { label: 'tenant' })
const db = provide(() => ({ query: async () => ({ id: '1' }) }))

const getUser = flow(
  db,
  async (deps, ctx, id: string) => {
    return deps.query()
  },
  auditTag('getUser'),
  // undefined entries are ignored but ordering is preserved
  (process.env.MULTI_TENANT ? tenantTag('acme') : undefined) as any
)

const result = await flow.execute(getUser, '1', {
  executionTags: [tenantTag('runtime-tenant')]
})
```

**Important:**
- Spread tags can follow `flow(handler, ...)`, `flow(deps, handler, ...)`, or `flow(config, deps?, handler)` forms.
- Undefined spread entries are dropped automatically via `mergeFlowTags`, so conditional spreads are safe.
- `flow.execute(..., { executionTags })` merges runtime tags after definition tags; extensions observe `[definition tags..., execution tags...]`.
```

### Custom Validators

`custom()` accepts an optional validator function for runtime validation:

```ts twoslash
import { flow, custom } from '@pumped-fn/core-next'

const validateAge = flow({
  input: custom<number>((value) => {
    if (typeof value !== 'number') {
      return { success: false, issues: [{ message: 'Must be a number' }] }
    }
    if (value < 0 || value > 120) {
      return { success: false, issues: [{ message: 'Age must be 0-120' }] }
    }
    return value
  }),
  output: custom<boolean>()
}, (ctx, age) => age >= 18)

await flow.execute(validateAge, 25)
await flow.execute(validateAge, 150)
```

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
  const validId = await ctx.exec({
    flow: validate,
    input,
    key: 'validate-input',
    timeout: 5000
  })
  const data = await ctx.exec({
    flow: fetchData,
    input: validId,
    key: 'fetch-data'
  })
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
    ctx.exec({ flow: getUser, input: userId, key: 'get-user' }),
    ctx.exec({ flow: getPosts, input: userId, key: 'get-posts' })
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

### ctx.resetJournal - Clear Journal Entries

Clear journal entries to allow re-execution of previously journaled operations. Useful for retry logic or repeated operations within a flow.

```ts twoslash
import { flow } from '@pumped-fn/core-next'

const retryOperation = flow(async (ctx, input: string) => {
  const attempt1 = await ctx.exec({
    key: 'operation',
    fn: () => ({ result: 'first' })
  })

  ctx.resetJournal()

  const attempt2 = await ctx.exec({
    key: 'operation',
    fn: () => ({ result: 'second' })
  })

  return { attempt1, attempt2 }
})
```

Clear specific entries by pattern:

```ts twoslash
import { flow } from '@pumped-fn/core-next'

const batchProcess = flow(async (ctx, items: string[]) => {
  for (const item of items) {
    await ctx.exec({
      key: `process:${item}`,
      fn: () => processItem(item)
    })
  }

  ctx.resetJournal('process')

  for (const item of items) {
    await ctx.exec({
      key: `process:${item}`,
      fn: () => processItem(item)
    })
  }

  return { processed: items.length }
})

declare function processItem(item: string): string
```

**Key Points:**
- `ctx.resetJournal()` - Clears all journal entries
- `ctx.resetJournal(pattern)` - Clears entries where user key contains pattern
- Pattern matching only applies to user-provided key portion
- Flow name and depth portions are not matched
- Allows re-execution of previously journaled operations

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
  const result = await ctx.exec({
    flow: riskyOperation,
    input,
    key: 'risky-operation'
  })

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
  const result = await ctx.exec({
      flow: transform,
      input,
      key: 'transform'
    })
    .map(n => n + 10)
    .switch(n => ctx.exec({
      flow: validate,
      input: n,
      key: 'validate'
    }))
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
- [API Cheatsheet](../reference/api-cheatsheet.md) - Quick reference for flow API
