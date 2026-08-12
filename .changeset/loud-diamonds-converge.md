---
"@pumped-fn/lite": patch
---

Fix watch-invalidation ordering. The invalidation queue drains in topological height order (sources before dependents, FIFO among equal heights) instead of edge-wire order, so watched diamond graphs — a dependent watching both a source and a derived atom of that source — recompute exactly once against fresh inputs regardless of `deps` key declaration order, including through async factories. Previously they recomputed against stale intermediates and could spuriously reject `flush()` with "Infinite invalidation loop detected".

Loop detection is unchanged from the previous release: a second unsanctioned recompute of the same atom within one flush burst rejects `flush()`, and a `set()`/`invalidate()` that lands mid-recompute still sanctions re-entry without limit, so finite factory self-invalidation of any depth settles exactly as before.

Behavior notes: atoms in one burst recompute in dependency-height order rather than invalidation-call order, so when a factory throws mid-burst, the pre-existing dropped-remainder consists of higher-height atoms rather than later-invalidated ones. A mid-burst controller write from a recomputing atom that re-dirties an already-recomputed lower atom surfaces the pre-existing loop rejection deterministically, where edge-wire order previously decided between settling and rejecting.
