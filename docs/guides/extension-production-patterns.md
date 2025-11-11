---
title: Extension Production Patterns
description: Collect metrics, traces, and observability data using existing Extension API
keywords: [extensions, production, monitoring, observability, tracing]
---

# Extension Production Patterns

Current Extension interface provides all capabilities needed for production observability. No additional hooks required.

## Available Data Points

### From Operation Types

**Resolve operations:**
```ts
operation.kind === "resolve"
operation.executor.dependencies  // Dependency graph
operation.executor.tags          // Executor metadata
operation.scope.registeredExecutors()  // All executors in scope
operation.scope.entries()        // All cached values
```

**Execution operations:**
```ts
operation.kind === "execution"
operation.target.type            // "flow" | "fn" | "parallel"
operation.target.definition?.name // Flow name (if flow)
operation.key                    // Named operation key (if journaled)
operation.context                // Tag store for correlation
// Access depth via: operation.context.get(flowMeta.depth.key)
```

### Timing Operations

```ts
wrap: async (scope, next, operation) => {
  const start = Date.now()
  try {
    const result = await next()
    const duration = Date.now() - start
    // Log success with duration
    return result
  } catch (error) {
    const duration = Date.now() - start
    // Log failure with duration
    throw error
  }
}
```

### Correlation Across Operations

Use context tags and depth tracking:

```ts
const traceId = tag(custom<string>(), { label: 'trace.id' })

const tracer = extension({
  name: 'tracer',
  wrap: async (scope, next, operation) => {
    if (operation.kind === 'execution' && operation.target.type === 'flow') {
      const ctx = operation.context
      const tid = traceId.readFrom(ctx) || generateTraceId()
      const depth = (ctx.get(flowMeta.depth.key) as number) || 0

      // Create span for flow execution
      const span = createSpan(tid, operation.target.definition.name, depth)
      return recordSpan(span, next)
    }

    return next()
  }
})
```

### Inspecting Dependency Resolution

```ts
const depTracker = extension({
  name: 'dep-tracker',
  wrap: async (scope, next, operation) => {
    if (operation.kind === 'resolve') {
      const deps = operation.executor.dependencies
      if (deps) {
        // Log dependency resolution start
        console.log('Resolving', { deps })
      }
    }
    return next()
  }
})
```

### Accessing Cached State

```ts
const cacheMonitor = extension({
  name: 'cache-monitor',
  init: (scope) => {
    // Snapshot current cache state
    const entries = scope.entries()
    for (const [executor, accessor] of entries) {
      const state = accessor.lookup()
      if (state?.kind === 'resolved') {
        console.log('Cached value exists', { executor })
      }
    }
  },
  wrap: async (scope, next, operation) => {
    if (operation.kind === 'resolve') {
      const accessor = operation.scope.accessor(operation.executor, false)
      const state = accessor.lookup()

      if (state?.kind === 'resolved') {
        // Cache hit
      } else {
        // Cache miss
      }
    }
    return next()
  }
})
```

## Production Extension Examples

### Distributed Tracing

```ts
const tracer = extension({
  name: 'tracer',
  wrap: async (scope, next, operation) => {
    const traceId = operation.kind === 'execution'
      ? requestId.readFrom(operation.context) || generateId()
      : generateId()
    const spanId = generateSpanId()

    const span = {
      traceId,
      spanId,
      operation: operation.kind,
      name: operation.kind === 'execution' && operation.target.type === 'flow'
        ? operation.target.definition.name
        : undefined,
      depth: operation.kind === 'execution'
        ? (operation.context.get(flowMeta.depth.key) as number) || 0
        : undefined,
      startTime: Date.now()
    }

    try {
      const result = await next()
      span.endTime = Date.now()
      span.status = 'success'
      exportSpan(span)
      return result
    } catch (error) {
      span.endTime = Date.now()
      span.status = 'error'
      span.error = error
      exportSpan(span)
      throw error
    }
  }
})
```

### Metrics Collection

```ts
const metrics = extension({
  name: 'metrics',
  wrap: async (scope, next, operation) => {
    const start = performance.now()

    try {
      const result = await next()
      const duration = performance.now() - start

      metrics.histogram('operation.duration', duration, {
        kind: operation.kind,
        targetType: operation.kind === 'execution' ? operation.target.type : undefined,
        name: operation.kind === 'execution' && operation.target.type === 'flow'
          ? operation.target.definition.name
          : undefined
      })

      metrics.counter('operation.success', 1, { kind: operation.kind })

      return result
    } catch (error) {
      const duration = performance.now() - start

      metrics.histogram('operation.duration', duration, {
        kind: operation.kind,
        error: true
      })

      metrics.counter('operation.error', 1, { kind: operation.kind })

      throw error
    }
  }
})
```

### Resource Monitoring

```ts
const resourceMonitor = extension({
  name: 'resource-monitor',
  init: (scope) => {
    setInterval(() => {
      const executors = scope.registeredExecutors()
      const entries = scope.entries()

      metrics.gauge('scope.executors', executors.length)
      metrics.gauge('scope.cached', entries.length)
    }, 5000)
  },
  wrap: async (scope, next, operation) => {
    if (operation.kind === 'resolve') {
      const memBefore = process.memoryUsage().heapUsed
      const result = await next()
      const memAfter = process.memoryUsage().heapUsed

      metrics.histogram('memory.allocated', memAfter - memBefore)

      return result
    }
    return next()
  }
})
```

## Key Patterns

**Correlation:** Use context tags (requestId, traceId) passed through operations

**Timing:** Wrap `next()` with performance.now() for precise timing

**Inspection:** Access `operation.executor`, `operation.scope` for metadata

**Aggregation:** Maintain extension state across wrap() calls for metrics

**Filtering:** Check `operation.kind` to target specific operation types

## No Missing Capabilities

Extension interface is complete for production:
- All operation data accessible via `operation` parameter
- Timing via wrapping `next()`
- State inspection via `scope.entries()`, `scope.registeredExecutors()`
- Correlation via context tags
- Error handling via try/catch around `next()`

Additional hooks would only add API surface without new capabilities.
