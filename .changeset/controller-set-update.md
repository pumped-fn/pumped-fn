---
"@pumped-fn/lite": minor
---

feat(lite): add Controller.set() and Controller.update() for direct value mutation

Adds two new methods to Controller for pushing values directly without re-running the factory:

- `controller.set(value)` - Replace value directly
- `controller.update(fn)` - Transform value using a function

Both methods:
- Use the same invalidation queue as `invalidate()`
- Run cleanups in LIFO order before applying new value
- Transition through `resolving → resolved` states
- Notify all subscribed listeners

This enables patterns like WebSocket updates pushing values directly into atoms without triggering factory re-execution.

BREAKING CHANGE: `DataStore.get()` now always returns `T | undefined` (Map-like semantics). Use `getOrSet()` to access default values from tags. This aligns DataStore behavior with standard Map semantics where `get()` is purely a lookup operation.
