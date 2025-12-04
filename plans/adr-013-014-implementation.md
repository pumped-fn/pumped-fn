# Implementation Plan: ADR-013 & ADR-014

## Overview

Implement two related changes:
- **ADR-013**: Add `Controller.set()` and `Controller.update()` for direct value mutation
- **ADR-014**: Change `DataStore.get()` to Map-like semantics (always returns `T | undefined`)

## Prerequisites

- Branch: `feature/controller-set-update`
- Worktree: `.worktrees/controller-set-update`

---

## Task 1: Update Type Definitions

**File**: `packages/lite/src/types.ts`

### 1.1 Add Controller.set() and Controller.update()

Find the `Controller` interface inside `namespace Lite` and add:

```typescript
export interface Controller<T> {
  readonly [controllerSymbol]: true
  readonly state: AtomState
  get(): T
  resolve(): Promise<T>
  release(): Promise<void>
  invalidate(): void
  set(value: T): void           // ADD THIS
  update(fn: (prev: T) => T): void  // ADD THIS
  on(event: ControllerEvent, listener: () => void): () => void
}
```

### 1.2 Change DataStore.get() signature

Find the `DataStore` interface and change `get()`:

**Before:**
```typescript
export interface DataStore {
  get<T>(tag: Tag<T, boolean>): T | undefined
  // ... actually check current signature, it may have conditional type
}
```

**After:**
```typescript
export interface DataStore {
  get<T>(tag: Tag<T, boolean>): T | undefined  // Always returns T | undefined
  set<T>(tag: Tag<T, boolean>, value: T): void
  has<T, H extends boolean>(tag: Tag<T, H>): boolean
  delete<T, H extends boolean>(tag: Tag<T, H>): boolean
  clear(): void
  getOrSet<T>(tag: Tag<T, true>): T
  getOrSet<T>(tag: Tag<T, true>, value: T): T  // ADD: new overload
  getOrSet<T>(tag: Tag<T, false>, value: T): T
}
```

---

## Task 2: Implement DataStore.get() Change

**File**: `packages/lite/src/scope.ts`

### 2.1 Modify DataStoreImpl.get()

Find `class DataStoreImpl` and change `get()` to pure lookup:

```typescript
get<T>(tag: Lite.Tag<T, boolean>): T | undefined {
  return this.map.get(tag.key) as T | undefined
}
```

Remove any default value logic - `get()` is now purely a Map lookup.

---

## Task 3: Implement Controller.set() and Controller.update()

**File**: `packages/lite/src/scope.ts`

### 3.1 Add pendingSet to AtomEntry

Find the `AtomEntry` interface (or inline type) and add:

```typescript
interface AtomEntry<T> {
  state: AtomState
  value?: T
  hasValue: boolean
  error?: unknown
  promise?: Promise<T>
  cleanups: (() => MaybePromise<void>)[]
  listeners: Map<string, Set<() => void>>
  data?: DataStoreImpl
  pendingInvalidate: boolean
  pendingSet?: { value: T } | { fn: (prev: T) => T }  // ADD THIS
}
```

### 3.2 Add ControllerImpl.set() and ControllerImpl.update()

Find `class ControllerImpl` and add:

```typescript
set(value: T): void {
  this.scope.scheduleSet(this.atom, value)
}

update(fn: (prev: T) => T): void {
  this.scope.scheduleUpdate(this.atom, fn)
}
```

### 3.3 Add ScopeImpl.scheduleSet()

Add to `class ScopeImpl`:

```typescript
scheduleSet<T>(atom: Lite.Atom<T>, value: T): void {
  const entry = this.cache.get(atom) as AtomEntry<T> | undefined

  if (!entry || entry.state === 'idle') {
    throw new Error('Atom not resolved')
  }

  if (entry.state === 'failed') {
    throw entry.error
  }

  entry.pendingSet = { value }

  if (entry.state === 'resolving') {
    return
  }

  this.scheduleInvalidation(atom)
}
```

### 3.4 Add ScopeImpl.scheduleUpdate()

Add to `class ScopeImpl`:

```typescript
scheduleUpdate<T>(atom: Lite.Atom<T>, fn: (prev: T) => T): void {
  const entry = this.cache.get(atom) as AtomEntry<T> | undefined

  if (!entry || entry.state === 'idle') {
    throw new Error('Atom not resolved')
  }

  if (entry.state === 'failed') {
    throw entry.error
  }

  entry.pendingSet = { fn }

  if (entry.state === 'resolving') {
    return
  }

  this.scheduleInvalidation(atom)
}
```

