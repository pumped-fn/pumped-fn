---
id: adr-014
title: DataStore Map-like Semantics
summary: >
  Align DataStore with Map semantics - get() always returns T | undefined
  (pure lookup), defaults only used by getOrSet() not get().
status: proposed
date: 2025-12-03
---

# [ADR-014] DataStore Map-like Semantics

## Status {#adr-014-status}
**Proposed** - 2025-12-03

## Problem/Requirement {#adr-014-problem}

The current DataStore API (ADR-010, ADR-012) has subtle semantics that differ from JavaScript's `Map`:

**Issue: `get()` returns default for tags with defaults**

```typescript
const countTag = tag<number>({ label: 'count', default: 0 })

ctx.data.get(countTag)  // Returns 0 (default) - but not stored!
ctx.data.has(countTag)  // Returns false - confusing!
```

This creates confusion:
- `get()` returns a value, but `has()` returns false
- Different behavior based on tag configuration
- Not Map-like: `Map.get()` returns undefined if key not present

**The mental model should be:**
- `get()` = pure lookup (like `Map.get()`)
- `getOrSet()` = initialize if missing, return value (like React's `useState` initial value)

## Exploration Journey {#adr-014-exploration}

**Initial hypothesis:** Changes isolated to DataStore interface and implementation.

**Explored:**
- **Isolated (DataStore):** Interface in types.ts, implementation in scope.ts
- **Upstream (ADR-010, ADR-012):** Original design decisions
- **Downstream (c3-202):** Documentation of ctx.data patterns

**Discovered:**
- Current `get()` behavior with defaults is "magical" - does more than a pure lookup
- Map-like semantics are simpler to reason about
- `getOrSet` name is accurate: "get the value, or set and return if missing" (like React's `useState`)

**Confirmed:** Changes affect DataStore interface, implementation, and documentation only.

## Solution {#adr-014-solution}

### Change: `get()` Always Returns `T | undefined`

Make `get()` a pure lookup - returns stored value or undefined, never uses defaults:

```typescript
// BEFORE (ADR-010)
get<T, H extends boolean>(tag: Tag<T, H>): H extends true ? T : T | undefined

// AFTER
get<T>(tag: Tag<T, boolean>): T | undefined
```

**Behavior:**

```typescript
const countTag = tag<number>({ label: 'count', default: 0 })

ctx.data.get(countTag)  // undefined (not stored)
ctx.data.has(countTag)  // false

ctx.data.set(countTag, 5)
ctx.data.get(countTag)  // 5
ctx.data.has(countTag)  // true
```

**Rationale:**
- Map-like: `get()` is pure lookup, no magic
- Predictable: same behavior regardless of tag configuration
- `has()` and `get()` are consistent

### `getOrSet` Unchanged (ADR-012)

The existing `getOrSet` name is accurate:
- **Get** the value if it exists
- **Or Set** (and return) if missing

This follows React's `useState` pattern - the default is only used on first access:

```typescript
// React
const [count, setCount] = useState(0)  // 0 only used on first render

// DataStore
const count = ctx.data.getOrSet(countTag)  // default only used if not stored
```

### Updated Interface

```typescript
interface DataStore {
  get<T>(tag: Tag<T, boolean>): T | undefined
  set<T>(tag: Tag<T, boolean>, value: T): void
  has<T, H extends boolean>(tag: Tag<T, H>): boolean
  delete<T, H extends boolean>(tag: Tag<T, H>): boolean
  clear(): void

  getOrSet<T>(tag: Tag<T, true>): T
  getOrSet<T>(tag: Tag<T, true>, value: T): T
  getOrSet<T>(tag: Tag<T, false>, value: T): T
}
```

### Mental Model

| Method | Stores? | Uses Default? | Returns |
|--------|---------|---------------|---------|
| `get(tag)` | No | No | `T \| undefined` |
| `set(tag, value)` | Yes | No | `void` |
| `getOrSet(tag)` | If missing | Yes (if tag has default) | `T` |
| `getOrSet(tag, value)` | If missing | No (uses provided value) | `T` |

## Changes Across Layers {#adr-014-changes}

### Types (types.ts)

```typescript
// BEFORE
interface DataStore {
  get<T, H extends boolean>(tag: Tag<T, H>): H extends true ? T : T | undefined
  // ... rest unchanged
}

// AFTER
interface DataStore {
  get<T>(tag: Tag<T, boolean>): T | undefined
  set<T>(tag: Tag<T, boolean>, value: T): void
  has<T, H extends boolean>(tag: Tag<T, H>): boolean
  delete<T, H extends boolean>(tag: Tag<T, H>): boolean
  clear(): void
  getOrSet<T>(tag: Tag<T, true>): T
  getOrSet<T>(tag: Tag<T, true>, value: T): T
  getOrSet<T>(tag: Tag<T, false>, value: T): T
}
```

### Scope Implementation (scope.ts)

```typescript
class DataStoreImpl implements Lite.DataStore {
  private readonly map = new Map<symbol, unknown>()

  // CHANGED: No longer uses tag default
  get<T>(tag: Lite.Tag<T, boolean>): T | undefined {
    return this.map.get(tag.key) as T | undefined
  }

  // ... set, has, delete, clear unchanged ...

  // getOrSet unchanged from ADR-012, just add third overload
  getOrSet<T>(tag: Lite.Tag<T, true>): T
  getOrSet<T>(tag: Lite.Tag<T, true>, value: T): T
  getOrSet<T>(tag: Lite.Tag<T, false>, value: T): T
  getOrSet<T>(tag: Lite.Tag<T, boolean>, value?: T): T {
    if (this.map.has(tag.key)) {
      return this.map.get(tag.key) as T
    }
    const storedValue = value !== undefined
      ? value
      : (tag.hasDefault ? tag.defaultValue as T : undefined as T)
    this.map.set(tag.key, storedValue)
    return storedValue
  }
}
```

### Component Docs (c3-202-atom.md)

Update "Per-Atom Private Storage" section:

**Before:**
```typescript
const countTag = tag<number>({ label: 'count', default: 0 })

const counterAtom = atom({
  factory: async (ctx) => {
    const count = ctx.data.get(countTag)  // number - guaranteed by default!
    ctx.data.set(countTag, count + 1)
    return count
  }
})
```

**After:**
```typescript
const countTag = tag<number>({ label: 'count', default: 0 })

const counterAtom = atom({
  factory: async (ctx) => {
    const count = ctx.data.getOrSet(countTag)  // 0 on first run, stored
    ctx.data.set(countTag, count + 1)
    return count
  }
})
```

### Test Updates

```typescript
describe('DataStore', () => {
  describe('get()', () => {
    it('returns undefined when not set, even with default tag', () => {
      const countTag = tag<number>({ label: 'count', default: 0 })
      const store = new DataStoreImpl()

      expect(store.get(countTag)).toBe(undefined)
      expect(store.has(countTag)).toBe(false)
    })

    it('returns stored value after set', () => {
      const countTag = tag<number>({ label: 'count', default: 0 })
      const store = new DataStoreImpl()

      store.set(countTag, 5)
      expect(store.get(countTag)).toBe(5)
    })
  })

  describe('getOrSet()', () => {
    it('uses tag default when no value provided', () => {
      const countTag = tag<number>({ label: 'count', default: 0 })
      const store = new DataStoreImpl()

      expect(store.getOrSet(countTag)).toBe(0)
      expect(store.has(countTag)).toBe(true)
      expect(store.get(countTag)).toBe(0)
    })

    it('uses provided value over tag default', () => {
      const countTag = tag<number>({ label: 'count', default: 0 })
      const store = new DataStoreImpl()

      expect(store.getOrSet(countTag, 5)).toBe(5)
      expect(store.get(countTag)).toBe(5)
    })

    it('returns existing value without overwriting', () => {
      const countTag = tag<number>({ label: 'count', default: 0 })
      const store = new DataStoreImpl()

      store.set(countTag, 10)
      expect(store.getOrSet(countTag, 5)).toBe(10)  // Existing value preserved
    })

    it('requires value for tag without default', () => {
      const userTag = tag<{ name: string }>({ label: 'user' })
      const store = new DataStoreImpl()

      expect(store.getOrSet(userTag, { name: 'Alice' })).toEqual({ name: 'Alice' })
    })
  })
})
```

## Verification {#adr-014-verification}

### Type System
- [ ] `get()` always returns `T | undefined` regardless of tag default
- [ ] `getOrSet(tagWithDefault)` compiles without second argument
- [ ] `getOrSet(tagWithDefault, value)` compiles with optional override
- [ ] `getOrSet(tagWithoutDefault)` is compile error (missing required value)
- [ ] `getOrSet(tagWithoutDefault, value)` compiles

### Runtime Behavior
- [ ] `get()` returns undefined when not stored (even with default tag)
- [ ] `get()` returns stored value when present
- [ ] `getOrSet()` stores and returns tag default when missing
- [ ] `getOrSet(tag, value)` stores provided value, not tag default
- [ ] `getOrSet()` returns existing value without overwriting
- [ ] `has()` returns true after `getOrSet()`

### Migration
- [ ] Breaking change: code relying on `get()` returning defaults will break
- [ ] Migration: replace `get(tagWithDefault)` with `getOrSet(tagWithDefault)`

## Migration Guide {#adr-014-migration}

### Pattern: Relied on get() returning default

**Before:**
```typescript
const countTag = tag<number>({ label: 'count', default: 0 })
const count = ctx.data.get(countTag)  // Was: number
```

**After:**
```typescript
const countTag = tag<number>({ label: 'count', default: 0 })
const count = ctx.data.getOrSet(countTag)  // Now: number, stored
```

## Related {#adr-014-related}

- [ADR-010](./adr-010-typed-data-store.md) - Original DataStore design
- [ADR-012](./adr-012-datastore-api-improvements.md) - Added getOrSet
- [c3-202](../c3-2-lite/c3-202-atom.md) - Atom and ctx.data documentation
