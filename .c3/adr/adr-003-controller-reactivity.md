---
id: ADR-003-controller-reactivity
title: Controller-based Reactivity for @pumped-fn/lite
summary: >
  Add minimal reactivity to the lite package through Controller pattern,
  enabling atoms to self-invalidate and subscribers to react to state changes
  while maintaining the package's lightweight principles.
status: proposed
date: 2025-11-28
---

# [ADR-003] Controller-based Reactivity for @pumped-fn/lite

## Status {#adr-003-status}
**Proposed** - 2025-11-28

## Problem/Requirement {#adr-003-problem}

The `@pumped-fn/lite` package provides lightweight DI, but lacks reactivity for common use cases:

**Backend scenarios:**
- Remote config that changes dynamically
- Feature flags that update without restart
- Connection pools that need refresh on credential rotation

**Frontend scenarios:**
- Atoms as external state for React (via `useSyncExternalStore`)
- Fetch atoms that depend on authentication state
- Real-time data that pushes updates

**Constraints (lite package principles):**
1. Very light, very compact - say no to unnecessary features
2. Very little API exposed - every API is gold, expensive to learn
3. Minimal overhead - optimized code required

## Exploration Journey {#adr-003-exploration}

**Initial hypothesis:** Add `subscribe` to Accessor and external `set()` method.

**Problem discovered:** Type inference. The factory returns `T`, but how does `set(value)` know the type?

**Explored alternatives:**

1. **External setter on scope:** `scope.set(atom, value)` - Type-safe but adds API surface
2. **Factory returns setter:** Complex, couples value with mutation
3. **Invalidation instead of set:** Factory re-runs, type stays consistent

**Key insight from exploration:**

The factory already knows how to produce the value. Instead of external `set()`, use **invalidation** - mark stale, re-run factory. This:
- Preserves type inference (factory return type is the only source of truth)
- Reuses existing cleanup mechanism (cleanup runs before re-resolution)
- Keeps API minimal (no setter types to manage)

**Composition question:** Should invalidation cascade to dependents?

**Answer:** No automatic cascade. Upstream shouldn't know about downstream. Instead, downstream explicitly subscribes to upstream changes. This follows the principle: "the downstream should put more effort on explaining the use."

**Naming evolution:**

- `lazy(atom)` → `controller(atom)` - Better reflects full control capability
- `Accessor<T>` → `Controller<T>` - Consistent naming throughout

## Solution {#adr-003-solution}

### State Machine

Atoms have explicit lifecycle states:

```
States: idle | resolving | resolved | failed

Transitions:
┌──────┐  resolve()   ┌───────────┐  success   ┌──────────┐
│ idle │─────────────►│ resolving │───────────►│ resolved │
└──────┘              └───────────┘            └──────────┘
                           │                        │
                         error                 invalidate()
                           │                        │
                           ▼                        ▼
                      ┌────────┐             ┌───────────┐
                      │ failed │────────────►│ resolving │
                      └────────┘ invalidate()└───────────┘
```

### API Changes

#### 1. Rename `lazy` → `controller`, `Accessor` → `Controller`

```typescript
// Dependency helper (renamed)
function controller<T>(atom: Atom<T>): ControllerDep<T>

// Type (renamed and extended)
type AtomState = 'idle' | 'resolving' | 'resolved' | 'failed'

interface Controller<T> {
  readonly [controllerSymbol]: true
  readonly state: AtomState
  get(): T
  resolve(): Promise<T>
  release(): Promise<void>
  invalidate(): void
  on(listener: () => void): () => void  // Consistent with scope.on()
}
```

#### 2. ResolveContext gains `invalidate()`

```typescript
interface ResolveContext {
  cleanup(fn: () => MaybePromise<void>): void
  invalidate(): void  // NEW: trigger re-resolution from within factory
  readonly scope: Scope
}
```

#### 3. Scope API updates

