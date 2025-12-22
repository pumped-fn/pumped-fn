# @pumped-fn/lite

A lightweight effect system for TypeScript with managed lifecycles and minimal reactivity.

**Zero dependencies** · **<17KB bundle** · **Full TypeScript support**

## Documentation

| Resource | Purpose |
|----------|---------|
| [PATTERNS.md](./PATTERNS.md) | Architecture patterns, flow design, deps resolution, cleanup strategies |
| [dist/index.d.mts](./dist/index.d.mts) | API reference with TSDoc |

## How It Works

```mermaid
sequenceDiagram
    participant User
    participant Scope
    participant Atom

    User->>Scope: createScope(options?)
    Scope-->>User: scope
    User->>Scope: await scope.ready

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

## Invalidation & Data Retention

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

## Flow Execution

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

## Tag Inheritance (ADR-023)

Tags are auto-populated into `ctx.data` and resolved via `seekTag()`:

```mermaid
flowchart TD
    subgraph Root["Root Context (ctx.data)"]
        S["scope.tags → auto-populated"]
        C["context.tags → auto-populated"]
        subgraph Child["Child Context (exec)"]
            E["exec.tags → auto-populated"]
            F["flow.tags → auto-populated"]
            D["ctx.data.setTag() → runtime"]
            subgraph Deps["tags.required(tag)"]
                R["seekTag() traverses: Child → Root"]
            end
        end
    end

    Note["Nearest value wins. Propagates to all descendants."]
```

## Controller Reactivity

```mermaid
sequenceDiagram
    participant User
    participant Controller
    participant Atom

    User->>Controller: scope.controller(atom)
    User->>Controller: ctrl.on('resolved', listener)
    Controller-->>User: unsubscribe fn

    Note over Controller: atom invalidated elsewhere

    Controller->>Atom: state = resolving
    Controller-->>User: 'resolving' listeners fire
    Atom-->>Controller: new value
    Controller->>Atom: state = resolved
    Controller-->>User: 'resolved' listeners fire

    User->>Controller: ctrl.get()
    Controller-->>User: current value
```

## Primitives

### Scope

Entry point. Manages atom lifecycles, caching, and cleanup orchestration.

- `createScope(options?)` — create with optional extensions, presets, tags
- `scope.ready` — wait for extension initialization
- `scope.resolve(atom)` — resolve and cache
- `scope.controller(atom)` — get reactive handle
- `scope.release(atom)` — run cleanups, remove from cache
- `scope.dispose()` — release all, cleanup extensions
- `scope.createContext(options?)` — create execution context for flows
- `scope.select(atom, selector)` — fine-grained reactivity
- `scope.flush()` — wait for pending invalidations

### Atom

Long-lived cached dependency with lifecycle.

- Dependencies on other atoms via `deps`
- `ctx.cleanup(fn)` — runs on invalidate and release (LIFO order)
- `ctx.invalidate()` — schedule re-resolution
- `ctx.data` — storage that survives invalidation (cleared on release)
- `ctx.data.getOrSetTag(tag, defaultValue)` — initialize and retrieve in one call

### Flow

Short-lived operation with input/output.

- `parse` — validate/transform input before factory (throws `ParseError` on failure)
- `typed<T>()` — type marker without runtime parsing
- Dependencies on atoms via `deps`
- `ctx.input` — typed input access
- `ctx.onClose(fn)` — cleanup when context closes
- `ctx.exec({ flow, rawInput })` — pass unknown input when flow has `parse`

### Tag

Contextual value passed through execution without explicit wiring.

- Hierarchical lookup via `seekTag()` (ADR-023)
- Auto-populates into `ctx.data`: scope → context → exec → flow
- Registry tracks atom↔tag relationships (ADR-026)

```mermaid
flowchart TD
    subgraph "Tag Registry (ADR-026)"
        direction LR
        A["atom({ tags: [...] })"] -->|auto-register| R["WeakMap⟨Tag, WeakRef⟨Atom⟩[]⟩"]
        R -->|"tag.atoms()"| Q["query atoms by tag"]
        R -->|"getAllTags()"| T["query all tags"]
    end

    subgraph "Tag Inheritance (ADR-023)"
        S[scope.tags] --> D[ctx.data]
        C[context.tags] --> D
        E[exec.tags] --> D
        F[flow.tags] --> D
        D -->|"seekTag()"| V["nearest value wins"]
    end
