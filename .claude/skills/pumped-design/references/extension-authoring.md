---
name: extension-authoring
tags: extension, author, create, stateful, integration, devtools, context, policy, server, scope, lifecycle, testing
description: Authoring production-ready extensions with stateful patterns, scope access, lifecycle management, and advanced capabilities (APM, devtools, server integration). Emphasizes error handling, type safety, and testing.
---

# Extension: Authoring

## When to Use

Use this sub-skill when:

- Creating reusable extensions for distribution
- Building stateful extensions (caching, rate limiting, connection pools)
- Integrating with external services (APM, logging, monitoring)
- Implementing context propagation (tracing, multi-tenancy)
- Adding devtools or debugging capabilities
- Exposing flows through server integrations
- Need to access scope internals (resolve resources, execute flows)

**Prerequisites:** Read extension-basics.md first for wrap() fundamentals.

---

## Part 1: Extension Architecture & Scope

### Extension Lifecycle

```typescript
interface Extension {
  name: string

  init?(scope: Core.Scope): MaybePromised<void>

  wrap?<T>(
    scope: Core.Scope,
    next: () => Promised<T>,
    operation: Operation
  ): Promise<T> | Promised<T>

  onError?(error: ExecutorError, scope: Core.Scope): void

  dispose?(scope: Core.Scope): MaybePromised<void>
}
```

**Lifecycle flow:**
1. **init** - Called once when scope created or extension registered
2. **wrap** - Called for every operation (execute, journal, subflow, parallel, resolve)
3. **onError** - Called when executor resolution fails
4. **dispose** - Called when scope disposed

### Scope Capabilities

Extensions receive `Core.Scope` giving access to pumped-fn runtime:

```typescript
interface Core.Scope {
  // Execute flows
  exec<S, I>(flow: Executor<Handler<S, I>>, input: I): Promised<S>

  // Resolve resources
  resolve<T>(executor: Executor<T>): Promised<T>
  resolveAccessor<T>(executor: Executor<T>): Promised<Accessor<T>>

  // Run operations with dependencies
  run<T, D>(dependencies: D, callback: (deps: InferOutput<D>) => T): Promised<T>

  // Lifecycle
  dispose(): Promised<void>

  // Event hooks
  onChange(cb: ChangeCallback): Cleanup
  onRelease(cb: ReleaseCallback): Cleanup
  onError(callback: GlobalErrorCallback): Cleanup

  // Extension registration
  useExtension(extension: Extension): Cleanup

  // Tag access
  tags?: Tag.Tagged[]
}
```

**When to use what:**

| Need | Method | Example |
|------|--------|---------|
| Execute flow from extension | `scope.exec()` | Devtools running flow for preview |
| Access resource | `scope.resolve()` | Extension needs logger, DB connection |
| Run with dependencies | `scope.run()` | Execute operation with resolved deps |
| Track changes | `scope.onChange()` | Cache invalidation on updates |
| Cleanup on disposal | `scope.onRelease()` | Close connections, flush buffers |

### Operation Types

Extensions intercept 5 operation kinds via `wrap()`:

```typescript
type Operation =
  | { kind: "execute"; definition: Definition; input: unknown; ... }
  | { kind: "journal"; key: string; params?: readonly unknown[]; ... }
  | { kind: "subflow"; definition: Definition; input: unknown; ... }
  | { kind: "parallel"; mode: "parallel" | "parallelSettled"; promiseCount: number; ... }
  | { kind: "resolve"; executor: Executor<unknown>; operation: "resolve" | "update"; scope: Scope }
```

**Resolve operation** - Extension can intercept executor resolution:
- Wrap resource access with caching
- Track dependency resolution performance
- Implement lazy loading strategies

### Context vs Scope

**Flow Context (`ctx` in flow body):**
- Available only inside flow execution
- Methods: `run()`, `exec()`, `parallel()`, `get()`, `set()`
- Cannot resolve resources (flows are pure)

**Scope (`scope` in extension):**
- Available throughout extension lifecycle
- Access to full runtime: resources, flows, executors
- Can resolve dependencies, register hooks, dispose

**Rule:** Use `ctx` in flows, `scope` in extensions.

### Tag System for Context Propagation

Tags propagate data through execution hierarchy:

