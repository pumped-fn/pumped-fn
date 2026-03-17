---
id: c3-301
c3-version: 4
title: React Hooks
type: component
category: foundation
parent: c3-3
goal: Expose React hooks that adapt lite scopes and controllers to React subscriptions, Suspense, and manual state rendering.
summary: >
  React hooks for @pumped-fn/lite integration - useScope, useAtom, useSelect,
  and useController with Suspense/ErrorBoundary support via useSyncExternalStore.
---

# React Hooks

## Goal

Expose the hook-level integration layer that lets React consume lite scopes and controllers without reimplementing the underlying state machine.

## Overview {#c3-301-overview}

Four hooks provide React integration with @pumped-fn/lite's scope and atom system:

| Hook | Purpose | React Integration |
|------|---------|-------------------|
| `useScope` | Access scope from context | Context API |
| `useController` | Get memoized controller | useMemo |
| `useAtom` | Subscribe to atom value | useSyncExternalStore + Suspense |
| `useSelect` | Fine-grained selection | useSyncExternalStore + controller subscription |

## Container Connection

This component is the concrete binding between the lite-react container and the lite controller model. It is where React-specific subscription, suspense, and error-boundary semantics are layered onto lite scopes.

## Dependencies

| Direction | What | From/To |
|-----------|------|---------|
| IN (uses) | Scope, controller, and select behavior | c3-201 |
| IN (uses) | Atom definitions | c3-202 |
| IN (uses) | Preset-driven test patterns | c3-205 |
| OUT (provides) | React hook API for the lite-react container | c3-3 |

## Concepts {#c3-301-concepts}

### Suspense-First Lifecycle

`useAtom` and `useSelect` are thin wrappers over controller state, but they will trigger resolution when React needs a value and the controller is still idle. In Suspense mode this happens by throwing a shared pending promise; in manual mode `resolve: true` kicks off the same work from `useEffect`. See [ADR-027](../adr/adr-027-non-suspense-mode.md).

### State-to-React Mapping

| Atom State | React Behavior |
|------------|----------------|
| `idle` | Auto-resolve and suspend |
| `resolving` | Return stale value if available, otherwise suspend |
| `resolved` | Returns value, subscribes to changes |
| `failed` | Throws stored error (ErrorBoundary catches) |

### useSyncExternalStore

All subscription hooks use React 18's `useSyncExternalStore` for:
- Concurrent rendering compatibility
- Automatic tear detection
- An import-safe SSR path using the same snapshot getter on server and client

## useScope {#c3-301-use-scope}

Access the scope from React context.

```typescript
function useScope(): Lite.Scope {
  const scope = useContext(ScopeContext)
  if (!scope) {
    throw new Error("useScope must be used within a ScopeProvider")
  }
  return scope
}
```

**Usage:**
```tsx
function MyComponent() {
  const scope = useScope()
  const handleResolve = () => scope.resolve(someAtom)
  return <button onClick={handleResolve}>Load</button>
}
```

## useController {#c3-301-use-controller}

Get a memoized Controller instance for an atom.

```typescript
function useController<T>(atom: Lite.Atom<T>): Lite.Controller<T>
function useController<T>(atom: Lite.Atom<T>, options: { resolve: true }): Lite.Controller<T>
```

**Basic usage:**
```tsx
function Counter() {
  const ctrl = useController(countAtom)

  return (
    <button onClick={() => ctrl.update(n => n + 1)}>
      Increment
    </button>
  )
}
```

**With resolve option:**

When `{ resolve: true }` is passed, the hook throws a Promise (triggering Suspense) while the controller is idle or re-resolving:

```tsx
function ConfigDisplay() {
  // Suspense ensures controller is resolved
  const ctrl = useController(configAtom, { resolve: true })
  return <div>{ctrl.get().apiUrl}</div> // safe - guaranteed resolved
}
```

| Option | Behavior |
|--------|----------|
| (none) | Returns controller immediately, any state |
| `{ resolve: true }` | Throws Promise for Suspense until the controller settles |

## useAtom {#c3-301-use-atom}

Subscribe to an atom's value with Suspense/ErrorBoundary integration or manual state handling.

```typescript
// Suspense mode (default)
function useAtom<T>(atom: Lite.Atom<T>): T

// Non-Suspense mode
function useAtom<T>(atom: Lite.Atom<T>, options: { suspense: false; resolve?: boolean }): UseAtomState<T>

interface UseAtomState<T> {
  data: T | undefined
  loading: boolean
  error: Error | undefined
  controller: Lite.Controller<T>
}
```

