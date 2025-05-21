# @pumped-fn/react

React bindings for Pumped Functions.

## Installation

```bash
npm install @pumped-fn/react @pumped-fn/core-next
# or
yarn add @pumped-fn/react @pumped-fn/core-next
# or
pnpm add @pumped-fn/react @pumped-fn/core-next
```

## API Documentation

### Components

#### `ScopeProvider`

Provides a scope context for all child components to access the same scope.

```tsx
import { ScopeProvider } from '@pumped-fn/react';
import { createScope } from '@pumped-fn/core-next';

// Optional: create a custom scope
const scope = createScope();

function App() {
  return (
    <ScopeProvider scope={scope}>
      {/* Your application components */}
    </ScopeProvider>
  );
}
```

#### `Resolve`

A component that resolves an executor and passes the value to its children.

```tsx
import { Resolve } from '@pumped-fn/react';
import { provide } from '@pumped-fn/core-next';

const countExecutor = provide(() => 0);

function Counter() {
  return (
    <Resolve e={countExecutor}>
      {(count) => <div>Count: {count}</div>}
    </Resolve>
  );
}
```

#### `Resolves`

A component that resolves multiple executors and passes the values to its children.

```tsx
import { Resolves } from '@pumped-fn/react';
import { provide, derive } from '@pumped-fn/core-next';

const countExecutor = provide(() => 0);
const doubleCount = derive([countExecutor.reactive], ([count]) => count * 2);

function CounterWithDouble() {
  return (
    <Resolves e={[countExecutor, doubleCount]}>
      {([count, double]) => (
        <div>
          <div>Count: {count}</div>
          <div>Double: {double}</div>
        </div>
      )}
    </Resolves>
  );
}
```

#### `Reselect`

A component that resolves an executor, applies a selector function, and passes the result to its children.

```tsx
import { Reselect } from '@pumped-fn/react';
import { provide } from '@pumped-fn/core-next';

const userExecutor = provide(() => ({ name: 'John', age: 30 }));

function UserName() {
  return (
    <Reselect 
      e={userExecutor} 
      selector={(user) => user.name}
    >
      {(name) => <div>Name: {name}</div>}
    </Reselect>
  );
}
```

#### `Reactives`

A component that resolves multiple reactive executors and passes the values to its children.

```tsx
import { Reactives } from '@pumped-fn/react';
import { provide } from '@pumped-fn/core-next';

const countExecutor = provide(() => 0);
const nameExecutor = provide(() => 'John');

function ReactiveExample() {
  return (
    <Reactives e={[countExecutor, nameExecutor]}>
      {([count, name]) => (
        <div>
          <div>Count: {count}</div>
          <div>Name: {name}</div>
        </div>
      )}
    </Reactives>
  );
}
```

#### `Effect`

A component that resolves executors for side effects without rendering anything.

```tsx
import { Effect } from '@pumped-fn/react';
import { provide, derive } from '@pumped-fn/core-next';

const loggerExecutor = derive([], () => {
  console.log('Logger initialized');
  return null;
});

function Logger() {
  return <Effect e={[loggerExecutor]} />;
}
```

### Hooks

#### `useScope`

Returns the current scope from the nearest `ScopeProvider`.

```tsx
import { useScope } from '@pumped-fn/react';

function MyComponent() {
  const scope = useScope();
  // Use scope methods directly
  return null;
}
```

#### `useResolve`

Resolves an executor and returns its value. Can optionally apply a selector function.

```tsx
import { useResolve } from '@pumped-fn/react';
import { provide } from '@pumped-fn/core-next';

const countExecutor = provide(() => 0);

function Counter() {
  // Basic usage
  const count = useResolve(countExecutor);
  
  // With selector
  const isEven = useResolve(countExecutor, (count) => count % 2 === 0);
  
  return (
    <div>
      <div>Count: {count}</div>
      <div>Is even: {isEven ? 'Yes' : 'No'}</div>
    </div>
  );
}
```

#### `useResolveMany`

Resolves multiple executors and returns their values as an array.

```tsx
import { useResolveMany } from '@pumped-fn/react';
import { provide, derive } from '@pumped-fn/core-next';

const countExecutor = provide(() => 0);
const doubleCount = derive([countExecutor.reactive], ([count]) => count * 2);

function CounterWithDouble() {
  const [count, double] = useResolveMany(countExecutor, doubleCount);
  
  return (
    <div>
      <div>Count: {count}</div>
      <div>Double: {double}</div>
    </div>
  );
}
```

