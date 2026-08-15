---
"@pumped-fn/lite": minor
---

Add `Extension.initContext` and `Extension.disposeContext` so extensions observe every execution context — scope-created roots, per-exec children, prepared-flow lifetimes, and detached streams — from creation through its close outcome. `initContext` runs synchronously after tags are seeded and rejects promise-returning hooks; a throwing hook rolls back by closing the context inside the owning lifetime. Also guard an abandoned failing `prepare()` from surfacing a global unhandled rejection.
