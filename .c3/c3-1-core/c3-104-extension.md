---
id: c3-104
c3-version: 3
title: Extension System
summary: >
  Cross-cutting concern hooks for observability and behavior modification.
---

# Extension System

## Overview {#c3-104-overview}
<!-- AOP-style hooks -->

The Extension system provides AOP-style hooks for cross-cutting concerns:

- **Extension** - Named plugin with lifecycle hooks
- **wrap()** - Intercept and modify resolution/execution
- **Operation** - Metadata about what's being resolved/executed
- **Pipeline** - Extensions chain together, inner-to-outer

Extensions enable logging, tracing, caching, retry logic, and more without modifying business code.

## Concepts {#c3-104-concepts}

### Extension Interface

An extension implements lifecycle hooks:

| Hook | When Called | Purpose |
|------|-------------|---------|
| `name` | - | Identifier for debugging |
| `init(scope)` | Scope creation | Setup resources, register callbacks |
| `wrap(scope, next, operation)` | Every resolve/exec | Intercept and modify behavior |
| `onError(error, scope)` | Resolution error | Handle or log errors |
| `dispose(scope)` | Scope disposal | Cleanup resources |

All hooks except `name` are optional.

### Operation Types

The `operation` passed to `wrap()` describes what's happening:

**ResolveOperation:**
```typescript
{
  kind: "resolve",
  executor: Core.Executor<unknown>,
  scope: Core.Scope,
  operation: "resolve" | "update"
}
```

**ExecutionOperation:**
```typescript
{
  kind: "execution",
  name: string,
  mode: "sequential" | "parallel" | "parallel-settled",
  input?: unknown,
  key?: string,
  context: Tag.Store,
  flow?: Flow.UFlow,           // Present for flow executions
  definition?: Flow.Definition, // Present for flow executions
  params?: readonly unknown[], // Present for fn executions
  count?: number               // Present for parallel executions
}
```

**Mode field:**
- `"sequential"` - Single flow or function execution
- `"parallel"` - ctx.parallel() operations
- `"parallel-settled"` - ctx.parallelSettled() operations

Use `mode` to determine execution type:
- Sequential with `flow`/`definition` = flow execution
- Sequential with `params` = fn execution
- Parallel modes = check `count` for item count

**ContextLifecycleOperation:**
```typescript
{
  kind: "context-lifecycle",
  phase: "create" | "closing" | "closed",
  context: ExecutionContext.Context,
  mode?: "graceful" | "abort"  // present for "closing" phase
}
```

Emitted when ExecutionContext is created, closing, or closed. Use for tracing spans, request logging, cleanup.

### Pipeline Execution

Extensions form a pipeline, executed outer-to-inner:

```
Extension A (wrap)
  └── Extension B (wrap)
        └── Extension C (wrap)
              └── Core operation (resolve/exec)
              └── Return to C
        └── Return to B
  └── Return to A
```

**Order matters:**
- Extensions added first wrap innermost
- Last extension added wraps outermost
- For logging: add logging extension last to see everything

### The wrap() Pattern

```typescript
wrap(scope, next, operation) {
  // Before: inspect operation, modify context
  console.log(`Starting ${operation.kind}`)

  try {
    const result = await next()  // Call inner layers
    // After: transform result, log success
    console.log(`Completed ${operation.kind}`)
    return result
  } catch (error) {
    // Error: handle, transform, or rethrow
    console.error(`Failed ${operation.kind}`, error)
    throw error
  }
}
```

**Key points:**
- `next()` returns `Promised<unknown>` - await it
- Return value replaces the operation result
- Throwing prevents downstream execution
- Can retry by calling `next()` multiple times

## Common Patterns {#c3-104-patterns}

### Logging Extension

```typescript
const loggingExtension = extension({
  name: "logging",
  wrap: (scope, next, operation) => {
    const start = Date.now()
    console.log(`[${operation.kind}] Starting`)

    return next()
      .map((result) => {
        console.log(`[${operation.kind}] Completed in ${Date.now() - start}ms`)
        return result
      })
      .mapError((error) => {
        console.error(`[${operation.kind}] Failed:`, error)
        throw error
      })
  }
})
```

