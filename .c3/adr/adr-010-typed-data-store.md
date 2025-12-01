---
id: ADR-010-typed-data-store
title: Tag-based Typed DataStore API for ctx.data
summary: >
  Replace Map<string, unknown> with typed DataStore interface using Tag as
  keys for compile-time type safety, consistent API with existing tag system,
  and default value support.
status: accepted
date: 2025-12-01
---

# [ADR-010] Tag-based Typed DataStore API for ctx.data

## Status {#adr-010-status}
**Accepted** - 2025-12-01

## Problem/Requirement {#adr-010-problem}

The current `ctx.data` API (introduced in ADR-007) exposes a raw `Map<string, unknown>`, requiring verbose explicit casts at every access:

```typescript
const pollingAtom = atom({
  factory: async (ctx) => {
    const prev = ctx.data.get('prev') as Data | undefined  // awkward cast
    const current = await fetchData()
    ctx.data.set('prev', current)
    return current
  }
})
```

**Pain points:**

1. **Verbose casting** - Every `get()` requires `as T | undefined`
2. **Type mismatch risk** - No compile-time connection between get/set types for same key
3. **String key collisions** - Easy to typo or reuse keys accidentally
4. **No default value pattern** - Common "init on first run" requires boilerplate

**Requirements:**
- True compile-time type safety (not just hidden casts)
- Consistent with existing tag API
- Default value support
- Allocation safe (minimal overhead)

## Exploration Journey {#adr-010-exploration}

**Initial hypothesis:** Add generic `get<T>/set<T>` methods with string keys.

**Problems discovered:**
- Still "trust me" type assertions - no compile-time enforcement
- Can `set<number>('key', 123)` then `get<string>('key')` - type system won't catch it
- Inconsistent with tag pattern already in the library

**Explored alternatives:**

| Approach | Type Safety | Consistency | Verdict |
|----------|-------------|-------------|---------|
| Generic `get<T>(key: string)` | ❌ Trust-me | ❌ Different from tags | Rejected |
| New `slot<T>()` concept | ✅ Enforced | ❌ New concept to learn | Rejected |
| **Reuse `tag<T>()` as key** | ✅ Enforced | ✅ Same pattern | **Selected** |

**Key insight:** The existing `tag` system already solves typed keys with unique symbols. Reusing it for `ctx.data` provides:
- Compile-time type safety (tag carries the type)
- Unique keys via `Symbol.for()` (no collisions)
- Default value support (already in tag API)
- Zero new concepts for developers

**Allocation analysis:**

```
Current:  1 Map per atom (lazy)
Proposed: 1 Map + 1 DataStore wrapper per atom (lazy)
          Tags defined once, reused across invalidations
```

## Solution {#adr-010-solution}

Use `Tag<T>` as typed keys for `ctx.data`:

### API

```typescript
interface DataStore {
  get<T, H extends boolean>(tag: Tag<T, H>): H extends true ? T : T | undefined
  set<T>(tag: Tag<T, boolean>, value: T): void
  has(tag: Tag<unknown, boolean>): boolean
  delete(tag: Tag<unknown, boolean>): boolean
  clear(): void
}
```

### Usage Examples

**Pattern 1: Optional value (no default)**
```typescript
const prevTag = tag<Data>({ label: 'prev' })

const pollingAtom = atom({
  factory: async (ctx) => {
    const prev = ctx.data.get(prevTag)  // Data | undefined - type enforced!
    const current = await fetchData()

    if (prev !== undefined && prev !== current) {
      console.log('Data changed!')
    }
    ctx.data.set(prevTag, current)  // ✅ type checked - must be Data
    ctx.data.set(prevTag, "wrong")  // ❌ compile error!

    return current
  }
})
```

**Pattern 2: With default value (guaranteed non-undefined)**
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

**Pattern 3: Complex types**
```typescript
const cacheTag = tag<Map<string, Result>>({ label: 'cache' })

const cacheAtom = atom({
  factory: async (ctx) => {
    let cache = ctx.data.get(cacheTag)
    if (!cache) {
      cache = new Map()
      ctx.data.set(cacheTag, cache)
    }
    return cache
  }
})
```

**Pattern 4: Reusable tags across atoms**
```typescript
const lastRunTag = tag<Date>({ label: 'lastRun' })

const atomA = atom({
  factory: (ctx) => {
    ctx.data.set(lastRunTag, new Date())
    return 'A'
  }
})

const atomB = atom({
  factory: (ctx) => {
    ctx.data.set(lastRunTag, new Date())  // Different storage (per-atom)
    return 'B'
  }
})
```

### Implementation

```typescript
class DataStoreImpl implements DataStore {
  private readonly map = new Map<symbol, unknown>()

  get<T, H extends boolean>(tag: Tag<T, H>): H extends true ? T : T | undefined {
    if (this.map.has(tag.key)) {
      return this.map.get(tag.key) as T
    }
    if (tag.hasDefault) {
      return tag.defaultValue as T
    }
    return undefined as H extends true ? T : T | undefined
  }

  set<T>(tag: Tag<T, boolean>, value: T): void {
    this.map.set(tag.key, value)
  }

  has(tag: Tag<unknown, boolean>): boolean {
    return this.map.has(tag.key)
  }

  delete(tag: Tag<unknown, boolean>): boolean {
    return this.map.delete(tag.key)
  }

  clear(): void {
    this.map.clear()
  }
}
```

