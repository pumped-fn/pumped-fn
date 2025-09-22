# Extension Development - @pumped-fn/core-next

_Comprehensive guide for building extensions that extend scope and flow functionality_

## Core Concepts

Extensions extend the library through a unified API that works across both scope and flow contexts:

**Scope Extensions**: Extend executor resolution, dependency management, and reactive systems from [llm.md](./llm.md)
**Flow Extensions**: Extend structured business logic and validation systems from [flow.md](./flow.md)

### Key Principle
Extensions access existing scope capabilities rather than duplicate them. The scope parameter in `extension.init()` provides all lifecycle hooks needed for telemetry, debugging, and functionality expansion.

---

## Extension API

### Unified Extension Interface
```typescript
interface Extension.Extension {
  name: string

  // Scope lifecycle
  init?(scope: Core.Scope): void | Promise<void>
  dispose?(scope: Core.Scope): void | Promise<void>

  // Pod lifecycle
  initPod?(pod: Core.Pod, context: DataStore): void | Promise<void>
  disposePod?(pod: Core.Pod): void | Promise<void>

  // Operation wrapping
  wrapResolve?(next: () => Promise<unknown>, context: ResolveContext): Promise<unknown>
  wrapExecute?<T>(context: DataStore, next: () => Promise<T>, execution: ExecutionContext): Promise<T>

  // Error handling
  onError?(error: ExecutorResolutionError | FactoryExecutionError | DependencyResolutionError, scope: Core.Scope): void
  onPodError?(error: unknown, pod: Core.Pod, context: DataStore): void
}

interface Extension.ResolveContext {
  operation: 'resolve' | 'update'
  executor: Core.Executor<unknown>
  scope: Core.Scope
}

interface Extension.ExecutionContext {
  flowName: string | undefined
  depth: number
  isParallel: boolean
  parentFlowName: string | undefined
}
```

