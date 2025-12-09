---
id: c3-206
c3-version: 3
title: Service
summary: >
  Context-aware method containers for infrastructure patterns like databases,
  loggers, and HTTP clients where multiple methods share the same dependencies.
---

# Service

## Overview {#c3-206-overview}
<!-- Context-aware method containers -->

Services are a specialized form of atom that returns an object with methods.
Each method receives `ExecutionContext` as its first parameter, enabling:

- **Multi-method infrastructure**: Database services with query, transaction, etc.
- **Shared dependencies**: All methods access the same resolved deps
- **Extension wrapping**: Methods invoked via `ctx.exec()` get extension hooks

Primary use cases:
- Database adapters with multiple operations
- HTTP clients with various request methods
- Logger services with level-specific methods
- Any infrastructure needing context-aware method grouping

## Concepts {#c3-206-concepts}

### Service = Narrowed Atom

```typescript
// Service method must match ctx.exec({ fn, params }) signature
type ServiceMethod = (ctx: ExecutionContext, ...args: unknown[]) => unknown
type ServiceMethods = Record<string, ServiceMethod>

// service() returns Atom<T> where T extends ServiceMethods
function service<T extends ServiceMethods>(config): Atom<T>
```

**Key insight:** `ctx.exec({ fn, params })` always injects `ExecutionContext` as the first
argument. The `service()` function enforces this at compile time via `T extends ServiceMethods`.

There is no separate `Service` type - `service()` just returns an `Atom<T>` with the constraint
that `T` must be methods compatible with `ctx.exec`.

## Creating Services {#c3-206-creating}

### Basic Service

```typescript
import { service } from '@pumped-fn/lite'

const loggerService = service({
  factory: () => ({
    info: (ctx: Lite.ExecutionContext, msg: string) => console.log('[INFO]', msg),
    error: (ctx: Lite.ExecutionContext, msg: string) => console.error('[ERROR]', msg),
  })
})
```

### Service with Dependencies

```typescript
const dbService = service({
  deps: { pool: poolAtom, config: configAtom },
  factory: (ctx, { pool, config }) => ({
    query: (ctx: Lite.ExecutionContext, sql: string) => {
      return pool.query(sql)
    },
    transaction: async (ctx: Lite.ExecutionContext, fn: (tx: Transaction) => Promise<T>) => {
      return pool.withTransaction(fn)
    },
  })
})
```

### Service with Tags

```typescript
const httpService = service({
  deps: { config: configAtom },
  factory: (ctx, { config }) => ({
    get: (ctx: Lite.ExecutionContext, url: string) => fetch(url),
    post: (ctx: Lite.ExecutionContext, url: string, body: unknown) =>
      fetch(url, { method: 'POST', body: JSON.stringify(body) }),
  }),
  tags: [infraTag('http')]
})
```

## Resolution {#c3-206-resolution}

Services are resolved like atoms - singleton per scope:

```typescript
const scope = createScope()
await scope.ready

const db = await scope.resolve(dbService)
const db2 = await scope.resolve(dbService)

db === db2 // true - same instance
```

## Invocation {#c3-206-invocation}

Service methods are invoked via `ctx.exec()`:

```typescript
const handleRequest = flow({
  deps: { db: dbService },
  factory: async (ctx, { db }) => {
    const users = await ctx.exec({
      fn: db.query,
      params: ['SELECT * FROM users']
    })
    return { users }
  }
})
```

### Why ctx.exec()?

Using `ctx.exec()` instead of direct invocation provides:
1. **Extension wrapping**: `wrapExec` hooks apply to service method calls
2. **Context propagation**: Extensions can track the call chain
3. **Consistent execution model**: Same pattern as flow execution

## Type Safety {#c3-206-types}

The factory return type is inferred:

```typescript
const db = await scope.resolve(dbService)

// TypeScript knows db has:
// - query: (ctx, sql: string) => Promise<Result>
// - transaction: (ctx, fn) => Promise<T>

await ctx.exec({ fn: db.query, params: ['SELECT 1'] }) // OK
await ctx.exec({ fn: db.query, params: [123] }) // Type error
```

