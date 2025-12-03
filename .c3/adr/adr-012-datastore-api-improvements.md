---
id: ADR-012-datastore-api-improvements
title: DataStore API Improvements - Relaxed Signatures and getOrSet
summary: >
  Fix overly strict has/delete signatures that reject valid Tag types, and add
  getOrSet convenience method to eliminate repetitive get-check-set boilerplate.
status: accepted
date: 2025-12-03
---

# [ADR-012] DataStore API Improvements - Relaxed Signatures and getOrSet

## Status {#adr-012-status}
**Accepted** - 2025-12-03

## Problem/Requirement {#adr-012-problem}

Two usability issues with the current `DataStore` API:

### Issue 1: Overly Strict Signatures

The current `has` and `delete` signatures use `Tag<unknown, boolean>`:

```typescript
interface DataStore {
  has(tag: Tag<unknown, boolean>): boolean
  delete(tag: Tag<unknown, boolean>): boolean
}
```

This is **too strict**. When you have a `Tag<number, true>` (tag with default), TypeScript rejects it because `Tag<number, true>` is not assignable to `Tag<unknown, boolean>` due to:
- Contravariance in the type parameter
- Literal `true` not being assignable to `boolean` in that position

```typescript
const countTag = tag({ label: 'count', default: 0 })  // Tag<number, true>

ctx.data.has(countTag)    // ❌ Type error!
ctx.data.delete(countTag) // ❌ Type error!
```

### Issue 2: Repetitive Initialization Pattern

A common pattern requires verbose boilerplate:

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

This pattern appears whenever state needs initialization on first access.

## Exploration Journey {#adr-012-exploration}

**Initial hypothesis:** Changes isolated to DataStore interface in c3-202 (Atom).

**Explored:**
- **Isolated (c3-202):** DataStore interface and usage patterns documented here
- **Upstream (ADR-010):** Original DataStore design - describes intent but signature issue wasn't caught
- **Adjacent (c3-204 Tag):** Tags used as keys - no changes needed to Tag itself
- **Downstream:** No components depend on DataStore - it's a leaf interface

**Discovered:**
- The "Complex Types" pattern in c3-202 (lines 309-322) shows exact boilerplate that `getOrSet` would eliminate
- Signature fix only requires changing type parameter - implementation unchanged

**Confirmed:** Changes are isolated to DataStore interface and implementation.

## Solution {#adr-012-solution}

### Fix 1: Relax has/delete Signatures

Change from non-generic to generic signatures:

```typescript
interface DataStore {
  has<T, H extends boolean>(tag: Tag<T, H>): boolean
  delete<T, H extends boolean>(tag: Tag<T, H>): boolean
}
```

**Why `Tag<unknown, boolean>` fails:**

The `Tag` interface includes a callable signature `(value: T) => Tagged<T>`. Due to contravariance in function parameters, `Tag<string, false>` is NOT assignable to `Tag<unknown, boolean>` because:
- `Tag<unknown, boolean>` expects to accept `unknown` as input
- `Tag<string, false>` only accepts `string` as input
- You can't pass a `string`-only function where an `unknown`-accepting function is expected

```typescript
const screenUpdateTag = tag<string>({ label: 'screen-update' })
ctx.data.delete(screenUpdateTag)  // ❌ Error: Tag<string, false> not assignable to Tag<unknown, boolean>
```

**Why generic signature works:**

By making `has` and `delete` generic over `T` and `H`, TypeScript infers the exact types from the argument, avoiding the contravariance issue entirely.

**Rationale:** These methods only use `tag.key` (a symbol) internally. The type parameters are irrelevant at runtime, so we should accept any Tag regardless of its type parameters.

### Fix 2: Add getOrSet Method

Add overloaded `getOrSet` that mirrors `tag()` API:

```typescript
interface DataStore {
  // Existing methods...

  // Tag with default - uses tag's defaultValue
  getOrSet<T>(tag: Tag<T, true>): T

  // Tag without default - must provide default value
  getOrSet<T>(tag: Tag<T, false>, defaultValue: T): T
}
```

**Semantics:**
- Returns existing value if present in store
- Otherwise stores and returns the default (from tag or parameter)
- Always materializes value into storage (so `has()` returns `true` afterward)

**Rationale for always storing:**
1. `getOrSet` implies "get or **set**" - calling it should set the value
2. Consistent behavior regardless of source (tag default vs parameter)
3. Enables meaningful `has()` checks: "has this been initialized?"
4. `delete()` → `getOrSet()` cycle makes sense: delete resets, getOrSet re-initializes

