---
"@pumped-fn/lite": patch
---

Fix watch-invalidation ordering, false infinite-loop errors, and a livelock. The invalidation queue drains in topological height order (sources before dependents, FIFO among equal heights) instead of edge-wire order, so watched diamond graphs — a dependent watching both a source and a derived atom of that source — recompute exactly once against fresh inputs regardless of `deps` key declaration order, including through async factories. Previously they recomputed against stale intermediates and could spuriously reject `flush()` with "Infinite invalidation loop detected".

Loop detection is now a bounded pass budget: an atom may recompute up to 25 times per flush burst, and every recompute counts, including re-runs triggered by a `set()`/`invalidate()` that landed mid-recompute. Convergent feedback — a recomputing atom writing a peer through a controller and settling — completes instead of falsely throwing. Genuine non-converging cycles reject `flush()` after at most 25 passes of the cycling atom; cycles driven by invalidate-during-recompute, which previously could hang `flush()` forever, now reject too.

Behavior notes: atoms in one burst recompute in dependency-height order rather than invalidation-call order, so when a factory throws mid-burst, the pre-existing dropped-remainder consists of higher-height atoms rather than later-invalidated ones; and a genuine cycle emits up to 25 intermediate notifications per atom before its error surfaces.
