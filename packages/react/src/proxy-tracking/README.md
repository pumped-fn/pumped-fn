# Proxy-Compare Based Tracking System

This module implements an efficient tracking system for React components using the `proxy-compare` library. It allows for automatic tracking of property access and optimized re-rendering based on actual usage patterns.

## Key Features

1. **Automatic Tracking**
   - Primitives are tracked automatically
   - Non-primitives (objects, arrays) are tracked based on actual property access

2. **Propagation of Tracking**
   - Tracking information propagates from child to parent components
   - Parent components only re-render when tracked properties change

3. **Optimized Rendering**
   - Components only re-render when accessed properties change
   - Prevents unnecessary re-renders for unaccessed properties

## Architecture

The tracking system consists of several key components:

### Tracker

The `Tracker` is responsible for:
- Wrapping values with proxies to track property access
- Determining if tracked properties have changed
- Retrieving original values from proxies

### Dependency Graph

The `DependencyGraph` manages relationships between components:
- Tracks parent-child relationships
- Propagates changes up the component tree
- Determines which components need to re-render

### Enhanced Scope Container

The `EnhancedScopeContainer` extends the original scope container with:
- Proxy-based tracking
- Dependency management
- Subscription system for updates

## Usage

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

// Create an executor
const userExecutor = provide(() => ({
  name: 'John',
  age: 30,
  address: {
    street: '123 Main St',
    city: 'New York'
  }
}));

function UserProfile() {
  // Only tracks the properties that are actually used
  const user = useEnhancedResolve(userExecutor);
  
  // This component will only re-render if user.name changes
  return <div>{user.name}</div>;
}

function AddressDisplay() {
  // Only tracks the properties that are actually used
  const user = useEnhancedResolve(userExecutor);
  
  // This component will only re-render if user.address.city changes
  return <div>{user.address.city}</div>;
}

function App() {
  return (
    <EnhancedScopeProvider>
      <UserProfile />
      <AddressDisplay />
    </EnhancedScopeProvider>
  );
}
```

## How It Works

1. When a component calls `useEnhancedResolve`, the returned value is wrapped in a proxy
2. The proxy tracks which properties are accessed during rendering
3. When the value changes, only the components that accessed the changed properties re-render
4. Child components register with their parents to propagate tracking information
5. Parent components only re-render when tracked properties used by their children change

## Benefits

- **Performance**: Minimizes unnecessary re-renders
- **Automatic**: No need to manually specify dependencies
- **Intuitive**: Just use the properties you need, and the system handles the rest
- **Propagation**: Changes in deeply nested components properly trigger parent updates
