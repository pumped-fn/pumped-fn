---
id: c3-202
c3-version: 3
title: Atom
summary: >
  Long-lived dependency definition with factory function, optional dependencies,
  and controller dependency helper for reactive patterns.
---

# Atom

## Overview {#c3-202-overview}
<!-- Long-lived dependency definition -->

An Atom represents a long-lived dependency that:
- Has a factory function that produces its value
- Can declare dependencies on other atoms, controllers, or tags
- Is resolved once per scope and cached
- Supports lifecycle cleanup via ResolveContext

## Concepts {#c3-202-concepts}

### Atom Interface

```typescript
interface Atom<T> {
  readonly [atomSymbol]: true
  readonly factory: AtomFactory<T, D>
  readonly deps?: Record<string, Dependency>
  readonly tags?: Tagged<unknown>[]
}
```

### Dependency Types

Atoms can depend on:
- **Atom** - Resolved value injected directly
- **ControllerDep** - Controller instance for reactive access
- **TagExecutor** - Tag value from scope/context

### ResolveContext

Passed to the factory during resolution:

```typescript
interface ResolveContext {
  cleanup(fn: () => MaybePromise<void>): void  // Register cleanup
  invalidate(): void                           // Schedule re-resolution
  readonly scope: Scope                        // Parent scope
  readonly data: Map<string, unknown>          // Per-atom private storage (lazy)
}
```

## Creating Atoms {#c3-202-creating}

### Simple Atom (No Dependencies)

```typescript
const configAtom = atom({
  factory: () => ({ port: 3000, host: 'localhost' })
})

const asyncAtom = atom({
  factory: async () => {
    const data = await fetchData()
    return data
  }
})
```

### Atom with Dependencies

```typescript
const dbAtom = atom({
  deps: { config: configAtom },
  factory: (ctx, { config }) => {
    const connection = createConnection(config.host, config.port)
    ctx.cleanup(() => connection.close())
    return connection
  }
})
```

### Atom with Controller Dependency

```typescript
const serverAtom = atom({
  deps: { config: controller(configAtom) },
  factory: (ctx, { config }) => {
    const unsub = config.on(() => ctx.invalidate())
    ctx.cleanup(unsub)

    return createServer(config.get().port)
  }
})
```

### Atom with Tag Dependency

```typescript
const tenantAtom = atom({
  deps: { tenantId: tags.required(tenantTag) },
  factory: (ctx, { tenantId }) => {
    return loadTenant(tenantId)
  }
})
```

## Type Inference {#c3-202-types}

### InferDep

The type system automatically infers dependency types:

```typescript
type InferDep<D> = D extends Atom<infer T>
  ? T                          // Direct value
  : D extends ControllerDep<infer T>
    ? Controller<T>            // Controller instance
    : D extends TagExecutor<infer TOutput>
      ? TOutput                // Tag value
      : never
```

### InferDeps

Maps all dependencies to their resolved types:

```typescript
const myAtom = atom({
  deps: {
    db: dbAtom,                     // Inferred as DbConnection
    config: controller(configAtom), // Inferred as Controller<Config>
    tenant: tags.optional(tenantTag) // Inferred as string | undefined
  },
  factory: (ctx, deps) => {
    // deps.db: DbConnection
    // deps.config: Controller<Config>
    // deps.tenant: string | undefined
  }
})
```

## Controller Dependency {#c3-202-controller}

### Creating Controller Dependency

```typescript
import { controller } from '@pumped-fn/lite'

const dep = controller(myAtom)
```

### Usage Pattern

```typescript
const dependentAtom = atom({
  deps: { upstream: controller(upstreamAtom) },
  factory: (ctx, { upstream }) => {
    // upstream is Controller<T>, not T

    // Subscribe to changes
    const unsub = upstream.on(() => {
      console.log('Upstream changed!')
      ctx.invalidate() // Cascade invalidation
    })
    ctx.cleanup(unsub)

    // Get current value
    const value = upstream.get()

    return processValue(value)
  }
})
```

### Type Guard

```typescript
import { isControllerDep } from '@pumped-fn/lite'

if (isControllerDep(dep)) {
  console.log(dep.atom) // The wrapped atom
}
```

