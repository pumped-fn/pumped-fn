---
"@pumped-fn/core-next": patch
---

Fix tag resolution to use execution context instead of scope

- Tags in flow dependencies now correctly resolve from execution context, not scope
- Added `executionContext` parameter to `scope.resolve()` for context-specific resolution
- Added type-safe `hasTagStore()` type guard replacing `any` casts
- Added error cleanup for `contextResolvedValue` on resolution failure
- Optimized constructor to skip cache operations for execution context accessors
- Added memory profiling tests validating ~5KB per context overhead
- Added comprehensive test coverage for concurrent and nested context scenarios
