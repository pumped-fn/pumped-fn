# Quick Start

Let's build a simple counter application to demonstrate the core concepts of Pumped Fn.

## Step 1: Create State

First, let's create a simple counter state using `provide()`:

```typescript
import { provide } from '@pumped-fn/core-next';

const counter = provide(() => 0);
```

The `provide()` function creates an **executor** that holds state. The function passed to `provide()` is called a **factory function** - it returns the initial value.

## Step 2: Create Derived State

Now let's create some derived state that depends on our counter:

```typescript
import { provide, derive } from '@pumped-fn/core-next';

const counter = provide(() => 0);

// Derived state that automatically updates when counter changes
const doubledCounter = derive([counter.reactive], ([count]) => count * 2);
const isEven = derive([counter.reactive], ([count]) => count % 2 === 0);
```

The `derive()` function creates computed state that automatically updates when its dependencies change. Notice the `.reactive` - this tells Pumped Fn to re-run the derivation whenever the counter changes.

## Step 3: Create a React Component

Now let's use our state in a React component:

```tsx
import React from 'react';
import { useResolves } from '@pumped-fn/react';

function Counter() {
  const [count, doubled, even] = useResolves(counter, doubledCounter, isEven);
  
  return (
    <div>
      <p>Count: {count}</p>
      <p>Doubled: {doubled}</p>
      <p>Is even: {even ? 'Yes' : 'No'}</p>
      <button onClick={() => counter.update(c => c + 1)}>
        Increment
      </button>
      <button onClick={() => counter.update(c => c - 1)}>
        Decrement
      </button>
    </div>
  );
}
```

The `useResolves()` hook subscribes to multiple executors and returns their current values. The component will automatically re-render when any of the values change.

## Step 4: Set Up the Scope Provider

Finally, wrap your app with the `ScopeProvider`:

```tsx
import React from 'react';
import { ScopeProvider } from '@pumped-fn/react';

function App() {
  return (
    <ScopeProvider>
      <Counter />
    </ScopeProvider>
  );
}

export default App;
```

The `ScopeProvider` creates a scope that manages the lifecycle of your executors.

## Complete Example

Here's the complete working example:

```tsx live
import React from 'react';
import { provide, derive } from '@pumped-fn/core-next';
import { useResolves, ScopeProvider } from '@pumped-fn/react';

// State definitions
const counter = provide(() => 0);
const doubledCounter = derive([counter.reactive], ([count]) => count * 2);
const isEven = derive([counter.reactive], ([count]) => count % 2 === 0);

function Counter() {
  const [count, doubled, even] = useResolves(counter, doubledCounter, isEven);
  
  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h3>Counter Example</h3>
      <p>Count: <strong>{count}</strong></p>
      <p>Doubled: <strong>{doubled}</strong></p>
      <p>Is even: <strong>{even ? 'Yes' : 'No'}</strong></p>
      <div style={{ marginTop: '10px' }}>
        <button 
          onClick={() => counter.update(c => c + 1)}
          style={{ marginRight: '10px' }}
        >
          Increment
        </button>
        <button onClick={() => counter.update(c => c - 1)}>
          Decrement
        </button>
      </div>
    </div>
  );
}

function App() {
  return (
    <ScopeProvider>
      <Counter />
    </ScopeProvider>
  );
}

export default App;
```

## What Just Happened?

1. **State Creation**: We created a counter executor with `provide()`
2. **Derived State**: We created computed values that automatically update with `derive()`
3. **React Integration**: We used `useResolves()` to subscribe to state in our component
4. **Automatic Updates**: When we call `counter.update()`, all dependent components and derivations update automatically

## Key Concepts Introduced

- **Executors**: Units of state created with `provide()` or `derive()`
- **Reactive Dependencies**: Using `.reactive` to create automatic updates
- **Scopes**: Containers that manage executor lifecycles
- **Hooks**: React integration with `useResolves()`

## Optional: Adding Tests

Testing your Pumped Fn state is straightforward and highly recommended. Here's a simple test for our counter example:

### Setup

First, install testing dependencies:

```bash
npm install --save-dev vitest @testing-library/react @testing-library/jest-dom jsdom
```

### Test Configuration

Create `vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
  },
});
```

Create `tests/setup.ts`:

```typescript
import "@testing-library/jest-dom";
```

### Testing Our Counter

Pumped Fn makes testing easy with the `preset` function. Instead of mocking, you simulate different states:

```typescript
// counter.test.tsx
import { test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { provide, derive, createScope, preset } from "@pumped-fn/core-next";
import { useResolves, ScopeProvider } from "@pumped-fn/react";

// Our state (same as before)
const counter = provide(() => 0);
const doubledCounter = derive([counter.reactive], ([count]) => count * 2);
const isEven = derive([counter.reactive], ([count]) => count % 2 === 0);

// Component to test
function Counter() {
  const [count, doubled, even] = useResolves(counter, doubledCounter, isEven);
  
  return (
    <div>
      <span data-testid="count">{count}</span>
      <span data-testid="doubled">{doubled}</span>
      <span data-testid="even">{even ? 'Even' : 'Odd'}</span>
    </div>
  );
}

// Test different counter states using preset
test("counter displays correctly for different values", () => {
  // Test with count = 0 (even)
  const evenScope = createScope(preset(counter, 0));
  const { container: evenContainer } = render(
    <ScopeProvider scope={evenScope}>
      <Counter />
    </ScopeProvider>
  );
  expect(screen.getByTestId("count")).toHaveTextContent("0");
  expect(screen.getByTestId("doubled")).toHaveTextContent("0");
  expect(screen.getByTestId("even")).toHaveTextContent("Even");
  
  // Test with count = 7 (odd)
  const oddScope = createScope(preset(counter, 7));
  const { container: oddContainer } = render(
    <ScopeProvider scope={oddScope}>
      <Counter />
    </ScopeProvider>
  );
  expect(screen.getByTestId("count")).toHaveTextContent("7");
  expect(screen.getByTestId("doubled")).toHaveTextContent("14");
  expect(screen.getByTestId("even")).toHaveTextContent("Odd");
});

// Test derived state logic directly
test("counter derivations work correctly", async () => {
  // Test with different preset values
  const testCases = [
    { input: 0, doubled: 0, even: true },
    { input: 5, doubled: 10, even: false },
    { input: 12, doubled: 24, even: true },
  ];
  
  for (const { input, doubled, even } of testCases) {
    const scope = createScope(preset(counter, input));
    
    expect(await scope.resolve(doubledCounter)).toBe(doubled);
    expect(await scope.resolve(isEven)).toBe(even);
  }
});
```

### Run Tests

Add to your `package.json`:

```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui"
  }
}
```

Run tests:

```bash
npm test
```

### Why Test?

- **Confidence**: Ensure your state logic works correctly
- **Refactoring**: Safely change implementation while maintaining behavior
- **Documentation**: Tests serve as living examples of how your state works
- **Debugging**: Isolate issues in your state management logic

For more comprehensive testing strategies, see our [Testing Guide](../testing/overview.md).

## Next Steps

Now that you understand the basics (and optionally how to test them), let's build a more complex application in [Your First App](./first-app.md)!