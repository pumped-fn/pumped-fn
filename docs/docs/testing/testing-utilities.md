# Testing Utilities

This guide covers helpful utilities, patterns, and helper functions that make testing Pumped Fn applications easier and more maintainable.

## Custom Test Helpers

### Scope Testing Utilities

```typescript
// test-utils.ts
import { createScope, preset, Core } from "@pumped-fn/core-next";

/**
 * Creates a test scope with optional presets
 */
export function createTestScope(...presets: Core.Preset<unknown>[]) {
  return createScope(...presets);
}

/**
 * Helper for testing executor resolution
 */
export async function resolveExecutor<T>(
  executor: Core.Executor<T>,
  scope?: Core.Scope
): Promise<T> {
  const testScope = scope || createScope();
  return await testScope.resolve(executor);
}

/**
 * Helper for testing reactive chains
 */
export async function testReactiveChain<S, D>(
  source: Core.Executor<S>,
  derived: Core.Executor<D>,
  updates: S[]
): Promise<D[]> {
  const scope = createScope();
  const results: D[] = [];
  
  // Initial value
  results.push(await scope.resolve(derived));
  
  // Apply updates and collect results
  for (const update of updates) {
    await scope.update(source, update);
    results.push(await scope.resolve(derived));
  }
  
  return results;
}

/**
 * Helper for testing cleanup behavior
 */
export async function testCleanup(
  executor: Core.Executor<unknown>,
  expectedCleanupCalls: number = 1
): Promise<{ cleanup: vi.MockedFunction<any>, scope: Core.Scope }> {
  const cleanup = vi.fn();
  
  const testExecutor = derive([executor], ([value], controller) => {
    controller.cleanup(cleanup);
    return value;
  });
  
  const scope = createScope();
  await scope.resolve(testExecutor);
  
  return { cleanup, scope };
}
```

### React Testing Utilities

```typescript
// react-test-utils.tsx
import React from "react";
import { render, RenderOptions } from "@testing-library/react";
import { createScope, preset, Core } from "@pumped-fn/core-next";
import { ScopeProvider } from "@pumped-fn/react";

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  scope?: Core.Scope;
  presets?: Core.Preset<unknown>[];
}

/**
 * Custom render function with ScopeProvider
 */
export function renderWithScope(
  ui: React.ReactElement,
  { scope, presets = [], ...options }: CustomRenderOptions = {}
) {
  const testScope = scope || createScope(...presets);
  
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <ScopeProvider scope={testScope}>{children}</ScopeProvider>;
  }
  
  return {
    ...render(ui, { wrapper: Wrapper, ...options }),
    scope: testScope,
  };
}

/**
 * Wrapper for testing components in isolation
 */
export function createComponentWrapper(
  scope?: Core.Scope,
  presets: Core.Preset<unknown>[] = []
) {
  const testScope = scope || createScope(...presets);
  
  return {
    Wrapper: ({ children }: { children: React.ReactNode }) => (
      <ScopeProvider scope={testScope}>{children}</ScopeProvider>
    ),
    scope: testScope,
  };
}

/**
 * Helper for testing async components with Suspense
 */
export function renderWithSuspense(
  ui: React.ReactElement,
  { fallback = "Loading...", ...options }: CustomRenderOptions & { fallback?: React.ReactNode } = {}
) {
  const WrappedComponent = (
    <React.Suspense fallback={<div data-testid="loading">{fallback}</div>}>
      {ui}
    </React.Suspense>
  );
  
  return renderWithScope(WrappedComponent, options);
}
```

## Custom Matchers

### Vitest Custom Matchers

