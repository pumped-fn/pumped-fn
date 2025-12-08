---
"@pumped-fn/lite": minor
---

Add `service()` for context-aware method containers

- New `service()` factory function for defining services with multiple methods
- Each method receives `ExecutionContext` as first parameter
- Methods are automatically bound to preserve `this` context
- Services are resolved as singletons per scope (same as atoms)
- Service methods invoked via `ctx.exec({ fn, params })` for extension wrapping
- New `isService()` type guard and `serviceSymbol` for identification
- `Scope.resolve()` now accepts both `Atom<T>` and `Service<T>`

Example:
```typescript
const dbService = service({
  deps: { pool: poolAtom },
  factory: (ctx, { pool }) => ({
    query: (ctx, sql: string) => pool.query(sql),
    transaction: (ctx, fn) => pool.withTransaction(fn),
  })
})

const db = await scope.resolve(dbService)
await ctx.exec({ fn: db.query, params: [ctx, "SELECT 1"] })
```
