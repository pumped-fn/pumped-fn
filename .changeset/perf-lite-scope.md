---
"@pumped-fn/lite": patch
---

Significant performance improvements to scope internals — no API changes.

**Resolve path**
- Non-async `resolve()` with cached Promise for resolved atoms (+56% cache hits)
- Sync fast-path in `resolveDeps` for already-resolved atom and controller deps
- Skip extension closure chain when scope has zero extensions (+111% flow execution)

**Invalidation & reactivity**
- Optimized `doInvalidateSequential` set fast-path (+57% listener dispatch, +75% select)
- Simplified invalidation chain scheduling (lighter microtask setup)
- Eliminated redundant Map.get calls in listener subscribe/unsubscribe (+63% churn)

**Execution context**
- Non-async `close()` when no cleanups registered
- Skip `ContextDataImpl` allocation when no tags configured
- Early return in `emitStateChange` for the common no-state-listeners case

**Misc**
- Pass entry directly to notification methods (avoid cache lookups)
- Simplified `controller.get()` branching
- `for-in` over `Object.values` in release/GC to avoid array allocation
