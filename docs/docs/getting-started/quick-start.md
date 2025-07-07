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

## Next Steps

Now that you understand the basics, let's build a more complex application in [Your First App](./first-app.md)!