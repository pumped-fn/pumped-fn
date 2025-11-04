# Execution Tracking

Track and control flow executions with IDs, status, cancellation, and timeout.

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
  id: string;                     // Unique UUID
  status: ExecutionStatus;        // Current status
  flowName: string;               // Flow identifier
  abort: AbortController;         // Cancellation control
  result: Promised<T>;           // Execution result
  ctx: Core.Context;             // Execution context
  onStatusChange(callback: StatusCallback): void;
  throwIfAborted(): void;
}
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
