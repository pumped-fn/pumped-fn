---
"@pumped-fn/lite": patch
---

Add `name` option to function execution for API consistency

When executing functions via `ctx.exec({ fn, params })`, you can now provide an explicit `name` option for better observability:

```typescript
await ctx.exec({
  fn: async (ctx, id) => fetchData(id),
  params: ["123"],
  name: "fetchUserData"
})
```

Name resolution priority: `options.name` > `fn.name` > `undefined`

This matches the existing `name` option on flow execution, enabling consistent naming for tracing and debugging.
