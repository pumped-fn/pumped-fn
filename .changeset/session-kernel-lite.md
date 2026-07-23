---
"@pumped-fn/lite": major
---

Add `scope.run` and `scope.runStream` as one-shot entry APIs that create and close their own execution boundary. The flow form mirrors `ctx.exec` and `ctx.execStream`; the named `deps`/`params`/`fn` form exposes a graph-visible one-off operation without injecting or capturing a context or scope.

Entry execution now activates the complete declared dependency tree, supports tagged controller readiness through `FlowInvocation`, and carries structured cancellation through `ExecutionContext.signal`. Callback registration accepts inferred trailing parameter tuples so cleanup and listener inputs remain explicit.

Atom resolve contexts gain a generation-bound `ctx.release()`. Pending factories, late cleanup registration, invalidation, release, and disposal join exactly-once generation cleanup without allowing stale capabilities to release replacements. This release has no legacy execution loop.
