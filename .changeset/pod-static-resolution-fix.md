---
"@pumped-fn/core-next": patch
---

fix: pod resolves .static dependencies as accessors

Previously, pods would return values instead of accessors for .static dependencies, breaking code that expected accessor methods like get(), update(), and subscribe().

Fixed by adding explicit handling for isStaticExecutor() in Pod.~resolveExecutor(), ensuring .static dependencies return accessors while still delegating to parent scope cache for resolution.