### 3.5 Modify doInvalidateSequential() to handle pendingSet

Find `doInvalidateSequential()` and modify to check for `pendingSet` after running cleanups:

```typescript
private async doInvalidateSequential<T>(atom: Lite.Atom<T>): Promise<void> {
  const entry = this.cache.get(atom) as AtomEntry<T>
  if (!entry) return

  const previousValue = entry.value

  // Run cleanups LIFO
  const cleanups = entry.cleanups.slice().reverse()
  entry.cleanups = []
  for (const cleanup of cleanups) {
    await cleanup()
  }

  // Check for pendingSet - if present, skip factory
  const pendingSet = entry.pendingSet
  entry.pendingSet = undefined

  if (pendingSet) {
    entry.state = 'resolving'
    this.emitStateChange('resolving', atom)
    this.notifyListeners(atom, 'resolving')

    if ('value' in pendingSet) {
      entry.value = pendingSet.value
    } else {
      entry.value = pendingSet.fn(previousValue as T)
    }

    entry.state = 'resolved'
    entry.hasValue = true
    this.emitStateChange('resolved', atom)
    this.notifyListeners(atom, 'resolved')
    return
  }

  // Normal invalidation - run factory
  // ... existing factory execution code ...
}
```

### 3.6 Handle pendingSet after resolution completes

In `doResolve()`, after successful resolution, check if `pendingSet` was added during resolution:

```typescript
// At end of successful resolution in doResolve():
if (entry.pendingSet) {
  this.scheduleInvalidation(atom)
}
```

---

## Task 4: Update Tests

**File**: `packages/lite/tests/scope.test.ts`

### 4.1 Fix existing tests that rely on get() returning defaults

Search for `ctx.data.get(` patterns and update to use `getOrSet()` where default values are expected.

Example fix:
```typescript
// Before
const count = ctx.data.get(countTag)  // Was expecting default

// After
const count = ctx.data.getOrSet(countTag)  // Now explicitly gets default
```

### 4.2 Add Controller.set() tests

```typescript
describe('controller.set()', () => {
  it('replaces value without running factory', async () => {
    let factoryCount = 0
    const myAtom = atom({
      factory: () => {
        factoryCount++
        return { name: 'initial' }
      }
    })

    const scope = createScope()
    const ctrl = scope.controller(myAtom)
    await ctrl.resolve()
    expect(factoryCount).toBe(1)

    ctrl.set({ name: 'updated' })
    await scope.flush()

    expect(ctrl.get()).toEqual({ name: 'updated' })
    expect(factoryCount).toBe(1)  // Factory NOT called again
  })

  it('runs cleanups before setting', async () => {
    const cleanups: string[] = []
    const myAtom = atom({
      factory: (ctx) => {
        ctx.cleanup(() => { cleanups.push('cleanup') })
        return 'value'
      }
    })

    const scope = createScope()
    const ctrl = scope.controller(myAtom)
    await ctrl.resolve()

    ctrl.set('new value')
    await scope.flush()

    expect(cleanups).toEqual(['cleanup'])
  })

  it('notifies listeners', async () => {
    const myAtom = atom({ factory: () => 'initial' })
    const scope = createScope()
    const ctrl = scope.controller(myAtom)
    await ctrl.resolve()

    const events: string[] = []
    ctrl.on('resolved', () => { events.push('resolved') })

    ctrl.set('updated')
    await scope.flush()

    expect(events).toEqual(['resolved'])
  })

  it('throws when atom is idle', () => {
    const myAtom = atom({ factory: () => 'value' })
    const scope = createScope()
    const ctrl = scope.controller(myAtom)

    expect(() => ctrl.set('value')).toThrow('Atom not resolved')
  })

  it('queues when atom is resolving', async () => {
    let resolveFactory: (v: string) => void
    const myAtom = atom({
      factory: () => new Promise<string>(r => { resolveFactory = r })
    })

    const scope = createScope()
    const ctrl = scope.controller(myAtom)
    const resolvePromise = ctrl.resolve()

    await Promise.resolve()  // Let factory start
    ctrl.set('pushed value')

    resolveFactory!('factory value')
    await resolvePromise
    await scope.flush()

    expect(ctrl.get()).toBe('pushed value')
  })
})
```

### 4.3 Add Controller.update() tests