### Updated Interface

```typescript
interface DataStore {
  get<T, H extends boolean>(tag: Tag<T, H>): H extends true ? T : T | undefined
  set<T>(tag: Tag<T, boolean>, value: T): void
  has<T, H extends boolean>(tag: Tag<T, H>): boolean
  delete<T, H extends boolean>(tag: Tag<T, H>): boolean
  clear(): void
  getOrSet<T>(tag: Tag<T, true>): T
  getOrSet<T>(tag: Tag<T, false>, defaultValue: T): T
}
```

### Usage Examples

**Before (verbose):**
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

**After (concise):**
```typescript
const cacheTag = tag<Map<string, Result>>({ label: 'cache' })

const cacheAtom = atom({
  factory: async (ctx) => {
    return ctx.data.getOrSet(cacheTag, new Map())
  }
})
```

**With default tag:**
```typescript
const countTag = tag({ label: 'count', default: 0 })

const counterAtom = atom({
  factory: (ctx) => {
    const count = ctx.data.getOrSet(countTag)  // number, now stored
    ctx.data.set(countTag, count + 1)
    return count
  }
})
```

## Changes Across Layers {#adr-012-changes}

### Component Level

#### c3-202 (Atom) - types.ts

```typescript
// BEFORE
interface DataStore {
  get<T, H extends boolean>(tag: Tag<T, H>): H extends true ? T : T | undefined
  set<T>(tag: Tag<T, boolean>, value: T): void
  has(tag: Tag<unknown, boolean>): boolean
  delete(tag: Tag<unknown, boolean>): boolean
  clear(): void
}

// AFTER
interface DataStore {
  get<T, H extends boolean>(tag: Tag<T, H>): H extends true ? T : T | undefined
  set<T>(tag: Tag<T, boolean>, value: T): void
  has<T, H extends boolean>(tag: Tag<T, H>): boolean
  delete<T, H extends boolean>(tag: Tag<T, H>): boolean
  clear(): void
  getOrSet<T>(tag: Tag<T, true>): T
  getOrSet<T>(tag: Tag<T, false>, defaultValue: T): T
}
```

#### c3-201 (Scope) - scope.ts

Add `getOrSet` implementation to `DataStoreImpl`:

```typescript
class DataStoreImpl implements Lite.DataStore {
  // ... existing methods ...

  getOrSet<T>(tag: Lite.Tag<T, true>): T
  getOrSet<T>(tag: Lite.Tag<T, false>, defaultValue: T): T
  getOrSet<T>(tag: Lite.Tag<T, boolean>, defaultValue?: T): T {
    if (this.map.has(tag.key)) {
      return this.map.get(tag.key) as T
    }
    const value = tag.hasDefault ? (tag.defaultValue as T) : (defaultValue as T)
    this.map.set(tag.key, value)
    return value
  }
}
```

### Documentation Updates

#### c3-202-atom.md

Update the "Per-Atom Private Storage" section:
- Update DataStore interface code block
- Replace "Complex Types" pattern with `getOrSet` example
- Add `getOrSet` documentation and patterns

## Verification {#adr-012-verification}

### Type System
- [ ] `ctx.data.has(tagWithDefault)` compiles (Tag<T, true>)
- [ ] `ctx.data.has(tagWithoutDefault)` compiles (Tag<T, false>)
- [ ] `ctx.data.delete(tagWithDefault)` compiles
- [ ] `ctx.data.getOrSet(tagWithDefault)` returns `T` (no second arg needed)
- [ ] `ctx.data.getOrSet(tagWithoutDefault, value)` returns `T`
- [ ] `ctx.data.getOrSet(tagWithoutDefault)` is compile error (missing arg)
- [ ] `ctx.data.getOrSet(tagWithDefault, value)` accepts optional second arg

### Runtime Behavior
- [ ] `getOrSet` returns existing value when present
- [ ] `getOrSet` stores and returns default when missing
- [ ] `has()` returns `true` after `getOrSet` call
- [ ] `delete()` followed by `getOrSet()` re-initializes value
- [ ] Works correctly with tags with and without defaults

### Migration
- [ ] Non-breaking: existing code continues to work
- [ ] New convenience method available without migration

## Related {#adr-012-related}

- [ADR-010](./adr-010-typed-data-store.md) - Original DataStore design (this ADR extends it)
- [c3-202](../c3-2-lite/c3-202-atom.md) - Atom and ResolveContext documentation
- [c3-204](../c3-2-lite/c3-204-tag.md) - Tag system (used as DataStore keys)