```typescript
// test-matchers.ts
import { expect } from "vitest";
import { createScope, Core } from "@pumped-fn/core-next";

interface CustomMatchers<R = unknown> {
  toResolveWith(expected: unknown): R;
  toResolveWithin(timeout: number): R;
  toFailWith(errorMessage: string): R;
}

declare module "vitest" {
  interface Assertion<T = any> extends CustomMatchers<T> {}
  interface AsymmetricMatchersContaining extends CustomMatchers {}
}

expect.extend({
  async toResolveWith(executor: Core.Executor<unknown>, expected: unknown) {
    const scope = createScope();
    
    try {
      const actual = await scope.resolve(executor);
      const pass = this.equals(actual, expected);
      
      return {
        pass,
        message: () =>
          pass
            ? `Expected executor not to resolve with ${this.utils.printExpected(expected)}`
            : `Expected executor to resolve with ${this.utils.printExpected(expected)}, but got ${this.utils.printReceived(actual)}`,
      };
    } catch (error) {
      return {
        pass: false,
        message: () =>
          `Expected executor to resolve with ${this.utils.printExpected(expected)}, but it threw: ${error}`,
      };
    }
  },

  async toResolveWithin(executor: Core.Executor<unknown>, timeout: number) {
    const scope = createScope();
    const startTime = Date.now();
    
    try {
      await scope.resolve(executor);
      const duration = Date.now() - startTime;
      const pass = duration <= timeout;
      
      return {
        pass,
        message: () =>
          pass
            ? `Expected executor to take longer than ${timeout}ms, but resolved in ${duration}ms`
            : `Expected executor to resolve within ${timeout}ms, but took ${duration}ms`,
      };
    } catch (error) {
      return {
        pass: false,
        message: () => `Expected executor to resolve within ${timeout}ms, but it threw: ${error}`,
      };
    }
  },

  async toFailWith(executor: Core.Executor<unknown>, errorMessage: string) {
    const scope = createScope();
    
    try {
      await scope.resolve(executor);
      return {
        pass: false,
        message: () => `Expected executor to throw "${errorMessage}", but it resolved successfully`,
      };
    } catch (error) {
      const pass = error.message.includes(errorMessage);
      
      return {
        pass,
        message: () =>
          pass
            ? `Expected executor not to throw "${errorMessage}"`
            : `Expected executor to throw "${errorMessage}", but got "${error.message}"`,
      };
    }
  },
});

// Usage examples:
// await expect(myExecutor).toResolveWith(expectedValue);
// await expect(asyncExecutor).toResolveWithin(1000);
// await expect(failingExecutor).toFailWith("Network error");
```

## State Factory Utilities

### Test Data Factories

