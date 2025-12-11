# React Patterns

Architectural patterns for `@pumped-fn/lite-react` — when and how to compose lite primitives in React applications.

## Pattern Overview

| Pattern | Lite Primitives | React Integration | Use Case |
|---------|-----------------|-------------------|----------|
| [App Bootstrap](#app-bootstrap) | `Scope`, `atom` | `ScopeProvider` | Application initialization |
| [Data Subscription](#data-subscription) | `Controller` | `useAtom`, `Suspense` | Reactive data display |
| [Fine-Grained Reactivity](#fine-grained-reactivity) | `SelectHandle` | `useSelect` | Render optimization |
| [Imperative Actions](#imperative-actions) | `Controller` | `useController` | Mutations, refresh |
| [Request Lifecycle](#request-lifecycle) | `Flow`, `ExecutionContext` | `useScope` | Form submission, API calls |
| [Isolated Testing](#isolated-testing) | `Scope`, `preset` | `ScopeProvider` | Component test isolation |
| [SSR Hydration](#ssr-hydration) | `Scope`, `preset` | `ScopeProvider` | Server rendering |
| [Testable Architecture](#testable-architecture) | `atom`, `preset` | Layer separation | Design for testability |

---

## App Bootstrap

**Combines:** IoC Container + Provider Pattern

```mermaid
sequenceDiagram
    participant Main as main.tsx
    participant Scope
    participant React as React Tree

    Main->>Scope: createScope({ extensions })
    Main->>Scope: resolve critical atoms
    Note over Scope: Atoms cached in scope

    Main->>React: render with ScopeProvider
    React->>React: useAtom → instant (pre-resolved)
```

**Characteristics:**
- Scope created once at app entry
- Critical atoms pre-resolved before render
- Extensions initialize at scope creation
- No loading flash for pre-resolved atoms

---

## Data Subscription

**Combines:** Observer + Suspense Integration

```mermaid
flowchart TD
    useAtom --> Mode{options?}
    Mode -->|default| Suspense[Suspense Mode]
    Mode -->|suspense: false| Manual[Manual Mode]

    Suspense --> SState{ctrl.state?}
    SState -->|idle/resolving| ThrowPromise[Throw Promise]
    SState -->|resolved| ReturnValue[Return T]
    SState -->|failed| ThrowError[Throw Error]

    Manual --> MState{ctrl.state?}
    MState -->|idle| IdleState["{ data: undefined, loading: false }"]
    MState -->|resolving| LoadingState["{ data: undefined, loading: true }"]
    MState -->|resolved| DataState["{ data: T, loading: false }"]
    MState -->|failed| ErrorState["{ error: Error, loading: false }"]
```

### Suspense Mode (Default)

| Atom State | React Behavior |
|------------|----------------|
| `idle` | Auto-resolve, throw Promise |
| `resolving` | Throw Promise (Suspense catches) |
| `resolved` | Return value, subscribe to changes |
| `failed` | Throw stored error (ErrorBoundary catches) |

**Characteristics:**
- Declarative loading via Suspense
- Declarative errors via ErrorBoundary
- Auto-resolution for lazy atoms
- Re-renders on value change or invalidation

### Manual Mode (Non-Suspense)

```tsx
const { data, loading, error, controller } = useAtom(atom, { suspense: false })
```

| Option | Behavior |
|--------|----------|
| `{ suspense: false }` | Returns state object, no auto-resolve |
| `{ suspense: false, resolve: true }` | Returns state object, auto-resolves on mount |

**Characteristics:**
- Imperative loading/error handling
- No Suspense boundary required
- Similar to TanStack Query pattern
- Controller exposed for mutations

---

## Fine-Grained Reactivity

**Combines:** Selector Pattern + Equality Filtering

```mermaid
sequenceDiagram
    participant Component
    participant SelectHandle
    participant Atom

    Note over Atom: value.email changes
    Atom->>SelectHandle: notify
    SelectHandle->>SelectHandle: selector(value) → same result
    SelectHandle->>SelectHandle: equality passes
    Note over Component: NO re-render

    Note over Atom: value.name changes
    Atom->>SelectHandle: notify
    SelectHandle->>SelectHandle: selector(value) → different result
    SelectHandle->>Component: re-render
```

**Characteristics:**
- Selector extracts derived value
- Component re-renders only when selected value changes
- Default equality: `===` (reference)
- Custom equality for complex comparisons

---

## Imperative Actions

**Combines:** Command Pattern + Controller

```mermaid
graph LR
    Action[User Action] --> Controller
    Controller -->|invalidate| Refetch[Re-run factory]
    Controller -->|set| Replace[Replace value]
    Controller -->|update| Transform[Transform value]
```

| Method | Behavior | Triggers Suspense |
|--------|----------|-------------------|
| `invalidate()` | Re-runs factory | Yes |
| `set(value)` | Replaces value directly | No |
| `update(fn)` | Transforms current value | No |

**Characteristics:**
- Controller memoized per atom
- `invalidate` → factory re-execution with Suspense
- `set`/`update` → immediate value change without factory

---

## Request Lifecycle

**Combines:** Command + Context Object + Cleanup

```mermaid
sequenceDiagram
    participant Component
    participant Scope
    participant Context as ExecutionContext
    participant Flow

    Component->>Scope: createContext({ tags })
    Scope-->>Component: ctx

    Component->>Context: ctx.exec({ flow, input })
    Context->>Flow: parse → validate
    Context->>Flow: factory(childCtx, deps)
    Flow-->>Context: result

    Component->>Context: ctx.close()
    Context->>Context: run onClose cleanups (LIFO)
```

**Characteristics:**
- ExecutionContext bounds request lifecycle
- Flow encapsulates validation + execution
- `rawInput` delegates validation to flow's `parse`
- Tags propagate through nested `exec()` calls
- `ctx.close()` runs cleanups in LIFO order

---

## Isolated Testing

**Combines:** IoC Container + Strategy (Preset)

```mermaid
graph TB
    subgraph "Test Isolation"
        Test1[Test 1] --> Scope1[Scope + Presets A]
        Test2[Test 2] --> Scope2[Scope + Presets B]
        Test3[Test 3] --> Scope3[Scope + Presets C]
    end
```

### State Control

```mermaid
stateDiagram-v2
    [*] --> idle: createScope()
    idle --> resolved: preset atom, value
    idle --> failed: preset atom, failingAtom
    idle --> resolving: resolve without await
    resolved --> resolving: invalidate()
```

| Target State | Setup |
|--------------|-------|
| `idle` | Create scope, don't resolve |
| `resolving` | Trigger resolve, don't await |
| `resolved` | Preset value or await resolve |
| `failed` | Preset failing atom |

### Preset Strategies

| Strategy | Use Case |
|----------|----------|
| Static value | Unit tests with fixed data |
| Atom redirect | Mock services, error simulation |
| No preset | Integration tests |

### Unit vs Integration

| Test Type | Preset Strategy |
|-----------|----------------|
| Unit | Preset all deps |
| Integration | Preset external only (API, DB) |

**Characteristics:**
- Fresh scope per test
- No global state pollution
- Safe for parallel execution

---

## SSR Hydration

**Combines:** IoC Container + Preset Injection

```mermaid
sequenceDiagram
    participant Server
    participant Client

    Note over Server: Server Render
    Server->>Server: scope.resolve(atoms)
    Server->>Server: renderToString
    Server->>Server: serialize data

    Server->>Client: HTML + serialized data

    Note over Client: Client Hydrate
    Client->>Client: createScope({ presets: [data] })
    Client->>Client: resolve (instant from preset)
    Client->>Client: hydrateRoot
```

**Characteristics:**
- No hydration mismatch (same data)
- Presets bypass async factory
- `useSyncExternalStore` provides server snapshot
- No flash of loading state

---

## Testable Architecture

**Principle:** Dependencies flow downward — preset lower layers, test upper layers.

```mermaid
graph TB
    subgraph "UI Layer"
        Components[Components]
        UIAtoms[UI State]
    end

    subgraph "Domain Layer"
        DomainAtoms[Domain Atoms]
        Flows[Flows]
    end

    subgraph "Data Layer"
        DataAtoms[Data Atoms]
        Services[Services]
    end

    Components --> UIAtoms
    Components --> DomainAtoms
    Components --> Flows

    UIAtoms -.-> DomainAtoms
    DomainAtoms -.-> DataAtoms
    Flows -.-> Services

    style Services fill:#ffe1e1
    style Components fill:#e1f5ff
```

### Atom Granularity

| Atom Type | Dependencies | Test Strategy |
|-----------|--------------|---------------|
| Service | None | Always preset |
| Data | Services only | Preset or real |
| Domain | Data atoms | Usually real |
| UI State | Domain/Data | Preset to target state |

**Anti-Pattern:** Fat atoms mixing concerns — impossible to preset granularly.

### Test Boundaries

| Test Type | Preset | Real |
|-----------|--------|------|
| Component | All atoms | None |
| Domain | Data atoms | Domain logic |
| Flow | Services | Validation + factory |
| Integration | External only | Everything else |

---

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Resolve in useEffect | Race conditions, no Suspense | Use `useAtom` (auto-resolves) |
| Create Scope in component | New scope every render | Create once outside component |
| Complex selector returning objects | Always re-renders (new reference) | Return primitives or custom equality |
| Missing ctx.close() | Cleanups never run | Always close in finally block |
| Fat atoms with mixed concerns | Can't preset granularly | One concern per atom |