```

Memory: `WeakRef` allows GC of unused atoms/tags. Cleanup on query.

### Controller

Reactive handle for observing and controlling atom state.

- `ctrl.state` — sync access: `'idle' | 'resolving' | 'resolved' | 'failed'`
- `ctrl.get()` — sync value access (throws if not resolved, returns stale during resolving)
- `ctrl.resolve()` — async resolution
- `ctrl.invalidate()` — trigger re-resolution (runs factory)
- `ctrl.set(value)` — replace value directly (skips factory)
- `ctrl.update(fn)` — transform value: `fn(currentValue) → newValue` (skips factory)
- `ctrl.on(event, listener)` — subscribe to `'resolved' | 'resolving' | '*'`
- Use `controller(atom)` in deps for reactive dependency (unresolved, you control timing)
- Use `controller(atom, { resolve: true })` to auto-resolve before passing to factory
- Use `scope.controller(atom, { resolve: true })` for same behavior outside deps

### Preset

Value injection for testing. Bypasses factory entirely.

- `preset(atom, value)` — inject direct value
- `preset(atom, otherAtom)` — redirect to another atom's factory
- Pass via `createScope({ presets: [...] })`

### Extension

AOP-style middleware for cross-cutting concerns.

- `init(scope)` — setup when scope created
- `wrapResolve(next, atom, scope)` — intercept atom resolution
- `wrapExec(next, target, ctx)` — intercept flow execution
- `dispose(scope)` — cleanup when scope disposed
- Pass via `createScope({ extensions: [...] })`

## Patterns

### Eager Resolution via Tag Registry

Use tags to mark atoms for eager resolution without hardcoding atom references:

```mermaid
flowchart LR
    subgraph "Define"
        T[eagerTag] --> A1[atomA]
        T --> A2[atomB]
        T --> A3[atomC]
    end

    subgraph "Extension init()"
        E["eagerTag.atoms()"] --> R["resolve all marked atoms"]
    end

    A1 & A2 & A3 -.->|"auto-tracked"| E
```

### Extension Discovery via getAllTags()

Extensions can discover and process all tags at runtime:

```mermaid
flowchart LR
    subgraph "Runtime"
        G["getAllTags()"] --> F{"filter by criteria"}
        F --> P["process matching tags"]
        P --> A["tag.atoms() for each"]
    end
```

Use cases: metrics collection, debugging, documentation generation.

## Types

All types available under the `Lite` namespace:

```typescript
import type { Lite } from '@pumped-fn/lite'
```

## Edge Cases

### Controller.set() / update()

| State | Behavior |
|-------|----------|
| `idle` | Throws "Atom not resolved" |
| `resolving` | Queues, applies after resolution completes |
| `resolved` | Queues normally |
| `failed` | Throws the stored error |

Both run cleanups before applying the new value.

### ContextData.getTag()

`ctx.data.getTag(tag)` always returns `T | undefined` (Map-like semantics). Use `getOrSetTag(tag)` when you need the tag's default value.

```typescript
const countTag = tag<number>({ label: 'count', default: 0 })

ctx.data.getTag(countTag)       // undefined (not stored)
ctx.data.getOrSetTag(countTag)  // 0 (uses default, now stored)
ctx.data.getTag(countTag)       // 0 (now stored)
```

### Hierarchical Data Lookup with seekTag() (ADR-023)

Tag dependencies (`tags.required()`, `tags.optional()`, `tags.all()`) use `seekTag()` internally to traverse the ExecutionContext parent chain. Tags from all sources are auto-populated into `ctx.data`:

```typescript
const requestIdTag = tag<string>({ label: 'requestId' })

