---
id: c3-301
c3-version: 3
title: React Hooks
summary: >
  React hooks for @pumped-fn/lite integration - useScope, useAtom, useSelect,
  and useController with Suspense/ErrorBoundary support via useSyncExternalStore.
---

# React Hooks

## Overview {#c3-301-overview}

Four hooks provide React integration with @pumped-fn/lite's scope and atom system:

| Hook | Purpose | React Integration |
|------|---------|-------------------|
| `useScope` | Access scope from context | Context API |
| `useController` | Get memoized controller | useMemo |
| `useAtom` | Subscribe to atom value | useSyncExternalStore + Suspense |
| `useSelect` | Fine-grained selection | useSyncExternalStore + useRef |

## Concepts {#c3-301-concepts}

### Explicit Lifecycle

Hooks **observe**, they don't **trigger**. Atoms must be resolved before rendering:

```tsx
const scope = createScope()
await scope.resolve(userAtom)

<ScopeProvider scope={scope}>
  <UserProfile />
</ScopeProvider>
```

### State-to-React Mapping

| Atom State | React Behavior |
|------------|----------------|
| `idle` | Throws Error (developer must pre-resolve) |
| `resolving` | Throws Promise (Suspense catches) |
| `resolved` | Returns value, subscribes to changes |
| `failed` | Throws stored error (ErrorBoundary catches) |

### useSyncExternalStore

All subscription hooks use React 18's `useSyncExternalStore` for:
- Concurrent rendering compatibility
- Automatic tear detection
- SSR support via `getServerSnapshot`

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
function useController<T>(atom: Lite.Atom<T>): Lite.Controller<T> {
  const scope = useScope()
  return useMemo(() => scope.controller(atom), [scope, atom])
}
```

**Usage:**
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

## useAtom {#c3-301-use-atom}

Subscribe to an atom's value with full Suspense/ErrorBoundary integration.

```typescript
function useAtom<T>(atom: Lite.Atom<T>): T {
  const ctrl = useController(atom)

  const getSnapshot = useCallback((): T => {
    switch (ctrl.state) {
      case 'idle':
        throw new Error("Atom not resolved...")
      case 'resolving':
        throw ctrl.resolve()
      case 'failed':
        throw ctrl.get()
      case 'resolved':
        return ctrl.get()
      default: {
        const exhaustiveCheck: never = ctrl.state
        throw new Error(`Unhandled atom state: ${exhaustiveCheck}`)
      }
    }
  }, [ctrl])

  const subscribe = useCallback(
    (onStoreChange: () => void) => ctrl.on('*', onStoreChange),
    [ctrl]
  )

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
```

**Usage:**
```tsx
function UserProfile() {
  const user = useAtom(userAtom)
  return <div>{user.name}</div>
}
```

**With Suspense:**
```tsx
<Suspense fallback={<Loading />}>
  <UserProfile />
</Suspense>
```

**With ErrorBoundary:**
```tsx
<ErrorBoundary fallback={<Error />}>
  <Suspense fallback={<Loading />}>
    <UserProfile />
  </Suspense>
</ErrorBoundary>
```

## useSelect {#c3-301-use-select}

Fine-grained selection with custom equality function.

```typescript
function useSelect<T, S>(
  atom: Lite.Atom<T>,
  selector: (value: T) => S,
  eq?: (a: S, b: S) => boolean
): S
```

**Key implementation details:**
- Selector stabilized via `useRef` to allow inline functions
- SelectHandle uses identity-tracking ref `{scope, atom, handle}` to detect changes
- New SelectHandle created when scope or atom changes
- Subscribes to SelectHandle, not Controller directly

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

## Source Files {#c3-301-source}

| File | Contents |
|------|----------|
| `src/context.tsx` | ScopeContext, ScopeProvider |
| `src/hooks.ts` | useScope, useController, useAtom, useSelect |
| `src/index.ts` | Public exports |

## Testing {#c3-301-testing}

Test coverage:
- ScopeProvider context propagation
- useScope error handling (outside provider)
- useAtom all 4 states (idle, resolving, resolved, failed)
- useSelect equality filtering
- useSelect custom equality function
- Preset injection patterns

**Skipped tests (jsdom timing issues):**
- Invalidation with Suspense transitions
- Direct value manipulation re-renders

## Related {#c3-301-related}

- [c3-201](../c3-2-lite/c3-201-scope.md) - Scope & Controller API
- [ADR-006](../adr/adr-006-select-fine-grained-reactivity.md) - select() design
