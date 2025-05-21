# @pumped-fn/react Usage Guide

This guide provides practical examples of how to use the `@pumped-fn/react` package in your React applications.

## Basic Setup

First, set up your application with the `ScopeProvider`:

```tsx
import React from 'react';
import { ScopeProvider } from '@pumped-fn/react';
import { createScope } from '@pumped-fn/core-next';

// Optional: create a custom scope
const scope = createScope();

function App() {
  return (
    <ScopeProvider scope={scope}>
      {/* Your application components */}
      <YourComponents />
    </ScopeProvider>
  );
}
```

## Basic State Management

### Using Hooks

```tsx
import React from 'react';
import { useResolve, useUpdate } from '@pumped-fn/react';
import { provide } from '@pumped-fn/core-next';

// Create a counter executor
const counterExecutor = provide(() => 0);

function Counter() {
  // Get the current value
  const count = useResolve(counterExecutor);
  
  // Get the update function
  const updateCount = useUpdate(counterExecutor);
  
  const increment = () => updateCount(count + 1);
  const decrement = () => updateCount(count - 1);
  
  return (
    <div>
      <h2>Counter: {count}</h2>
      <button onClick={increment}>Increment</button>
      <button onClick={decrement}>Decrement</button>
    </div>
  );
}
```

### Using Components

```tsx
import React from 'react';
import { Resolve } from '@pumped-fn/react';
import { provide } from '@pumped-fn/core-next';

// Create a counter executor
const counterExecutor = provide(() => 0);

function Counter() {
  return (
    <Resolve e={counterExecutor}>
      {(count) => (
        <div>
          <h2>Counter: {count}</h2>
          <button onClick={() => counterExecutor.update(count + 1)}>
            Increment
          </button>
          <button onClick={() => counterExecutor.update(count - 1)}>
            Decrement
          </button>
        </div>
      )}
    </Resolve>
  );
}
```

## Derived State

```tsx
import React from 'react';
import { useResolve, useUpdate } from '@pumped-fn/react';
import { provide, derive } from '@pumped-fn/core-next';

// Create a counter executor
const counterExecutor = provide(() => 0);

// Create derived executors
const doubleCount = derive([counterExecutor.reactive], ([count]) => count * 2);
const isEven = derive([counterExecutor.reactive], ([count]) => count % 2 === 0);

function Counter() {
  // Get the current values
  const count = useResolve(counterExecutor);
  const doubled = useResolve(doubleCount);
  const even = useResolve(isEven);
  
  // Get the update function
  const updateCount = useUpdate(counterExecutor);
  
  const increment = () => updateCount(count + 1);
  
  return (
    <div>
      <h2>Counter: {count}</h2>
      <p>Doubled: {doubled}</p>
      <p>Is Even: {even ? 'Yes' : 'No'}</p>
      <button onClick={increment}>Increment</button>
    </div>
  );
}
```

## Using Multiple Values

### With useResolveMany

```tsx
import React from 'react';
import { useResolveMany, useUpdate } from '@pumped-fn/react';
import { provide, derive } from '@pumped-fn/core-next';

// Create executors
const counterExecutor = provide(() => 0);
const nameExecutor = provide(() => 'John');
const greeting = derive([nameExecutor.reactive], ([name]) => `Hello, ${name}!`);

function UserGreeting() {
  // Get multiple values at once
  const [count, name, greetingText] = useResolveMany(
    counterExecutor,
    nameExecutor,
    greeting
  );
  
  // Get update functions
  const updateCount = useUpdate(counterExecutor);
  const updateName = useUpdate(nameExecutor);
  
  return (
    <div>
      <h2>{greetingText}</h2>
      <p>Counter: {count}</p>
      
      <button onClick={() => updateCount(count + 1)}>Increment</button>
      
      <div>
        <input
          value={name}
          onChange={(e) => updateName(e.target.value)}
          placeholder="Enter name"
        />
      </div>
    </div>
  );
}
```

