---
"@pumped-fn/core-next": minor
---

Sucrose runtime optimization: leverage static analysis for performance

- Remove `async` from Inference (unreliable, use thenable check instead)
- Always-normalized `fn` in Metadata (no runtime provide/derive check)
- Pre-computed controllerFactory (NOOP_CONTROLLER for simple executors)
- Lazy variant getters (lazy/reactive/static created on-demand)
- Dependency resolution short-circuit for provide()
- Use isThenable instead of instanceof Promise
- Remove factory field from executor objects (use metadata.fn)
- Remove factory from ReplacerResult (accessed via metadata)
