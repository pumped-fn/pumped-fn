---
"@pumped-fn/lite": minor
---

Unify `ResolveContext.data` and `ExecutionContext.data` into a single `ContextData` interface

**Breaking Change:** Tag-based methods renamed:
- `get(tag)` → `getTag(tag)`
- `set(tag, value)` → `setTag(tag, value)`
- `has(tag)` → `hasTag(tag)`
- `delete(tag)` → `deleteTag(tag)`
- `getOrSet(tag)` → `getOrSetTag(tag)`

**New:** Raw Map operations available on both contexts:
- `get(key: string | symbol)` → raw lookup
- `set(key: string | symbol, value)` → raw store
- `has(key: string | symbol)` → raw check
- `delete(key: string | symbol)` → raw delete
- `clear()` → remove all

This allows extensions to use simple `symbol` keys while user code benefits from type-safe Tag-based methods.