### Suspense Mode (Default)

```tsx
function UserProfile() {
  const user = useAtom(userAtom)
  return <div>{user.name}</div>
}

// Wrap with Suspense + ErrorBoundary
<ErrorBoundary fallback={<Error />}>
  <Suspense fallback={<Loading />}>
    <UserProfile />
  </Suspense>
</ErrorBoundary>
```

### Non-Suspense Mode

For manual loading/error state handling:

```tsx
function UserProfile() {
  const { data, loading, error, controller } = useAtom(userAtom, { suspense: false })

  if (loading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>
  if (!data) return <div>Not loaded</div>

  return (
    <div>
      <h1>{data.name}</h1>
      <button onClick={() => controller.invalidate()}>Refresh</button>
    </div>
  )
}
```

### Options

| Option | Return | Behavior |
|--------|--------|----------|
| (none) | `T` | Suspense mode, auto-resolves and throws Promise |
| `{ resolve: false }` | `T` | Suspense mode, but requires the atom to be resolved before render |
| `{ suspense: false }` | `UseAtomState<T>` | Manual state, no auto-resolve |
| `{ suspense: false, resolve: true }` | `UseAtomState<T>` | Manual state, auto-resolves on mount |

### State Mapping

**Suspense mode:**

| Atom State | Behavior |
|------------|----------|
| `idle` | Auto-resolve, throw Promise |
| `resolving` | Throw Promise (Suspense catches) |
| `resolved` | Return value, subscribe |
| `failed` | Throw error (ErrorBoundary catches) |

**Non-Suspense mode:**

| Atom State | `data` | `loading` | `error` |
|------------|--------|-----------|---------|
| `idle` | `undefined` | `resolve: true` -> `true`, otherwise `false` | `undefined` |
| `resolving` | Last resolved value if available | `true` | `undefined` |
| `resolved` | value | `false` | `undefined` |
| `failed` | `undefined` | `false` | Error |

Manual mode preserves stale data while a refresh is in flight, but a failed refresh clears `data` and surfaces the stored error.

## useSelect {#c3-301-use-select}

Fine-grained selection with custom equality function.

```typescript
function useSelect<T, S>(
  atom: Lite.Atom<T>,
  selector: (value: T) => S,
  eq?: (a: S, b: S) => boolean
): S
```

`useSelect` has no manual mode. It always follows the Suspense/ErrorBoundary rendering model and auto-resolves the source atom on first render.

**Key implementation details:**
- Selector and equality functions are kept in refs so inline lambdas can change without rebuilding the subscription
- Snapshot caching keeps referential stability when the selected value is equal
- The hook subscribes directly to the owning controller rather than `scope.select()`
- A failed refresh after a previously resolved value throws on the next render instead of retaining stale data indefinitely

**Usage:**
```tsx
function TodoCount() {
  const count = useSelect(
    todosAtom,
    todos => todos.filter(t => !t.done).length
  )
  return <span>{count} remaining</span>
}
```

**With custom equality:**
```tsx
function UserName() {
  const name = useSelect(
    userAtom,
    user => user.name,
    (a, b) => a === b
  )
  return <span>{name}</span>
}
```

## Code References {#c3-301-source}

| File | Contents |
|------|----------|
| `src/context.tsx` | ScopeContext, ScopeProvider |
| `src/hooks.ts` | useScope, useController, useAtom, useSelect |
| `src/index.ts` | Public exports |

## Related Refs

No component-specific `ref-*` documents are wired yet for the React hook layer.

## Testing {#c3-301-testing}

Test coverage (97% stmt, 94% branch):
- ScopeProvider context propagation and nesting
- useScope error handling (outside provider)
- useAtom all 4 states plus manual-mode auto-resolution, refresh, and unhandledRejection suppression
- useSelect equality filtering, stale refresh rendering, and refresh-failure behavior
- useSelect non-suspense mode: auto-resolve, failed atom error, refresh error surfacing
- useController memoization, Suspense resolve, set(), update(), and ErrorBoundary recovery
- Provider switching and preset injection patterns

## Related {#c3-301-related}

- [c3-201-scope](../c3-2-lite/c3-201-scope.md) - Scope & Controller API
- [ADR-006](../adr/adr-006-select-fine-grained-reactivity.md) - select() design