### Tracing Extension

```typescript
const tracingExtension = extension({
  name: "tracing",
  wrap: (scope, next, operation) => {
    if (operation.kind === "execution" && operation.flow) {
      const traceId = operation.context.get(traceIdTag.key)
      const spanId = crypto.randomUUID()

      console.log(`[trace:${traceId}] Starting span ${spanId}`)
      return next().finally(() => {
        console.log(`[trace:${traceId}] Ending span ${spanId}`)
      })
    }
    return next()
  }
})
```

### Caching Extension

```typescript
const cachingExtension = extension({
  name: "caching",
  init: (scope) => {
    const cache = new Map()
    scope.set("cache", cache)
  },
  wrap: (scope, next, operation) => {
    if (operation.kind !== "execution") return next()

    const key = operation.key
    if (!key) return next()

    const cache = scope.get("cache")
    if (cache.has(key)) {
      return Promised.create(Promise.resolve(cache.get(key)))
    }

    return next().map((result) => {
      cache.set(key, result)
      return result
    })
  },
  dispose: (scope) => {
    scope.get("cache")?.clear()
  }
})
```

### Retry Extension

```typescript
const retryExtension = extension({
  name: "retry",
  wrap: async (scope, next, operation) => {
    const maxRetries = 3
    let lastError: unknown

    for (let i = 0; i < maxRetries; i++) {
      try {
        return await next()
      } catch (error) {
        lastError = error
        console.log(`Retry ${i + 1}/${maxRetries}`)
      }
    }

    throw lastError
  }
})
```

## Lifecycle {#c3-104-lifecycle}

### Registration

Extensions are registered via:
- `createScope({ extensions: [...] })` - At scope creation
- `scope.useExtension(ext)` - Dynamically add

**Dynamic registration:**
```typescript
const cleanup = scope.useExtension(myExtension)
// Later...
cleanup()  // Remove extension
```

### Initialization

`init()` is called:
- Immediately when added via `useExtension()`
- During scope construction for initial extensions

**Use cases:**
- Register scope-level callbacks
- Initialize caches or stores
- Set up external connections

### Disposal

`dispose()` is called:
- During `scope.dispose()`
- Before all executors are released
- In reverse order (last added, first disposed)

**Use cases:**
- Flush buffers
- Close connections
- Clean up resources

## Error Handling {#c3-104-errors}

### onError Hook

Called when resolution fails:
- Receives the error and scope
- Called after error is stored in cache
- Called for all registered extensions
- Does not prevent error from propagating

```typescript
onError(error, scope) {
  // Log to external service
  errorReporter.capture(error)
}
```

### Error in wrap()

If `wrap()` throws:
- Error propagates up the pipeline
- Outer extensions see the error
- `onError()` is called
- Original operation is not retried

## Configuration {#c3-104-config}

Extensions are plain objects implementing `Extension.Extension`:

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | string | Yes | Identifier for debugging |
| `init` | `(scope) => void \| Promise<void>` | No | Initialization hook |
| `wrap` | `(scope, next, operation) => Promised<unknown>` | No | Interception hook |
| `onError` | `(error, scope) => void` | No | Error handling |
| `dispose` | `(scope) => void \| Promise<void>` | No | Cleanup hook |

## The extension() Helper {#c3-104-helper}

The `extension()` function is a no-op type helper:

```typescript
const myExt = extension({
  name: "my-extension",
  wrap: (scope, next, operation) => next()
})
```

It provides TypeScript type inference without runtime overhead.

## Source Files {#c3-104-source}

| File | Contents |
|------|----------|
| `helpers.ts` | extension() type helper |
| `types.ts` | Extension namespace (Operation, ResolveOperation, ExecutionOperation, ContextLifecycleOperation) |
| `scope.ts` | Extension pipeline execution |
| `execution-context.ts` | applyExtensions() utility |

## Testing {#c3-104-testing}

Primary tests: `extensions.behavior.test.ts`

Key test scenarios:
- Extension lifecycle (init, wrap, dispose)
- Pipeline ordering
- Error propagation
- Dynamic registration
- Operation inspection
- Async extensions