const middleware = flow({
  factory: async (ctx) => {
    ctx.data.setTag(requestIdTag, 'req-123')
    return ctx.exec({ flow: handler })
  }
})

const handler = flow({
  deps: { reqId: tags.required(requestIdTag) },
  factory: (ctx, { reqId }) => {
    // reqId === 'req-123' (found via seekTag from parent)
  }
})
```

| Method | Scope | Use Case |
|--------|-------|----------|
| `getTag(tag)` | Local only | Per-exec isolated data |
| `seekTag(tag)` | Local → parent → root | Cross-cutting concerns |
| `setTag(tag, v)` | Local only | Always writes to current context |
| `tags.required(tag)` | Uses `seekTag()` | Dependency injection |

### Resolution Timing

Tag dependencies resolve **once** at factory start. Direct `seekTag()` calls reflect runtime changes:

```typescript
const handler = flow({
  deps: { userId: tags.required(userIdTag) },
  factory: (ctx, { userId }) => {
    ctx.data.setTag(userIdTag, 'changed')

    console.log(userId)                      // Original (stable)
    console.log(ctx.data.seekTag(userIdTag)) // 'changed' (dynamic)
  }
})
```

| Access | Resolution | Runtime Changes |
|--------|------------|-----------------|
| `deps: { x: tags.required(tag) }` | Once at start | Stable snapshot |
| `ctx.data.seekTag(tag)` | Each call | Sees changes |

## Automatic Garbage Collection

Atoms are automatically released when they have no subscribers, preventing memory leaks in long-running applications.

### How It Works

```mermaid
sequenceDiagram
    participant Component
    participant Controller
    participant Scope
    participant Timer

    Component->>Controller: ctrl.on('resolved', callback)
    Note over Controller: subscriberCount = 1
    
    Component->>Controller: unsubscribe()
    Note over Controller: subscriberCount = 0
    Controller->>Timer: schedule GC (3000ms)
    
    alt Resubscribe before timeout
        Component->>Controller: ctrl.on('resolved', callback)
        Controller->>Timer: cancel GC
        Note over Controller: Atom stays alive
    else Timeout fires
        Timer->>Scope: release(atom)
        Note over Scope: Cleanups run, cache cleared
        Scope->>Scope: Check dependencies for cascading GC
    end
```

### Configuration

```typescript
// Default: GC enabled with 3000ms grace period
const scope = createScope()

// Custom grace period (useful for tests)
const scope = createScope({
  gc: { graceMs: 100 }
})

// Disable GC entirely (preserves pre-1.11 behavior)
const scope = createScope({
  gc: { enabled: false }
})
```

### Opt-Out with keepAlive

Mark atoms that should never be automatically released:

```typescript
const configAtom = atom({
  factory: () => loadConfig(),
  keepAlive: true  // Never auto-released
})
```

### Cascading Dependency Protection

Dependencies are protected while dependents are mounted:

```
configAtom (keepAlive: true)
    ↑
dbAtom ←── userServiceAtom ←── [Component subscribes]
```

- `dbAtom` won't be GC'd while `userServiceAtom` is mounted
- When component unmounts, `userServiceAtom` is GC'd after grace period
- Then `dbAtom` becomes eligible for GC (no dependents)
- `configAtom` stays alive due to `keepAlive: true`

### React Strict Mode Compatibility

The 3000ms default grace period handles React's double-mount behavior:

```
Mount (render 1):     subscribe    → count=1
Unmount (cleanup 1):  unsubscribe  → count=0 → schedule GC
Mount (render 2):     subscribe    → count=1 → CANCEL GC
```

The second mount always happens before the GC timer fires.

### API Summary

| Option | Default | Description |
|--------|---------|-------------|
| `gc.enabled` | `true` | Enable/disable automatic GC |
| `gc.graceMs` | `3000` | Delay before releasing (ms) |
| `atom.keepAlive` | `false` | Prevent auto-release for specific atoms |

## License

MIT
