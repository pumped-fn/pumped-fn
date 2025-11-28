---
id: c3-2
c3-version: 3
title: Lite Library (@pumped-fn/lite)
summary: >
  Lightweight dependency injection with minimal reactivity - atoms, flows, tags,
  and controllers for TypeScript applications with zero external dependencies.
---

# Lite Library (@pumped-fn/lite)

## Overview {#c3-2-overview}
<!-- Lightweight DI with minimal reactivity -->

`@pumped-fn/lite` is a minimal dependency injection library for TypeScript that provides:
- **Atoms** - Long-lived dependencies with lifecycle management
- **Flows** - Short-lived request/response execution patterns
- **Tags** - Metadata attachment and extraction
- **Controllers** - Deferred resolution with reactivity support

**Design principles:**
1. Very light, very compact - say no to unnecessary features
2. Very little API exposed - every API is gold, expensive to learn
3. Minimal overhead - optimized code required

**Bundle size:** <17KB (ESM), <17KB (CJS)

**Dependencies:** Zero external dependencies

## Technology Stack {#c3-2-stack}
<!-- Runtime and build tooling -->

| Category | Technology |
|----------|------------|
| Language | TypeScript 5.9+ |
| Runtime | Node.js 18+ |
| Build | tsdown (rolldown-based) |
| Test | Vitest |
| Package | ESM + CJS dual format |

## Component Relationships {#c3-2-relationships}
<!-- How internal modules connect -->

```mermaid
graph TB
    subgraph "Public API"
        createScope["createScope()"]
        atom["atom()"]
        flow["flow()"]
        tag["tag()"]
        preset["preset()"]
        controller["controller()"]
    end

    subgraph "Runtime"
        Scope["Scope"]
        Controller["Controller"]
        ExecutionContext["ExecutionContext"]
    end

    subgraph "Data"
        AtomEntry["AtomEntry<br/>(state, value, cleanups)"]
        Tags["Tagged[]"]
    end

    createScope --> Scope
    atom --> Scope
    flow --> ExecutionContext
    tag --> Tags
    preset --> Scope
    controller --> Controller

    Scope --> AtomEntry
    Scope --> Controller
    Scope --> ExecutionContext
    Controller --> AtomEntry
    ExecutionContext --> Scope
    ExecutionContext --> Tags
```

## Data Flow {#c3-2-data-flow}
<!-- Execution sequence -->

### Atom Resolution Flow

```mermaid
sequenceDiagram
    participant App as Application
    participant Scope
    participant Entry as AtomEntry
    participant Factory

    App->>Scope: resolve(atom)
    Scope->>Entry: check state
    alt state = resolved
        Entry-->>App: cached value
    else state = idle/failed
        Scope->>Entry: state = resolving
        Scope->>Factory: call factory(ctx, deps)
        Factory-->>Scope: value
        Scope->>Entry: state = resolved, cache value
        Entry-->>App: value
    end
```

### Controller Invalidation Flow

```mermaid
sequenceDiagram
    participant App as Application
    participant Ctrl as Controller
    participant Scope
    participant Entry as AtomEntry
    participant Factory

    App->>Ctrl: invalidate()
    Ctrl->>Scope: invalidate(atom)
    Scope->>Entry: run cleanups (LIFO)
    Scope->>Entry: state = resolving
    Scope->>Entry: notify listeners
    Scope->>Factory: call factory(ctx, deps)
    Factory-->>Scope: new value
    Scope->>Entry: state = resolved
    Scope->>Entry: notify listeners
```

## Public API {#c3-2-api}
<!-- Exported functions and types -->

### Factory Functions

| Function | Description | Returns |
|----------|-------------|---------|
| `createScope(options?)` | Create DI container | `Promise<Scope>` |
| `atom(config)` | Define long-lived dependency | `Atom<T>` |
| `flow(config)` | Define request handler | `Flow<T, I>` |
| `tag(config)` | Define metadata tag | `Tag<T>` |
| `preset(atom, value)` | Create preset injection | `Preset<T>` |
| `controller(atom)` | Create controller dependency | `ControllerDep<T>` |

### Type Guards

| Function | Description |
|----------|-------------|
| `isAtom(value)` | Check if value is Atom |
| `isFlow(value)` | Check if value is Flow |
| `isTag(value)` | Check if value is Tag |
| `isTagged(value)` | Check if value is Tagged |
| `isPreset(value)` | Check if value is Preset |
| `isControllerDep(value)` | Check if value is ControllerDep |
| `isTagExecutor(value)` | Check if value is TagExecutor |

### Interfaces

| Interface | Description |
|-----------|-------------|
| `Scope` | DI container with resolution, controller, and event APIs |
| `Controller<T>` | Deferred accessor with state, get, invalidate, and subscription |
| `ExecutionContext` | Flow execution context with input, exec, and lifecycle |
| `Extension` | Cross-cutting hooks for resolve and exec |

