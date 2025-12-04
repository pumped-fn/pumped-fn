# README Documentation Strategy for @pumped-fn/lite

## Overview

**Principle:** README teaches *what's possible*, `index.d.mts` documents *what's available*.

**Goal:** Users understand the library's capabilities and patterns without wading through API details that types already provide.

## Format Rules

Choose format based on what communicates best:

- **Diagrams** — when relationships, flows, or timing matter
- **Sentences** — when capability is self-explanatory
- **Minimal snippets** — only when syntax isn't obvious from types

## Structure

```
1. Header (name, one-liner, badges)
2. Diagrams (focused, multiple)
3. Primitives (one section each, capability lists)
4. Footer (pointer to .d.mts, license)
```

## Diagrams

Five focused diagrams, each small and single-purpose:

### 1. Scope Lifecycle

Shows: createScope → ready → resolve (with preset branch) → dispose

```mermaid
sequenceDiagram
    participant User
    participant Scope
    participant Atom

    User->>Scope: createScope(options?)
    Scope-->>User: scope
    User->>Scope: await scope.ready
    Scope-->>User: ready

    User->>Scope: scope.resolve(atom)
    alt preset exists
        Scope-->>User: preset value (factory skipped)
    else no preset
        Scope->>Atom: factory(ctx, deps)
        Atom-->>Scope: value (cached)
        Scope-->>User: value
    end

    User->>Scope: scope.dispose()
    Scope->>Atom: run cleanups, release all
```

### 2. Invalidation Flow

Shows: invalidate → cleanups run → ctx.data retained → factory re-runs → resolved

```mermaid
sequenceDiagram
    participant User
    participant Controller
    participant Atom
    participant DataStore as ctx.data

    Note over DataStore: persists across invalidations

    User->>Controller: ctrl.invalidate()
    Controller->>Atom: run cleanups (LIFO)
    Note over DataStore: retained
    Controller->>Atom: state = resolving
    Controller->>Atom: factory(ctx, deps)
    Note right of Atom: ctx.data still has previous values
    Atom-->>Controller: new value
    Controller->>Atom: state = resolved
    Controller-->>User: listeners notified
```

### 3. Flow Execution

Shows: createContext → exec → close

```mermaid
sequenceDiagram
    participant User
    participant Scope
    participant Context as ExecutionContext
    participant Flow

    User->>Scope: scope.createContext(options?)
    Scope-->>User: context

    User->>Context: ctx.exec({ flow, input, tags? })
    Context->>Flow: parse(input)
    Context->>Context: resolve flow deps
    Context->>Flow: factory(ctx, deps)
    Flow-->>Context: output
    Context-->>User: output

    User->>Context: ctx.close()
    Context->>Context: run onClose cleanups (LIFO)
```

### 4. Tag Inheritance

Shows: Scope → Context → Flow (with override)

```mermaid
flowchart TD
    subgraph Scope["Scope tags: [tenantId('t1')]"]
        subgraph Context["Context tags: [requestId('r1')]"]
            subgraph Flow["Flow accesses:"]
                T1["tags.required(tenantId) → 't1'"]
                T2["tags.required(requestId) → 'r1'"]
            end
        end
    end

    subgraph Override["Context with override"]
        subgraph Flow2["Flow accesses:"]
            T3["tags.required(tenantId) → 't2' (overridden)"]
        end
    end

    Note1[Inner inherits from outer]
    Note2[Override replaces inherited]
```

### 5. Controller Reactivity

Shows: observe → state changes → listener fires

```mermaid
sequenceDiagram
    participant User
    participant Controller
    participant Atom

    User->>Controller: scope.controller(atom)
    User->>Controller: ctrl.on('resolved', listener)
    Controller-->>User: unsubscribe fn

    Note over Controller: atom gets invalidated elsewhere

    Controller->>Atom: state = resolving
    Controller-->>User: 'resolving' listeners fire
    Atom-->>Controller: new value
    Controller->>Atom: state = resolved
    Controller-->>User: 'resolved' listeners fire

    User->>Controller: ctrl.get()
    Controller-->>User: current value
```

## Primitives Sections

Each primitive gets a short section with capabilities listed. Format per primitive:

### Scope
- Entry point for everything
- Manages atom lifecycles
- Capabilities: resolve, controller, release, dispose, flush, createContext, on, select

### Atom
- Long-lived cached dependency
- Capabilities:
  - Dependencies on other atoms
  - ctx.cleanup() — runs on invalidate and release
  - ctx.invalidate() — schedules re-resolution
  - ctx.data — storage that survives invalidation

### Flow
- Short-lived operation with input/output
- Capabilities:
  - parse — validate/transform input before factory
  - Dependencies on atoms
  - ctx.input — typed input access
  - ctx.onClose() — cleanup when context closes

### Tag
- Contextual value passed through execution
- Capabilities:
  - default — fallback when not set
  - parse — validate on creation
  - tags.required/optional/all — dependency modes

### Controller
- Reactive handle for atom observation
- Capabilities:
  - state — sync access to current state
  - get() — sync access to value (if resolved)
  - resolve() — async resolution
  - invalidate() — trigger re-resolution
  - on() — subscribe to state changes

### Preset
- Value injection for testing
- Bypasses factory entirely
- Can inject value or redirect to another atom

### Extension
- AOP-style middleware
- Capabilities:
  - init — setup when scope created
  - wrapResolve — intercept atom resolution
  - wrapExec — intercept flow execution
  - dispose — cleanup when scope disposed

## Footer

```markdown
## Full API

See [`dist/index.d.mts`](./dist/index.d.mts) for complete type definitions.

## License

MIT
```

## Migration from Current README

**Remove:**
- API reference tables (redundant with .d.mts)
- Full code examples (replaced with diagrams + capability lists)
- Installation section (users already have it installed)
- Duplicate explanations

**Keep:**
- One-liner description
- Badges
- License

**Target size:** ~150-200 lines (down from ~530)

## Success Criteria

A user reading this README should:
1. Understand what each primitive does (from sections)
2. Understand how they interact (from diagrams)
3. Know what capabilities exist (from lists)
4. Know where to find exact API (pointer to .d.mts)

Without:
- Reading code examples
- Scrolling through API tables
- Guessing at relationships between concepts
