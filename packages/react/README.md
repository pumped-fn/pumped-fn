# @pumped-fn/react

React bindings for Pumped Functions.

## Installation

```bash
npm install @pumped-fn/react @pumped-fn/core-next
```

## Usage

```tsx
import { provide } from '@pumped-fn/core-next';
import { ScopeProvider, useResolve } from '@pumped-fn/react';

const countExecutor = provide(() => 0);

function Counter() {
  const count = useResolve(countExecutor);
  const update = useUpdate(countExecutor);
  
  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => update(count + 1)}>Increment</button>
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
```

## Enhanced Proxy-Compare Based Tracking

@pumped-fn/react now includes an enhanced tracking system based on the `proxy-compare` library. This system provides automatic tracking of property access and optimized re-rendering based on actual usage patterns.

### Key Features

1. **Automatic Tracking**
   - Primitives are tracked automatically
   - Non-primitives (objects, arrays) are tracked based on actual property access

2. **Propagation of Tracking**
   - Tracking information propagates from child to parent components
   - Parent components only re-render when tracked properties change

3. **Optimized Rendering**
   - Components only re-render when accessed properties change
   - Prevents unnecessary re-renders for unaccessed properties

### Usage

Instead of using the original hooks and components, use the enhanced versions:

```tsx
// Original
import { useResolve, ScopeProvider } from '@pumped-fn/react';

// Enhanced with proxy-compare tracking
import { useEnhancedResolve, EnhancedScopeProvider } from '@pumped-fn/react';
```

### Example

```tsx
import { EnhancedScopeProvider, useEnhancedResolve } from '@pumped-fn/react';
import { provide } from '@pumped-fn/core-next';

// Create an executor with a complex nested structure
const userExecutor = provide(() => ({
  profile: {
    name: 'John Doe',
    age: 30,
  },
  preferences: {
    theme: 'dark',
    notifications: {
      email: true,
      push: false,
    },
  },
}));

// Component that only uses profile.name
function UserName() {
  const user = useEnhancedResolve(userExecutor);
  
  // This component will only re-render if user.profile.name changes
  return <h2>{user.profile.name}</h2>;
}

// Component that only uses preferences.theme
function ThemeDisplay() {
  const user = useEnhancedResolve(userExecutor);
  
  // This component will only re-render if user.preferences.theme changes
  return <div>Current theme: {user.preferences.theme}</div>;
}

function App() {
  return (
    <EnhancedScopeProvider>
      <UserName />
      <ThemeDisplay />
    </EnhancedScopeProvider>
  );
}
```

## API Reference

### Original API

- `ScopeProvider`: Provides a scope for resolving executors
- `useResolve`: Hook to resolve an executor and subscribe to changes
- `useResolveMany`: Hook to resolve multiple executors
- `useUpdate`: Hook to update an executor's value
- `useReset`: Hook to reset an executor to its initial value
- `useRelease`: Hook to release an executor from the scope
- `Resolve`: Component to resolve an executor and render children with the result
- `Resolves`: Component to resolve multiple executors
- `Reselect`: Component to resolve an executor with a selector
- `Reactives`: Component to resolve multiple reactive executors
- `Effect`: Component to resolve executors for side effects

### Enhanced API with Proxy-Compare Tracking

- `EnhancedScopeProvider`: Provides an enhanced scope with proxy-compare tracking
- `useEnhancedResolve`: Hook to resolve an executor with proxy-compare tracking
- `useEnhancedResolveMany`: Hook to resolve multiple executors with tracking
- `useEnhancedUpdate`: Hook to update an executor's value
- `useEnhancedReset`: Hook to reset an executor
- `useEnhancedRelease`: Hook to release an executor
- `EnhancedResolve`: Component version of useEnhancedResolve
- `EnhancedResolves`: Component version of useEnhancedResolveMany
- `EnhancedReselect`: Component to resolve with a selector
- `EnhancedReactives`: Component for multiple reactive executors
- `EnhancedEffect`: Component for side effects

## How It Works

1. When a component calls `useEnhancedResolve`, the returned value is wrapped in a proxy
2. The proxy tracks which properties are accessed during rendering
3. When the value changes, only the components that accessed the changed properties re-render
4. Child components register with their parents to propagate tracking information
5. Parent components only re-render when tracked properties used by their children change

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
