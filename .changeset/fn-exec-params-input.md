---
"@pumped-fn/lite": patch
---

Expose function params as `ctx.input` for extensions

When executing functions via `ctx.exec({ fn, params })`, the `params` array is now available on `ctx.input`. This enables extensions to access function arguments consistently with flow input.

- Flows: `ctx.input` = parsed input value
- Functions: `ctx.input` = params array
