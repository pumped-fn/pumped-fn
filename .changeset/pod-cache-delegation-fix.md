---
"@pumped-fn/core-next": patch
---

Fix pod cache delegation to reuse scope-cached resources without re-resolution

Previously, pods would re-resolve executors whenever any dependency had a preset, even if the executor was already cached in the parent scope. This caused unnecessary re-resolution of expensive resources like database connections and services.

The fix reorders resolution checks in Pod.resolve to prioritize parent scope cache lookup before checking for dependency presets. Now pods correctly copy cached values from scope, only re-resolving when the executor itself has a preset or isn't cached in the parent scope.

This significantly improves pod performance and prevents resource duplication in real-world applications.
