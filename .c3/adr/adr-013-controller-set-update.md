---
id: adr-013
title: Controller.set() and Controller.update() for Direct Value Mutation
summary: >
  Add set() and update() methods to Controller for pushing values directly
  without re-running the factory, enabling external data sources (WebSocket,
  etc.) to update atom values reactively while preserving the invalidation queue.
status: proposed
date: 2025-12-03
---

# [ADR-013] Controller.set() and Controller.update() for Direct Value Mutation

## Status {#adr-013-status}
**Proposed** - 2025-12-03

## Problem/Requirement {#adr-013-problem}

Frontend applications need to push data from external sources (WebSocket, server-sent events, etc.) into the atom system while maintaining reactivity.

**Example scenario:**
```
WebSocket message → User data → Authentication state → Dashboard
```

Currently, the only way to update an atom's value is `invalidate()`, which re-runs the factory. This is problematic when:

1. **Data comes from outside** - WebSocket pushes new user data; factory would re-fetch, missing the pushed value
2. **Factory is expensive** - Re-running setup logic (connections, subscriptions) just to accept a new value
3. **Value is known** - Caller already has the new value; factory can't "receive" it

**Current workarounds:**
- Store value in module-level closure, `invalidate()`, factory reads closure → breaks scope isolation
- Use `ctx.data` to cache, `invalidate()`, factory reads from data → awkward indirection
- Create separate "source" atoms with shared state → complex dual-model

## Exploration Journey {#adr-013-exploration}

**Initial hypothesis:** Add scope-level `sharedData` storage with reactive subscriptions.

**Explored:**
- `ctx.sharedData` / `scope.sharedData` with `.on(tag, callback)` subscriptions
- Tags as keys for type safety
- Reactive notifications on `.set()`

**Discovered:**
- Adds new primitive (`SharedData`) and new concepts
- Duplicates what Controller already provides (reactive access, subscriptions)
- Doesn't leverage existing dependency graph

**Key insight:** Controller already has:
- The cached value
- The listener notification system (`on()`)
- The state machine and queue infrastructure (ADR-011)
- The type `T` from `Controller<T>`

Adding `set(value: T)` requires no new primitives - just extends Controller.

**Revisiting ADR-003 rejection:**

ADR-003 rejected `set()` citing type inference problems. However:
- Controller already has `T` from `Controller<T>`
- `set(value: T)` uses same `T` - no additional inference
- Type safety is preserved

**Confirmed:**
- `set()` and `update()` should use same queue as `invalidate()` (ADR-011)
- Same state transitions: `resolved → resolving → resolved`
- Same cleanup execution
- Same listener notification

## Solution {#adr-013-solution}

### API Addition

```typescript
interface Controller<T> {
  // Existing
  readonly state: AtomState
  get(): T
  resolve(): Promise<T>
  release(): Promise<void>
  invalidate(): void
  on(event: ControllerEvent, listener: () => void): () => void

  // New
  set(value: T): void
  update(fn: (prev: T) => T): void
}
```

### Behavior

Both `set()` and `update()` follow the same pattern as `invalidate()`:

1. Queue operation via `scheduleInvalidation()` (sync return)
2. On microtask processing:
   - State: `resolved → resolving` (notify listeners)
   - Run cleanups (LIFO)
   - Replace value (from argument, not factory)
   - State: `resolving → resolved` (notify listeners)

**Comparison:**

| | `invalidate()` | `set(value)` / `update(fn)` |
|---|---|---|
| Runs cleanups | Yes | Yes |
| State transition | resolving → resolved | resolving → resolved |
| Gets value from | Factory (async) | Argument (sync) |
| Triggers listeners | Yes | Yes |
| Uses queue | Yes | Yes |

**`update()` is sugar:**

```typescript
controller.update(fn)
// Equivalent to:
controller.set(fn(controller.get()))
```

### Usage Examples

**WebSocket pushing user updates:**

