---
"@pumped-fn/lite": patch
---

exec() starts a flow's factory synchronously again when parsing is synchronous
or absent — an internal refactor had deferred invocation start by a microtask,
which let execution contexts close between a UI dispatch and the factory
starting (silent drop under React provider re-renders). Regression tests pin
the sync-start contract.