## Cleanup Registration {#c3-202-cleanup}

### Registering Cleanups

```typescript
const resourceAtom = atom({
  factory: (ctx) => {
    const resource = acquireResource()

    ctx.cleanup(() => resource.release())
    ctx.cleanup(async () => {
      await resource.flush()
    })

    return resource
  }
})
```

### Cleanup Execution Order

Cleanups run in LIFO order (last registered, first executed):

```typescript
const atom = atom({
  factory: (ctx) => {
    ctx.cleanup(() => console.log('A'))
    ctx.cleanup(() => console.log('B'))
    ctx.cleanup(() => console.log('C'))
    return 'value'
  }
})

await scope.release(atom)
// Output: C, B, A
```

## Self-Invalidation {#c3-202-invalidation}

### Pattern: Polling Refresh

```typescript
const configAtom = atom({
  factory: async (ctx) => {
    const config = await fetchConfig()

    const interval = setInterval(() => {
      ctx.invalidate()
    }, 60_000)

    ctx.cleanup(() => clearInterval(interval))

    return config
  }
})
```

### Pattern: WebSocket Updates

```typescript
const dataAtom = atom({
  factory: async (ctx) => {
    const ws = new WebSocket('wss://api.example.com')

    ws.onmessage = () => ctx.invalidate()
    ctx.cleanup(() => ws.close())

    const initial = await fetchInitialData()
    return initial
  }
})
```

## Per-Atom Private Storage {#c3-202-data}

The `ctx.data` Map provides private storage that survives invalidation but is cleared on release. Useful for internal bookkeeping that shouldn't be exposed publicly.

### Pattern: Change Detection

```typescript
const pollingAtom = atom({
  factory: async (ctx) => {
    const prev = ctx.data.get('prev') as Data | undefined
    const current = await fetchData()

    if (prev !== undefined && current !== prev) {
      console.log('Data changed!')
    }
    ctx.data.set('prev', current)

    setTimeout(() => ctx.invalidate(), 5000)
    return current
  }
})
```

### Lifecycle

| Event | `ctx.data` Behavior |
|-------|---------------------|
| First access | Map created lazily |
| `invalidate()` | Map preserved |
| `release()` | Map cleared |
| `scope.dispose()` | Map cleared |

### When to Use

Use `ctx.data` for:
- Internal state that survives invalidation
- Bookkeeping not meant for external access
- Values that don't warrant a separate atom

Use a separate atom instead when:
- State should be shared across atoms
- State needs its own invalidation lifecycle
- State should be externally accessible/controllable

## Type Guard {#c3-202-guards}

### isAtom

```typescript
import { isAtom } from '@pumped-fn/lite'

function processValue(value: unknown) {
  if (isAtom(value)) {
    // value is Atom<unknown>
    console.log('Is an atom')
  }
}
```

### isControllerDep

```typescript
import { isControllerDep } from '@pumped-fn/lite'

function processDep(dep: Dependency) {
  if (isControllerDep(dep)) {
    // dep is ControllerDep<unknown>
    console.log('Atom:', dep.atom)
  }
}
```

## Source Files {#c3-202-source}

| File | Contents |
|------|----------|
| `src/atom.ts` | `atom()`, `controller()`, `isAtom()`, `isControllerDep()` |
| `src/types.ts` | `Atom`, `ControllerDep`, `ResolveContext`, `AtomFactory` |
| `src/symbols.ts` | `atomSymbol`, `controllerDepSymbol` |

## Testing {#c3-202-testing}

Key test scenarios in `tests/atom.test.ts`:
- Atom creation with/without dependencies
- Type inference for dependencies
- Controller dependency creation
- Type guards

Key test scenarios for `ctx.data` in `tests/scope.test.ts`:
- Data persists across invalidations
- Data cleared on release
- Data lazily created
- Independent data per atom

## Related {#c3-202-related}

- [c3-201](./c3-201-scope.md) - Scope resolution and Controller
- [c3-204](./c3-204-tag.md) - Tag dependencies
- [c3-205](./c3-205-preset.md) - Atom value presets
- [ADR-007](../adr/adr-007-resolve-context-data.md) - Per-atom private storage design