#### `useUpdate`

Returns a function that can update an executor's value.

```tsx
import { useResolve, useUpdate } from '@pumped-fn/react';
import { provide } from '@pumped-fn/core-next';

const countExecutor = provide(() => 0);

function Counter() {
  const count = useResolve(countExecutor);
  const updateCount = useUpdate(countExecutor);
  
  const increment = () => {
    // Direct value update
    updateCount(count + 1);
    
    // Or with function update
    updateCount((current) => current + 1);
  };
  
  return (
    <div>
      <div>Count: {count}</div>
      <button onClick={increment}>Increment</button>
    </div>
  );
}
```

#### `useReset`

Returns a function that resets an executor to its initial value.

```tsx
import { useResolve, useReset } from '@pumped-fn/react';
import { provide } from '@pumped-fn/core-next';

const countExecutor = provide(() => 0);

function Counter() {
  const count = useResolve(countExecutor);
  const resetCount = useReset(countExecutor);
  
  return (
    <div>
      <div>Count: {count}</div>
      <button onClick={resetCount}>Reset</button>
    </div>
  );
}
```

#### `useRelease`

Returns a function that releases an executor from the scope.

```tsx
import { useResolve, useRelease } from '@pumped-fn/react';
import { provide } from '@pumped-fn/core-next';

const countExecutor = provide(() => 0);

function Counter() {
  const count = useResolve(countExecutor);
  const releaseCount = useRelease(countExecutor);
  
  return (
    <div>
      <div>Count: {count}</div>
      <button onClick={releaseCount}>Release</button>
    </div>
  );
}
```

## TypeScript Types

### Component Props

```typescript
// ScopeProvider props
type ScopeProviderProps = {
  children: React.ReactNode;
  scope?: Core.Scope;
};

// Resolve props
type ResolveProps<T> = {
  e: Core.Executor<T>;
  children: (props: T) => React.ReactNode | React.ReactNode[];
};

// Resolves props
type ResolvesProps<T extends Core.BaseExecutor<unknown>[]> = {
  e: { [K in keyof T]: T[K] };
  children: (props: { [K in keyof T]: Core.InferOutput<T[K]> }) =>
    | React.ReactNode
    | React.ReactNode[];
};

// Reselect props
type ReselectProps<T, K> = {
  e: Core.Executor<T>;
  selector: (value: T) => K;
  children: (props: K) => React.ReactNode | React.ReactNode[];
  equality?: (thisValue: T, thatValue: T) => boolean;
};

// Reactives props
type ReactivesProps<T extends Core.Executor<unknown>[]> = {
  e: { [K in keyof T]: T[K] };
  children: (props: { [K in keyof T]: Core.InferOutput<T[K]> }) =>
    | React.ReactNode
    | React.ReactNode[];
};

// Effect props
type EffectProps = {
  e: Core.Executor<unknown>[];
};
```

### Hook Types

```typescript
// useResolve options
type UseResolveOption<T> = {
  snapshot?: (value: T) => T;
  equality?: (thisValue: T, thatValue: T) => boolean;
};

// useResolve return type
function useResolve<T extends Core.BaseExecutor<unknown>>(
  executor: T
): Core.InferOutput<T>;

function useResolve<T extends Core.BaseExecutor<unknown>, K>(
  executor: T,
  selector: (value: Core.InferOutput<T>) => K,
  options?: UseResolveOption<T>
): K;

// useResolveMany return type
function useResolveMany<T extends Array<Core.BaseExecutor<unknown>>>(
  ...executors: { [K in keyof T]: T[K] }
): { [K in keyof T]: Core.InferOutput<T[K]> };

// useUpdate return type
function useUpdate<T>(
  executor: Core.Executor<T>
): (updateFn: T | ((current: T) => T)) => void;

// useReset return type
function useReset(executor: Core.Executor<unknown>): () => void;

// useRelease return type
function useRelease(executor: Core.Executor<unknown>): () => void;
```

## Integration with @pumped-fn/core-next

This package is designed to work with `@pumped-fn/core-next` and provides React bindings for the core functionality. The main concepts from the core package that you'll use with these React bindings are:

- `provide`: Creates a new executor with an initial value
- `derive`: Creates a derived executor based on other executors
- `createScope`: Creates a new scope for managing executors

For more information on these core concepts, refer to the `@pumped-fn/core-next` documentation.

## License

MIT

