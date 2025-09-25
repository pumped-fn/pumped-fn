# Troubleshooting Guide - @pumped-fn/core-next

_Common issues and solutions when working with pumped-fn_

## 🔍 Common Graph Resolution Errors

### Circular Dependency Detection

**Error**: `Circular dependency detected`

**Cause**: Two or more executors depend on each other, creating a cycle.

```typescript
// ❌ Circular dependency
const a = derive([b], ([b]) => b + 1);
const b = derive([a], ([a]) => a + 1);  // Error!
```

**Solution**: Refactor to break the cycle
```typescript
// ✅ Use a common source
const source = provide(() => 0);
const a = derive([source], ([s]) => s + 1);
const b = derive([source], ([s]) => s + 2);
```

### Executor Not Found

**Error**: `Executor not found in scope`

**Cause**: Trying to resolve an executor that hasn't been registered.

**Solution**: Ensure executor is resolved before accessing
```typescript
// ❌ Wrong
const scope = createScope();
const value = await scope.resolve(unregisteredExecutor);  // Error!

// ✅ Correct
const executor = provide(() => value);
const scope = createScope();
const value = await scope.resolve(executor);  // Works
```

### Factory Execution Error

**Error**: `Factory execution failed`

**Cause**: Error thrown during executor factory execution.

**Solution**: Add error handling in factory
```typescript
const executor = provide(async (ctl) => {
  try {
    const resource = await createResource();
    ctl.cleanup(() => resource.close());
    return resource;
  } catch (error) {
    // Log error for debugging
    console.error("Resource creation failed:", error);
    throw error;  // Re-throw for proper handling
  }
});
```

## 🔄 Reactive Update Issues

### Updates Not Propagating

**Problem**: Changes to source not updating dependent executors.

**Cause**: Not using `.reactive` in dependencies.

```typescript
// ❌ No updates
const consumer = derive([source], ([val]) => val * 2);

// ✅ Reactive updates
const consumer = derive([source.reactive], ([val]) => val * 2);
```

### Excessive Re-renders

**Problem**: Too many updates triggering performance issues.

**Solution**: Batch updates or debounce
```typescript
// Batch multiple updates
await scope.update(source, (current) => {
  // Multiple changes in one update
  return { ...current, field1: value1, field2: value2 };
});
```

## 💾 Memory Management

### Memory Leaks

**Problem**: Resources not being cleaned up.

**Cause**: Missing cleanup callbacks.

**Solution**: Always register cleanup
```typescript
const service = derive([], (_, ctl) => {
  const resource = createResource();

  // ✅ Register cleanup
  ctl.cleanup(async () => {
    await resource.dispose();
  });

  return resource;
});
```

### Scope Not Disposed

**Problem**: Scopes staying in memory after use.

**Solution**: Always dispose scopes
```typescript
const scope = createScope();
try {
  // Use scope
  const result = await scope.resolve(executor);
} finally {
  // Always cleanup
  await scope.dispose();
}
```

## 🧪 Testing Issues

### Mocks Not Working

**Problem**: Real implementation used instead of mock.

**Cause**: Preset not applied correctly.

**Solution**: Ensure presets are passed during scope creation
```typescript
// ❌ Wrong - preset after scope creation
const scope = createScope();
preset(database, mockDb);  // Too late!

// ✅ Correct - preset during scope creation
const scope = createScope({
  initialValues: [preset(database, mockDb)]
});
```

### Test Isolation Failures

**Problem**: Tests affecting each other.

**Solution**: Create new scope for each test
```typescript
describe("Service", () => {
  let scope;

  beforeEach(() => {
    scope = createScope();  // Fresh scope
  });

  afterEach(async () => {
    await scope.dispose();  // Clean up
  });
});
```

## 🔧 Flow Execution Problems

### Context Not Inherited

**Problem**: Child flows not receiving parent context.

**Solution**: Use `ctx.execute()` for proper propagation
```typescript
// ✅ Context inherited
const parentFlow = flow.handler(async (ctx, input) => {
  ctx.set("userId", "123");

  // Child inherits context
  const result = await ctx.execute(childFlow, data);
  return result;
});
```

### Validation Errors

**Problem**: Input validation failing unexpectedly.

