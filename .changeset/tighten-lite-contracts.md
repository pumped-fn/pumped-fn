---
"@pumped-fn/lite": minor
"@pumped-fn/lite-react": minor
"@pumped-fn/lite-devtools-server": patch
---

Add execution-scoped resource resolution and React resource/scoped-value primitives.

`@pumped-fn/lite` now exposes `ExecutionContext.resolve(atom | resource)`, `ctx.release(resource)`, resource controllers through `ctx.controller(resource)` and `controller(resource)`, resource presets, resource metadata tags, and resource-local cleanup through `ResourceContext.cleanup`.

`@pumped-fn/lite-react` now exposes `ExecutionContextProvider`, `useExecutionContext`, `useResource`, `scopedValue`, and `useScopedValue`, including Suspense and non-Suspense load-union modes.

`@pumped-fn/lite-devtools-server` now emits portable TUI component declaration types during release builds.
