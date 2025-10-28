---
title: API Cheatsheet
description: Quick reference for all core APIs
keywords: [api, reference, cheatsheet]
---

# API Cheatsheet

## Quick Start: Which API Do I Need?

| I need to...                    | Use this API      | Signature                    |
|---------------------------------|-------------------|------------------------------|
| Create value (no dependencies)  | `provide()`       | `() => T`                    |
| Create value (with dependencies)| `derive()`        | `(deps) => T`                |
| Manage resource lifecycle       | `createScope()`   | `{ tags, presets, ext }`     |
| Handle request/task/job         | `flow()`          | `(ctx, args) => result`      |
| Pass type-safe runtime data     | `tag()`           | `get()/set()/find()`         |
| Mock dependencies in tests      | `preset()`        | `(executor, mockValue)`      |
| Dynamic resource pools          | `multi.provide()` | `(key) => executor`          |
| Add logging/tracing             | `extension()`     | `wrap(scope, next, op)`      |
| Lazy composition/error handling | `Promised`        | `.map()/.switch()/.catch()`  |

**Jump to:** [provide](#provide) · [derive](#derive) · [createScope](#createscope) · [flow](#flow) · [tag](#tag) · [preset](#preset) · [Promised](#promised) · [extension](#extension) · [multi](#multi-executors) · [Patterns](#common-patterns)

---

## Critical Rules

⚠️ **NEVER** use `ctx.get()` or `scope.resolve()` inside executors
→ Declare dependencies explicitly in arrays

⚠️ **NEVER** escape `provide`/`derive` with conditional logic
→ Use `.lazy` for conditional resolution

⚠️ **NEVER** use classes
→ Use object closures with captured state

⚠️ **NEVER** import with file extensions

✓ **ALWAYS** use `derive([deps], ([deps]) => factory)` array syntax
✓ **ALWAYS** make dependencies explicit in arrays
✓ Use `scope` for long-lived resources, `flow` for short-lived operations
✓ Use `preset()` for test mocking

---

## Executors

### provide()
```typescript
import { provide } from '@pumped-fn/core-next'

// No dependencies
const config = provide(() => ({
  port: 3000,
  env: 'development'
}))
```

### derive()
```typescript
import { derive } from '@pumped-fn/core-next'

// Single dependency
const db = derive(config, (cfg) => createConnection(cfg))

// Multiple dependencies (object)
const service = derive(
  { db, config },
  ({ db, config }) => ({
    method: () => {}
  })
)
```

### preset()
```typescript
import { preset } from '@pumped-fn/core-next'

// Override executor in tests
const scope = createScope({
  presets: [preset(dbExecutor, mockDb)]
})
```

## Scope

### createScope()
```typescript
import { createScope } from '@pumped-fn/core-next'

const scope = createScope()

// With tags
const scope = createScope({
  tags: [
    appConfig({ port: 3000 }),
    logger(console)
  ]
})

// With presets
const scope = createScope({
  presets: [preset(db, mockDb)]
})
```

### scope.resolve()
```typescript
// Resolve executor
const service = await scope.resolve(userService)

// Returns Promised<T>
const promised = scope.resolve(userService)
const service = await promised
```

### scope.dispose()
```typescript
// Cleanup all resources
await scope.dispose()
```

## Tags

### tag()
```typescript
import { tag, custom } from '@pumped-fn/core-next'

// Basic tag
const userId = tag(custom<string>(), { label: 'user.id' })

// With default
const retryCount = tag(custom<number>(), {
  label: 'retry.count',
  default: 3
})
```

### Tag access
```typescript
// .get() - throws if not found
const value = tag.get(container)  // T

// .find() - returns undefined
const value = tag.find(container)  // T | undefined

// .set() - type-safe
tag.set(container, value)  // value must match T
```

### Tag usage
```typescript
// In scope
const config = appConfig.get(scope)

// In flow context
const userId = userId.get(ctx)
ctx.set(userId, "123")

// In any container
const value = tag.find(store)
```

## Flow

### flow()
```typescript
import { flow } from '@pumped-fn/core-next'

// Basic flow
const handler = flow((ctx, input: Request) => {
  return { status: 200 }
})

// With dependencies
const handler = flow({ db, config }, (deps, ctx, input) => {
  return deps.db.query('...')
})
```

### flow() with schema (RPC pattern)
```typescript
import { custom } from '@pumped-fn/core-next'

// Two-step: reusable definition
const def = flow({
  name: 'handleRequest',
  input: custom<Request>(),
  output: custom<Response>()
})

const handler = def.handler((ctx, input) => {
  return { status: 200 }
})

// One-step: direct use
const handler2 = flow(
  { name: 'handleRequest', input: custom<Request>(), output: custom<Response>() },
  (ctx, input) => {
    return { status: 200 }
  }
)
```

### flow.execute()
```typescript
// Execute flow
const result = await flow.execute(handler, input)

// With options
const result = await flow.execute(handler, input, {
  scope: existingScope,
  extensions: [loggingExtension],
  tags: [requestId("req-123")]
})
```

### Flow Context

```typescript
flow((ctx, input) => {
  // Get/set tags
  const id = ctx.get(userId)
  ctx.set(requestId, "req-123")

  // Run with journaling
  const result = await ctx.run("step1", () => fetchData())

  // Execute subflow
  const data = await ctx.exec(subFlow, input)

  // Parallel execution
  const results = await ctx.parallel([
    promise1,
    promise2
  ])
})
```

## Promised

### Methods
```typescript
import { Promised } from '@pumped-fn/core-next'

// .map() - transform value
promised.map(value => value * 2)

// .switch() - chain Promised
promised.switch(value => otherPromised)

// .catch() - error handling
promised.catch(error => fallbackValue)
```

### Static methods
```typescript
// Parallel resolution
Promised.all([p1, p2, p3])

// With failure handling
Promised.allSettled([p1, p2, p3])
  .fulfilled()  // Get successful values
  .rejected()   // Get errors
  .partition()  // Get both
```

## Extension

### extension()
```typescript
import { extension } from '@pumped-fn/core-next'

const logger = extension({
  name: 'logging',
  wrap(ctx, next, operation) {
    console.log(`Starting ${operation.kind}`)
    const result = await next()
    console.log(`Finished ${operation.kind}`)
    return result
  }
})
```

## Type Inference Rules

```typescript
// Single dep → direct parameter
derive(db, (db) => {})

// Multiple deps → destructure object
derive({ db, config }, ({ db, config }) => {})

// Return type → inferred from implementation
const service = derive({ db }, ({ db }) => ({
  method: () => db.query('...')  // Return type inferred
}))
```

## Multi-Executors

### multi.provide()
```typescript
import { multi, custom } from '@pumped-fn/core-next'

// Dynamic executor pools (e.g., per-tenant DB)
const tenantDb = multi.provide({
  keySchema: custom<string>()
}, (tenantId: string) => {
  return provide(() => ({
    tenantId,
    query: async (sql: string) => []
  }))
})

const db1 = await scope.resolve(tenantDb('tenant-1'))
const db2 = await scope.resolve(tenantDb('tenant-2'))

// Cleanup
await tenantDb.release(scope)
```

---

## Common Patterns

### Error Handling (Discriminated Unions)
```typescript
type Result<T, E = string> =
  | { ok: true; data: T }
  | { ok: false; error: E }

const handler = flow(async (ctx, input: string): Promise<Result<number>> => {
  const parsed = parseInt(input, 10)
  if (isNaN(parsed)) {
    return { ok: false, error: 'Invalid number' }
  }
  return { ok: true, data: parsed }
})

// Convert infrastructure errors
const safe = Promised.create(riskyOp())
  .map(data => ({ ok: true as const, data }))
  .catch(error => ({ ok: false as const, error: String(error) }))
```

### HTTP Server Setup
```typescript
const config = provide(() => ({ port: 3000 }))
const db = derive(config, (cfg) => createConnection(cfg))
const routes = derive({ db, config }, (deps) => createRouter(deps))

const scope = createScope()
const router = await scope.resolve(routes)
const server = createServer(router)
```

### Testing with Presets
```typescript
test('service queries database', async () => {
  const mockDb = { query: vi.fn(async () => [{ id: '1' }]) }

  const scope = createScope({
    presets: [preset(db, mockDb)]
  })

  const svc = await scope.resolve(service)
  await svc.getUser('123')

  expect(mockDb.query).toHaveBeenCalledWith('SELECT * FROM users WHERE id = ?', ['123'])
  await scope.dispose()
})
```

### Multi-Tenant Resources
```typescript
const tenantDb = multi.provide({
  keySchema: custom<string>()
}, (tenantId: string) => {
  return provide(() => createTenantConnection(tenantId))
})

const handler = flow({ tenantDb }, async (deps, ctx, req) => {
  const tenantId = extractTenantId(req)
  const db = await ctx.scope.resolve(deps.tenantDb(tenantId))
  return db.query('SELECT * FROM users')
})
```

### Logging/Tracing Extension
```typescript
const logging = extension({
  name: 'logging',
  wrap: async (scope, next, operation) => {
    const start = Date.now()
    console.log(`[${operation.kind}] Starting`)

    try {
      const result = await next()
      console.log(`[${operation.kind}] Done in ${Date.now() - start}ms`)
      return result
    } catch (error) {
      console.log(`[${operation.kind}] Failed after ${Date.now() - start}ms`)
      throw error
    }
  }
})

const scope = createScope({ extensions: [logging] })
```

---

## Verification

```bash
# Check types
pnpm -F @pumped-fn/core-next typecheck:full

# Run tests
pnpm -F @pumped-fn/core-next test
```

## See Also

- [Type Verification](./type-verification.md)
- [Common Mistakes](./common-mistakes.md)
- [Error Solutions](./error-solutions.md)
- [Full Guides](../guides/) - In-depth explanations
- [Patterns](../patterns/) - Production use cases
