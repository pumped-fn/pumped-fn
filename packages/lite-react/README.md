# @pumped-fn/lite-react

React bindings for `@pumped-fn/lite` with Suspense, ErrorBoundary integration, and stale-while-revalidate refreshes.

**Zero dependencies** · **<2KB bundle** · **React 18+**

## How It Works

```mermaid
sequenceDiagram
    participant App
    participant ScopeProvider
    participant useAtom
    participant Controller

    App->>App: scope.resolve(atom)
    App->>ScopeProvider: <ScopeProvider scope={scope}>

    useAtom->>Controller: check ctrl.state
    alt resolved
        Controller-->>useAtom: value
        useAtom->>Controller: subscribe to changes
    else resolving with stale value
        Controller-->>useAtom: stale value
    else resolving without value
        useAtom-->>App: throw Promise (Suspense)
    else failed
        useAtom-->>App: throw Error (ErrorBoundary)
    else idle
        useAtom-->>App: throw Promise (Suspense)
    end
```

## State Handling

```mermaid
flowchart TD
    Hook[useAtom/useSelect]
    Hook --> State{ctrl.state?}

    State -->|idle| AutoResolve[Auto-resolve + Throw Promise]
    State -->|resolving + stale value| Stale[Return stale value]
    State -->|resolving + no value| Promise[Throw cached Promise]
    State -->|resolved| Value[Return value]
    State -->|failed| Stored[Throw stored error]

    AutoResolve --> Suspense[Suspense catches]
    Promise --> Suspense
    Stale --> Render[Keep current UI]
    Stored --> ErrorBoundary[ErrorBoundary catches]
```

| State | Hook Behavior |
|-------|---------------|
| `idle` | Auto-resolves and suspends — Suspense shows fallback |
| `resolving` | Returns stale value if available, otherwise throws cached promise |
| `resolved` | Returns value, subscribes to changes |
| `failed` | Throws stored error — ErrorBoundary catches |

## API

### ScopeProvider

Provides scope to component tree.

```tsx
import { createScope } from '@pumped-fn/lite'
import { ScopeProvider } from '@pumped-fn/lite-react'

const scope = createScope()
await scope.resolve(userAtom)

<ScopeProvider scope={scope}>
  <App />
</ScopeProvider>
```

### useScope

Access scope from context.

```tsx
const scope = useScope()
await scope.resolve(someAtom)
```

### useController

Get memoized controller for imperative operations.

```tsx
const ctrl = useController(counterAtom)
ctrl.set(10)
ctrl.update(n => n + 1)
ctrl.invalidate()
```

With `{ resolve: true }` option, triggers Suspense if atom not resolved:

```tsx
// Suspense ensures controller is resolved before render
const ctrl = useController(configAtom, { resolve: true })
ctrl.get() // safe - Suspense guarantees resolved state
```

While a controller is re-resolving, `{ resolve: true }` keeps suspending until the controller settles.

### useAtom

Subscribe to atom value with Suspense integration.

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

#### Non-Suspense Mode

For manual loading/error state handling without Suspense:

```tsx
function UserProfile() {
  const { data, loading, error, controller } = useAtom(userAtom, { suspense: false })

  if (loading && data) return <div>Refreshing {data.name}...</div>
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

With `{ resolve: true }`, auto-resolves on mount:

```tsx
// Starts resolution automatically when component mounts
const { data, loading, error } = useAtom(userAtom, { suspense: false, resolve: true })
```

| Option | Effect |
|--------|--------|
| `{ suspense: false }` | Returns state object, no auto-resolve |
| `{ suspense: false, resolve: true }` | Returns state object, auto-resolves on mount |

While `loading` is `true`, `data` may still contain the last resolved value during a refresh.

### useSelect

Fine-grained selection — only re-renders when selected value changes.

```tsx
const name = useSelect(userAtom, user => user.name)
const count = useSelect(todosAtom, todos => todos.length, (a, b) => a === b)
```

## Invalidation

When an atom is invalidated, `useAtom` and `useSelect` keep rendering the last value while re-resolving:

```mermaid
sequenceDiagram
    participant Component
    participant useAtom
    participant Controller

    Note over Controller: state = resolved
    Component->>useAtom: render (value)

    Note over Controller: ctrl.invalidate()
    Controller->>Controller: state = resolving
    useAtom-->>Component: stale value
    Note over Component: current UI stays visible

    Controller->>Controller: factory runs
    Controller->>Controller: state = resolved
    useAtom->>Component: re-render (new value)
```

`useController(atom, { resolve: true })` is different: it suspends until the controller settles again.

## Testing

Use presets for test isolation:

```tsx
import { createScope, preset } from '@pumped-fn/lite'
import { ScopeProvider } from '@pumped-fn/lite-react'

const scope = createScope({
  presets: [preset(userAtom, { name: 'Test User' })]
})
await scope.resolve(userAtom)

render(
  <ScopeProvider scope={scope}>
    <UserProfile />
  </ScopeProvider>
)
```

## SSR

SSR-compatible when request-scoped atoms are resolved before rendering:

- No side effects on import
- Scope passed as prop (no global state)

```tsx
// Server
const scope = createScope()
await scope.resolve(dataAtom)
const html = renderToString(<ScopeProvider scope={scope}><App /></ScopeProvider>)

// Client
const clientScope = createScope({
  presets: [preset(dataAtom, window.__DATA__)]
})
await clientScope.resolve(dataAtom)
hydrateRoot(root, <ScopeProvider scope={clientScope}><App /></ScopeProvider>)
```

## Full API

See [`dist/index.d.mts`](./dist/index.d.mts) for complete type definitions.

## License

MIT
