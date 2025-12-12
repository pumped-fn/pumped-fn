---
"@pumped-fn/lite": minor
"@pumped-fn/lite-extension-otel": minor
---

Add `name` property to ExecutionContext for extension visibility

- ExecutionContext now exposes `name: string | undefined` (lazy-computed)
- Name resolution: exec name > flow name > undefined
- OTEL extension uses `ctx.name` with configurable `defaultFlowName` fallback
