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

Hooks **observe**, they don't **trigger**. Atoms must be resolved before rendering.

**Exception:** `useAtom(atom, { suspense: false, resolve: true })` triggers resolution via `useEffect`. This is an opt-in escape hatch for users who need imperative auto-resolution without Suspense. See [ADR-027](../adr/adr-027-non-suspense-mode.md).

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

When `{ resolve: true }` is passed, the hook throws a Promise (triggering Suspense) if the atom is not resolved:

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
| `{ resolve: true }` | Throws Promise for Suspense if not resolved |

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
| `idle` | `undefined` | `false` | `undefined` |
| `resolving` | `undefined` | `true` | `undefined` |
| `resolved` | value | `false` | `undefined` |
| `failed` | `undefined` | `false` | Error |

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
