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
2. **wrap** - Called for every operation (execution, resolve)
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

Extensions intercept 2 operation kinds via `wrap()`:

```typescript
type Operation =
  | { kind: "resolve"; executor: Executor<unknown>; operation: "resolve" | "update"; scope: Scope }
  | {
      kind: "execution";
      target: FlowTarget | FnTarget | ParallelTarget;
      input: unknown;
      key?: string;
      context: Tag.Store;
      executionContext?: ExecutionContext.Context;
    }

type FlowTarget = { type: "flow"; flow: Flow.UFlow; definition: Flow.Definition }
type FnTarget = { type: "fn"; params?: readonly unknown[] }
type ParallelTarget = { type: "parallel"; mode: "parallel" | "parallelSettled"; count: number }
```

**Resolve operation** - Extension can intercept executor resolution:
- Wrap resource access with caching
- Track dependency resolution performance
- Implement lazy loading strategies

**Execution operation** - Extension can intercept flow/function/parallel execution:
- Target discrimination via `target.type` ("flow" | "fn" | "parallel")
- Named operations indicated by `key` field (for journaling/replay)
- Context access via `context` field (Tag.Store with flowMeta tags)
- **NEW: ExecutionContext access** via `executionContext` field (ExecutionContext.Context for nested execution)

### ExecutionContext: Standalone Primitive

**ExecutionContext** is the core execution primitive in pumped-fn:
- Can be created directly via `scope.createExecution()`
- Used independently without flows
- Powers Flow.Context internally
- Provides execution hierarchy, tag inheritance, abort signals
- Layer boundaries + touchpoints visualized in `docs/index.md`; review that diagram before designing or reviewing extensions

```typescript
namespace ExecutionContext {
  interface Details {
    name: string
    startedAt: number
    completedAt?: number
    error?: unknown
    metadata?: Record<string, unknown>
  }

  interface Context {
    readonly scope: Scope
    readonly parent: Context | undefined
    readonly id: string
    readonly tagStore: Tag.Store
    readonly signal: AbortSignal
    readonly details: Details

    exec<T>(name: string, fn: (ctx: Context) => T): Promised<T>
    get<T>(tag: Tag.Tag<T>): T
    find<T>(tag: Tag.Tag<T>): T | undefined
    set<T>(tag: Tag.Tag<T>, value: T): void
    end(): void
    throwIfAborted(): void
  }
}
```

**Creating ExecutionContext:**
```typescript
const scope = createScope()
const ctx = scope.createExecution({ name: 'my-operation' })

ctx.exec('step1', async (childCtx) => {
  childCtx.set(someTag, 'value')
  return await doWork()
})

ctx.end()
```

### Context Hierarchy: ExecutionContext → Flow.Context

**ExecutionContext.Context** (primitive):
- Core execution context interface
- Created via `scope.createExecution()`
- Methods: `exec()`, `get()`, `find()`, `set()`, `end()`, `throwIfAborted()`
- Tag API: `ctx.get(tag)`, `ctx.set(tag, value)` - uses Tag object
- Used for any execution, not just flows

**Flow.Context** (extension of ExecutionContext):
- Extends ExecutionContext.Context with flow-specific operations
- Created automatically by flow execution
- Additional methods: `run()`, `parallel()`, `parallelSettled()`, `resetJournal()`
- Overloaded `exec()` for flow/fn execution with retry/timeout options
- Tag API: same as ExecutionContext, `ctx.get(tag)`, `ctx.set(tag, value)`

**Extension operation.context (Tag.Store)**:
- Low-level tag storage interface
- Available on all `execution` operations (kind: "execution")
- Methods: `get(key)`, `set(key, value)`
- Tag API: `context.get(tag.key)`, `context.set(tag.key, value)` - uses symbol key
- Direct access to tag storage without wrapper methods

**Extension operation.executionContext (ExecutionContext.Context)**:
- Available on `execution` operations for nested executions
- Full ExecutionContext.Context interface
- Use for creating child contexts, accessing execution hierarchy
- Tag API: `executionContext.get(tag)`, `executionContext.set(tag, value)` - uses Tag object

**API Comparison:**

| API | Where | Get Tag | Set Tag | Notes |
|-----|-------|---------|---------|-------|
| ExecutionContext.Context | `scope.createExecution()`, `operation.executionContext` | `ctx.get(tag)` | `ctx.set(tag, value)` | Primitive, uses Tag objects |
| Flow.Context | Flow body `ctx` parameter | `ctx.get(tag)` | `ctx.set(tag, value)` | Extends ExecutionContext, uses Tag objects |
| Tag.Store | `operation.context` | `store.get(tag.key)` | `store.set(tag.key, value)` | Low-level, uses symbol keys |

