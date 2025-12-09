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
  readonly data: DataStore                     // Per-atom private storage (lazy)
}

interface DataStore {
  get<T>(tag: Tag<T, boolean>): T | undefined     // Always lookup-only
  set<T>(tag: Tag<T, boolean>, value: T): void
  has<T, H extends boolean>(tag: Tag<T, H>): boolean
  delete<T, H extends boolean>(tag: Tag<T, H>): boolean
  clear(): void
  getOrSet<T>(tag: Tag<T, true>): T               // Uses tag default
  getOrSet<T>(tag: Tag<T, true>, value: T): T     // Prefers stored, falls back to arg
  getOrSet<T>(tag: Tag<T, false>, value: T): T    // Requires explicit value
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

The `ctx.data` DataStore provides typed private storage using Tags as keys. Data survives invalidation but is cleared on release. Useful for internal bookkeeping that shouldn't be exposed publicly.

### Pattern: Optional Value (no default)

```typescript
const prevTag = tag<Data>({ label: 'prev' })

const pollingAtom = atom({
  factory: async (ctx) => {
    const prev = ctx.data.get(prevTag)  // Data | undefined - type enforced!
    const current = await fetchData()

    if (prev !== undefined && current !== prev) {
      console.log('Data changed!')
    }
    ctx.data.set(prevTag, current)  // Type checked - must be Data

    setTimeout(() => ctx.invalidate(), 5000)
    return current
  }
})
```

### Pattern: With Default Value

Use `getOrSet` for tags with defaults - `get()` always returns `T | undefined`:

```typescript
const countTag = tag<number>({ label: 'count', default: 0 })

const counterAtom = atom({
  factory: async (ctx) => {
    const count = ctx.data.getOrSet(countTag)  // number - uses tag default!
    ctx.data.set(countTag, count + 1)
    return count
  }
})
```

### Pattern: Complex Types with getOrSet

Use `getOrSet` to eliminate repetitive initialization boilerplate:

```typescript
const cacheTag = tag<Map<string, Result>>({ label: 'cache' })

const cacheAtom = atom({
  factory: async (ctx) => {
    return ctx.data.getOrSet(cacheTag, new Map())
  }
})
```

For tags with defaults, no second argument is needed:

```typescript
const countTag = tag<number>({ label: 'count', default: 0 })

const counterAtom = atom({
  factory: (ctx) => {
    const count = ctx.data.getOrSet(countTag)  // number, now stored
    ctx.data.set(countTag, count + 1)
    return count
  }
})
```

`getOrSet` always materializes the value into storage, so `has()` returns `true` afterward.

### Type Safety

Tags enforce types at compile time:

```typescript
const numTag = tag<number>({ label: 'num' })
const countTag = tag<number>({ label: 'count', default: 0 })

ctx.data.set(numTag, 123)      // ✅ OK
ctx.data.set(numTag, "oops")   // ❌ Compile error!

ctx.data.get(numTag)           // number | undefined (always)
ctx.data.get(countTag)         // number | undefined (always - Map semantics)
ctx.data.getOrSet(countTag)    // number (guaranteed - uses default)
```

### Lifecycle

| Event | `ctx.data` Behavior |
|-------|---------------------|
| First access | DataStore created lazily |
| `invalidate()` | Data preserved |
| `release()` | Data cleared |
| `scope.dispose()` | Data cleared |

### When to Use

Use `ctx.data` for:
- Internal state that survives invalidation
- Bookkeeping not meant for external access
- Values that don't warrant a separate atom

Use a separate atom instead when:
- State should be shared across atoms
- State needs its own invalidation lifecycle
- State should be externally accessible/controllable

## Service Helper {#c3-202-service}

The `service()` function is a convenience wrapper that returns an `Atom<T>` with the constraint that `T` must be methods compatible with `ctx.exec()`:

```typescript
type ServiceMethod = (ctx: ExecutionContext, ...args: unknown[]) => unknown
type ServiceMethods = Record<string, ServiceMethod>

// service() returns Atom<T> where T extends ServiceMethods
const dbService = service({
  deps: { pool: poolAtom },
  factory: (ctx, { pool }) => ({
    query: (ctx: ExecutionContext, sql: string) => pool.query(sql),
    insert: (ctx: ExecutionContext, table: string, data: object) => pool.insert(table, data),
  })
})
```

This is purely a compile-time constraint - `ctx.exec({ fn, params })` always injects `ExecutionContext` as the first argument, so service methods must match that signature.

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
| `src/service.ts` | `service()` |
| `src/types.ts` | `Atom`, `ControllerDep`, `ResolveContext`, `AtomFactory`, `ServiceMethod`, `ServiceMethods` |
| `src/symbols.ts` | `atomSymbol`, `controllerDepSymbol` |

## Testing {#c3-202-testing}

Key test scenarios in `tests/atom.test.ts`:
- Atom creation with/without dependencies
- Type inference for dependencies
- Controller dependency creation
- Type guards

Key test scenarios for `service()` in `tests/types.test.ts`:
- Type constraint enforced (methods must match `(ctx: ExecutionContext, ...args) => result`)
- Negative test: invalid signature rejected at compile time (`@ts-expect-error`)
- Runtime behavior identical to `atom()` (covered by `scope.test.ts`)

Key test scenarios for `ctx.data` in `tests/scope.test.ts`:
- Tag-based get/set with type safety
- Default value handling for tags with defaults
- Data persists across invalidations
- Data cleared on release
- DataStore lazily created
- Independent data per atom (same tag, different storage)
- has(), delete(), clear() operations
- getOrSet() returns existing value when present
- getOrSet() stores and returns default when missing
- getOrSet() uses tag default when available
- getOrSet() materializes value so has() returns true
- delete() then getOrSet() re-initializes value

## Related {#c3-202-related}

- [c3-201](./c3-201-scope.md) - Scope resolution and Controller
- [c3-204](./c3-204-tag.md) - Tag dependencies (tags also used as DataStore keys)
- [c3-205](./c3-205-preset.md) - Atom value presets
- [ADR-007](../adr/adr-007-resolve-context-data.md) - Original per-atom private storage design
- [ADR-010](../adr/adr-010-typed-data-store.md) - Tag-based typed DataStore API
- [ADR-012](../adr/adr-012-datastore-api-improvements.md) - DataStore API improvements (getOrSet, relaxed signatures)
- [ADR-014](../adr/adr-014-datastore-map-semantics.md) - DataStore Map-like semantics (get() always returns T | undefined)