```typescript
import { createTag } from '@pumped-fn/core-next'

const requestIdTag = createTag<string>('request-id')

const tracingExtension = extension({
  name: 'tracing',
  init: (scope) => {
    // Tags available in scope
  },
  wrap: (scope, next, operation) => {
    if (operation.kind === 'execute') {
      const requestId = operation.context?.get(requestIdTag) ?? generateId()
      // Set tag for child operations
      operation.context?.set(requestIdTag, requestId)
    }
    return next()
  }
})
```

**Pattern:** Read tag from parent, propagate to children via `operation.context`.

---

## Part 2: Build Your First Stateful Extension

### Complete Example: Request Correlation Tracker

**Goal:** Track requests across flows using correlation IDs with proper lifecycle.

```typescript
import { extension, createTag } from '@pumped-fn/core-next'
import type { Extension, Core } from '@pumped-fn/core-next/types'

const correlationIdTag = createTag<string>('correlation-id', { required: true })

type CorrelationStore = {
  activeRequests: Map<string, { startTime: number; flowName: string }>
  disposed: boolean
}

export const correlationExtension = extension({
  name: 'correlation-tracker',

  init: (scope) => {
    const store: CorrelationStore = {
      activeRequests: new Map(),
      disposed: false
    }

    // Attach to scope for wrap() access
    scope.tags = scope.tags || []
    const storeTag = createTag<CorrelationStore>('correlation-store', { required: true })
    scope.tags.push({ tag: storeTag, value: store })

    return undefined
  },

  wrap: <T>(scope: Core.Scope, next: () => Promised<T>, operation: Extension.Operation): Promise<T> | Promised<T> => {
    // Type-safe operation handling
    if (operation.kind === 'execute') {
      const storeTag = createTag<CorrelationStore>('correlation-store', { required: true })
      const store = scope.tags?.find(t => t.tag === storeTag)?.value as CorrelationStore | undefined

      if (!store || store.disposed) {
        // Graceful degradation: extension state unavailable
        console.warn('[correlation] Store unavailable, skipping tracking')
        return next()
      }

      const correlationId = operation.context?.find(correlationIdTag) ??
                           `corr-${Date.now()}-${Math.random().toString(36).slice(2)}`

      // Track request start
      store.activeRequests.set(correlationId, {
        startTime: Date.now(),
        flowName: operation.definition.name
      })

      return next()
        .then((result) => {
          // Track completion
          const request = store.activeRequests.get(correlationId)
          if (request) {
            const duration = Date.now() - request.startTime
            console.log(`[correlation] ${correlationId} completed in ${duration}ms`)
            store.activeRequests.delete(correlationId)
          }
          return result
        })
        .catch((error) => {
          // Error handling: log and cleanup
          const request = store.activeRequests.get(correlationId)
          if (request) {
            console.error(`[correlation] ${correlationId} failed after ${Date.now() - request.startTime}ms`)
            store.activeRequests.delete(correlationId)
          }
          throw error
        })
    }

    return next()
  },

  dispose: async (scope) => {
    const storeTag = createTag<CorrelationStore>('correlation-store', { required: true })
    const store = scope.tags?.find(t => t.tag === storeTag)?.value as CorrelationStore | undefined

    if (store) {
      // Cleanup: warn about incomplete requests
      if (store.activeRequests.size > 0) {
        console.warn(`[correlation] Disposing with ${store.activeRequests.size} active requests`)
      }
      store.activeRequests.clear()
      store.disposed = true
    }
  }
} satisfies Extension.Extension)
```

### Pattern Breakdown

**1. Init - Setup State**
```typescript
init: (scope) => {
  const store = { /* state */ }
  // Attach to scope via tags
  scope.tags = scope.tags || []
  scope.tags.push({ tag: storeTag, value: store })
}
```

**2. Wrap - Access State with Error Handling**
```typescript
wrap: (scope, next, operation) => {
  const store = /* retrieve from scope.tags */

  if (!store || store.disposed) {
    // CRITICAL: Graceful degradation
    return next()
  }

  // Extension logic with try/catch
  return next()
    .then(result => { /* success */ return result })
    .catch(error => { /* cleanup */ throw error })
}
```

