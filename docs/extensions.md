# Extensions - Cross-Cutting Functionality

Extensions provide a unified API to extend both scope and flow functionality with cross-cutting concerns like logging, monitoring, error handling, and custom lifecycle management.

## Core Concepts

Extensions work across the entire pumped-fn system:

- **Scope Extensions**: Extend executor resolution, dependency management, and reactive systems
- **Flow Extensions**: Extend structured business logic and validation systems
- **Unified API**: Single extension interface works for both scopes and flows

### Key Principle
Extensions access existing scope capabilities rather than duplicating them. The scope parameter provides all lifecycle hooks needed for telemetry, debugging, and functionality expansion.

## Extension API

### Interface Definition

```typescript

interface Extension {
  name: string

  // Scope lifecycle
  init?(scope: Core.Scope): void | Promise<void>
  dispose?(scope: Core.Scope): void | Promise<void>

  // Pod lifecycle (for flows)
  initPod?(pod: Core.Pod, context: DataStore): void | Promise<void>
  disposePod?(pod: Core.Pod): void | Promise<void>

  // Operation wrapping
  wrapResolve?(next: () => Promise<unknown>, context: ResolveContext): Promise<unknown>
  wrapExecute?<T>(context: DataStore, next: () => Promise<T>, execution: ExecutionContext): Promise<T>

  // Error handling
  onError?(error: Error, scope: Core.Scope): void
  onPodError?(error: unknown, pod: Core.Pod, context: DataStore): void
}

interface ResolveContext {
  operation: 'resolve' | 'update'
  executor: Core.Executor<unknown>
  scope: Core.Scope
}

interface ExecutionContext {
  flowName: string | undefined
  depth: number
  isParallel: boolean
  parentFlowName: string | undefined
}
```

### Scope Access Capabilities

Extensions get full access to scope capabilities:

- `scope.onChange()` - Monitor all resolve/update events
- `scope.onRelease()` - Track executor lifecycle
- `scope.entries()` - Inspect cache state
- `scope.accessor(executor)` - Direct executor access
- Full reactive system integration

### Operation Wrapping vs Events

Wrap methods provide advantages over traditional event patterns:

```typescript

// ❌ Complex state tracking across events
const startTimes = new Map()
scope.onChange((event, executor, value) => {
  if (event === 'resolve') {
    startTimes.set(executor, Date.now())
  } else if (event === 'update') {
    const duration = Date.now() - startTimes.get(executor)
    // Record metrics, cleanup state...
  }
})

// ✅ Clean, single-function metrics
async function wrapResolve(next, context) {
  const start = Date.now()
  try {
    const result = await next()
    recordMetrics({ duration: Date.now() - start, success: true })
    return result
  } catch (error) {
    recordMetrics({ duration: Date.now() - start, error: true })
    throw error
  }
}
```

## Extension Patterns

### 1. Performance Monitoring

```typescript

import type { Extension } from "@pumped-fn/core-next";

const performanceExtension = (): Extension => {
  const metrics = new Map()

  return {
    name: "performance",

    async wrapResolve(next, context) {
      const start = performance.now()
      try {
        const result = await next()
        const duration = performance.now() - start

        metrics.set(context.executor, {
          operation: context.operation,
          duration,
          success: true,
          timestamp: Date.now()
        })

        return result
      } catch (error) {
        const duration = performance.now() - start
        metrics.set(context.executor, {
          operation: context.operation,
          duration,
          error: error.message,
          timestamp: Date.now()
        })
        throw error
      }
    },

    async wrapExecute(context, next, execution) {
      const start = performance.now()
      try {
        const result = await next()
        const duration = performance.now() - start

        console.log(`Flow '${execution.flowName}' completed in ${duration.toFixed(2)}ms`)
        return result
      } catch (error) {
        const duration = performance.now() - start
        console.log(`Flow '${execution.flowName}' failed after ${duration.toFixed(2)}ms:`, error)
        throw error
      }
    },

    getMetrics: () => Array.from(metrics.entries())
  }
}
```

### 2. Request Tracing

```typescript

import type { Extension } from "@pumped-fn/core-next";

const tracingExtension = (): Extension => {
  return {
    name: "tracing",

    async initPod(pod, context) {
      // Set trace ID for the entire pod execution
      const traceId = `trace-${Date.now()}-${Math.random().toString(36)}`
      context.set("traceId", traceId)
      context.set("spans", [])
    },

    async wrapResolve(next, context) {
      const traceId = context.scope.accessor(/* traceContext */).get()?.traceId
      console.log(`[${traceId}] Resolving executor: ${context.executor}`)

      const result = await next()
      console.log(`[${traceId}] Resolved executor: ${context.executor}`)
      return result
    },

    async wrapExecute(context, next, execution) {
      const traceId = context.get("traceId")
      const spans = context.get("spans") || []

      const span = {
        flowName: execution.flowName,
        start: Date.now(),
        depth: execution.depth,
        isParallel: execution.isParallel
      }

      spans.push(span)
      context.set("spans", spans)

      console.log(`[${traceId}] Starting ${execution.flowName} (depth: ${execution.depth})`)

      try {
        const result = await next()
        span.end = Date.now()
        span.success = true
        console.log(`[${traceId}] Completed ${execution.flowName} in ${span.end - span.start}ms`)
        return result
      } catch (error) {
        span.end = Date.now()
        span.error = error.message
        console.log(`[${traceId}] Failed ${execution.flowName} after ${span.end - span.start}ms:`, error)
        throw error
      }
    }
  }
}
```