```typescript
interface Scope {
  resolve<T>(atom: Atom<T>): Promise<T>
  controller<T>(atom: Atom<T>): Controller<T>  // renamed from accessor
  release<T>(atom: Atom<T>): Promise<void>
  dispose(): Promise<void>
  createContext(options?: CreateContextOptions): ExecutionContext
  on(event: AtomState, atom: Atom<unknown>, listener: () => void): () => void  // NEW
}
```

### Behavior Specifications

#### `controller.get()` behavior by state:
| State | Behavior |
|-------|----------|
| `idle` | Throws "not resolved" |
| `resolving` | Returns stale value (previous resolved value) |
| `resolved` | Returns current value |
| `failed` | Throws the error that caused failure |

#### `controller.invalidate()` behavior:
1. Runs all cleanup functions (LIFO order)
2. Clears cached value
3. Transitions to `resolving` state
4. Re-runs factory
5. Emits state change event
6. Notifies all listeners registered via `controller.on()`

#### `ctx.invalidate()` (inside factory):
- Schedules invalidation after current resolution completes
- Does NOT interrupt current factory execution
- Allows patterns like "poll and refresh"

### Usage Examples

**Self-invalidating remote config:**
```typescript
const configAtom = atom({
  factory: async (ctx) => {
    const config = await fetchConfig()

    const interval = setInterval(() => ctx.invalidate(), 30_000)
    ctx.cleanup(() => clearInterval(interval))

    return config
  }
})
```

**Downstream subscribing to upstream:**
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

**External control via controller:**
```typescript
const scope = await createScope()
const ctrl = scope.controller(configAtom)

await ctrl.resolve()
console.log(ctrl.state)  // 'resolved'
console.log(ctrl.get())  // { port: 3000 }

ctrl.invalidate()        // Triggers re-fetch
console.log(ctrl.state)  // 'resolving'
```

**React integration:**
```typescript
function useAtom<T>(ctrl: Controller<T>): T {
  return useSyncExternalStore(
    ctrl.on,
    ctrl.get
  )
}

function ConfigDisplay() {
  const ctrl = useController(configAtom)
  const config = useAtom(ctrl)
  return <div>Port: {config.port}</div>
}
```

**Event listening:**
```typescript
const scope = await createScope()

const unsub = scope.on('resolved', configAtom, () => {
  console.log('Config updated!')
})

scope.on('failed', configAtom, () => {
  console.error('Config fetch failed')
})
```

## Changes Across Layers {#adr-003-changes}

### Symbols (symbols.ts)

```typescript
// Rename
export const controllerSymbol: unique symbol = Symbol.for("@pumped-fn/lite/controller")
// Remove: accessorSymbol (or keep as alias for migration)
```

### Types (types.ts)

```typescript
// Add
export type AtomState = 'idle' | 'resolving' | 'resolved' | 'failed'

// Rename Accessor → Controller, add new members
export interface Controller<T> {
  readonly [controllerSymbol]: true
  readonly state: AtomState
  get(): T
  resolve(): Promise<T>
  release(): Promise<void>
  invalidate(): void
  on(listener: () => void): () => void
}

// Update ResolveContext
export interface ResolveContext {
  cleanup(fn: () => MaybePromise<void>): void
  invalidate(): void  // NEW
  readonly scope: Scope
}

// Update Scope
export interface Scope {
  // ... existing
  controller<T>(atom: Atom<T>): Controller<T>  // renamed
  on(event: AtomState, atom: Atom<unknown>, listener: () => void): () => void  // NEW
}

// Rename Lazy type
export interface ControllerDep<T> {
  readonly [controllerDepSymbol]: true
  readonly atom: Atom<T>
}
```

### Atom helper (atom.ts)

```typescript
// Rename lazy → controller
export function controller<T>(atom: Lite.Atom<T>): Lite.ControllerDep<T>
export function isController(value: unknown): value is Lite.ControllerDep<unknown>
```

### Scope implementation (scope.ts)