```typescript
describe('controller.update()', () => {
  it('transforms value using function', async () => {
    const myAtom = atom({ factory: () => ({ count: 0 }) })
    const scope = createScope()
    const ctrl = scope.controller(myAtom)
    await ctrl.resolve()

    ctrl.update(prev => ({ count: prev.count + 1 }))
    await scope.flush()

    expect(ctrl.get()).toEqual({ count: 1 })
  })

  it('runs cleanups before updating', async () => {
    const cleanups: string[] = []
    const myAtom = atom({
      factory: (ctx) => {
        ctx.cleanup(() => { cleanups.push('cleanup') })
        return { count: 0 }
      }
    })

    const scope = createScope()
    const ctrl = scope.controller(myAtom)
    await ctrl.resolve()

    ctrl.update(prev => ({ count: prev.count + 1 }))
    await scope.flush()

    expect(cleanups).toEqual(['cleanup'])
  })
})
```

---

## Task 5: Update C3 Documentation

### 5.1 Update c3-201-scope.md

**File**: `.c3/c3-2-lite/c3-201-scope.md`

Add `set()` and `update()` to Controller interface in Concepts section.

Add new section "Direct Value Mutation" after "Invalidation" section:

```markdown
## Direct Value Mutation {#c3-201-set-update}

### Controller.set() and Controller.update()

Push values directly without re-running the factory:

\`\`\`typescript
const ctrl = scope.controller(userAtom)
await ctrl.resolve()

// Replace value directly
ctrl.set({ name: 'Alice' })

// Transform value
ctrl.update(user => ({ ...user, lastSeen: Date.now() }))
\`\`\`

### Behavior

Both methods follow the same flow as `invalidate()`:
1. Queue via same invalidation mechanism
2. Run cleanups (LIFO)
3. State: `resolved → resolving → resolved`
4. Replace value (from argument, not factory)
5. Notify listeners

### Comparison with invalidate()

| | `invalidate()` | `set(value)` / `update(fn)` |
|---|---|---|
| Runs cleanups | Yes | Yes |
| State transition | resolving → resolved | resolving → resolved |
| Gets value from | Factory (async) | Argument (sync) |
| Triggers listeners | Yes | Yes |
| Uses queue | Yes | Yes |

### Use Cases

| Use Case | Method |
|----------|--------|
| External data source pushes value (WebSocket) | `set()` |
| Transform based on current value | `update()` |
| Re-fetch from source | `invalidate()` |

### State Requirements

| State | `set()` / `update()` Behavior |
|-------|-------------------------------|
| `idle` | Throws "Atom not resolved" |
| `resolving` | Queues, executes after resolution |
| `resolved` | Queues normally |
| `failed` | Throws the stored error |
```

Add ADR-013 to Related section.

### 5.2 Update c3-202-atom.md

**File**: `.c3/c3-2-lite/c3-202-atom.md`

Update DataStore interface to show new `get()` signature.

Update "Pattern: With Default Value" to use `getOrSet()`.

Add ADR-014 to Related section.

---

## Task 6: Verification

```bash
pnpm -F @pumped-fn/lite typecheck:full
pnpm -F @pumped-fn/lite test
```

---

## Task 7: Create Changeset

**File**: `.changeset/controller-set-update.md`

```markdown
---
"@pumped-fn/lite": minor
---

feat(lite): add Controller.set() and Controller.update() for direct value mutation

Adds two new methods to Controller for pushing values directly without re-running the factory:

- `controller.set(value)` - Replace value directly
- `controller.update(fn)` - Transform value using a function

Both methods:
- Use the same invalidation queue as `invalidate()`
- Run cleanups in LIFO order before applying new value
- Transition through `resolving → resolved` states
- Notify all subscribed listeners

This enables patterns like WebSocket updates pushing values directly into atoms without triggering factory re-execution.

BREAKING CHANGE: `DataStore.get()` now always returns `T | undefined` (Map-like semantics). Use `getOrSet()` to access default values from tags. This aligns DataStore behavior with standard Map semantics where `get()` is purely a lookup operation.
```

---

## Execution Order

1. Task 1 (types) - Foundation
2. Task 2 (DataStore.get) - Simple change
3. Task 3 (Controller.set/update) - Main implementation
4. Task 4 (tests) - Verify behavior
5. Task 5 (docs) - Update C3 docs
6. Task 6 (verify) - Run typecheck and tests
7. Task 7 (changeset) - Prepare for release
