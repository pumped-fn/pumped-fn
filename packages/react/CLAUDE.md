# packages/react/CLAUDE.md - React Integration (@pumped-fn/react)

## When to Use This Context
- Integrating pumped-fn executors with React components
- Managing React state through executor reactivity
- Setting up scope providers in React applications
- Optimizing React re-renders with selective resolution
- Testing React components that use pumped-fn hooks

## Core React Integration

### Main File
**File: `src/index.tsx`** - All React hooks and components

### Hook System

#### Primary Hooks
- **`useResolves(...executors)`** - Resolve multiple executors, handles reactivity
- **`useResolve(executor, selector, options?)`** - Resolve single executor with selector
- **`useUpdate(executor)`** - Get update function for mutable executors
- **`useScope()`** - Access current scope context
- **`useRelease(executor)`** - Get release function for cleanup

#### Hook Features
- **Automatic Reactivity**: `useResolves` subscribes to reactive executors
- **Proxy-based Change Detection**: Uses `proxy-compare` for efficient re-renders
- **Suspense Support**: Throws promises for pending executors
- **Error Boundaries**: Throws errors from rejected executors

### Context System

#### ScopeProvider
```typescript
<ScopeProvider scope={myScope} presets={[preset1, preset2]}>
  {children}
</ScopeProvider>

// Or auto-create scope
<ScopeProvider presets={[preset1, preset2]}>
  {children}  
</ScopeProvider>
```

**Key Features:**
- Provides scope context to React tree
- Can accept existing scope or create new one
- Supports presets for initial values
- Uses React.Context for propagation

### Component System

#### Render Props Components
- **`<Resolves e={[exec1, exec2]}>{values => ...}</Resolves>`** - Multi-executor resolution
- **`<Reselect e={executor} selector={fn}>{value => ...}</Reselect>`** - Selective resolution
- **`<Reactives e={[exec1, exec2]}>{values => ...}</Reactives>`** - Force reactive resolution
- **`<Effect e={[exec1, exec2]} />`** - Side-effect only resolution

## Implementation Details

### Change Detection System
**Lines 58-114 in `src/index.tsx`** - `useResolves` implementation
- Uses `createProxy` from `proxy-compare` for change detection
- Maintains `WeakMap` for tracking accessed properties
- Only re-renders when accessed properties change
- Batches updates in `startTransition` for React 18

### Reactivity Integration
**Lines 116-164 in `src/index.tsx`** - Subscription system
- Subscribes to reactive executors via `scope.onUpdate`
- Uses `useSyncExternalStore` for React 18 compatibility
- Automatically cleans up subscriptions on unmount
- Supports both sync and async executor updates

### Error Handling
**Lines 19-26 in `src/index.tsx`** - State type guards
- `isErrorEntry()` - Detects rejected states
- `isPendingEntry()` - Detects pending states
- Throws promises for Suspense integration
- Throws errors for Error Boundary integration

## Testing Strategy

### Test Files
- **`tests/hooks.test.tsx`** - Hook behavior and integration
- **`tests/batching.test.tsx`** - React batching and update behavior
- **`tests/setup.ts`** - Testing utilities and React Testing Library setup

### Testing Patterns
```typescript
import { render } from '@testing-library/react';
import { provide, createScope } from '@pumped-fn/core-next';
import { ScopeProvider, useResolves } from '@pumped-fn/react';

// Test component with scope
const TestComponent = () => {
  const [value] = useResolves(executor);
  return <div>{value}</div>;
};

// Render with scope provider
const scope = createScope();
render(
  <ScopeProvider scope={scope}>
    <TestComponent />
  </ScopeProvider>
);
```

### Testing Tools
- **@testing-library/react** for component testing
- **@testing-library/jest-dom** for DOM assertions
- **vitest** for test runner
- Mock executors with `vi.fn()` factories

## Common Usage Patterns

### Basic Hook Usage
```typescript
function MyComponent() {
  const [config, user] = useResolves(configExecutor, userExecutor);
  const updateUser = useUpdate(userExecutor);
  
  return (
    <div>
      <p>Port: {config.port}</p>
      <p>User: {user.name}</p>
      <button onClick={() => updateUser({...user, name: 'New Name'})}>
        Update
      </button>
    </div>
  );
}
```

### Selective Resolution
```typescript
function UserName() {
  // Only re-render when user.name changes
  const name = useResolve(
    userExecutor, 
    user => user.name,
    { equality: (a, b) => a === b }
  );
  
  return <span>{name}</span>;
}
```

### Render Props Pattern
```typescript
function App() {
  return (
    <Resolves e={[configExecutor, userExecutor]}>
      {([config, user]) => (
        <div>
          <h1>App on port {config.port}</h1>
          <p>Welcome {user.name}</p>
        </div>
      )}
    </Resolves>
  );
}
```

## Performance Considerations

### Change Detection Optimization
- Uses proxy-compare for minimal re-renders
- Only triggers updates when accessed properties change
- Supports custom equality functions in `useResolve`
- Batches updates using React 18 `startTransition`

### Memory Management
- Automatic cleanup of subscriptions on unmount
- WeakMap usage prevents memory leaks
- Scope disposal cleans up all resources
- Use `useRelease` for manual executor cleanup

## Build Configuration
- **`tsconfig.json`** - TypeScript with React JSX
- **`tsdown.config.ts`** - Build bundler configuration
- **`vitest.config.ts`** - Test environment with jsdom
- Outputs ESM with React 18+ compatibility