```typescript
// test-factories.ts
import { provide, derive } from "@pumped-fn/core-next";

/**
 * Factory for creating test counter state
 */
export function createTestCounter(initialValue: number = 0) {
  const counter = provide(() => initialValue);
  const doubled = derive([counter.reactive], ([count]) => count * 2);
  const isEven = derive([counter.reactive], ([count]) => count % 2 === 0);
  
  const controller = derive([counter.static], ([ref]) => ({
    increment: () => ref.update(c => c + 1),
    decrement: () => ref.update(c => c - 1),
    set: (value: number) => ref.update(value),
    reset: () => ref.update(initialValue),
  }));
  
  return {
    counter,
    doubled,
    isEven,
    controller,
  };
}

/**
 * Factory for creating test todo state
 */
export function createTestTodos(initialTodos: Todo[] = []) {
  const todos = provide(() => initialTodos);
  
  const completedTodos = derive([todos.reactive], ([list]) =>
    list.filter(todo => todo.completed)
  );
  
  const activeTodos = derive([todos.reactive], ([list]) =>
    list.filter(todo => !todo.completed)
  );
  
  const controller = derive([todos.static], ([ref]) => ({
    add: (text: string) => {
      ref.update(list => [...list, {
        id: Date.now().toString(),
        text,
        completed: false,
      }]);
    },
    toggle: (id: string) => {
      ref.update(list =>
        list.map(todo =>
          todo.id === id ? { ...todo, completed: !todo.completed } : todo
        )
      );
    },
    remove: (id: string) => {
      ref.update(list => list.filter(todo => todo.id !== id));
    },
    clear: () => ref.update([]),
  }));
  
  return {
    todos,
    completedTodos,
    activeTodos,
    controller,
  };
}

/**
 * Factory for creating test user state
 */
export function createTestUser(initialUser?: Partial<User>) {
  const defaultUser: User = {
    id: 1,
    name: "Test User",
    email: "test@example.com",
    settings: {
      theme: "light",
      notifications: true,
    },
    ...initialUser,
  };
  
  const user = provide(() => defaultUser);
  
  const userProfile = derive([user.reactive], ([u]) => ({
    displayName: u.name,
    avatar: `https://avatar.example.com/${u.id}`,
    initials: u.name
      .split(" ")
      .map(n => n[0])
      .join("")
      .toUpperCase(),
  }));
  
  const userPreferences = derive([user.reactive], ([u]) => u.settings);
  
  const controller = derive([user.static], ([ref]) => ({
    updateName: (name: string) => ref.update(u => ({ ...u, name })),
    updateEmail: (email: string) => ref.update(u => ({ ...u, email })),
    updateSettings: (settings: Partial<UserSettings>) =>
      ref.update(u => ({
        ...u,
        settings: { ...u.settings, ...settings },
      })),
  }));
  
  return {
    user,
    userProfile,
    userPreferences,
    controller,
  };
}
```

## Mock and Spy Utilities

### API Mocking

```typescript
// api-mocks.ts
import { vi } from "vitest";
import { provide, derive } from "@pumped-fn/core-next";

/**
 * Creates a mock API client
 */
export function createMockApi() {
  const mockFetch = vi.fn();
  const mockGet = vi.fn();
  const mockPost = vi.fn();
  const mockPut = vi.fn();
  const mockDelete = vi.fn();
  
  const api = provide(() => ({
    fetch: mockFetch,
    get: mockGet,
    post: mockPost,
    put: mockPut,
    delete: mockDelete,
  }));
  
  const apiHelpers = {
    mockSuccess: (data: any) => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(data) });
      mockGet.mockResolvedValue(data);
      mockPost.mockResolvedValue(data);
      mockPut.mockResolvedValue(data);
      mockDelete.mockResolvedValue(data);
    },
    
    mockError: (error: string) => {
      const errorResponse = new Error(error);
      mockFetch.mockRejectedValue(errorResponse);
      mockGet.mockRejectedValue(errorResponse);
      mockPost.mockRejectedValue(errorResponse);
      mockPut.mockRejectedValue(errorResponse);
      mockDelete.mockRejectedValue(errorResponse);
    },
    
    mockLoading: (delay: number = 1000) => {
      const pendingPromise = new Promise(resolve => setTimeout(resolve, delay));
      mockFetch.mockReturnValue(pendingPromise);
      mockGet.mockReturnValue(pendingPromise);
      mockPost.mockReturnValue(pendingPromise);
      mockPut.mockReturnValue(pendingPromise);
      mockDelete.mockReturnValue(pendingPromise);
    },
    
    getMocks: () => ({
      fetch: mockFetch,
      get: mockGet,
      post: mockPost,
      put: mockPut,
      delete: mockDelete,
    }),
  };
  
  return { api, ...apiHelpers };
}

/**
 * Creates a mock timer utility
 */
export function createMockTimer() {
  const callbacks = new Set<() => void>();
  
  const timer = provide(() => ({
    setInterval: (callback: () => void, ms: number) => {
      callbacks.add(callback);
      return setInterval(callback, ms);
    },
    clearInterval: (id: number) => {
      clearInterval(id);
    },
    tick: () => {
      callbacks.forEach(callback => callback());
    },
  }));
  
  return {
    timer,
    tick: () => {
      callbacks.forEach(callback => callback());
    },
    clearAll: () => {
      callbacks.clear();
    },
  };
}
```

## Test Assertion Helpers

### State Assertion Utilities

```typescript
// assertion-helpers.ts
import { Core, createScope } from "@pumped-fn/core-next";