**Visual Example - All Three APIs:**

```typescript
const requestIdTag = tag(custom<string>(), { label: 'request-id' })

const example = extension({
  name: 'multi-api-example',
  wrap: (scope, next, operation) => {
    if (operation.kind === 'execution') {
      const requestIdFromStore = operation.context.get(requestIdTag.key)
      console.log('Tag.Store API (symbol key):', requestIdFromStore)

      if (!requestIdFromStore) {
        operation.context.set(requestIdTag.key, `req-${Date.now()}`)
      }

      if (operation.executionContext) {
        const requestIdFromExecCtx = operation.executionContext.find(requestIdTag)
        console.log('ExecutionContext API (Tag object):', requestIdFromExecCtx)

        operation.executionContext.exec('nested', (childCtx) => {
          console.log('Child context parent:', childCtx.parent === operation.executionContext)
          return 'result'
        })
      }
    }

    return next()
  }
})
```

### Tag System for Context Propagation

Tags propagate data through execution hierarchy. All `execution` operations have `context: Tag.Store`:

```typescript
import { tag, custom, flowMeta } from '@pumped-fn/core-next'

const requestIdTag = tag(custom<string>(), { label: 'request-id' })

const tracingExtension = extension({
  name: 'tracing',
  wrap: (scope, next, operation) => {
    if (operation.kind === 'execution') {
      const requestId = operation.context.get(requestIdTag.key) as string | undefined

      if (!requestId) {
        const newId = `req-${Date.now()}`
        operation.context.set(requestIdTag.key, newId)
      }

      // Access nesting depth via flowMeta tags
      const depth = (operation.context.get(flowMeta.depth.key) as number) || 0
      console.log(`Execution at depth ${depth}`)
    }
    return next()
  }
})
```

**Pattern:** Use `context.get(tag.key)` and `context.set(tag.key, value)` with Tag.Store.
**Nesting context:** Use `flowMeta.depth`, `flowMeta.flowName`, `flowMeta.parentFlowName` tags.

---

## Part 2: Build Your First Stateful Extension

### Complete Example: Request Correlation Tracker

**Goal:** Track requests across flows using correlation IDs with proper lifecycle.

See: `correlationExtension` in skill-examples/extensions.ts

```typescript
import { extension } from '@pumped-fn/core-next'
import type { Extension, Core } from '@pumped-fn/core-next/types'

type CorrelationStore = {
  activeRequests: Map<string, { startTime: number; flowName: string }>
  disposed: boolean
}

// WeakMap for extension state (scope → state)
const stateMap = new WeakMap<Core.Scope, CorrelationStore>()

export const correlationExtension = extension({
  name: 'correlation-tracker',

  init: (scope) => {
    const store: CorrelationStore = {
      activeRequests: new Map(),
      disposed: false
    }
    stateMap.set(scope, store)
  },

  wrap: <T>(scope: Core.Scope, next: () => Promised<T>, operation: Extension.Operation): Promise<T> | Promised<T> => {
    const store = stateMap.get(scope)

    if (!store || store.disposed) {
      // Graceful degradation: extension state unavailable
      console.warn('[correlation] Store unavailable, skipping tracking')
      return next()
    }

    // Type-safe operation handling
    if (operation.kind === 'execution' && operation.target.type === 'flow') {
      const correlationId = `corr-${Date.now()}-${Math.random().toString(36).slice(2)}`

      // Track request start
      store.activeRequests.set(correlationId, {
        startTime: Date.now(),
        flowName: operation.target.definition.name
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
    const store = stateMap.get(scope)
    if (store) {
      // Cleanup: warn about incomplete requests
      if (store.activeRequests.size > 0) {
        console.warn(`[correlation] Disposing with ${store.activeRequests.size} active requests`)
      }
      store.activeRequests.clear()
      store.disposed = true
      stateMap.delete(scope)
    }
  }
} satisfies Extension.Extension)
```

### Pattern Breakdown

**1. Init - Setup State with WeakMap**
```typescript
const stateMap = new WeakMap<Core.Scope, MyState>()

init: (scope) => {
  const store = { /* state */ }
  stateMap.set(scope, store)
}
```

**2. Wrap - Access State with Error Handling**
```typescript
wrap: (scope, next, operation) => {
  const store = stateMap.get(scope)

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
  const store = stateMap.get(scope)
  if (store) {
    store.activeRequests.clear()
    store.disposed = true
    stateMap.delete(scope)
  }
}
```

### Type Safety Pattern

