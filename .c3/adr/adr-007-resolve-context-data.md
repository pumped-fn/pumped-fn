---
id: ADR-007-resolve-context-data
title: Per-Atom Private Storage via ctx.data
summary: >
  Add lazy per-atom storage to ResolveContext, enabling state that survives
  invalidation while remaining truly private to the atom factory.
status: accepted
date: 2025-12-01
---

# [ADR-007] Per-Atom Private Storage via ctx.data

## Status {#adr-007-status}
**Accepted** - 2025-12-01

## Problem/Requirement {#adr-007-problem}

When an atom is invalidated, the factory re-runs (similar to React rerender). There's no way to persist internal state across these re-invocations.

**Use case:** Polling atom that tracks previous value for change detection:

```typescript
const pollingAtom = atom({
  factory: async (ctx) => {
    // Need to persist `prev` across invalidations
    // But it's internal bookkeeping, not public API
    const current = await fetchData()

    if (prev !== null && current !== prev) {
      console.log('Data changed!')
    }
    prev = current

    setTimeout(() => ctx.invalidate(), 5000)
    return current
  }
})
```

**Current workarounds and their problems:**

1. **Use another atom for state:**
   ```typescript
   const prevAtom = atom({ factory: () => ({ value: null }) })

   const pollingAtom = atom({
     deps: { prev: controller(prevAtom) },
     factory: async (ctx, { prev }) => { ... }
   })
   ```

   Problems:
   - Exposes internal bookkeeping publicly in scope
   - External code can `scope.controller(prevAtom).invalidate()` - breaking encapsulation
   - Pollutes atom registry with implementation details

2. **Module-level closure:**
   ```typescript
   let prev: Data | null = null

   const pollingAtom = atom({
     factory: async (ctx) => {
       // use prev...
     }
   })
   ```

   Problems:
   - Survives atom `release()` - memory leak if atom recreated
   - Shared across all scopes - unexpected in multi-scope scenarios

## Exploration Journey {#adr-007-exploration}

**Initial hypothesis:** Add scope-level `Store` using `Tag` as typed keys.

```typescript
const prevTag = tag<Data>({ label: 'prev' })

const pollingAtom = atom({
  factory: async (ctx) => {
    const prev = ctx.store.get(prevTag)
    ctx.store.set(prevTag, current)
  }
})
```

**Problems discovered through architectural review:**

1. **Doesn't solve encapsulation** - Tags are globally accessible, any atom can read/write
2. **Wrong granularity** - Scope-level when problem is atom-level
3. **Tag semantic confusion** - Tags are immutable metadata, not mutable state
4. **Symbol.for collision** - Same label = same key across modules
5. **No cleanup on release** - Store persists after atom released

**Key insight:** The problem is **atom-level private state**, not scope-level shared storage. Shared storage is already solved by atom composition.

**Explored alternatives:**

| Approach | Verdict |
|----------|---------|
| Scope-level store with Tag keys | Rejected - doesn't solve encapsulation |
| Dedicated `StoreKey` type | Rejected - still scope-level, same problems |
| Atom-scoped `ctx.local` | Viable - true encapsulation |
| Expose raw `Map` as `ctx.data` | **Selected** - simplest, lazy, correct lifecycle |

## Solution {#adr-007-solution}

Add `data` property to `ResolveContext` - a lazy `Map<string, unknown>` scoped to the atom.

### API

```typescript
interface ResolveContext {
  cleanup(fn: () => MaybePromise<void>): void
  invalidate(): void
  readonly scope: Scope
  readonly data: Map<string, unknown>  // NEW - lazy, per-atom
}
```

### Usage

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

| Event | Behavior |
|-------|----------|
| First `ctx.data` access | Map created lazily |
| `invalidate()` | Map preserved (survives re-resolution) |
| `release()` | Map cleared (entry deleted from cache) |
| `scope.dispose()` | Map cleared (all entries deleted) |

### Implementation

```typescript
interface AtomEntry<T> {
  state: AtomState
  value?: T
  hasValue: boolean
  error?: Error
  cleanups: (() => MaybePromise<void>)[]
  listeners: Set<() => void>
  pendingInvalidate: boolean
  data?: Map<string, unknown>  // NEW - optional, lazy
}

// In doResolve, create ctx with lazy getter:
const ctx: Lite.ResolveContext = {
  cleanup: (fn) => entry.cleanups.push(fn),
  invalidate: () => this.scheduleInvalidation(atom),
  scope: this,
  get data() {
    if (!entry.data) {
      entry.data = new Map()
    }
    return entry.data
  }
}
```

## Changes Across Layers {#adr-007-changes}

### Types (types.ts)

```typescript
export interface ResolveContext {
  cleanup(fn: () => MaybePromise<void>): void
  invalidate(): void
  readonly scope: Scope
  readonly data: Map<string, unknown>  // ADD
}
```

### Scope Implementation (scope.ts)

```typescript
// AtomEntry - add optional data field
interface AtomEntry<T> {
  // ... existing fields
  data?: Map<string, unknown>  // ADD
}

// doResolve - create ctx with lazy data getter
const ctx: Lite.ResolveContext = {
  cleanup: (fn) => entry.cleanups.push(fn),
  invalidate: () => this.scheduleInvalidation(atom),
  scope: this,
  get data() {
    if (!entry.data) {
      entry.data = new Map()
    }
    return entry.data
  }
}

// doInvalidate - do NOT clear entry.data (it survives)

// release - entry.data cleared automatically when cache.delete(atom)
```

### Component Docs (c3-202-atom.md)

Add section on ResolveContext.data for persisting state across invalidations.

## Verification {#adr-007-verification}

### Type System
- [ ] `ctx.data` is `Map<string, unknown>`
- [ ] `ctx.data` is readonly (can't reassign, can mutate contents)

### Runtime Behavior
- [ ] `ctx.data` returns same Map instance across invalidations
- [ ] `ctx.data` is lazily created on first access
- [ ] Map is cleared when atom is released
- [ ] Map is cleared when scope is disposed
- [ ] Different atoms have independent data Maps

### Integration
- [ ] Works with self-invalidation pattern
- [ ] Works with controller-based invalidation
- [ ] No memory leak when atom never accesses data

## Alternatives Considered {#adr-007-alternatives}

### 1. Scope-level Store with Tag keys

```typescript
ctx.store.get(prevTag)
ctx.store.set(prevTag, value)
```

**Rejected:** Tags are globally accessible, doesn't solve encapsulation. Wrong granularity.

### 2. Typed wrapper API

```typescript
interface LocalStore {
  get<T>(key: string): T | undefined
  set<T>(key: string, value: T): void
  has(key: string): boolean
  delete(key: string): void
}
```

**Rejected:** More API surface for no benefit. Raw Map is simpler and well-understood.

### 3. Closure pattern (no API change)

```typescript
function createPollingAtom() {
  let prev: Data | null = null
  return atom({ factory: ... })
}
```

**Not rejected but insufficient:** Survives `release()`, shared across scopes. Document as alternative pattern but doesn't replace `ctx.data`.

## Related {#adr-007-related}

- [ADR-003](./adr-003-controller-reactivity.md) - Controller reactivity that enables invalidation
- [c3-202](../c3-2-lite/c3-202-atom.md) - Atom and ResolveContext
- [c3-201](../c3-2-lite/c3-201-scope.md) - Scope lifecycle