### With Resolves Component

```tsx
import React from 'react';
import { Resolves } from '@pumped-fn/react';
import { provide, derive } from '@pumped-fn/core-next';

// Create executors
const counterExecutor = provide(() => 0);
const nameExecutor = provide(() => 'John');
const greeting = derive([nameExecutor.reactive], ([name]) => `Hello, ${name}!`);

function UserGreeting() {
  return (
    <Resolves e={[counterExecutor, nameExecutor, greeting]}>
      {([count, name, greetingText]) => (
        <div>
          <h2>{greetingText}</h2>
          <p>Counter: {count}</p>
          
          <button onClick={() => counterExecutor.update(count + 1)}>
            Increment
          </button>
          
          <div>
            <input
              value={name}
              onChange={(e) => nameExecutor.update(e.target.value)}
              placeholder="Enter name"
            />
          </div>
        </div>
      )}
    </Resolves>
  );
}
```

## Selecting Parts of State

```tsx
import React from 'react';
import { useResolve, useUpdate } from '@pumped-fn/react';
import { provide } from '@pumped-fn/core-next';

// Create a user executor with complex state
const userExecutor = provide(() => ({
  name: 'John',
  age: 30,
  email: 'john@example.com',
  preferences: {
    theme: 'dark',
    notifications: true
  }
}));

function UserProfile() {
  // Select only the name from the user object
  const name = useResolve(userExecutor, (user) => user.name);
  
  // Select only the theme preference
  const theme = useResolve(userExecutor, (user) => user.preferences.theme);
  
  // Get the update function
  const updateUser = useUpdate(userExecutor);
  
  const toggleTheme = () => {
    updateUser((user) => ({
      ...user,
      preferences: {
        ...user.preferences,
        theme: user.preferences.theme === 'dark' ? 'light' : 'dark'
      }
    }));
  };
  
  return (
    <div>
      <h2>Hello, {name}!</h2>
      <p>Current theme: {theme}</p>
      <button onClick={toggleTheme}>Toggle Theme</button>
    </div>
  );
}
```

## Using Reselect Component

```tsx
import React from 'react';
import { Reselect } from '@pumped-fn/react';
import { provide } from '@pumped-fn/core-next';

// Create a user executor with complex state
const userExecutor = provide(() => ({
  name: 'John',
  age: 30,
  email: 'john@example.com'
}));

function UserEmail() {
  return (
    <Reselect
      e={userExecutor}
      selector={(user) => user.email}
    >
      {(email) => (
        <div>
          <h3>Contact</h3>
          <p>Email: {email}</p>
          <button onClick={() => userExecutor.update((user) => ({
            ...user,
            email: 'new.email@example.com'
          }))}>
            Update Email
          </button>
        </div>
      )}
    </Reselect>
  );
}
```

## Side Effects with Effect Component

```tsx
import React, { useEffect } from 'react';
import { Effect, useResolve } from '@pumped-fn/react';
import { provide, derive } from '@pumped-fn/core-next';

// Create executors
const counterExecutor = provide(() => 0);

// Create a logger executor for side effects
const loggerExecutor = derive([counterExecutor.reactive], ([count]) => {
  console.log(`Counter changed to: ${count}`);
  return null;
});

function CounterWithLogging() {
  const count = useResolve(counterExecutor);
  
  return (
    <div>
      <h2>Counter: {count}</h2>
      <button onClick={() => counterExecutor.update(count + 1)}>
        Increment
      </button>
      
      {/* This will log changes to the counter without rendering anything */}
      <Effect e={[loggerExecutor]} />
    </div>
  );
}
```

## Reset and Release