**Solution**: Ensure schema matches input structure
```typescript
// Check schema definition
const schema = z.object({
  email: z.string().email(),  // Must be valid email
  age: z.number().min(0)       // Must be positive
});

// Validate input matches
const input = {
  email: "user@example.com",  // Valid email format
  age: 25                      // Positive number
};
```

## 🔌 Extension Issues

### Extension Not Triggering

**Problem**: Extension hooks not being called.

**Cause**: Extension not registered with scope.

**Solution**: Register extension properly
```typescript
// ❌ Wrong - extension not registered
const scope = createScope();
const extension = myExtension();  // Created but not used

// ✅ Correct - extension registered
const scope = createScope({
  extensions: [myExtension()]
});
```

### Extension Order Matters

**Problem**: Extensions interfering with each other.

**Solution**: Consider extension order
```typescript
// Extensions execute in order
const scope = createScope({
  extensions: [
    loggingExtension(),    // Runs first
    metricsExtension(),    // Runs second
    tracingExtension()     // Runs last
  ]
});
```

## 🎯 Performance Issues

### Slow Resolution

**Problem**: Executor resolution taking too long.

**Causes**:
1. Heavy computation in factories
2. Missing caching
3. Unnecessary dependencies

**Solutions**:
```typescript
// 1. Move heavy computation outside factory
const precomputed = computeExpensiveValue();
const executor = provide(() => precomputed);

// 2. Use static for caching
const cached = derive([source.static], ([accessor]) => {
  // Computed once, cached forever
  return expensiveOperation(accessor.get());
});

// 3. Minimize dependencies
const optimized = derive(
  [onlyNeeded],  // Don't include unnecessary deps
  ([needed]) => process(needed)
);
```

### Large Dependency Graphs

**Problem**: Graph becoming too complex.

**Solution**: Break into modules
```typescript
// Organize by domain
namespace UserDomain {
  export const service = derive([db], ([database]) => {
    // User-specific logic
  });
}

namespace OrderDomain {
  export const service = derive([db], ([database]) => {
    // Order-specific logic
  });
}

// Compose at app level
const app = derive(
  [UserDomain.service, OrderDomain.service],
  ([users, orders]) => ({ users, orders })
);
```

## 📋 Debugging Tips

### Enable Debug Logging

```typescript
const debugExtension: Extension.Extension = {
  name: "debug",

  async wrapResolve(next, { operation, executor }) {
    console.log(`[${operation}] ${executor.name || "unnamed"}`);
    const start = Date.now();
    try {
      const result = await next();
      console.log(`✓ ${Date.now() - start}ms`);
      return result;
    } catch (error) {
      console.log(`✗ Failed: ${error.message}`);
      throw error;
    }
  }
};

const scope = createScope({ extensions: [debugExtension] });
```

### Inspect Dependency Chain

```typescript
// View all registered executors
const executors = scope.registeredExecutors();
console.log("Registered:", executors.map(e => e.name));

// Check resolution state
const entries = scope.entries();
for (const [executor, accessor] of entries) {
  const state = accessor.lookup();
  console.log(`${executor.name}: ${state?.kind || "unresolved"}`);
}
```

### Track Context Flow

```typescript
const contextDebugger = flow.handler(async (ctx, input) => {
  // Log all context keys
  console.log("Context keys:", Array.from(ctx.keys()));

  // Track specific values
  const userId = ctx.get("userId");
  console.log("User ID:", userId);

  return ctx.ok({ debug: true });
});
```

## 🚨 Error Recovery

### Graceful Degradation

```typescript
const resilientService = derive([primaryDb, fallbackDb], async ([primary, fallback]) => {
  try {
    return await primary.connect();
  } catch (error) {
    console.warn("Primary DB failed, using fallback");
    return await fallback.connect();
  }
});
```

### Retry Logic

```typescript
const withRetry = derive([], async () => {
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    try {
      return await riskyOperation();
    } catch (error) {
      attempts++;
      if (attempts === maxAttempts) throw error;
      await new Promise(r => setTimeout(r, 1000 * attempts));
    }
  }
});
```

## 📚 API Reference

For detailed API documentation, see [api.md](./api.md).

## Getting Help

If you encounter issues not covered here:

1. Check [api.md](./api.md) for correct API usage
2. Review [concepts.md](./concepts.md) for fundamentals
3. Look at [patterns/examples.md](./patterns/examples.md) for working examples