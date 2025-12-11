# React Patterns

Architectural patterns for `@pumped-fn/lite-react`. For API reference, see [README.md](./README.md).

---

## App Bootstrap

Pre-resolve critical atoms before rendering to avoid loading flash:

```mermaid
sequenceDiagram
    participant Main as main.tsx
    participant Scope
    participant React as React Tree

    Main->>Scope: createScope({ extensions })
    Main->>Scope: resolve critical atoms
    Main->>React: render with ScopeProvider
    React->>React: useAtom → instant (pre-resolved)
```

---

## Fine-Grained Reactivity

`useSelect` filters re-renders by selector output:

```mermaid
sequenceDiagram
    participant Component
    participant SelectHandle
    participant Atom

    Note over Atom: value.email changes
    Atom->>SelectHandle: notify
    SelectHandle->>SelectHandle: selector(value) → same result
    Note over Component: NO re-render

    Note over Atom: value.name changes
    Atom->>SelectHandle: notify
    SelectHandle->>SelectHandle: selector(value) → different
    SelectHandle->>Component: re-render
```

- Default equality: `===` (reference)
- Custom equality for complex comparisons

---

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Resolve in useEffect | Race conditions, no Suspense | Use `useAtom` (auto-resolves) |
| Create Scope in component | New scope every render | Create once outside component |
| Complex selector returning objects | Always re-renders (new reference) | Return primitives or custom equality |
| Fat atoms with mixed concerns | Can't preset granularly | One concern per atom |