**3. Dispose - Cleanup State**
```typescript
dispose: (scope) => {
  const store = /* retrieve from scope.tags */
  if (store) {
    store.activeRequests.clear()
    store.disposed = true
  }
}
```

### Type Safety Pattern

```typescript
// ✅ Correct: Discriminated union with narrowing
wrap: (scope, next, operation) => {
  if (operation.kind === 'execute') {
    // TypeScript knows: operation.definition, operation.input exist
    const flowName = operation.definition.name
    const input = operation.input
  }

  if (operation.kind === 'journal') {
    // TypeScript knows: operation.key, operation.params exist
    const key = operation.key
  }

  return next()
}

// ❌ Wrong: Accessing properties without narrowing
wrap: (scope, next, operation) => {
  const flowName = operation.definition.name  // Type error!
  return next()
}
```

### Error Handling Pattern

```typescript
// ✅ Correct: Never break flow execution
wrap: (scope, next, operation) => {
  try {
    // Extension logic that might fail
    const result = externalService.track(operation)
  } catch (error) {
    // Log but don't throw
    console.error('[extension] Tracking failed:', error)
  }

  // ALWAYS call next()
  return next()
}

// ❌ Wrong: Throwing from extension
wrap: (scope, next, operation) => {
  const result = externalService.track(operation)  // Might throw!
  return next()  // Flow breaks if tracking fails
}
```

### Testing Stateful Extensions

**Unit test - Extension logic:**
```typescript
import { describe, test, expect, vi } from 'vitest'
import { createScope, flow } from '@pumped-fn/core-next'
import { correlationExtension } from './correlation'

test('correlation extension tracks request lifecycle', async () => {
  const scope = createScope({ extensions: [correlationExtension] })

  const testFlow = flow(async (ctx, input: number) => {
    return await ctx.run('double', () => input * 2)
  })

  const result = await scope.exec(testFlow, 5)

  expect(result).toBe(10)
  // Verify extension behavior via logs or exported metrics

  await scope.dispose()
})
```

**Integration test - With real flows:**
```typescript
test('correlation extension handles flow errors gracefully', async () => {
  const scope = createScope({ extensions: [correlationExtension] })

  const failingFlow = flow(async () => {
    throw new Error('Intentional failure')
  })

  await expect(scope.exec(failingFlow)).rejects.toThrow('Intentional failure')

  // Extension should cleanup despite error
  await scope.dispose()
})
```

---

## Part 3: Advanced Patterns by Capability

### Stateful: Rate Limiter

```typescript
type RateLimitConfig = { maxRequests: number; windowMs: number }
type RateLimitStore = { requests: Map<string, number[]>; config: RateLimitConfig }

export const rateLimiterExtension = (config: RateLimitConfig) => extension({
  name: 'rate-limiter',

  init: (scope) => {
    const store: RateLimitStore = {
      requests: new Map(),
      config
    }
    const storeTag = createTag<RateLimitStore>('rate-limit-store', { required: true })
    scope.tags = scope.tags || []
    scope.tags.push({ tag: storeTag, value: store })
  },

  wrap: (scope, next, operation) => {
    if (operation.kind !== 'execute') return next()

    const storeTag = createTag<RateLimitStore>('rate-limit-store', { required: true })
    const store = scope.tags?.find(t => t.tag === storeTag)?.value as RateLimitStore | undefined
    if (!store) return next()

    const flowKey = operation.definition.name
    const now = Date.now()
    const requests = store.requests.get(flowKey) || []

    // Remove expired requests
    const validRequests = requests.filter(t => now - t < store.config.windowMs)

    if (validRequests.length >= store.config.maxRequests) {
      return Promise.reject(new Error(`Rate limit exceeded for ${flowKey}`))
    }

    validRequests.push(now)
    store.requests.set(flowKey, validRequests)

    return next()
  },

  dispose: (scope) => {
    const storeTag = createTag<RateLimitStore>('rate-limit-store', { required: true })
    const store = scope.tags?.find(t => t.tag === storeTag)?.value as RateLimitStore | undefined
    if (store) store.requests.clear()
  }
})
```

### Integration: APM (Application Performance Monitoring)