```typescript
// ✅ Correct: Discriminated union with narrowing
wrap: (scope, next, operation) => {
  if (operation.kind === 'execution' && operation.target.type === 'flow') {
    // TypeScript knows: operation.target.definition, operation.input exist
    const flowName = operation.target.definition.name
    const input = operation.input
  }

  if (operation.kind === 'execution' && operation.target.type === 'fn' && operation.key) {
    // TypeScript knows: operation.key, operation.target.params, operation.context exist
    const key = operation.key
    const params = operation.target.params
    const context = operation.context  // Tag.Store
  }

  return next()
}

// ❌ Wrong: Accessing properties without narrowing
wrap: (scope, next, operation) => {
  const flowName = operation.target.definition.name  // Type error!
  return next()
}
```

### Error Handling Pattern

```typescript
// ✅ Correct: Never break flow execution
wrap: (scope, next, operation) => {
  try {
    // Extension logic that might fail
    externalService.track(operation)
  } catch (error) {
    // Log but don't throw
    console.error('[extension] Tracking failed:', error)
  }

  // ALWAYS call next()
  return next()
}

// ❌ Wrong: Throwing from extension
wrap: (scope, next, operation) => {
  externalService.track(operation)  // Might throw!
  return next()  // Flow breaks if tracking fails
}
```

### Testing Stateful Extensions

**Unit test - Extension logic:**
```typescript
import { describe, test, expect } from 'vitest'
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

See: `rateLimiterExtension` in skill-examples/extensions.ts

```typescript
import { extension } from '@pumped-fn/core-next'
import type { Extension, Core } from '@pumped-fn/core-next/types'

type RateLimitConfig = { maxRequests: number; windowMs: number }
type RateLimitStore = { requests: Map<string, number[]>; config: RateLimitConfig }

const stateMap = new WeakMap<Core.Scope, RateLimitStore>()

export const rateLimiterExtension = (config: RateLimitConfig) => extension({
  name: 'rate-limiter',

  init: (scope) => {
    stateMap.set(scope, {
      requests: new Map(),
      config
    })
  },

  wrap: (scope, next, operation) => {
    if (operation.kind !== 'execution' || operation.target.type !== 'flow') return next()

    const store = stateMap.get(scope)
    if (!store) return next()

    const flowKey = operation.target.definition.name
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
    const store = stateMap.get(scope)
    if (store) {
      store.requests.clear()
      stateMap.delete(scope)
    }
  }
} satisfies Extension.Extension)
```

### Integration: APM (Application Performance Monitoring)

See: `apmExtension` in skill-examples/extensions.ts

```typescript
import { extension } from '@pumped-fn/core-next'
import type { Extension, Core } from '@pumped-fn/core-next/types'

type APMClient = { startTransaction: (name: string) => APMTransaction }
type APMTransaction = { end: () => void; setError: (error: unknown) => void }
type APMStore = { client: APMClient; activeTransactions: Map<string, APMTransaction> }

const stateMap = new WeakMap<Core.Scope, APMStore>()

