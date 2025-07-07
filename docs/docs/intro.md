# Introduction

**Pumped Fn** is a functional reactive state management library designed specifically for React applications. It provides a clean, type-safe way to manage complex state with automatic reactivity and powerful composition patterns.

## What is Pumped Fn?

Pumped Fn is built around the concept of **Executors** - composable units of state and logic that can be combined to create complex reactive systems. Unlike traditional state management solutions, Pumped Fn emphasizes:

- **Functional Composition**: Build complex state from simple, reusable pieces
- **Automatic Reactivity**: Components update automatically when dependencies change
- **Type Safety**: Full TypeScript support with automatic type inference
- **Lifecycle Management**: Automatic cleanup and resource management

## Key Features

### 🔄 Reactive State Management
State changes automatically propagate to dependent components and computations.

### 🧩 Functional Composition
Compose complex state logic from simple, reusable executors using `provide()` and `derive()`.

### 🔒 Type Safety
Full TypeScript support with automatic type inference throughout your state tree.

### ⚡ Performance Optimized
Minimal re-renders with fine-grained reactivity and proxy-based change detection.

### 🎯 React Integration
Purpose-built React hooks and components for seamless integration.

## Quick Example

```tsx
import { provide, derive } from '@pumped-fn/core-next';
import { useResolves, ScopeProvider } from '@pumped-fn/react';

// Define state
const count = provide(() => 0);
const doubledCount = derive([count.reactive], ([count]) => count * 2);

// Use in React
function Counter() {
  const [countValue, doubledValue] = useResolves(count, doubledCount);
  
  return (
    <div>
      <p>Count: {countValue}</p>
      <p>Doubled: {doubledValue}</p>
      <button onClick={() => count.update(c => c + 1)}>
        Increment
      </button>
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

## Getting Started

Ready to dive in? Let's start with [installation](./getting-started/installation.md) and build your first Pumped Fn application!