**Lazy initialization in scope:**
```typescript
const ctx: Lite.ResolveContext = {
  get data() {
    if (!entry.data) {
      entry.data = new DataStoreImpl()
    }
    return entry.data
  }
}
```

### Type Safety Guarantee

Unlike string-keyed approaches, this design enforces types at compile time:

```typescript
const numTag = tag<number>({ label: 'num' })
const strTag = tag<string>({ label: 'str' })

ctx.data.set(numTag, 123)     // ✅ OK
ctx.data.set(numTag, "oops")  // ❌ Compile error: string not assignable to number

const n = ctx.data.get(numTag)  // type is number | undefined
const s = ctx.data.get(strTag)  // type is string | undefined
```

### Default Value Semantics

Tags with defaults return the default when key is missing (not stored):

```typescript
const countTag = tag({ label: 'count', default: 0 })

ctx.data.get(countTag)  // Returns 0 (default, not stored)
ctx.data.set(countTag, 5)
ctx.data.get(countTag)  // Returns 5 (stored value)
ctx.data.delete(countTag)
ctx.data.get(countTag)  // Returns 0 (default again)
```

## Changes Across Layers {#adr-010-changes}

### Component Level

#### c3-202 (Atom) - types.ts
```typescript
// BEFORE
export interface ResolveContext {
  cleanup(fn: () => MaybePromise<void>): void
  invalidate(): void
  readonly scope: Scope
  readonly data: Map<string, unknown>
}

// AFTER
export interface DataStore {
  get<T, H extends boolean>(tag: Tag<T, H>): H extends true ? T : T | undefined
  set<T>(tag: Tag<T, boolean>, value: T): void
  has(tag: Tag<unknown, boolean>): boolean
  delete(tag: Tag<unknown, boolean>): boolean
  clear(): void
}

export interface ResolveContext {
  cleanup(fn: () => MaybePromise<void>): void
  invalidate(): void
  readonly scope: Scope
  readonly data: DataStore
}
```

#### c3-201 (Scope) - scope.ts
- Add `DataStoreImpl` class
- Change internal map from `Map<string, unknown>` to `Map<symbol, unknown>`
- Update lazy getter to instantiate `DataStoreImpl`

#### c3-203 (Tag) - tag.ts
- No changes needed - existing Tag type works as-is

### Documentation Updates

#### c3-202-atom.md
Update "Per-Atom Private Storage" section with tag-based API examples.

#### README.md
Update `ctx.data` usage example.

## Verification {#adr-010-verification}

### Type System
- [ ] `ctx.data.get(tagWithoutDefault)` returns `T | undefined`
- [ ] `ctx.data.get(tagWithDefault)` returns `T` (not `T | undefined`)
- [ ] `ctx.data.set(tag, value)` enforces value type matches tag type
- [ ] `ctx.data.set(numTag, "string")` is compile error
- [ ] `ctx.data` is readonly (can't reassign)

### Runtime Behavior
- [ ] `get()` returns undefined for missing keys (no default)
- [ ] `get()` returns default for missing keys (with default)
- [ ] `get()` returns stored value when present (ignores default)
- [ ] Data persists across invalidations
- [ ] Data cleared on release
- [ ] DataStore lazily created on first access
- [ ] Same tag in different atoms = independent storage

### Migration
- [ ] Breaking change: `ctx.data.get('string')` no longer works
- [ ] Migration: create tags for each key used

## Migration Guide {#adr-010-migration}

**Before (ADR-007 style):**
```typescript
const pollingAtom = atom({
  factory: async (ctx) => {
    const prev = ctx.data.get('prev') as Data | undefined
    ctx.data.set('prev', current)
  }
})
```

**After (ADR-010 style):**
```typescript
const prevTag = tag<Data>({ label: 'prev' })

const pollingAtom = atom({
  factory: async (ctx) => {
    const prev = ctx.data.get(prevTag)  // Data | undefined, type-safe!
    ctx.data.set(prevTag, current)      // Enforced at compile time
  }
})
```

**With default value:**
```typescript
const countTag = tag({ label: 'count', default: 0 })

const counterAtom = atom({
  factory: (ctx) => {
    const count = ctx.data.get(countTag)  // number, guaranteed!
    ctx.data.set(countTag, count + 1)
  }
})
```

## Related {#adr-010-related}

- [ADR-007](./adr-007-resolve-context-data.md) - Original ctx.data design (this ADR replaces the API)
- [c3-202](../c3-2-lite/c3-202-atom.md) - Atom and ResolveContext
- [c3-201](../c3-2-lite/c3-201-scope.md) - Scope implementation
- [c3-204](../c3-2-lite/c3-204-tag.md) - Tag system (reused as keys)