```typescript
type APMClient = { startTransaction: (name: string) => APMTransaction }
type APMTransaction = { end: () => void; setError: (error: unknown) => void }
type APMStore = { client: APMClient; activeTransactions: Map<string, APMTransaction> }

export const apmExtension = (client: APMClient) => extension({
  name: 'apm',

  init: (scope) => {
    const store: APMStore = {
      client,
      activeTransactions: new Map()
    }
    const storeTag = createTag<APMStore>('apm-store', { required: true })
    scope.tags = scope.tags || []
    scope.tags.push({ tag: storeTag, value: store })
  },

  wrap: (scope, next, operation) => {
    if (operation.kind !== 'execute') return next()

    const storeTag = createTag<APMStore>('apm-store', { required: true })
    const store = scope.tags?.find(t => t.tag === storeTag)?.value as APMStore | undefined
    if (!store) return next()

    const transactionId = `${operation.definition.name}-${Date.now()}`

    let transaction: APMTransaction | undefined
    try {
      transaction = store.client.startTransaction(operation.definition.name)
      store.activeTransactions.set(transactionId, transaction)
    } catch (error) {
      // APM client failure should not break flows
      console.error('[apm] Failed to start transaction:', error)
      return next()
    }

    return next()
      .then((result) => {
        transaction?.end()
        store.activeTransactions.delete(transactionId)
        return result
      })
      .catch((error) => {
        transaction?.setError(error)
        transaction?.end()
        store.activeTransactions.delete(transactionId)
        throw error
      })
  },

  dispose: async (scope) => {
    const storeTag = createTag<APMStore>('apm-store', { required: true })
    const store = scope.tags?.find(t => t.tag === storeTag)?.value as APMStore | undefined
    if (!store) return

    // End all active transactions
    for (const [id, transaction] of store.activeTransactions) {
      try {
        transaction.end()
      } catch (error) {
        console.error(`[apm] Failed to end transaction ${id}:`, error)
      }
    }
    store.activeTransactions.clear()
  }
})
```

### Context Propagation: Multi-tenant Isolation

```typescript
const tenantIdTag = createTag<string>('tenant-id', { required: true })

export const tenantIsolationExtension = extension({
  name: 'tenant-isolation',

  wrap: (scope, next, operation) => {
    if (operation.kind === 'execute' || operation.kind === 'subflow') {
      // Ensure tenant ID propagates through hierarchy
      const tenantId = operation.context?.find(tenantIdTag)

      if (!tenantId) {
        return Promise.reject(new Error('Tenant ID required but not found'))
      }

      // Validate tenant ID format
      if (!/^tenant-[a-z0-9]+$/.test(tenantId)) {
        return Promise.reject(new Error(`Invalid tenant ID format: ${tenantId}`))
      }

      // Log access for audit
      console.log(`[tenant] ${tenantId} executing ${operation.definition.name}`)
    }

    return next()
  }
})
```

### Policy Enforcement: Authorization

```typescript
type AuthPolicy = (flowName: string, input: unknown, userId: string) => boolean
type AuthStore = { policy: AuthPolicy }

const userIdTag = createTag<string>('user-id', { required: true })

export const authExtension = (policy: AuthPolicy) => extension({
  name: 'authorization',

  init: (scope) => {
    const store: AuthStore = { policy }
    const storeTag = createTag<AuthStore>('auth-store', { required: true })
    scope.tags = scope.tags || []
    scope.tags.push({ tag: storeTag, value: store })
  },

  wrap: (scope, next, operation) => {
    if (operation.kind !== 'execute') return next()

    const storeTag = createTag<AuthStore>('auth-store', { required: true })
    const store = scope.tags?.find(t => t.tag === storeTag)?.value as AuthStore | undefined
    if (!store) return next()

    const userId = operation.context?.find(userIdTag)
    if (!userId) {
      return Promise.reject(new Error('User ID required for authorization'))
    }

    const allowed = store.policy(operation.definition.name, operation.input, userId)
    if (!allowed) {
      return Promise.reject(new Error(`User ${userId} not authorized for ${operation.definition.name}`))
    }

    return next()
  }
})
```

### Devtools: Execution Timeline Inspector

