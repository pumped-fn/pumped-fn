---
"@pumped-fn/core-next": patch
---

fix: pod resolves dependencies through parent scope cache

Previously, pods would re-resolve executors already cached in the scope when executing flows via scope.exec(). This caused unnecessary re-resolution of expensive resources like database connections.

Fixed by making Pod.~resolveExecutor() call this.resolve() for dependencies, ensuring parent scope cache is checked before re-resolving.