/**
 * Asserts that an executor resolves to the expected value
 */
export async function assertResolves<T>(
  executor: Core.Executor<T>,
  expected: T,
  scope?: Core.Scope
): Promise<void> {
  const testScope = scope || createScope();
  const actual = await testScope.resolve(executor);
  expect(actual).toEqual(expected);
}

/**
 * Asserts that an executor throws the expected error
 */
export async function assertThrows(
  executor: Core.Executor<unknown>,
  expectedError: string | RegExp,
  scope?: Core.Scope
): Promise<void> {
  const testScope = scope || createScope();
  await expect(testScope.resolve(executor)).rejects.toThrow(expectedError);
}

/**
 * Asserts that a reactive chain works correctly
 */
export async function assertReactiveChain<S, D>(
  source: Core.Executor<S>,
  derived: Core.Executor<D>,
  updates: Array<{ input: S; expected: D }>,
  scope?: Core.Scope
): Promise<void> {
  const testScope = scope || createScope();
  
  for (const { input, expected } of updates) {
    await testScope.update(source, input);
    const actual = await testScope.resolve(derived);
    expect(actual).toEqual(expected);
  }
}

/**
 * Asserts that cleanup functions are called
 */
export async function assertCleanup(
  executor: Core.Executor<unknown>,
  expectedCalls: number = 1,
  scope?: Core.Scope
): Promise<vi.MockedFunction<any>> {
  const cleanup = vi.fn();
  const testScope = scope || createScope();
  
  const wrappedExecutor = derive([executor], ([value], controller) => {
    controller.cleanup(cleanup);
    return value;
  });
  
  await testScope.resolve(wrappedExecutor);
  await testScope.release(wrappedExecutor);
  
  expect(cleanup).toHaveBeenCalledTimes(expectedCalls);
  return cleanup;
}
```

## Example Usage

### Complete Test Suite Example

```typescript
// complete-test-example.test.ts
import { vi, test, expect, describe, beforeEach } from "vitest";
import { renderWithScope, createTestCounter, assertResolves } from "./test-utils";
import { fireEvent, screen, waitFor } from "@testing-library/react";

describe("Counter with Test Utilities", () => {
  let counterState: ReturnType<typeof createTestCounter>;
  
  beforeEach(() => {
    counterState = createTestCounter(10);
  });
  
  test("executor behavior", async () => {
    const { counter, doubled, controller } = counterState;
    
    // Test initial values
    await assertResolves(counter, 10);
    await assertResolves(doubled, 20);
    
    // Test reactive updates
    await assertReactiveChain(counter, doubled, [
      { input: 5, expected: 10 },
      { input: 0, expected: 0 },
      { input: -3, expected: -6 },
    ]);
  });
  
  test("component integration", async () => {
    const { counter, doubled, controller } = counterState;
    
    function TestComponent() {
      const [count, doubledValue, ctrl] = useResolves(counter, doubled, controller);
      
      return (
        <div>
          <span data-testid="count">{count}</span>
          <span data-testid="doubled">{doubledValue}</span>
          <button onClick={ctrl.increment} data-testid="increment">
            +
          </button>
        </div>
      );
    }
    
    renderWithScope(<TestComponent />);
    
    expect(screen.getByTestId("count")).toHaveTextContent("10");
    expect(screen.getByTestId("doubled")).toHaveTextContent("20");
    
    fireEvent.click(screen.getByTestId("increment"));
    
    await waitFor(() => {
      expect(screen.getByTestId("count")).toHaveTextContent("11");
      expect(screen.getByTestId("doubled")).toHaveTextContent("22");
    });
  });
});
```

These testing utilities make your Pumped Fn tests more maintainable, readable, and less repetitive while providing powerful assertion capabilities.