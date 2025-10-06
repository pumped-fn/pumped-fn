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

  // Unified operation wrapping
  wrap?<T>(
    context: DataStore,
    next: () => Promise<T>,
    operation: Operation
  ): Promise<T>

  // Error handling
  onError?(error: Error, scope: Core.Scope): void
  onPodError?(error: unknown, pod: Core.Pod, context: DataStore): void
}

type Operation =
  | {
      kind: "resolve"
      executor: Core.Executor<unknown>
      scope: Core.Scope
      operation: "resolve" | "update"
    }
  | {
      kind: "execute"
      flow: Flow.UFlow
      definition: Flow.Definition<any, any>
      input: unknown
      flowName: string | undefined
      depth: number
      isParallel: boolean
      parentFlowName: string | undefined
    }
  | {
      kind: "journal"
      key: string
      flowName: string
      depth: number
      isReplay: boolean
      pod: Core.Pod
      params?: readonly unknown[]
    }
  | {
      kind: "subflow"
      flow: Flow.UFlow
      definition: Flow.Definition<any, any>
      input: unknown
      journalKey: string | undefined
      parentFlowName: string | undefined
      depth: number
      pod: Core.Pod
    }
  | {
      kind: "parallel"
      mode: "parallel" | "parallelSettled"
      promiseCount: number
      depth: number
      parentFlowName: string | undefined
      pod: Core.Pod
    }
```

### Scope Access Capabilities

Extensions get full access to scope capabilities:

- `scope.onChange()` - Monitor all resolve/update events
- `scope.onRelease()` - Track executor lifecycle
- `scope.entries()` - Inspect cache state
- `scope.accessor(executor)` - Direct executor access
- Full reactive system integration

### Unified Operation Wrapping

The `wrap` method intercepts all operations with a discriminated union type. This provides advantages over traditional event patterns:

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

// ✅ Clean, single-function metrics with operation discrimination
async function wrap<T>(context, next, operation): Promise<T> {
  const start = Date.now()
  try {
    const result = await next()
    recordMetrics({
      kind: operation.kind,
      duration: Date.now() - start,
      success: true
    })
    return result
  } catch (error) {
    recordMetrics({
      kind: operation.kind,
      duration: Date.now() - start,
      error: true
    })
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

    async wrap(context, next, operation) {
      const start = performance.now()

      try {
        const result = await next()
        const duration = performance.now() - start

        if (operation.kind === "resolve") {
          metrics.set(operation.executor, {
            operation: operation.operation,
            duration,
            success: true,
            timestamp: Date.now()
          })
        } else if (operation.kind === "execute") {
          console.log(`Flow '${operation.flowName}' completed in ${duration.toFixed(2)}ms`)
        }

        return result
      } catch (error) {
        const duration = performance.now() - start

        if (operation.kind === "resolve") {
          metrics.set(operation.executor, {
            operation: operation.operation,
            duration,
            error: (error as Error).message,
            timestamp: Date.now()
          })
        } else if (operation.kind === "execute") {
          console.log(`Flow '${operation.flowName}' failed after ${duration.toFixed(2)}ms:`, error)
        }

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
import { accessor, custom } from "@pumped-fn/core-next";

const traceIdAccessor = accessor("traceId", custom<string>());
const spansAccessor = accessor("spans", custom<any[]>(), []);

const tracingExtension = (): Extension => {
  return {
    name: "tracing",

    async initPod(pod, context) {
      const traceId = `trace-${Date.now()}-${Math.random().toString(36)}`
      traceIdAccessor.set(context, traceId)
      spansAccessor.set(context, [])
    },

    async wrap(context, next, operation) {
      const traceId = traceIdAccessor.find(context)

      if (operation.kind === "resolve") {
        console.log(`[${traceId}] ${operation.operation} executor`)
        const result = await next()
        console.log(`[${traceId}] ${operation.operation} complete`)
        return result
      }

      if (operation.kind === "execute" || operation.kind === "subflow") {
        const spans = spansAccessor.get(context)
        const span: any = {
          flowName: operation.definition.name,
          start: Date.now(),
          depth: operation.depth
        }

        spans.push(span)

        console.log(`[${traceId}] Starting ${span.flowName} (depth: ${operation.depth})`)

        try {
          const result = await next()
          span.end = Date.now()
          span.success = true
          console.log(`[${traceId}] Completed ${span.flowName} in ${span.end - span.start}ms`)
          return result
        } catch (error) {
          span.end = Date.now()
          span.error = (error as Error).message
          console.log(`[${traceId}] Failed ${span.flowName} after ${span.end - span.start}ms:`, error)
          throw error
        }
      }

      return next()
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
        scope.onChange((event, executor, value) => {
          console.log(`[SCOPE] ${event}:`, { executor: executor.toString(), value })
        })

        scope.onRelease((executor) => {
          console.log(`[SCOPE] release:`, { executor: executor.toString() })
        })
      }
    },

    async wrap(context, next, operation) {
      if (operation.kind === "resolve") {
        if (options.logLevel === 'debug' || options.logLevel === 'verbose') {
          console.log(`[RESOLVE] Starting ${operation.operation}`)
        }

        const result = await next()

        if (options.logLevel === 'debug' || options.logLevel === 'verbose') {
          console.log(`[RESOLVE] Completed ${operation.operation}`, { result })
        }

        return result
      }

      if (operation.kind === "execute" || operation.kind === "subflow") {
        const logPrefix = `[FLOW${operation.depth > 0 ? `:${operation.depth}` : ''}]`

        if (options.logLevel !== 'info') {
          console.log(`${logPrefix} Starting ${operation.definition.name}`)
        }

        try {
          const result = await next()

          if (options.logLevel !== 'info') {
            console.log(`${logPrefix} Success ${operation.definition.name}`)
          }

          return result
        } catch (error) {
          console.error(`${logPrefix} Error ${operation.definition.name}:`, error)
          throw error
        }
      }

      return next()
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

const myFlow = flow(async (ctx, input: { data: string }) => {
  return { result: input.data.toUpperCase() }
})

// Extensions work automatically with flows
const result = await flow.execute(myFlow, { data: "hello" }, {
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