## Type Guard {#c3-206-guards}

Services are atoms, so use `isAtom()`:

```typescript
import { isAtom } from '@pumped-fn/lite'

if (isAtom(value)) {
  const methods = await scope.resolve(value)
}
```

## Best Practices {#c3-206-best-practices}

### Use Arrow Functions

Service methods should use arrow functions (closures) rather than method syntax.

**Why?** When methods are passed to `ctx.exec({ fn: method })`, they lose their
`this` binding. Arrow functions don't rely on `this` - they capture state via
closures, so they work correctly when extracted and passed around.

```typescript
const counterService = service({
  factory: () => {
    let count = 0
    return {
      increment: (ctx: Lite.ExecutionContext) => ++count,
      getCount: (ctx: Lite.ExecutionContext) => count,
    }
  }
})
```

Arrow functions capture closure state and work correctly when destructured:

```typescript
const counter = await scope.resolve(counterService)
const { increment, getCount } = counter

await ctx.exec({ fn: increment, params: [] })
await ctx.exec({ fn: getCount, params: [] })
```

### Avoid Class-Based Factories

If you need class instances, bind methods explicitly:

```typescript
const dbService = service({
  deps: { pool: poolAtom },
  factory: (ctx, { pool }) => {
    const client = new DbClient(pool)
    return {
      query: client.query.bind(client),
      transaction: (ctx, fn) => client.transaction(fn),
    }
  }
})
```

## Common Patterns {#c3-206-patterns}

### Database Service

```typescript
const dbService = service({
  deps: { pool: pgPoolAtom },
  factory: (ctx, { pool }) => ({
    query: async (ctx: Lite.ExecutionContext, sql: string, params?: unknown[]) => {
      return pool.query(sql, params)
    },
    transaction: async <T>(
      ctx: Lite.ExecutionContext,
      fn: (client: PoolClient) => Promise<T>
    ): Promise<T> => {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const result = await fn(client)
        await client.query('COMMIT')
        return result
      } catch (e) {
        await client.query('ROLLBACK')
        throw e
      } finally {
        client.release()
      }
    }
  })
})
```

### HTTP Client Service

```typescript
const httpService = service({
  deps: { config: configAtom },
  factory: (ctx, { config }) => ({
    get: async (ctx: Lite.ExecutionContext, path: string) => {
      const res = await fetch(`${config.baseUrl}${path}`)
      return res.json()
    },
    post: async (ctx: Lite.ExecutionContext, path: string, body: unknown) => {
      const res = await fetch(`${config.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      return res.json()
    }
  })
})
```

### Logger Service with Context

```typescript
const loggerService = service({
  factory: () => ({
    info: (ctx: Lite.ExecutionContext, msg: string, meta?: object) => {
      const requestId = requestIdTag.find(ctx)
      console.log(JSON.stringify({ level: 'info', msg, requestId, ...meta }))
    },
    error: (ctx: Lite.ExecutionContext, msg: string, error?: Error) => {
      const requestId = requestIdTag.find(ctx)
      console.error(JSON.stringify({
        level: 'error',
        msg,
        requestId,
        stack: error?.stack
      }))
    }
  })
})
```

## Source Files {#c3-206-source}

| File | Contents |
|------|----------|
| `src/service.ts` | `service()` |
| `src/types.ts` | `ServiceMethod`, `ServiceMethods` |

## Testing {#c3-206-testing}

Runtime tests in `tests/service.test.ts`:
- Service is atom (`isAtom()` returns true)
- Resolution with dependencies
- Method invocation via `ctx.exec()`

Type tests in `tests/types.test.ts`:
- Service methods must match `ctx.exec` signature `(ctx, ...args) => result`

## Related {#c3-206-related}

- [c3-201](./c3-201-scope.md) - Scope resolution for services
- [c3-202](./c3-202-atom.md) - Atom (simpler single-value pattern)
- [c3-203](./c3-203-flow.md) - ExecutionContext for method invocation