### Scope Access Capabilities
- `scope.onChange()` - Monitor all resolve/update events
- `scope.onRelease()` - Track executor lifecycle
- `scope.onError()` - Handle resolution failures
- `scope.entries()` - Inspect cache state
- `scope.registeredExecutors()` - Access all registered executors
- `scope.accessor(executor)` - Direct executor access
- Full reactive system integration from [Reactive Updates](./llm.md#reactive-updates)

### Operation Wrapping vs Events

The wrap methods provide significant advantages over the traditional `onChange` event pattern:

**Wrap Methods Benefits:**
- **Single Function Scope**: Capture complete operation lifecycle in one function
- **Natural Timing**: `const start = Date.now(); await next(); const duration = Date.now() - start`
- **Error Handling**: Built-in try/catch around operations
- **No State Management**: No need for separate Maps to track timing/state
- **Type Safety**: Each wrap has specific context types
- **Composition**: Multiple extensions naturally compose their wraps

**Old Event Pattern Issues:**
```typescript
// ❌ Complex state tracking across events
const startTimes = new Map()
scope.onChange((event, executor, value) => {
  if (event === 'resolve') {
    startTimes.set(executor, Date.now()) // Start time
  } else if (event === 'update') {
    const duration = Date.now() - startTimes.get(executor) // End time
    // Record metrics...
    startTimes.delete(executor) // Cleanup
  }
})
```

**New Wrap Pattern:**
```typescript
// ✅ Clean, single-function metrics
async wrapResolve(next, context) {
  const start = Date.now()
  try {
    const result = await next()
    const duration = Date.now() - start
    recordMetrics(context.executor, context.operation, { duration, success: true })
    return result
  } catch (error) {
    const duration = Date.now() - start
    recordMetrics(context.executor, context.operation, { duration, error: true })
    throw error
  }
}
```

---

## Essential Extension Patterns

### Pattern 1: Telemetry Collection

```typescript
import { name } from '@pumped-fn/core-next'

const telemetryExtension = (): Extension.Extension => {
  const metrics = new Map()
  let cacheHits = 0
  let cacheMisses = 0

  const extension = {
    name: 'telemetry',

    async wrapResolve(next, { operation, executor, scope }) {
      const executorName = name.find(executor) || 'unnamed'

      if (operation === 'resolve') {
        const hadCache = !!scope.accessor(executor).lookup()

        // Track cache efficiency
        if (hadCache) {
          cacheHits++
        } else {
          cacheMisses++
        }
      }

      const start = performance.now()
      try {
        const result = await next()
        const duration = performance.now() - start

        // Record successful operation metrics
        const currentMetrics = metrics.get(executorName) || {}
        if (operation === 'resolve') {
          metrics.set(executorName, {
            ...currentMetrics,
            lastResolveTime: duration,
            resolveCount: (currentMetrics.resolveCount || 0) + 1,
            lastResolvedAt: Date.now()
          })
        } else {
          metrics.set(executorName, {
            ...currentMetrics,
            lastUpdateTime: duration,
            updateCount: (currentMetrics.updateCount || 0) + 1
          })
        }

        return result
      } catch (error) {
        const duration = performance.now() - start

        // Record failed operation metrics
        const currentMetrics = metrics.get(executorName) || {}
        if (operation === 'resolve') {
          metrics.set(executorName, {
            ...currentMetrics,
            lastErrorTime: duration,
            errorCount: (currentMetrics.errorCount || 0) + 1
          })
        } else {
          metrics.set(executorName, {
            ...currentMetrics,
            lastUpdateErrorTime: duration
          })
        }

        throw error
      }
    },

    // Expose metrics as extension methods
    getMetrics() {
      return {
        cache: {
          hits: cacheHits,
          misses: cacheMisses,
          ratio: cacheHits / (cacheHits + cacheMisses) || 0
        },
        executors: Object.fromEntries(metrics)
      }
    },

    getCacheStats() {
      return { hits: cacheHits, misses: cacheMisses }
    },

    getExecutorMetrics(executorName?: string) {
      return executorName ? metrics.get(executorName) : Object.fromEntries(metrics)
    }
  }

  return extension
}

// Usage:
const telemetry = telemetryExtension()
scope.useExtension(telemetry)

// Access metrics directly from extension instance
console.log(telemetry.getMetrics())
console.log(telemetry.getCacheStats())
```

### Pattern 2: DevTools Integration

```typescript
import { name } from '@pumped-fn/core-next'

const devtoolsExtension = (port = 9001): Extension.Extension => ({
  name: 'devtools',

  init(scope) {
    const wss = new WebSocketServer({ port })
    const clients = new Set()

    wss.on('connection', (ws) => {
      clients.add(ws)

      // Send initial state
      ws.send(JSON.stringify({
        type: 'initial-state',
        executors: scope.entries().map(([exec, accessor]) => ({
          name: name.find(exec) || 'unnamed',
          resolved: !!accessor.lookup(),
          value: accessor.lookup()?.kind === 'resolved' ? accessor.get() : null
        }))
      }))

      ws.on('close', () => clients.delete(ws))

      // Handle remote commands
      ws.on('message', async (data) => {
        const { type, payload } = JSON.parse(data)

        if (type === 'update-executor') {
          const [executor] = scope.entries().find(([e]) => name.find(e) === payload.name) || []
          if (executor) {
            await scope.update(executor, payload.value)
          }
        }

        if (type === 'release-executor') {
          const [executor] = scope.entries().find(([e]) => name.find(e) === payload.name) || []
          if (executor) {
            await scope.release(executor)
          }
        }
      })
    })

    // Broadcast state changes
    scope.onChange((event, executor, value) => {
      const message = JSON.stringify({
        type: 'state-change',
        event,
        executor: name.find(executor) || 'unnamed',
        value: event === 'resolve' ? value : null,
        timestamp: Date.now()
      })

      clients.forEach(ws => ws.send(message))
    })
  },

  dispose() {
    wss.close()
  }
})
```

### Pattern 3: Flow Execution Tracing

```typescript
const tracingExtension = (): Extension.Extension => ({
  name: 'execution-tracer',

  initPod(pod, context) {
    const traces = []
    context.set('traces', traces)
    context.set('currentSpan', null)
  },

  async wrapExecute(context, next, execution) {
    const traces = context.get('traces')
    const parentSpan = context.get('currentSpan')

    const { flowName, depth, isParallel, parentFlowName } = execution

    const span = {
      id: `${Date.now()}-${Math.random()}`,
      name: flowName || 'unknown',
      startTime: performance.now(),
      depth,
      isParallel,
      parentFlowName,
      parent: parentSpan?.id,
      children: [],
      status: 'running'
    }

    traces.push(span)
    if (parentSpan) {
      parentSpan.children.push(span.id)
    }

    context.set('currentSpan', span)

    try {
      const result = await next()
      span.endTime = performance.now()
      span.duration = span.endTime - span.startTime
      span.status = result?.type === 'ko' ? 'error' : 'success'
      return result
    } catch (error) {
      span.endTime = performance.now()
      span.duration = span.endTime - span.startTime
      span.status = 'exception'
      span.error = error.message
      throw error
    } finally {
      context.set('currentSpan', parentSpan)
    }
  }
})
```

### Pattern 4: Error Recovery & Retry

```typescript
const retryExtension = ({ maxRetries = 3, backoffMs = 1000 } = {}): Extension.Extension => {
  const retryStats = new Map()

  const extension = {
    name: 'retry',

    async wrapResolve(next, { operation, executor, scope }) {
      // Only retry resolve operations, not updates
      if (operation !== 'resolve') {
        return next()
      }

      const executorName = name.find(executor) || 'unnamed'
      let attemptCount = 0

      while (attemptCount <= maxRetries) {
        try {
          const result = await next()

          // Success - clear any retry stats
          if (retryStats.has(executorName)) {
            retryStats.delete(executorName)
          }

          return result
        } catch (error) {
          attemptCount++

          // Track retry attempts
          retryStats.set(executorName, {
            attempts: attemptCount,
            lastError: error.message,
            lastAttemptAt: Date.now()
          })

          if (attemptCount > maxRetries || !isRetriableError(error)) {
            throw error
          }

          // Exponential backoff before retry
          const delay = backoffMs * Math.pow(2, attemptCount - 1)
          await new Promise(resolve => setTimeout(resolve, delay))

          // For retries, we need to force re-resolution
          // This would need to be handled at the scope level
        }
      }
    },

    // Expose retry statistics
    getRetryStats() {
      return Object.fromEntries(retryStats)
    },

    getRetryCount(executorName: string) {
      return retryStats.get(executorName)?.attempts || 0
    }
  }

  return extension
}

function isRetriableError(error: any): boolean {
  return error.code === 'NETWORK_ERROR' ||
         error.code === 'TIMEOUT_ERROR' ||
         error.message.includes('rate limit')
}

// Usage:
const retry = retryExtension({ maxRetries: 5, backoffMs: 500 })
scope.useExtension(retry)

// Check retry statistics
console.log(retry.getRetryStats())
```

---

## Extension Composition & Testing

### Combining Extensions
```typescript
const scope = createScope({
  extensions: [
    telemetryExtension(),
    devtoolsExtension(9001),
    retryExtension({ maxRetries: 5 })
  ]
})

// Register executors separately
scope.resolve(dbExecutor)
scope.resolve(apiExecutor)
scope.resolve(cacheExecutor)
```

### Testing Pattern
```typescript
test('extension tracks resolution timing', async () => {
  let metrics: any
  const testExtension: Extension.Extension = {
    name: 'test',
    init(scope) {
      scope.onChange((event, executor, value) => {
        if (event === 'resolve') {
          metrics = { executor: name.find(executor) || 'unnamed', value }
        }
      })
    }
  }

  const scope = createScope({ extensions: [testExtension] })
  await scope.resolve(testExecutor)

  expect(metrics).toBeDefined()
  expect(metrics.executor).toBe('test-executor')
})
```

---

## Flow Extension Integration

Flow extensions work within [Flow execution context](./flow.md#execution) and access [Flow lifecycle](./flow.md#lifecycle-timeline):

```typescript
const performanceExtension: Extension.Extension = {
  name: 'performance-monitor',

  async wrapExecute(context, next, execution) {
    const start = performance.now()
    const result = await next()
    const duration = performance.now() - start

    // Access flow context
    const { flowName, depth, isParallel } = execution

    // Store metrics in context for parent flows
    const metrics = context.get('performance') || []
    metrics.push({ flowName, depth, isParallel, duration })
    context.set('performance', metrics)

    return result
  }
}

// Usage with flow execution
const result = await flow.execute(handler, input, {
  extensions: [performanceExtension]
})
```

---

## Anti-Patterns

❌ **Don't duplicate scope functionality**
```typescript
// Wrong - scope already provides onChange
extension: {
  onResolve: (executor, value) => {} // Redundant
}
```

✅ **Use scope.onChange() instead**
```typescript
extension: {
  init(scope) {
    scope.onChange((event, executor, value) => {
      if (event === 'resolve') { /* handle */ }
    })
  }
}
```

❌ **Don't mutate executor factories**
```typescript
// Wrong - modifies core behavior
init(scope) {
  for (const [executor] of scope.entries()) {
    executor.factory = newFactory // Don't do this!
  }
}
```

✅ **Use presets for testing/mocking**
```typescript
const scope = createScope({
  extensions: [myExtension],
  initialValues: [preset(executor, mockValue)]
})
```

❌ **Don't block in init**
```typescript
// Wrong - delays scope creation
async init(scope) {
  await fetchRemoteConfig() // Blocks initialization
}
```

✅ **Initialize async resources later**
```typescript
init(scope) {
  fetchRemoteConfig().then(config => setupExtension(scope, config))
}
```

---

## Integration with Core Patterns

### With [State + Controller + Display Pattern](./llm.md#pattern-1-state--controller--display-most-common)
```typescript
import { name } from '@pumped-fn/core-next'

const stateTrackingExtension: Extension.Extension = {
  name: 'state-tracking',
  init(scope) {
    scope.onChange((event, executor, value) => {
      // Track state changes, controller actions, display updates
      const executorName = name.find(executor) || 'unnamed'
      if (executorName.includes('state')) logStateChange(value)
      if (executorName.includes('controller')) logControllerAction(value)
      if (executorName.includes('display')) logDisplayUpdate(value)
    })
  }
}
```

### With [Flow Execution](./flow.md#execution)
```typescript
const flowAuditExtension: Extension.Extension = {
  name: 'audit-trail',

  async wrapExecute(context, next, execution) {
    const { flowName } = execution
    const input = context.input

    auditLog.record({ type: 'flow-start', flow: flowName, input })

    try {
      const result = await next()
      auditLog.record({ type: 'flow-end', flow: flowName, result })
      return result
    } catch (error) {
      auditLog.record({ type: 'flow-error', flow: flowName, error })
      throw error
    }
  }
}
```

---

## Complete Example: Production Telemetry

```typescript
export const productionTelemetry = (options: {
  metricsEndpoint?: string
  sampleRate?: number
  enableDevtools?: boolean
}): Extension.Extension => {
  const { metricsEndpoint, sampleRate = 1.0, enableDevtools = false } = options

  return {
    name: 'production-telemetry',

    init(scope) {
      const collector = new MetricsCollector(sampleRate)

      // Resolution performance
      scope.onChange(async (event, executor, value) => {
        if (Math.random() <= sampleRate) {
          collector.record('executor.event', {
            event,
            executor: name.find(executor) || 'unnamed',
            timestamp: Date.now(),
            memoryUsage: process.memoryUsage().heapUsed
          })
        }
      })

      // Error tracking
      scope.onError(async (error, scope) => {
        collector.record('executor.error', {
          error: error.code || error.name,
          message: error.message,
          timestamp: Date.now()
        })
      })

      // Periodic flush
      if (metricsEndpoint) {
        setInterval(() => {
          collector.flush(metricsEndpoint)
        }, 30000)
      }

      // DevTools integration
      if (enableDevtools) {
        setupDevtools(scope)
      }
    },

    async wrapExecute(context, next, execution) {
      const traceId = generateTraceId()
      const { flowName } = execution

      context.set('traceId', traceId)

      const span = {
        traceId,
        flowName,
        startTime: Date.now(),
        parentSpan: context.get('parentSpan')
      }

      try {
        const result = await next()

        if (metricsEndpoint && Math.random() <= sampleRate) {
          sendMetric('flow.execution', {
            ...span,
            duration: Date.now() - span.startTime,
            status: result?.type || 'unknown'
          })
        }

        return result
      } catch (error) {
        sendMetric('flow.error', {
          ...span,
          duration: Date.now() - span.startTime,
          error: error.message
        })
        throw error
      }
    }
  }
}
```

---

## Extension Development Checklist

✅ **Design**
- Uses existing scope/flow capabilities
- Minimal API surface
- Clear separation of concerns
- Testable in isolation

✅ **Implementation**
- Non-blocking initialization
- Proper cleanup in dispose
- Error handling for extension failures
- Memory leak prevention

✅ **Integration**
- Works with existing patterns
- Composes well with other extensions
- Respects executor lifecycle
- Maintains reactive semantics

✅ **Testing**
- Unit tests for extension logic
- Integration tests with scope/flow
- Performance impact testing
- Error condition testing

This extension system enables comprehensive observability, debugging, and extensibility while maintaining the library's generic, dependency-injection focused core.