# Change: DataStore Map-like Semantics

**Status: MERGED** - 2025-12-09
> Specs merged to `openspec/specs/datastore/spec.md`. Verification confirmed behavior was already correct.

## Why

The current DataStore API has subtle semantics that differ from JavaScript's `Map`:

```typescript
const countTag = tag<number>({ label: 'count', default: 0 })

ctx.data.get(countTag)  // Returns 0 (default) - but not stored!
ctx.data.has(countTag)  // Returns false - confusing!
```

This creates confusion:
- `get()` returns a value, but `has()` returns false
- Different behavior based on tag configuration
- Not Map-like: `Map.get()` returns undefined if key not present

## What Changes

- **BREAKING**: `get()` always returns `T | undefined` (pure lookup, no defaults)
- `getOrSet()` unchanged - uses default only when storing
- Simpler mental model: `get()` = lookup, `getOrSet()` = initialize-if-missing

## Impact

- Affected specs: `specs/datastore`
- Affected code: `packages/lite/src/scope.ts`, `packages/lite/src/types.ts`
- Source ADR: `.c3/adr/adr-014-datastore-map-semantics.md`
- **Breaking change**: Code relying on `get()` returning defaults will break
- **Migration**: Replace `get(tagWithDefault)` with `getOrSet(tagWithDefault)`
