---
"@pumped-fn/lite": patch
---

Fix watched diamond convergence. Mutations issued before a flush burst begins processing — including several `set()`/`update()`/`invalidate()` calls batched in one synchronous turn — are clean burst inputs: the derived recomputes they schedule, and the recomputes those schedule transitively, carry clean provenance, and when a clean recompute's value change re-dirties a watcher that already recomputed in the same burst, that watcher retries instead of rejecting `flush()` with "Infinite invalidation loop detected". Diamond graphs — nested, overlapping, shared-corridor, multi-root batched, in every `deps` declaration order, including async factories — converge to correct final values. Clean provenance survives suspension: a clean re-dirty buffered against a mid-flight resolve re-emerges clean.

Nothing else grants retries. `set()`/`update()` value notifications never wash directly, and any mutation issued after the burst starts processing — from factories, listeners (inside or outside a drain), cleanups, or concurrent code between drain passes — taints what it schedules; tainted recomputes cannot wash. Every feedback loop therefore reaches the loop detector and rejects exactly as the previous release, and programs that settled on the previous release execute identically.

Behavior notes: on previously-rejecting diamond shapes, dependents may recompute more than once per burst and listeners observe transitional values before convergence; adversely-wired deep chains converge with quadratic total recomputes where the previous release rejected immediately.
