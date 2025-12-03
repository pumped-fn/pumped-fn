---
"@pumped-fn/lite": minor
---

Add `getOrSet` method to DataStore and fix generic signatures for `has`/`delete`

**New: `getOrSet` method**

Eliminates repetitive initialization boilerplate:

```typescript
// Before (verbose)
let cache = ctx.data.get(cacheTag)
if (!cache) {
  cache = new Map()
  ctx.data.set(cacheTag, cache)
}

// After (concise)
const cache = ctx.data.getOrSet(cacheTag, new Map())
```

For tags with defaults, no second argument needed:

```typescript
const countTag = tag({ label: 'count', default: 0 })
const count = ctx.data.getOrSet(countTag)  // number, now stored
```

**Fixed: `has`/`delete` signatures**

Changed from non-generic to generic signatures to accept any `Tag<T, H>`:

```typescript
// Before: rejected Tag<string, false> due to contravariance
has(tag: Tag<unknown, boolean>): boolean

// After: accepts any tag
has<T, H extends boolean>(tag: Tag<T, H>): boolean
```
