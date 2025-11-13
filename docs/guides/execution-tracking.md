# Execution Tracking

Track and control flow executions with IDs, status, cancellation, and timeout.

## ExecutionContext Primitive

ExecutionContext is the standalone primitive for execution tracking. Create contexts directly via `scope.createExecution()`:

```typescript
const ctx = scope.createExecution({
  name: 'my-operation',
  metadata: { userId: '123' }
})

ctx.exec('subtask', (childCtx) => {
  childCtx.set(userIdTag, '123')
  return performWork()
})

ctx.end()
```

ExecutionContext provides:
- **id**: Unique execution identifier
- **details**: name, startedAt, completedAt, error, metadata
- **signal**: AbortSignal for cancellation
- **tagStore**: Type-safe tag storage with parent inheritance
- **exec()**: Create child contexts
- **get/set/find()**: Tag operations
- **end()**: Mark completion
- **throwIfAborted()**: Cancellation check

Flow.Context extends ExecutionContext with Flow-specific operations (exec with flows, parallel, parallelSettled).

## FlowExecution

`scope.exec()` returns FlowExecution with metadata:

```typescript
const execution = scope.exec({
  flow: orderFlow,
  input: { orderId: '123' },
  timeout: 30000
});

console.log(execution.id); // UUID
console.log(execution.status); // 'running'
console.log(execution.flowName); // 'orderFlow'

const result = await execution.result; // Promised<Order>
```

## Cancellation

Use AbortController to cancel executions:

```typescript
const execution = scope.exec({ flow, input });

setTimeout(() => execution.abort.abort(), 5000);

await execution.result; // Throws if cancelled
```

Flows cooperate via ctx.signal:

```typescript
const flow = flow((ctx, input) => {
  ctx.throwIfAborted(); // Throws if cancelled

  const data = await fetch(url, { signal: ctx.signal });
  return data;
});
```

## Timeout

Set timeout at scope or context level:

```typescript
scope.exec({
  flow,
  input,
  timeout: 30000 // 30 second timeout
});

ctx.exec({
  flow: childFlow,
  input: data,
  timeout: 5000 // 5 second timeout
});
```

## Status Tracking

Subscribe to status changes:

```typescript
execution.onStatusChange((status, exec) => {
  console.log(`Status changed to: ${status}`);

  if (status === 'completed') {
    console.log('Execution finished');
  }
});
```

Status values: 'pending', 'running', 'completed', 'failed', 'cancelled'

## Return Type & API Changes

### scope.exec() Return Type

**New return type:**
```typescript
interface FlowExecution<T> {
  id: string;                               // Unique UUID
  status: ExecutionStatus;                  // Current status
  flowName: string;                         // Flow identifier
  abort: AbortController;                   // Cancellation control
  result: Promised<T>;                     // Execution result
  ctx: Core.Context;                       // Flow execution context
  onStatusChange(callback: StatusCallback): void;
  throwIfAborted(): void;
}
```

Access execution context from FlowExecution:
```typescript
const execution = scope.exec({ flow, input });
const ctx = execution.ctx;  // Access Flow.Context (which extends ExecutionContext)
```

**Backward compatibility:**
```typescript
// Old API (still works via Promised auto-await)
const result = await scope.exec({ flow, input });

// New API (recommended)
const execution = scope.exec({ flow, input });
const result = await execution.result;

// Access execution metadata
console.log(execution.id, execution.status);
```

### ctx.signal and ctx.throwIfAborted()

Flows receive execution context with cancellation support:

```typescript
const myFlow = flow(async (ctx, input) => {
  // Check if cancelled before expensive operation
  ctx.throwIfAborted();

  // Pass signal to external APIs
  const response = await fetch(url, { signal: ctx.signal });

  // Periodic cancellation checks in loops
  for (const item of items) {
    ctx.throwIfAborted();
    await processItem(item);
  }

  return result;
});
```

**Status transition triggers:**
- `pending` → `running`: Flow execution starts
- `running` → `completed`: Flow returns successfully
- `running` → `failed`: Flow throws error
- `running` → `cancelled`: abort() called or timeout exceeded

## Tag.Store in Extensions

Extensions receive Tag.Store via operation.context:

```typescript
const logging = extension({
  name: 'logging',
  wrap(scope, next, operation) {
    if (operation.kind === 'execution') {
      const store = operation.context
      const flowName = store.get(flowMeta.flowName.key) as string | undefined

      if (flowName) {
        console.log(`Starting ${flowName}`)
      }

      const result = await next()

      if (flowName) {
        console.log(`Completed ${flowName}`)
      }
      return result
    }
    return next()
  }
})
```

This enables extensions to access execution metadata and tags via the Tag.Store interface.

## Migration Guide

### For Application Developers

No changes required. Flow.Context continues to work exactly as before:

```typescript
// Existing code works unchanged
flow((ctx, input) => {
  ctx.set(userId, '123')
  const id = ctx.get(userId)
  return ctx.exec(subFlow, data)
})
```

New capability: Access execution context from FlowExecution:

```typescript
const execution = scope.exec({ flow, input })
const ctx = execution.ctx  // Flow.Context (extends ExecutionContext)
console.log(ctx.details.name, ctx.id)
```

### For Extension Developers

Extensions receive Tag.Store via operation.context:

```typescript
extension({
  wrap(scope, next, operation) {
    if (operation.kind === 'execution') {
      const store = operation.context  // Tag.Store with tag access
      const requestId = store.get(requestIdTag.key)
      console.log('Request ID:', requestId)
    }
  }
})
```

For execution tracking in extensions, use operation.context (Tag.Store) to access flow metadata via flowMeta tags.

### For Library Developers

Use ExecutionContext directly without Flow dependency:

```typescript
// Before: Required Flow
import { flow } from '@pumped-fn/core-next'
flow((ctx, input) => { /* ... */ })

// After: Standalone execution context
import { createScope } from '@pumped-fn/core-next'
const scope = createScope()
const ctx = scope.createExecution({ name: 'task' })
ctx.exec('step', (c) => doWork())
```

Benefits:
- No Flow overhead for simple execution tracking
- Direct access to execution metadata (id, details, signal)
- Tag inheritance without Flow-specific APIs
- Lighter dependency for libraries
