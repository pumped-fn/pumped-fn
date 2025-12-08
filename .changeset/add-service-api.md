---
"@pumped-fn/lite": minor
---

Add `service()` for context-aware method containers

- New `service()` factory function for defining services with multiple methods
- Each method receives `ExecutionContext` as first parameter (auto-injected)
- Services are resolved as singletons per scope (same as atoms)
- Service methods invoked via `ctx.exec({ fn, params })` for extension wrapping
- New `isService()` type guard and `serviceSymbol` for identification
- `Scope.resolve()` now accepts both `Atom<T>` and `Service<T>`

**BREAKING:** `ctx.exec({ fn, params })` now auto-injects `ExecutionContext` as first argument.
Functions passed to `ctx.exec()` must have `(ctx, ...args)` signature.
Only pass remaining args in `params` - ctx is injected automatically.

**Migration:** Find and update all `ctx.exec({ fn, params: [ctx, ...] })` calls:
```bash
grep -r "params:.*\[ctx" --include="*.ts" .
```
Remove `ctx` from params array - it's now auto-injected.

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
await ctx.exec({ fn: db.query, params: ["SELECT 1"] })
```
