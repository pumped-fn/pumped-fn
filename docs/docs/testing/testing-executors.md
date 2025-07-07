# Testing Executors

This guide covers comprehensive testing strategies for Pumped Fn executors, including basic state, derived state, and complex interactions.

## Basic Executor Testing

### Testing Simple State

```typescript
import { vi, test, expect } from "vitest";
import { provide, createScope } from "@pumped-fn/core-next";

test("basic state executor", async () => {
  // Arrange
  const initialState = { count: 0, name: "test" };
  const state = provide(() => initialState);
  const scope = createScope();
  
  // Act
  const result = await scope.resolve(state);
  
  // Assert
  expect(result).toEqual(initialState);
  expect(result).not.toBe(initialState); // Should be a copy
});

test("state updates", async () => {
  const counter = provide(() => 0);
  const scope = createScope();
  
  // Initial value
  expect(await scope.resolve(counter)).toBe(0);
  
  // Update with value
  await scope.update(counter, 5);
  expect(await scope.resolve(counter)).toBe(5);
  
  // Update with function
  await scope.update(counter, (current) => current + 3);
  expect(await scope.resolve(counter)).toBe(8);
});
```

### Testing Factory Functions

```typescript
test("factory function is called correctly", async () => {
  const factory = vi.fn(() => ({ initialized: true }));
  const executor = provide(factory);
  const scope = createScope();
  
  // Factory not called until resolved
  expect(factory).not.toHaveBeenCalled();
  
  const result = await scope.resolve(executor);
  
  // Factory called exactly once
  expect(factory).toHaveBeenCalledTimes(1);
  expect(result).toEqual({ initialized: true });
  
  // Subsequent resolves don't call factory again
  await scope.resolve(executor);
  expect(factory).toHaveBeenCalledTimes(1);
});
```

## Testing Derived State

### Basic Derivations

```typescript
test("derived state computation", async () => {
  const base = provide(() => 10);
  const doubled = derive([base.reactive], ([value]) => value * 2);
  const scope = createScope();
  
  expect(await scope.resolve(doubled)).toBe(20);
  
  await scope.update(base, 15);
  expect(await scope.resolve(doubled)).toBe(30);
});

test("multiple dependencies", async () => {
  const a = provide(() => 5);
  const b = provide(() => 3);
  const sum = derive([a.reactive, b.reactive], ([aVal, bVal]) => aVal + bVal);
  const scope = createScope();
  
  expect(await scope.resolve(sum)).toBe(8);
  
  await scope.update(a, 10);
  expect(await scope.resolve(sum)).toBe(13);
  
  await scope.update(b, 7);
  expect(await scope.resolve(sum)).toBe(17);
});
```

### Object Dependencies

```typescript
test("object-shaped dependencies", async () => {
  const user = provide(() => ({ name: "John", age: 30 }));
  const settings = provide(() => ({ theme: "dark", language: "en" }));
  
  const profile = derive(
    { user: user.reactive, settings: settings.reactive },
    ({ user, settings }) => ({
      displayName: user.name,
      theme: settings.theme,
      isAdult: user.age >= 18
    })
  );
  
  const scope = createScope();
  const result = await scope.resolve(profile);
  
  expect(result).toEqual({
    displayName: "John",
    theme: "dark",
    isAdult: true
  });
});
```

### Reactive Updates

```typescript
test("reactive dependency updates", async () => {
  const computationMock = vi.fn((value) => value * 2);
  const source = provide(() => 1);
  const derived = derive([source.reactive], ([value]) => computationMock(value));
  
  const scope = createScope();
  
  // Initial computation
  await scope.resolve(derived);
  expect(computationMock).toHaveBeenCalledTimes(1);
  expect(computationMock).toHaveBeenCalledWith(1);
  
  // Update triggers recomputation
  await scope.update(source, 5);
  await scope.resolve(derived);
  expect(computationMock).toHaveBeenCalledTimes(2);
  expect(computationMock).toHaveBeenCalledWith(5);
});
```

## Testing Executor Variants

### Static Dependencies

