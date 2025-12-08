# Context Auto-Injection for ctx.exec()

## Problem

Currently, when invoking functions via `ctx.exec({ fn, params })`, users must manually pass `ctx` as the first parameter:

```typescript
await ctx.exec({ fn: db.query, params: [ctx, "SELECT 1"] })
```

This is redundant - `ctx` is already available and should be injected automatically.

## Solution

Change `ctx.exec()` to auto-inject `ctx` as the first argument to functions. Users only pass the remaining args:

```typescript
await ctx.exec({ fn: db.query, params: ["SELECT 1"] })
```

## Design Decisions

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| Scope | All functions via ctx.exec() | Consistent behavior, no special cases |
| Migration | Breaking change | Clean API, no legacy baggage |
| Type enforcement | Compile-time | fn must be `(ctx, ...args) => T` |
| Type approach | Generic constraint | Args inferred from params |

## Type Changes

### Before

```typescript
interface ExecFnOptions<Output, Args extends unknown[]> {
  fn: (...args: Args) => MaybePromise<Output>
  params: Args
  tags?: Tagged<unknown>[]
}
```

### After

```typescript
interface ExecFnOptions<Output, Args extends unknown[]> {
  fn: (ctx: ExecutionContext, ...args: Args) => MaybePromise<Output>
  params: Args
  tags?: Tagged<unknown>[]
}
```

## Runtime Changes

In `scope.ts`, the exec implementation changes:

```typescript
// Before
return options.fn(...options.params)

// After
return options.fn(this, ...options.params)
```

## Files to Update

| File | Change |
|------|--------|
| `src/types.ts` | Update `ExecFnOptions` signature |
| `src/scope.ts` | Inject `ctx` as first arg in exec |
| `tests/service.test.ts` | Remove `ctx` from params |
| `tests/extension.test.ts` | Update any fn exec calls |
| `packages/lite/README.md` | Update ctx.exec examples |
| `.c3/c3-2-lite/c3-206-service.md` | Update examples |
| `.c3/c3-2-lite/c3-203-flow.md` | Update examples if any |

## Migration

This is a **breaking change**. Users must:

1. Update all `ctx.exec({ fn, params: [ctx, ...] })` calls to remove `ctx` from params
2. Ensure all functions passed to `ctx.exec()` have `(ctx: ExecutionContext, ...args)` signature

## Changeset

```markdown
---
"@pumped-fn/lite": minor
---

BREAKING: ctx.exec() now auto-injects ExecutionContext

Functions passed to ctx.exec({ fn, params }) must have (ctx, ...args) signature.
The ctx is now injected automatically - only pass remaining args in params.

Before:
await ctx.exec({ fn: db.query, params: [ctx, "SELECT 1"] })

After:
await ctx.exec({ fn: db.query, params: ["SELECT 1"] })
```
