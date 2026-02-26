---
"@pumped-fn/lite": minor
---

Add `controller({ resolve: true, watch: true, eq? })` for automatic reactive invalidation.

When `watch: true` is set, the parent atom re-runs automatically whenever the dep resolves to a new value (equality-gated via `Object.is` or a custom `eq` function). Replaces manual `ctx.cleanup(ctx.scope.on('resolved', dep, () => ctx.invalidate()))` wiring. Watch listeners are auto-cleaned on re-resolve, release, and dispose.