```typescript
type ExecutionEvent = {
  timestamp: number
  kind: string
  flowName?: string
  key?: string
  duration?: number
}
type DevtoolsStore = { timeline: ExecutionEvent[]; enabled: boolean }

export const devtoolsExtension = extension({
  name: 'devtools',

  init: (scope) => {
    const store: DevtoolsStore = {
      timeline: [],
      enabled: process.env.NODE_ENV === 'development'
    }
    const storeTag = createTag<DevtoolsStore>('devtools-store', { required: true })
    scope.tags = scope.tags || []
    scope.tags.push({ tag: storeTag, value: store })
  },

  wrap: (scope, next, operation) => {
    const storeTag = createTag<DevtoolsStore>('devtools-store', { required: true })
    const store = scope.tags?.find(t => t.tag === storeTag)?.value as DevtoolsStore | undefined
    if (!store || !store.enabled) return next()

    const startTime = Date.now()
    const event: ExecutionEvent = {
      timestamp: startTime,
      kind: operation.kind
    }

    if (operation.kind === 'execute' || operation.kind === 'subflow') {
      event.flowName = operation.definition.name
    }
    if (operation.kind === 'journal') {
      event.key = operation.key
    }

    return next()
      .then((result) => {
        event.duration = Date.now() - startTime
        store.timeline.push(event)
        return result
      })
      .catch((error) => {
        event.duration = Date.now() - startTime
        store.timeline.push(event)
        throw error
      })
  },

  dispose: (scope) => {
    const storeTag = createTag<DevtoolsStore>('devtools-store', { required: true })
    const store = scope.tags?.find(t => t.tag === storeTag)?.value as DevtoolsStore | undefined
    if (store) {
      // Export timeline before disposal
      console.log('[devtools] Execution timeline:', JSON.stringify(store.timeline, null, 2))
      store.timeline = []
    }
  }
})
```

### Server Integration: HTTP Endpoint Exposure

```typescript
import type { Hono } from 'hono'

type ServerStore = { app: Hono; routes: Map<string, Flow.UFlow> }

export const httpServerExtension = (app: Hono) => extension({
  name: 'http-server',

  init: (scope) => {
    const store: ServerStore = {
      app,
      routes: new Map()
    }

    // Register HTTP route handler
    app.post('/flow/:flowName', async (c) => {
      const flowName = c.req.param('flowName')
      const flow = store.routes.get(flowName)

      if (!flow) {
        return c.json({ error: 'Flow not found' }, 404)
      }

      const input = await c.req.json()

      try {
        const result = await scope.exec(flow, input)
        return c.json({ success: true, result })
      } catch (error) {
        return c.json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }, 500)
      }
    })

    const storeTag = createTag<ServerStore>('server-store', { required: true })
    scope.tags = scope.tags || []
    scope.tags.push({ tag: storeTag, value: store })
  },

  wrap: (scope, next, operation) => {
    if (operation.kind === 'execute') {
      const storeTag = createTag<ServerStore>('server-store', { required: true })
      const store = scope.tags?.find(t => t.tag === storeTag)?.value as ServerStore | undefined
      if (store) {
        // Auto-register flows as HTTP endpoints
        store.routes.set(operation.definition.name, operation.flow)
      }
    }
    return next()
  }
})
```

---

## Key Principles

| Principle | Rationale | Pattern |
|-----------|-----------|---------|
| **Never break flows** | Extensions observe, not control | Wrap all extension logic in try/catch |
| **Graceful degradation** | Extension failure ≠ flow failure | Return next() if extension state unavailable |
| **Type-safe operations** | Discriminated unions prevent errors | Always narrow with if (operation.kind === ...) |
| **Cleanup on dispose** | Prevent resource leaks | Clear maps, close connections, mark disposed |
| **Stateless wrap preferred** | Simpler, less error-prone | Use stateless when possible (see extension-basics.md) |
| **Scope for resources** | Extensions can access dependencies | Use scope.resolve() for DB, logger, etc. |
| **Tags for context** | Propagate data through hierarchy | Use tag system, not global variables |

---

## Related Sub-skills

- **extension-basics** - Using existing extensions, basic wrap() patterns
- **flow-context** - Understanding ctx.run() and ctx.exec() that extensions intercept
- **testing-flows** - Testing flows with extensions enabled
- **entrypoint-patterns** - Attaching extensions at app initialization