export const apmExtension = (client: APMClient) => extension({
  name: 'apm',

  init: (scope) => {
    stateMap.set(scope, {
      client,
      activeTransactions: new Map()
    })
  },

  wrap: (scope, next, operation) => {
    if (operation.kind !== 'execution' || operation.target.type !== 'flow') return next()

    const store = stateMap.get(scope)
    if (!store) return next()

    const transactionId = `${operation.target.definition.name}-${Date.now()}`

    let transaction: APMTransaction | undefined
    try {
      transaction = store.client.startTransaction(operation.target.definition.name)
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
    const store = stateMap.get(scope)
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
    stateMap.delete(scope)
  }
} satisfies Extension.Extension)
```

### Context Propagation: Multi-tenant Isolation

See: `tenantIsolationExtension` in skill-examples/extensions.ts

```typescript
import { tag, custom, extension } from '@pumped-fn/core-next'
import type { Extension } from '@pumped-fn/core-next/types'

const tenantIdTag = tag(custom<string>(), { label: 'tenant-id' })

export const tenantIsolationExtension = extension({
  name: 'tenant-isolation',

  wrap: (scope, next, operation) => {
    if (operation.kind === 'execution') {
      const tenantId = operation.context.get(tenantIdTag.key) as string | undefined

      if (!tenantId) {
        return Promise.reject(new Error('Tenant ID required but not found'))
      }

      // Validate tenant ID format
      if (!/^tenant-[a-z0-9]+$/.test(tenantId)) {
        return Promise.reject(new Error(`Invalid tenant ID format: ${tenantId}`))
      }

      // Log access for audit
      const opName = operation.target.type === 'flow'
        ? operation.target.definition.name
        : operation.target.type === 'fn' && operation.key
        ? operation.key
        : operation.target.type
      console.log(`[tenant] ${tenantId} executing ${opName}`)
    }

    return next()
  }
} satisfies Extension.Extension)
```

### Policy Enforcement: Authorization

```typescript
import { tag, custom, extension } from '@pumped-fn/core-next'
import type { Extension, Core } from '@pumped-fn/core-next/types'

type AuthPolicy = (flowName: string, input: unknown, userId: string) => boolean
type AuthStore = { policy: AuthPolicy }

const stateMap = new WeakMap<Core.Scope, AuthStore>()
const userIdTag = tag(custom<string>(), { label: 'user-id' })

export const authExtension = (policy: AuthPolicy) => extension({
  name: 'authorization',

  init: (scope) => {
    stateMap.set(scope, { policy })
  },

  wrap: (scope, next, operation) => {
    if (operation.kind !== 'execution' || operation.target.type !== 'flow') return next()

    const store = stateMap.get(scope)
    if (!store) return next()

    // Get userId from context (propagated via tags)
    const userId = (operation.context.get(userIdTag.key) as string) || 'default-user'

    const allowed = store.policy(operation.target.definition.name, operation.input, userId)
    if (!allowed) {
      return Promise.reject(new Error(`User ${userId} not authorized for ${operation.target.definition.name}`))
    }

    return next()
  },

  dispose: (scope) => {
    stateMap.delete(scope)
  }
} satisfies Extension.Extension)
```

### Devtools: Execution Timeline Inspector

```typescript
import { extension } from '@pumped-fn/core-next'
import type { Extension, Core } from '@pumped-fn/core-next/types'

type ExecutionEvent = {
  timestamp: number
  kind: string
  flowName?: string
  key?: string
  duration?: number
}
type DevtoolsStore = { timeline: ExecutionEvent[]; enabled: boolean }

const stateMap = new WeakMap<Core.Scope, DevtoolsStore>()

export const devtoolsExtension = extension({
  name: 'devtools',

  init: (scope) => {
    stateMap.set(scope, {
      timeline: [],
      enabled: process.env.NODE_ENV === 'development'
    })
  },

  wrap: (scope, next, operation) => {
    const store = stateMap.get(scope)
    if (!store || !store.enabled) return next()

    const startTime = Date.now()
    const event: ExecutionEvent = {
      timestamp: startTime,
      kind: operation.kind
    }

    if (operation.kind === 'execution') {
      if (operation.target.type === 'flow') {
        event.flowName = operation.target.definition.name
      }
      if (operation.key) {
        event.key = operation.key
      }
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
    const store = stateMap.get(scope)
    if (store) {
      // Export timeline before disposal
      console.log('[devtools] Execution timeline:', JSON.stringify(store.timeline, null, 2))
      store.timeline = []
      stateMap.delete(scope)
    }
  }
} satisfies Extension.Extension)
```

### Server Integration: HTTP Endpoint Exposure

```typescript
import { extension } from '@pumped-fn/core-next'
import type { Extension, Core, Flow } from '@pumped-fn/core-next/types'
import type { Hono } from 'hono'

type ServerStore = { app: Hono; routes: Map<string, Flow.UFlow> }

const stateMap = new WeakMap<Core.Scope, ServerStore>()

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
        const result = await scope.exec({ flow: flow, input: input })
        return c.json({ success: true, result })
      } catch (error) {
        return c.json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }, 500)
      }
    })

    stateMap.set(scope, store)
  },

  wrap: (scope, next, operation) => {
    if (operation.kind === 'execution' && operation.target.type === 'flow') {
      const store = stateMap.get(scope)
      if (store) {
        // Auto-register flows as HTTP endpoints
        store.routes.set(operation.target.definition.name, operation.target.flow)
      }
    }
    return next()
  },

  dispose: (scope) => {
    const store = stateMap.get(scope)
    if (store) {
      store.routes.clear()
      stateMap.delete(scope)
    }
  }
} satisfies Extension.Extension)
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
| **WeakMap for state** | No memory leaks, no scope mutation | Use WeakMap<Scope, State> pattern |
| **Context uses symbol keys** | Different from flow ctx API | operation.context.get(tag.key) |

---

## Related Sub-skills

- **extension-basics** - Using existing extensions, basic wrap() patterns
- **flow-context** - Understanding ctx.run() and ctx.exec() that extensions intercept
- **testing-flows** - Testing flows with extensions enabled
- **entrypoint-patterns** - Attaching extensions at app initialization