```typescript
test("static dependencies provide accessor", async () => {
  const counter = provide(() => 0);
  const controller = derive([counter.static], ([accessor]) => ({
    increment: () => accessor.update(c => c + 1),
    decrement: () => accessor.update(c => c - 1),
    getValue: () => accessor.get()
  }));
  
  const scope = createScope();
  const ctrl = await scope.resolve(controller);
  await scope.resolve(counter); // Initialize counter
  
  expect(ctrl.getValue()).toBe(0);
  
  await ctrl.increment();
  expect(ctrl.getValue()).toBe(1);
  
  await ctrl.decrement();
  expect(ctrl.getValue()).toBe(0);
});
```

### Lazy Dependencies

```typescript
test("lazy dependencies are not auto-resolved", async () => {
  const expensive = vi.fn(() => "expensive computation");
  const expensiveExecutor = provide(expensive);
  
  const controller = derive([expensiveExecutor.lazy], ([lazyAccessor]) => ({
    compute: () => lazyAccessor.resolve(),
    hasValue: () => !!lazyAccessor.lookup()
  }));
  
  const scope = createScope();
  const ctrl = await scope.resolve(controller);
  
  // Expensive computation not called yet
  expect(expensive).not.toHaveBeenCalled();
  expect(ctrl.hasValue()).toBe(false);
  
  // Manually trigger computation
  await ctrl.compute();
  expect(expensive).toHaveBeenCalledTimes(1);
  expect(ctrl.hasValue()).toBe(true);
});
```

## Testing Side Effects and Cleanup

### Basic Cleanup

```typescript
test("cleanup functions are called", async () => {
  const cleanup = vi.fn();
  
  const executor = derive([], (_, controller) => {
    controller.cleanup(cleanup);
    return "value";
  });
  
  const scope = createScope();
  await scope.resolve(executor);
  
  expect(cleanup).not.toHaveBeenCalled();
  
  await scope.release(executor);
  expect(cleanup).toHaveBeenCalledTimes(1);
});

test("cleanup on update", async () => {
  const cleanup = vi.fn();
  const trigger = provide(() => 0);
  
  const sideEffect = derive([trigger.reactive], ([value], controller) => {
    controller.cleanup(cleanup);
    return `value-${value}`;
  });
  
  const scope = createScope();
  await scope.resolve(sideEffect);
  
  // Update triggers cleanup and re-execution
  await scope.update(trigger, 1);
  expect(cleanup).toHaveBeenCalledTimes(1);
  
  await scope.update(trigger, 2);
  expect(cleanup).toHaveBeenCalledTimes(2);
});
```

### Resource Management

```typescript
test("timer management", async () => {
  vi.useFakeTimers();
  
  const interval = provide(() => 1000);
  const callback = vi.fn();
  
  const timer = derive([interval.reactive], ([ms], controller) => {
    const id = setInterval(callback, ms);
    controller.cleanup(() => clearInterval(id));
    return id;
  });
  
  const scope = createScope();
  const timerId = await scope.resolve(timer);
  
  expect(typeof timerId).toBe("number");
  expect(callback).not.toHaveBeenCalled();
  
  // Advance time
  vi.advanceTimersByTime(1000);
  expect(callback).toHaveBeenCalledTimes(1);
  
  vi.advanceTimersByTime(1000);
  expect(callback).toHaveBeenCalledTimes(2);
  
  // Update interval - should cleanup old timer
  await scope.update(interval, 500);
  callback.mockClear();
  
  vi.advanceTimersByTime(500);
  expect(callback).toHaveBeenCalledTimes(1);
  
  vi.useRealTimers();
});
```

## Testing Async Executors

### Promise-based State

```typescript
test("async executor resolution", async () => {
  const asyncData = provide(async () => {
    await new Promise(resolve => setTimeout(resolve, 100));
    return { loaded: true, data: "test" };
  });
  
  const scope = createScope();
  const result = await scope.resolve(asyncData);
  
  expect(result).toEqual({ loaded: true, data: "test" });
});

test("async dependency chains", async () => {
  const fetchUser = provide(async () => ({ id: 1, name: "John" }));
  const fetchUserPosts = derive([fetchUser], async ([user]) => {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 50));
    return [`Post 1 by ${user.name}`, `Post 2 by ${user.name}`];
  });
  
  const scope = createScope();
  const posts = await scope.resolve(fetchUserPosts);
  
  expect(posts).toEqual(["Post 1 by John", "Post 2 by John"]);
});
```