### 3. Development Debugging

```typescript

import type { Extension } from "@pumped-fn/core-next";

const debugExtension = (options: { logLevel: 'info' | 'debug' | 'verbose' } = { logLevel: 'info' }): Extension => {
  return {
    name: "debug",

    init(scope) {
      if (options.logLevel === 'verbose') {
        // Log all scope events
        scope.onChange((event, executor, value) => {
          console.log(`[SCOPE] ${event}:`, { executor: executor.toString(), value })
        })

        scope.onRelease((executor) => {
          console.log(`[SCOPE] release:`, { executor: executor.toString() })
        })
      }
    },

    async wrapResolve(next, context) {
      if (options.logLevel === 'debug' || options.logLevel === 'verbose') {
        console.log(`[RESOLVE] Starting ${context.operation} for executor`)
      }

      const result = await next()

      if (options.logLevel === 'debug' || options.logLevel === 'verbose') {
        console.log(`[RESOLVE] Completed ${context.operation}`, { result })
      }

      return result
    },

    async wrapExecute(context, next, execution) {
      const logPrefix = `[FLOW${execution.depth > 0 ? `:${execution.depth}` : ''}]`

      if (options.logLevel !== 'info') {
        console.log(`${logPrefix} Starting ${execution.flowName}`)
      }

      try {
        const result = await next()

        if (options.logLevel !== 'info') {
          console.log(`${logPrefix} Success ${execution.flowName}`)
        }

        return result
      } catch (error) {
        console.error(`${logPrefix} Error ${execution.flowName}:`, error)
        throw error
      }
    },

    onError(error, scope) {
      console.error('[SCOPE ERROR]', error)
    },

    onPodError(error, pod, context) {
      const traceId = context.get("traceId")
      console.error(`[POD ERROR] ${traceId}:`, error)
    }
  }
}
```

### 4. Error Collection

```typescript

import type { Extension } from "@pumped-fn/core-next";

const errorCollectionExtension = (): Extension => {
  const errors: Array<{ timestamp: number; error: any; context: any }> = []

  return {
    name: "error-collection",

    onError(error, scope) {
      errors.push({
        timestamp: Date.now(),
        error: {
          message: error.message,
          stack: error.stack,
          type: 'scope-error'
        },
        context: {
          scopeId: scope.toString()
        }
      })
    },

    onPodError(error, pod, context) {
      errors.push({
        timestamp: Date.now(),
        error: {
          message: error.message || String(error),
          type: 'flow-error'
        },
        context: {
          traceId: context.get("traceId"),
          spans: context.get("spans")
        }
      })
    },

    getErrors: () => [...errors],
    clearErrors: () => { errors.length = 0 }
  }
}
```

## Using Extensions

### With Scopes

```typescript

import { createScope } from "@pumped-fn/core-next";

const scope = createScope()

// Register extensions
const perfExt = performanceExtension()
const debugExt = debugExtension({ logLevel: 'debug' })

scope.use(perfExt)
scope.use(debugExt)

// Extensions automatically apply to all operations
const result = await scope.resolve(someExecutor)
```

### With Flows

```typescript

import { flow, custom } from "@pumped-fn/core-next";

const myFlow = flow.define({
  name: "example",
  input: custom<{ data: string }>(),
  success: custom<{ result: string }>(),
  error: custom<{ error: string }>()
})

const handler = myFlow.handler(async (ctx, input) => {
  return ctx.ok({ result: input.data.toUpperCase() })
})

// Extensions work automatically with flows
const result = await flow.execute(handler, { data: "hello" }, {
  extensions: [
    tracingExtension(),
    performanceExtension(),
    debugExtension({ logLevel: 'verbose' })
  ]
})
```

### Extension Composition

Extensions compose naturally - multiple extensions can wrap the same operations:

```typescript

const result = await flow.execute(handler, input, {
  extensions: [
    tracingExtension(),      // Adds tracing
    performanceExtension(),  // Adds performance metrics
    debugExtension(),        // Adds debug logging
    errorCollectionExtension() // Collects errors
  ]
})

// Each extension wraps the next, creating a chain:
// tracing -> performance -> debug -> errorCollection -> actual operation
```

## Key Benefits

- **Unified API**: Same extension interface works for both scopes and flows
- **Composable**: Multiple extensions work together automatically
- **Type Safe**: Full TypeScript support with proper context types
- **Lifecycle Aware**: Extensions participate in all lifecycle events
- **Performance Oriented**: Wrap pattern avoids complex state management
- **Testing Friendly**: Extensions can be easily mocked or disabled for testing