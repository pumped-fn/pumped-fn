# @pumped-fn/react Documentation

Welcome to the documentation for `@pumped-fn/react`, the React bindings for Pumped Functions.

## Table of Contents

- [API Reference](./api.d.ts) - Detailed TypeScript type definitions and API documentation
- [Usage Guide](./usage-guide.md) - Practical examples and best practices
- [README](../README.md) - Overview and quick start guide

## What is @pumped-fn/react?

`@pumped-fn/react` provides React bindings for the Pumped Functions library (`@pumped-fn/core-next`). It allows you to use Pumped Functions' state management capabilities in your React applications with a simple, hooks-based API.

The package offers:

- React hooks for resolving, updating, and managing executors
- React components for declarative state management
- Suspense integration for handling async data
- Efficient re-rendering with fine-grained reactivity

## Key Concepts

### Executors

Executors are the core building blocks of Pumped Functions. They represent units of computation that can be resolved, updated, and composed together.

### Scope

A scope is a container for executors that manages their lifecycle and dependencies. In React applications, a scope is provided through the `ScopeProvider` component.

### Resolving

Resolving is the process of getting the current value of an executor. In React, this is done with the `useResolve` hook or the `Resolve` component.

### Reactivity

Pumped Functions provides a reactive system that automatically tracks dependencies between executors and updates dependent values when dependencies change.

## Getting Started

Check out the [Usage Guide](./usage-guide.md) for practical examples of how to use `@pumped-fn/react` in your applications.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