### Error Handling

```typescript
test("async error handling", async () => {
  const failingExecutor = provide(async () => {
    await new Promise(resolve => setTimeout(resolve, 10));
    throw new Error("Network error");
  });
  
  const scope = createScope();
  
  await expect(scope.resolve(failingExecutor)).rejects.toThrow("Network error");
});

test("error recovery", async () => {
  let shouldFail = true;
  const unstableExecutor = provide(async () => {
    if (shouldFail) {
      shouldFail = false;
      throw new Error("Temporary failure");
    }
    return "success";
  });
  
  const scope = createScope();
  
  // First attempt fails
  await expect(scope.resolve(unstableExecutor)).rejects.toThrow("Temporary failure");
  
  // Force re-resolution
  const result = await scope.resolve(unstableExecutor, true);
  expect(result).toBe("success");
});
```

## Testing Complex Scenarios

### Multiple Scopes

```typescript
test("isolated scopes", async () => {
  const counter = provide(() => 0);
  
  const scope1 = createScope();
  const scope2 = createScope();
  
  await scope1.update(counter, 5);
  await scope2.update(counter, 10);
  
  expect(await scope1.resolve(counter)).toBe(5);
  expect(await scope2.resolve(counter)).toBe(10);
});
```

### Presets

```typescript
test("preset values", async () => {
  const config = provide(() => ({ env: "development" }));
  const app = derive([config], ([cfg]) => `App running in ${cfg.env}`);
  
  // Default scope
  const defaultScope = createScope();
  expect(await defaultScope.resolve(app)).toBe("App running in development");
  
  // Scope with preset
  const prodScope = createScope(preset(config, { env: "production" }));
  expect(await prodScope.resolve(app)).toBe("App running in production");
});
```

## Performance Testing

### Memory Management

```typescript
test("memory cleanup on scope disposal", async () => {
  const heavyData = provide(() => new Array(1000000).fill("data"));
  const scope = createScope();
  
  await scope.resolve(heavyData);
  
  // Dispose scope and verify cleanup
  await scope.dispose();
  
  // Access should throw after disposal
  expect(() => scope.resolve(heavyData)).toThrow();
});
```

### Subscription Management

```typescript
test("subscription cleanup", async () => {
  const source = provide(() => 0);
  const listener = vi.fn();
  
  const scope = createScope();
  await scope.resolve(source);
  
  const cleanup = scope.onUpdate(source, listener);
  
  await scope.update(source, 1);
  expect(listener).toHaveBeenCalledTimes(1);
  
  cleanup();
  
  await scope.update(source, 2);
  expect(listener).toHaveBeenCalledTimes(1); // Not called after cleanup
});
```

## Testing Utilities

### Custom Matchers

```typescript
// Custom matcher for executor values
expect.extend({
  async toResolveWith(executor, expected) {
    const scope = createScope();
    const actual = await scope.resolve(executor);
    
    return {
      pass: this.equals(actual, expected),
      message: () => `Expected executor to resolve with ${expected}, got ${actual}`
    };
  }
});

// Usage
await expect(myExecutor).toResolveWith(expectedValue);
```

### Test Helpers

```typescript
// Helper for testing reactive chains
async function testReactiveChain(source, derived, updates) {
  const scope = createScope();
  const results = [];
  
  for (const update of updates) {
    await scope.update(source, update);
    results.push(await scope.resolve(derived));
  }
  
  return results;
}

// Usage
const results = await testReactiveChain(
  counter,
  doubled,
  [1, 2, 3, 4]
);
expect(results).toEqual([2, 4, 6, 8]);
```

This comprehensive testing approach ensures your Pumped Fn executors are reliable, performant, and maintainable.