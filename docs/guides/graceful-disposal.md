---
title: Graceful Disposal
description: Understanding two-phase disposal with grace periods
keywords: [scope, disposal, cleanup, graceful shutdown]
---

# Graceful Disposal

Scopes support graceful disposal to allow active operations to complete before cleanup.

## Two-Phase Disposal

When `dispose()` is called with a grace period, the scope transitions through two phases:

1. **Disposing Phase** - Reject new operations, allow active operations to complete
2. **Disposed Phase** - Run cleanup callbacks, clear all resources

## Basic Usage

### Default Grace Period (5000ms)

```typescript
const scope = createScope()

await scope.dispose()
```

### Custom Grace Period

```typescript
await scope.dispose({ gracePeriod: 10000 })
```

### Immediate Disposal

```typescript
await scope.dispose({ gracePeriod: 0 })
```

## Behavior During Disposal

### Pending Operations

Operations that haven't started executing are canceled immediately:

```typescript
const scope = createScope()
const slowExecutor = provide(() => new Promise(r => setTimeout(r, 10000)))

const promise1 = scope.resolve(slowExecutor)

const disposePromise = scope.dispose({ gracePeriod: 1000 })

const promise2 = scope.resolve(slowExecutor)
```

- `promise1`: Gets grace period to complete
- `promise2`: Throws `ScopeDisposingError` immediately

### Active Operations

Operations already executing receive the full grace period:

```typescript
const scope = createScope()
const activeOp = provide(() => new Promise(r => setTimeout(r, 2000)))

const opPromise = scope.resolve(activeOp)

await scope.dispose({ gracePeriod: 5000 })
```

- Operation has 5000ms to complete
- If completes within grace period, resolves normally
- If exceeds grace period, disposal continues anyway

### After Disposal

All operations throw after scope is disposed:

```typescript
await scope.dispose()

await scope.resolve(executor)
```

Throws: `"Scope is disposed"`

## Flow Execution

Flow operations follow the same rules:

```typescript
const handler = flow(async (ctx) => {
  await new Promise(r => setTimeout(r, 3000))
  return "done"
})

const execPromise = flow.execute(handler, undefined, { scope })

await scope.dispose({ gracePeriod: 5000 })
```

- Active flow gets grace period
- New flow.execute() during disposal throws `ScopeDisposingError`

## Error Classes

### ScopeDisposingError

Thrown when attempting operations during disposal phase:

```typescript
import { ScopeDisposingError } from '@pumped-fn/core-next'

try {
  await scope.resolve(executor)
} catch (error) {
  if (error instanceof ScopeDisposingError) {
    console.log('Operation canceled due to disposal')
  }
}
```

### GracePeriodExceededError

Exported for completeness but not currently thrown by the implementation:

```typescript
import { GracePeriodExceededError } from '@pumped-fn/core-next'
```

## Cleanup Order

After grace period expires or active operations complete:

1. Extension dispose hooks (parallel)
2. Executor cleanup callbacks (reverse registration order)
3. Clear cache and event handlers
4. Transition to disposed state

## Best Practices

### HTTP Server Shutdown

```typescript
const scope = createScope()
const server = await scope.resolve(httpServer)

process.on('SIGTERM', async () => {
  server.close()
  await scope.dispose({ gracePeriod: 30000 })
  process.exit(0)
})
```

### Request Draining

```typescript
let activeRequests = 0

const middleware = flow(async (ctx, req) => {
  activeRequests++
  try {
    return await handleRequest(req)
  } finally {
    activeRequests--
  }
})

const gracefulShutdown = async () => {
  console.log(`Draining ${activeRequests} active requests`)
  await scope.dispose({ gracePeriod: 60000 })
}
```

### Testing

Use short grace periods in tests:

```typescript
test('cleanup runs', async () => {
  const scope = createScope()
  const cleanup = vi.fn()

  const executor = provide(() => {
    return { value: 'test' }
  }, {
    cleanup: async () => cleanup()
  })

  await scope.resolve(executor)
  await scope.dispose({ gracePeriod: 0 })

  expect(cleanup).toHaveBeenCalled()
})
```

## See Also

- [Scope Lifecycle](./03-scope-lifecycle.md)
- [API Cheatsheet](../reference/api-cheatsheet.md#scopedispose)
