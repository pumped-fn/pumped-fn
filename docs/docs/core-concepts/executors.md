# Executors

Executors are the fundamental building blocks of Pumped Fn. They encapsulate state, computations, and side effects in a composable, type-safe way.

## What is an Executor?

An executor is a container that holds:
- A **factory function** that produces a value
- **Dependencies** on other executors (optional)
- **Metadata** for debugging and introspection (optional)

## Creating Executors

### `provide()` - Independent State

Use `provide()` to create executors that don't depend on other executors:

```tsx live
import React from 'react';
import { provide } from '@pumped-fn/core-next';
import { useResolves, ScopeProvider } from '@pumped-fn/react';

// Simple value
const message = provide(() => "Hello, World!");

// Complex state
const userSettings = provide(() => ({
  theme: 'dark',
  notifications: true,
  language: 'en'
}));

// Function state
const apiClient = provide(() => {
  return {
    get: async (url) => {
      // Mock API call
      return { data: `Data from ${url}` };
    }
  };
});

function ProvideExample() {
  const [msg, settings, client] = useResolves(message, userSettings, apiClient);
  
  return (
    <div style={{ padding: '20px' }}>
      <h3>Provide Examples</h3>
      <p>Message: {msg}</p>
      <p>Theme: {settings.theme}</p>
      <p>Notifications: {settings.notifications ? 'On' : 'Off'}</p>
      <p>API Client: {typeof client.get}</p>
    </div>
  );
}

export default function App() {
  return (
    <ScopeProvider>
      <ProvideExample />
    </ScopeProvider>
  );
}
```

### `derive()` - Dependent State

Use `derive()` to create executors that depend on other executors:

```tsx live
import React from 'react';
import { provide, derive } from '@pumped-fn/core-next';
import { useResolves, ScopeProvider } from '@pumped-fn/react';

// Base state
const firstName = provide(() => "John");
const lastName = provide(() => "Doe");
const age = provide(() => 25);

// Derived state - single dependency
const fullName = derive([firstName.reactive, lastName.reactive], ([first, last]) => {
  return `${first} ${last}`;
});

// Derived state - object dependencies
const person = derive(
  { firstName: firstName.reactive, lastName: lastName.reactive, age: age.reactive },
  ({ firstName, lastName, age }) => ({
    name: `${firstName} ${lastName}`,
    age,
    isAdult: age >= 18
  })
);

// Derived state - dependent on derived state
const greeting = derive([fullName.reactive], ([name]) => {
  return `Hello, ${name}!`;
});

function DeriveExample() {
  const [full, personInfo, greet] = useResolves(fullName, person, greeting);
  
  return (
    <div style={{ padding: '20px' }}>
      <h3>Derive Examples</h3>
      <p>Full Name: {full}</p>
      <p>Person: {personInfo.name}, Age: {personInfo.age}</p>
      <p>Is Adult: {personInfo.isAdult ? 'Yes' : 'No'}</p>
      <p>Greeting: {greet}</p>
      
      <div style={{ marginTop: '20px' }}>
        <button onClick={() => firstName.update('Jane')}>
          Change First Name
        </button>
        <button onClick={() => age.update(17)} style={{ marginLeft: '10px' }}>
          Make Minor
        </button>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ScopeProvider>
      <DeriveExample />
    </ScopeProvider>
  );
}
```

## Executor Variants

Each executor has different variants that control how they interact with dependencies:

### `.reactive` - Automatic Updates

Use `.reactive` when you want the derived executor to re-run whenever the dependency changes:

```typescript
const count = provide(() => 0);
const doubled = derive([count.reactive], ([count]) => count * 2);
// doubled updates automatically when count changes
```

### `.static` - Access to Accessor

Use `.static` when you need access to the full accessor (for updates, metadata, etc.):

```typescript
const count = provide(() => 0);
const incrementer = derive([count.static], ([countAccessor]) => {
  return () => countAccessor.update(c => c + 1);
});
```

### `.lazy` - No Automatic Resolution

Use `.lazy` when you want to control when the dependency is resolved:

```typescript
const expensiveComputation = provide(() => /* expensive work */);
const controller = derive([expensiveComputation.lazy], ([lazyAccessor]) => {
  return {
    compute: () => lazyAccessor.resolve(),
    getValue: () => lazyAccessor.get()
  };
});
```

## Lifecycle and Side Effects

Executors can perform side effects and cleanup:

```tsx live
import React from 'react';
import { provide, derive } from '@pumped-fn/core-next';
import { useResolves, ScopeProvider } from '@pumped-fn/react';

const interval = provide(() => 1000);
const counter = provide(() => 0);

// Executor with side effects
const timer = derive(
  [interval.reactive, counter.static],
  ([intervalMs, counterAccessor], controller) => {
    console.log(`Starting timer with ${intervalMs}ms interval`);
    
    const intervalId = setInterval(() => {
      counterAccessor.update(c => c + 1);
    }, intervalMs);
    
    // Cleanup function
    controller.cleanup(() => {
      console.log('Cleaning up timer');
      clearInterval(intervalId);
    });
    
    return {
      intervalId,
      stop: () => clearInterval(intervalId)
    };
  }
);

function TimerExample() {
  const [count, timerInfo, intervalMs] = useResolves(counter, timer, interval);
  
  return (
    <div style={{ padding: '20px' }}>
      <h3>Timer Example</h3>
      <p>Count: {count}</p>
      <p>Interval: {intervalMs}ms</p>
      <p>Timer ID: {timerInfo.intervalId}</p>
      
      <div style={{ marginTop: '20px' }}>
        <button onClick={() => interval.update(500)}>
          Faster (500ms)
        </button>
        <button onClick={() => interval.update(2000)} style={{ marginLeft: '10px' }}>
          Slower (2000ms)
        </button>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ScopeProvider>
      <TimerExample />
    </ScopeProvider>
  );
}
```

## Controller API

The controller parameter provides lifecycle management:

```typescript
derive(dependencies, (deps, controller) => {
  // Cleanup function - called when:
  // - The executor is updated
  // - The executor is released
  // - The scope is disposed
  controller.cleanup(() => {
    console.log('Cleaning up');
  });
  
  // Release this executor
  controller.release();
  
  // Access to the current scope
  const scope = controller.scope;
  
  return value;
});
```

## Best Practices

### 1. Keep Factory Functions Pure

Factory functions should be pure when possible:

```typescript
// Good - pure function
const doubled = derive([count.reactive], ([count]) => count * 2);

// Avoid - side effects in factory
const doubled = derive([count.reactive], ([count]) => {
  console.log('Computing doubled'); // Side effect
  return count * 2;
});
```

### 2. Use Appropriate Variants

Choose the right variant for your use case:

- `.reactive` for automatic updates
- `.static` for accessing the full accessor
- `.lazy` for delayed resolution

### 3. Handle Side Effects Properly

Always clean up side effects:

```typescript
const subscription = derive([source.reactive], ([source], controller) => {
  const sub = source.subscribe(handler);
  
  controller.cleanup(() => {
    sub.unsubscribe();
  });
  
  return sub;
});
```

## Next Steps

Now that you understand executors, explore:
- [React Integration](../react/overview.md) - Using executors in React components
- [Examples](../examples/counter.md) - More practical examples