```tsx
import React from 'react';
import { useResolve, useUpdate, useReset, useRelease } from '@pumped-fn/react';
import { provide } from '@pumped-fn/core-next';

// Create a counter executor
const counterExecutor = provide(() => 0);

function Counter() {
  const count = useResolve(counterExecutor);
  const updateCount = useUpdate(counterExecutor);
  const resetCount = useReset(counterExecutor);
  const releaseCount = useRelease(counterExecutor);
  
  return (
    <div>
      <h2>Counter: {count}</h2>
      <button onClick={() => updateCount(count + 1)}>Increment</button>
      <button onClick={resetCount}>Reset to 0</button>
      <button onClick={releaseCount}>Release (cleanup)</button>
    </div>
  );
}
```

## Advanced: Custom Equality Function

```tsx
import React from 'react';
import { useResolve, useUpdate } from '@pumped-fn/react';
import { provide } from '@pumped-fn/core-next';

// Create a list executor
const listExecutor = provide(() => [1, 2, 3]);

function ListComponent() {
  // Use a custom equality function to compare arrays by their length
  const list = useResolve(
    listExecutor,
    (list) => list,
    {
      equality: (prev, next) => prev.length === next.length
    }
  );
  
  const updateList = useUpdate(listExecutor);
  
  const addItem = () => {
    updateList([...list, list.length + 1]);
  };
  
  const replaceItem = () => {
    // This won't trigger a re-render if using the length equality function
    // because the array length stays the same
    const newList = [...list];
    newList[0] = Math.random();
    updateList(newList);
  };
  
  return (
    <div>
      <h2>List</h2>
      <ul>
        {list.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
      <button onClick={addItem}>Add Item</button>
      <button onClick={replaceItem}>Replace First Item</button>
    </div>
  );
}
```

## Advanced: Suspense Integration

```tsx
import React, { Suspense } from 'react';
import { useResolve } from '@pumped-fn/react';
import { provide, derive } from '@pumped-fn/core-next';

// Create an async data executor
const asyncDataExecutor = derive([], async () => {
  // Simulate API call
  await new Promise(resolve => setTimeout(resolve, 1000));
  return { name: 'John', role: 'Developer' };
});

function UserData() {
  // This will suspend while the data is loading
  const userData = useResolve(asyncDataExecutor);
  
  return (
    <div>
      <h2>User Data</h2>
      <p>Name: {userData.name}</p>
      <p>Role: {userData.role}</p>
    </div>
  );
}

function App() {
  return (
    <div>
      <h1>Async Data Example</h1>
      <Suspense fallback={<div>Loading...</div>}>
        <UserData />
      </Suspense>
    </div>
  );
}
```

## Best Practices

1. **Place ScopeProvider at the top level** of your application to ensure all components have access to the same scope.

2. **Use selectors** to minimize re-renders by only subscribing to the specific parts of state that you need.

3. **Prefer hooks over components** for most use cases, as they provide a more concise API.

4. **Use derived executors** to compute values based on other state, similar to selectors in Redux or computed properties in Vue.

5. **Leverage Suspense** for handling async data loading with a consistent loading UI.

6. **Clean up resources** with `useRelease` when components unmount to prevent memory leaks.

7. **Use custom equality functions** to control when re-renders happen based on your specific needs.

8. **Organize executors** by feature or domain to keep your code modular and maintainable.

## Troubleshooting

### "useScope must be used within a ScopeProvider"

This error occurs when you try to use hooks like `useResolve` outside of a `ScopeProvider`. Make sure you have wrapped your component tree with a `ScopeProvider`.

### Component suspends indefinitely

If your component is stuck in a loading state, check that your async executors properly resolve or reject. Unhandled promise rejections can cause components to suspend indefinitely.

### Updates not triggering re-renders

If updates to your state don't cause re-renders, check:

1. Are you using a custom equality function that might be preventing updates?
2. Are you correctly using `.reactive` for derived executors that depend on other executors?
3. Is the component that should re-render actually consuming the updated value?

### Memory leaks

If you're seeing memory leaks, ensure you're properly cleaning up resources:

1. Use `useRelease` for executors that should be cleaned up when components unmount
2. Provide cleanup functions in your derive controllers when appropriate