### Namespace Export

All types are grouped under the `Lite` namespace:

```typescript
import type { Lite } from '@pumped-fn/lite'

const myAtom: Lite.Atom<Config> = atom({ factory: () => loadConfig() })
```

## Comparison with core-next {#c3-2-comparison}
<!-- Feature comparison -->

| Feature | @pumped-fn/lite | @pumped-fn/core-next |
|---------|-----------------|---------------------|
| Atoms/Executors | `atom()` | `provide()`, `derive()` |
| Flows | `flow()` | `flow()` |
| Tags | `tag()`, `tags.required/optional/all` | `tag()`, `tags.required/optional/all` |
| Extensions | Simple 4-hook interface | Full lifecycle hooks |
| Schema validation | No | StandardSchema |
| Journaling | No | Yes |
| Multi-executor pools | No | `multi()` |
| Enhanced Promise | No | `Promised` class |
| Error classes | Simple Error | Rich hierarchy |
| Tag lookup | O(n) array scan | O(1) Map-based |
| Reactivity | Controller + invalidation | No built-in |
| Bundle size | <17KB | ~75KB |

## Source Organization {#c3-2-source}
<!-- File structure -->

```
packages/lite/
├── src/
│   ├── index.ts      # Public exports
│   ├── types.ts      # Lite namespace with all interfaces
│   ├── symbols.ts    # Unique symbols for type guards
│   ├── atom.ts       # atom(), controller(), type guards
│   ├── flow.ts       # flow(), isFlow()
│   ├── tag.ts        # tag(), tags, tag type guards
│   ├── preset.ts     # preset(), isPreset()
│   └── scope.ts      # createScope(), Scope, Controller, ExecutionContext
├── tests/
│   ├── atom.test.ts
│   ├── flow.test.ts
│   ├── tag.test.ts
│   ├── preset.test.ts
│   ├── scope.test.ts
│   ├── extension.test.ts
│   └── types.test.ts
├── package.json
├── tsconfig.json
└── tsdown.config.ts
```

## Components {#c3-2-components}
<!-- Component inventory -->

| ID | Component | Description |
|----|-----------|-------------|
| [c3-201](./c3-201-scope.md) | Scope & Controller | DI container, resolution, lifecycle states, reactivity |
| [c3-202](./c3-202-atom.md) | Atom | Long-lived dependency definition |
| [c3-203](./c3-203-flow.md) | Flow & ExecutionContext | Request/response execution pattern |
| [c3-204](./c3-204-tag.md) | Tag System | Metadata attachment and extraction |
| [c3-205](./c3-205-preset.md) | Preset | Value injection and atom redirection |

## Extension System {#c3-2-extension}
<!-- Cross-cutting concern hooks -->

Extensions provide AOP-style hooks for cross-cutting concerns:

```typescript
interface Extension {
  readonly name: string
  init?(scope: Scope): MaybePromise<void>
  wrapResolve?<T>(next: () => Promise<T>, atom: Atom<T>, scope: Scope): Promise<T>
  wrapExec?<T>(next: () => Promise<T>, target: Flow | Function, ctx: ExecutionContext): Promise<T>
  dispose?(scope: Scope): MaybePromise<void>
}
```

**Lifecycle:**
1. `init()` - Called when scope is created (after `createScope()`)
2. `wrapResolve()` - Wraps atom resolution (innermost extension runs first)
3. `wrapExec()` - Wraps flow/function execution
4. `dispose()` - Called when scope is disposed

**Example logging extension:**

```typescript
const loggingExtension: Lite.Extension = {
  name: 'logging',
  wrapResolve: async (next, atom, scope) => {
    console.log('Resolving atom...')
    const result = await next()
    console.log('Resolved:', result)
    return result
  }
}

const scope = await createScope({ extensions: [loggingExtension] })
```

## Testing {#c3-2-testing}
<!-- Testing strategy -->

**Test organization:**
- Unit tests per source file
- Type tests using `expectTypeOf` from Vitest
- 84 tests covering all components

**Running tests:**
```bash
pnpm -F @pumped-fn/lite test        # Run all tests
pnpm -F @pumped-fn/lite test:watch  # Watch mode
pnpm -F @pumped-fn/lite typecheck   # Type check src
pnpm -F @pumped-fn/lite typecheck:full  # Type check src + tests
```

## Related {#c3-2-related}

- [ADR-002](../adr/adr-002-lightweight-lite-package.md) - Initial package design decisions
- [ADR-003](../adr/adr-003-controller-reactivity.md) - Controller-based reactivity design
- [c3-1-core](../c3-1-core/) - Core library (feature comparison)