```typescript
const userAtom = atom({
  factory: async () => fetch('/api/me').then(r => r.json())
})

const wsAtom = atom({
  deps: { user: controller(userAtom) },
  factory: (ctx, { user }) => {
    const ws = new WebSocket('wss://api.example.com')

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      if (data.type === 'user-update') {
        user.set(data.payload)  // Push value directly
      }
    }

    ctx.cleanup(() => ws.close())
    return ws
  }
})
```

**External control:**

```typescript
const scope = createScope()
const userCtrl = scope.controller(userAtom)

await userCtrl.resolve()

// Push from outside (e.g., form submission)
userCtrl.set({ name: 'Alice', role: 'admin' })

// Transform existing value
userCtrl.update(user => ({ ...user, lastSeen: Date.now() }))
```

**React integration unchanged:**

```typescript
function useAtom<T>(ctrl: Controller<T>): T {
  return useSyncExternalStore(ctrl.on, ctrl.get)
}
// Works with set/update - listeners fire, component re-renders
```

### State Requirements

`set()` and `update()` require the atom to be in `resolved` state:

| State | `set()` / `update()` Behavior |
|-------|-------------------------------|
| `idle` | Throws "Atom not resolved" |
| `resolving` | Queues (pendingSet), executes after resolution |
| `resolved` | Queues normally |
| `failed` | Throws the stored error |

## Changes Across Layers {#adr-013-changes}

### Types (types.ts)

```typescript
export interface Controller<T> {
  // ... existing ...

  set(value: T): void
  update(fn: (prev: T) => T): void
}
```

### Scope Implementation (scope.ts)

```typescript
// AtomEntry - add pending set value
interface AtomEntry<T> {
  // ... existing ...
  pendingSet?: { value: T } | { fn: (prev: T) => T }
}

// ControllerImpl - add methods
class ControllerImpl<T> implements Lite.Controller<T> {
  // ... existing ...

  set(value: T): void {
    this.scope.scheduleSet(this.atom, value)
  }

  update(fn: (prev: T) => T): void {
    this.scope.scheduleUpdate(this.atom, fn)
  }
}

// ScopeImpl - add scheduling methods
class ScopeImpl {
  scheduleSet<T>(atom: Lite.Atom<T>, value: T): void {
    const entry = this.cache.get(atom)
    if (!entry || entry.state === 'idle') {
      throw new Error("Atom not resolved")
    }
    if (entry.state === 'failed' && entry.error) {
      throw entry.error
    }

    if (entry.state === 'resolving') {
      entry.pendingSet = { value }
      return
    }

    entry.pendingSet = { value }
    this.scheduleInvalidation(atom)
  }

  scheduleUpdate<T>(atom: Lite.Atom<T>, fn: (prev: T) => T): void {
    const entry = this.cache.get(atom)
    if (!entry || entry.state === 'idle') {
      throw new Error("Atom not resolved")
    }
    if (entry.state === 'failed' && entry.error) {
      throw entry.error
    }

    if (entry.state === 'resolving') {
      entry.pendingSet = { fn }
      return
    }

    entry.pendingSet = { fn }
    this.scheduleInvalidation(atom)
  }

  // Modified doInvalidateSequential
  private async doInvalidateSequential<T>(atom: Lite.Atom<T>): Promise<void> {
    const entry = this.cache.get(atom)
    if (!entry) return

    // ... cleanup, state = resolving, notify ...

    // Check for pending set
    if (entry.pendingSet) {
      const pending = entry.pendingSet
      entry.pendingSet = undefined

      if ('value' in pending) {
        entry.value = pending.value
      } else {
        entry.value = pending.fn(entry.value as T)
      }
      entry.state = 'resolved'
      entry.hasValue = true
      this.notifyListeners(atom, 'resolved')
      this.emitStateChange('resolved', atom)
      return
    }

    // Normal invalidation - run factory
    await this.resolve(atom)
  }
}
```

### Component Docs (c3-201-scope.md)

Add section `#c3-201-set-update`:

```markdown
## Direct Value Mutation {#c3-201-set-update}

### Controller.set() and Controller.update()

Push values directly without re-running the factory:

\`\`\`typescript
const ctrl = scope.controller(userAtom)
await ctrl.resolve()

// Replace value
ctrl.set({ name: 'Alice' })

// Transform value
ctrl.update(user => ({ ...user, lastSeen: Date.now() }))
\`\`\`

### Behavior

Both methods:
1. Queue via same mechanism as `invalidate()`
2. Run cleanups (LIFO)
3. State: `resolving` → `resolved`
4. Notify listeners

### When to Use

| Use Case | Method |
|----------|--------|
| External data source pushes value | `set()` |
| Transform based on current value | `update()` |
| Re-fetch from source | `invalidate()` |
\`\`\`
```

### Test Files

Add to `tests/scope.test.ts`:

```typescript
describe('Controller.set()', () => {
  it('replaces value and notifies listeners', async () => {
    const userAtom = atom({ factory: () => ({ name: 'Guest' }) })
    const scope = createScope()
    const ctrl = scope.controller(userAtom)

    await ctrl.resolve()

    const notifications: string[] = []
    ctrl.on('resolved', () => notifications.push('resolved'))

    ctrl.set({ name: 'Alice' })
    await scope.flush()

    expect(ctrl.get()).toEqual({ name: 'Alice' })
    expect(notifications).toEqual(['resolved'])
  })

  it('runs cleanups before setting', async () => {
    const cleanups: string[] = []
    const userAtom = atom({
      factory: (ctx) => {
        ctx.cleanup(() => cleanups.push('cleanup'))
        return { name: 'Guest' }
      }
    })

    const scope = createScope()
    const ctrl = scope.controller(userAtom)
    await ctrl.resolve()

    ctrl.set({ name: 'Alice' })
    await scope.flush()

    expect(cleanups).toEqual(['cleanup'])
  })

  it('throws when atom not resolved', () => {
    const userAtom = atom({ factory: () => ({ name: 'Guest' }) })
    const scope = createScope()
    const ctrl = scope.controller(userAtom)

    expect(() => ctrl.set({ name: 'Alice' })).toThrow("Atom not resolved")
  })

  it('queues when atom is resolving', async () => {
    let resolveFactory: () => void
    const userAtom = atom({
      factory: () => new Promise(r => { resolveFactory = () => r({ name: 'Guest' }) })
    })

    const scope = createScope()
    const ctrl = scope.controller(userAtom)

    const resolvePromise = ctrl.resolve()
    ctrl.set({ name: 'Alice' })  // Should queue, not throw

    resolveFactory!()
    await resolvePromise
    await scope.flush()

    expect(ctrl.get()).toEqual({ name: 'Alice' })
  })
})

describe('Controller.update()', () => {
  it('transforms value using function', async () => {
    const countAtom = atom({ factory: () => 0 })
    const scope = createScope()
    const ctrl = scope.controller(countAtom)

    await ctrl.resolve()

    ctrl.update(n => n + 1)
    await scope.flush()

    expect(ctrl.get()).toBe(1)
  })
})
```

## Verification {#adr-013-verification}

### Type System
- [ ] `ctrl.set(value)` requires `value: T` matching atom type
- [ ] `ctrl.update(fn)` requires `fn: (prev: T) => T`
- [ ] Compile error if type mismatch

### Runtime Behavior
- [ ] `set()` replaces value without calling factory
- [ ] `update()` transforms value without calling factory
- [ ] Cleanups run before value replacement
- [ ] State transitions: `resolved → resolving → resolved`
- [ ] Listeners notified at each transition
- [ ] Throws on idle/failed state
- [ ] Queues when resolving (pendingSet)

### Queue Integration
- [ ] Uses same queue as `invalidate()`
- [ ] Same frame model (trigger → process → settle)
- [ ] Loop detection still works
- [ ] Concurrent `set()` calls deduplicated

### Integration
- [ ] Works with `scope.select()` (derived subscriptions update)
- [ ] Works with `useSyncExternalStore` (React re-renders)
- [ ] Works with controller dependency pattern

## Related {#adr-013-related}

- [c3-201](../c3-2-lite/c3-201-scope.md) - Scope & Controller component
- [ADR-003](./adr-003-controller-reactivity.md) - Original Controller design (addresses rejection)
- [ADR-011](./adr-011-sequential-invalidation-chain.md) - Queue infrastructure reused
