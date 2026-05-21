# Lite React Resource Boundary Autoresearch

Session: `lite-react-resource-boundary`

Scope: `packages/lite-react` resource and scoped-value paths introduced by the ExecutionContext resource work.

Target metric: lower `total_ms`, the sum of:
- `resource_rerender_ms`: average milliseconds per rerender for a component using `useResource(resource, { suspense: false })` after the resource is ready.
- `scoped_select_update_ms`: average milliseconds per scoped value update with 100 `useScopedValue(value, { select })` subscribers.

Stable baseline was run 3 after switching the harness to median-of-five samples:
- `resource_rerender_ms=0.294656`
- `scoped_select_update_ms=1.646725`
- `total_ms=1.941382`

Kept result: controller-backed `useResource` records avoid ready-rerender `ctx.resolve(...)` polling while observing release/reset.
- run 6: `resource_rerender_ms=0.1691`, `scoped_select_update_ms=1.054509`, `total_ms=1.223609`
- run 8 post-simplify: `resource_rerender_ms=0.171881`, `scoped_select_update_ms=1.058304`, `total_ms=1.230185`

Discarded experiments:
- caching scoped-value listener snapshots regressed `total_ms`
- directly iterating listener `Set` regressed `total_ms`
- caching fulfilled resource promises did not meaningfully improve `total_ms`

Useful conclusion: React should observe resource lifecycle through `ctx.controller(resource)` instead of calling `ctx.resolve(resource)` on every ready render. Keep scoped-value fanout simple until a more specific benchmark shows a real bottleneck; the attempted listener micro-optimizations were not worth keeping.
