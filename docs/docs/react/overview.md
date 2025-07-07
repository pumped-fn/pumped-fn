# React Integration Overview

Pumped Fn provides seamless React integration through the `@pumped-fn/react` package. This package includes hooks, components, and utilities that make working with Pumped Fn state in React applications intuitive and performant.

## Core Components

### ScopeProvider

The `ScopeProvider` is the root component that provides a scope context to your React tree:

```tsx
import { ScopeProvider } from '@pumped-fn/react';

function App() {
  return (
    <ScopeProvider>
      <YourApp />
    </ScopeProvider>
  );
}
```

### Custom Scope

You can provide your own scope or presets:

```tsx
import { createScope, preset } from '@pumped-fn/core-next';
import { ScopeProvider } from '@pumped-fn/react';

const customScope = createScope(
  preset(userSettings, { theme: 'dark' })
);

function App() {
  return (
    <ScopeProvider scope={customScope}>
      <YourApp />
    </ScopeProvider>
  );
}
```

## Core Hooks

### useResolves

The primary hook for subscribing to executor state:

```tsx live
import React from 'react';
import { provide, derive } from '@pumped-fn/core-next';
import { useResolves, ScopeProvider } from '@pumped-fn/react';

const count = provide(() => 0);
const doubled = derive([count.reactive], ([c]) => c * 2);

function Counter() {
  const [countValue, doubledValue] = useResolves(count, doubled);
  
  return (
    <div style={{ padding: '20px' }}>
      <p>Count: {countValue}</p>
      <p>Doubled: {doubledValue}</p>
      <button onClick={() => count.update(c => c + 1)}>
        Increment
      </button>
    </div>
  );
}

export default function App() {
  return (
    <ScopeProvider>
      <Counter />
    </ScopeProvider>
  );
}
```

### useUpdate

Get an update function for a specific executor:

```tsx
import { useUpdate } from '@pumped-fn/react';

function Counter() {
  const [count] = useResolves(counter);
  const updateCount = useUpdate(counter);
  
  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => updateCount(c => c + 1)}>
        Increment
      </button>
    </div>
  );
}
```

### useRelease

Get a release function for cleanup:

```tsx
import { useRelease } from '@pumped-fn/react';

function ExpensiveComponent() {
  const [data] = useResolves(expensiveComputation);
  const release = useRelease(expensiveComputation);
  
  return (
    <div>
      <p>Data: {data}</p>
      <button onClick={release}>
        Release Resources
      </button>
    </div>
  );
}
```

## Component Patterns

### Resolves Component

For render prop pattern:

```tsx
import { Resolves } from '@pumped-fn/react';

function App() {
  return (
    <Resolves e={[count, doubled]}>
      {([countValue, doubledValue]) => (
        <div>
          <p>Count: {countValue}</p>
          <p>Doubled: {doubledValue}</p>
        </div>
      )}
    </Resolves>
  );
}
```

### Reactives Component

Automatically uses `.reactive` variant:

```tsx live
import React from 'react';
import { provide, derive } from '@pumped-fn/core-next';
import { Reactives, ScopeProvider } from '@pumped-fn/react';

const items = provide(() => ['apple', 'banana', 'cherry']);
const count = derive([items.reactive], ([items]) => items.length);

function ListExample() {
  return (
    <div style={{ padding: '20px' }}>
      <Reactives e={[items, count]}>
        {([itemList, itemCount]) => (
          <div>
            <h3>Items ({itemCount})</h3>
            <ul>
              {itemList.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
            <button onClick={() => items.update(list => [...list, 'new item'])}>
              Add Item
            </button>
          </div>
        )}
      </Reactives>
    </div>
  );
}

export default function App() {
  return (
    <ScopeProvider>
      <ListExample />
    </ScopeProvider>
  );
}
```

## Advanced Patterns

### Selective Updates with useResolve

Use `useResolve` for fine-grained subscriptions:

```tsx
import { useResolve } from '@pumped-fn/react';

const user = provide(() => ({
  name: 'John',
  email: 'john@example.com',
  settings: { theme: 'dark' }
}));

function UserName() {
  // Only re-render when name changes
  const name = useResolve(user, (user) => user.name);
  
  return <h1>{name}</h1>;
}

function UserEmail() {
  // Only re-render when email changes
  const email = useResolve(user, (user) => user.email);
  
  return <p>{email}</p>;
}
```

### Conditional Rendering

```tsx live
import React from 'react';
import { provide, derive } from '@pumped-fn/core-next';
import { useResolves, ScopeProvider } from '@pumped-fn/react';

const isLoggedIn = provide(() => false);
const user = provide(() => ({ name: 'John Doe', email: 'john@example.com' }));

const currentView = derive([isLoggedIn.reactive], ([loggedIn]) => {
  return loggedIn ? 'dashboard' : 'login';
});

function ConditionalExample() {
  const [loggedIn, view, userData] = useResolves(isLoggedIn, currentView, user);
  
  return (
    <div style={{ padding: '20px' }}>
      <h3>Current View: {view}</h3>
      
      {loggedIn ? (
        <div>
          <h4>Welcome, {userData.name}!</h4>
          <p>Email: {userData.email}</p>
          <button onClick={() => isLoggedIn.update(false)}>
            Logout
          </button>
        </div>
      ) : (
        <div>
          <h4>Please login</h4>
          <button onClick={() => isLoggedIn.update(true)}>
            Login
          </button>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ScopeProvider>
      <ConditionalExample />
    </ScopeProvider>
  );
}
```

## Performance Considerations

### Proxy-based Change Detection

Pumped Fn uses proxy-based change detection to minimize re-renders:

```tsx
const complexState = provide(() => ({
  user: { name: 'John', settings: { theme: 'dark' } },
  posts: [/* many posts */],
  ui: { loading: false }
}));

function UserComponent() {
  const [state] = useResolves(complexState);
  
  // Only re-renders when user.name changes
  return <h1>{state.user.name}</h1>;
}
```

### Batched Updates

Updates are automatically batched for performance:

```tsx
function updateMultiple() {
  // These updates are batched
  count.update(c => c + 1);
  name.update('New Name');
  settings.update(s => ({ ...s, theme: 'light' }));
}
```

## Error Handling

### Suspense Integration

Pumped Fn integrates with React Suspense for async state:

```tsx
import { Suspense } from 'react';

const asyncData = provide(async () => {
  const response = await fetch('/api/data');
  return response.json();
});

function AsyncComponent() {
  const [data] = useResolves(asyncData);
  return <div>{data.title}</div>;
}

function App() {
  return (
    <ScopeProvider>
      <Suspense fallback={<div>Loading...</div>}>
        <AsyncComponent />
      </Suspense>
    </ScopeProvider>
  );
}
```

## Next Steps

- Explore [Core Concepts](../core-concepts/executors.md) for deeper understanding
- Try the [Counter Example](../examples/counter.md) for hands-on practice
- Build your [First App](../getting-started/first-app.md) step-by-step