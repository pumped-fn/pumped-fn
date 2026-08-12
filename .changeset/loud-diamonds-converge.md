---
"@pumped-fn/lite": patch
---

Fix watch-invalidation ordering, false infinite-loop errors, and a livelock. The invalidation queue drains in topological height order (sources before dependents, FIFO among equal heights) instead of edge-wire order, so watched diamond graphs — a dependent watching both a source and a derived atom of that source — recompute exactly once against fresh inputs regardless of `deps` key declaration order, including through async factories. Previously they recomputed against stale intermediates and could spuriously reject `flush()` with "Infinite invalidation loop detected".

Loop detection is now an explicit bounded contract: an atom may recompute at most 100 times within a single flush burst, and every recompute counts, including re-runs triggered by a `set()`/`invalidate()` that landed mid-recompute. Convergent feedback — a recomputing atom writing a peer through a controller, or re-entering itself finitely — completes instead of falsely throwing, and the exact boundary is pinned by tests (settles at 100 sanctioned re-entries, rejects past it). Non-converging feedback rejects `flush()`; unbounded invalidate-during-recompute, which previously hung `flush()` forever, now rejects too. Programs that legitimately need more passes reset the budget by splitting work across bursts (`await scope.flush()` between steps).

Behavior notes: atoms in one burst recompute in dependency-height order rather than invalidation-call order, so when a factory throws mid-burst, the pre-existing dropped-remainder consists of higher-height atoms rather than later-invalidated ones; and a genuine cycle emits up to 100 intermediate notifications per atom before its error surfaces.
