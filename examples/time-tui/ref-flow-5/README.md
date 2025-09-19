# Enhanced Function Execution Example

This example demonstrates the improved `ctx.execute` and `ctx.executeParallel` API that supports both Flow executors and regular functions with consistent error handling.

## Key Improvements

### Before (try-catch approach)
```typescript
try {
  const result = await payment.charge(amount, method, token);
  logger.info("Payment successful", { transactionId: result.transactionId });
  return ctx.ok(result);
} catch (error) {
  logger.error("Payment failed", error);
  // Manual error handling and categorization
  return ctx.ko({ ... });
}
```

### After (Result-like approach)
```typescript
const paymentResult = await ctx.execute(
  async (amount: number, method: string, token: string) =>
    payment.charge(amount, method, token),
  [input.amount, input.method, input.token]
);

if (paymentResult.type === "ko") {
  logger.error("Payment failed", paymentResult.data);
  // Error is already wrapped in KO, consistent handling
  return ctx.ko({ ... });
}

logger.info("Payment successful", { transactionId: paymentResult.data.transactionId });
return ctx.ok(paymentResult.data);
```

## Benefits

1. **No try-catch needed**: Functions throwing errors are automatically wrapped as `KO` results
2. **Consistent error handling**: Both Flow executors and functions return the same Result-like structure
3. **Multi-parameter support**: Use arrays for functions with multiple parameters
4. **Type safety**: Full TypeScript support with proper inference
5. **Composability**: Mix Flow executors and functions in `executeParallel`

## Function Types Supported

### Single Parameter Functions
```typescript
await ctx.execute(
  async (customerId: string) => db.findCustomer(customerId),
  input.customerId
);
```

### Multi-Parameter Functions
```typescript
await ctx.execute(
  async (amount: number, method: string, token: string) =>
    payment.charge(amount, method, token),
  [input.amount, input.method, input.token]
);
```

### Mixed Parallel Execution
```typescript
const [emailResult, smsResult, webhookResult] = await ctx.executeParallel([
  [sendEmail, input],                    // Flow executor
  [(id: string) => sendSms(id), input.customerId],  // Single param function
  [(id: string, data: any) => webhook(id, data), [input.orderId, payload]]  // Multi param function
]);
```

## Error Handling Pattern

All functions return consistent `Flow.OK<T> | Flow.KO<E>` results:

```typescript
const result = await ctx.execute(someFunction, input);

if (result.type === "ko") {
  // Handle error - no need for try-catch
  logger.error("Operation failed", result.data);
  return ctx.ko({ code: "ERROR", message: "Operation failed" });
}

// Use successful result
const data = result.data;
return ctx.ok({ processed: data });
```

This approach eliminates the need for external error handling libraries and provides a unified way to handle both Flow executions and regular function calls.