```typescript
// Internal state tracking
interface AtomEntry<T> {
  state: AtomState
  value?: T
  error?: Error
  cleanups: (() => MaybePromise<void>)[]
  listeners: Set<() => void>
  pendingInvalidate: boolean
}

// Event emission
class ScopeImpl {
  private stateListeners = new Map<AtomState, Map<Atom, Set<() => void>>>()

  on(event: AtomState, atom: Atom<unknown>, listener: () => void): () => void {
    // Add listener, return unsubscribe
  }

  private emit(event: AtomState, atom: Atom<unknown>): void {
    // Notify state listeners
  }
}
```

### Index exports (index.ts)

```typescript
export {
  // ... existing
  controllerSymbol,  // renamed from accessorSymbol
} from "./symbols"

export {
  atom,
  isAtom,
  controller,      // renamed from lazy
  isController,    // renamed from isLazy
} from "./atom"
```

## Migration from ADR-002 {#adr-003-migration}

| ADR-002 | ADR-003 |
|---------|---------|
| `lazy(atom)` | `controller(atom)` |
| `Accessor<T>` | `Controller<T>` |
| `scope.accessor(atom)` | `scope.controller(atom)` |
| `isLazy()` | `isController()` |
| `lazySymbol` | `controllerDepSymbol` |
| `accessorSymbol` | `controllerSymbol` |

**Breaking changes:** Yes, this renames public API. Since the package is not yet released, this is acceptable.

## Verification {#adr-003-verification}

### Type System
- [ ] `controller(atom)` returns `ControllerDep<T>` with correct T
- [ ] `Controller<T>.get()` returns T
- [ ] `Controller<T>.on()` accepts `() => void` listener, returns unsubscribe
- [ ] `scope.on()` is type-safe for AtomState events

### Runtime Behavior
- [ ] `ctx.invalidate()` schedules re-resolution after factory completes
- [ ] `controller.invalidate()` runs cleanups in LIFO order
- [ ] `controller.get()` returns stale value during resolving
- [ ] `controller.get()` throws on failed state
- [ ] `controller.on()` notifies on any state change
- [ ] `scope.on()` fires for specific state transitions
- [ ] Multiple subscribers receive notifications
- [ ] Unsubscribe functions work correctly

### Integration
- [ ] `useSyncExternalStore` integration works with `controller.on` / `controller.get`
- [ ] Downstream atoms can subscribe to upstream changes
- [ ] Cleanup runs before re-resolution

## Performance Considerations {#adr-003-performance}

**Subscriber storage:** `Set<() => void>` per atom - O(1) add/remove/iterate

**Event emission:** Direct iteration over listener Set - no allocation per emit

**State tracking:** Single `AtomEntry` object per resolved atom - minimal overhead

**Stale-while-revalidate:** Previous value kept in memory during re-resolution - acceptable tradeoff for UX

## Alternatives Considered {#adr-003-alternatives}

### 1. External `set(value)` instead of invalidation

**Rejected:** Type inference problem. Factory return type is the source of truth; adding `set(T)` requires T to be inferred from both factory and set, which is complex.

### 2. Automatic cascade to dependents

**Rejected:** Violates composition principle. Upstream shouldn't know about downstream. Explicit subscription is clearer and more controllable.

### 3. Observable/RxJS-style API

**Rejected:** Adds complexity and potential dependency. Simple callback-based subscription is sufficient and lighter.

### 4. Keep `Accessor` name, add `ReactiveAccessor`

**Rejected:** Two concepts for similar thing. `Controller` better reflects the full capability (read, write, subscribe, lifecycle).

## Related {#adr-003-related}

- [ADR-002](./adr-002-lightweight-effect-package.md) - Base package design this extends
- [c3-101](../c3-1-core/c3-101-scope.md) - Core Scope pattern (reference)
- [ADR-001](./adr-001-execution-context-lifecycle.md) - Lifecycle patterns
