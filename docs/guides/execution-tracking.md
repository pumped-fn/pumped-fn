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
