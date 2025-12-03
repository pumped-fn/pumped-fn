---
"@pumped-fn/lite": patch
---

fix(flow): improve type inference for flows without parse

Add explicit `parse?: undefined` to flow overloads without parse function. This ensures TypeScript correctly narrows the overload selection, allowing `ctx.input` to be properly typed when `parse` is provided.
