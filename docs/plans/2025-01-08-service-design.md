# Service Design

## Problem

Flows handle single functions with `ExecutionContext`. But for infrastructure like db, logger, etc., we need to expose **multiple methods** that are context-aware.

Currently, you could use `atom()` returning an object with methods, but:
- No semantic clarity that it's a "service"
- No type enforcement for ctx-first signature
- Methods lose `this` binding when passed to `ctx.exec()`

## Solution

Introduce `service()` - a narrowed-down version of `atom()` that:
1. Returns an object where all methods take `(ctx, ...params)`
2. Auto-binds methods to preserve `this`
3. Provides semantic clarity via separate symbol/type guard

## Design Decisions

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| Name | `service` | Familiar DI terminology |
| Context sharing | Same as caller | No nested context (unlike subflows) |
| Definition API | Mirrors `atom()` | Consistency with existing patterns |
| Resolution | Singleton per scope | Service is stateless method container |
| Invocation | `ctx.exec({ fn, params })` | Unified invocation, extension wrapping |
| Type enforcement | All methods must be `(ctx, ...params)` | Compiler infers `ctx` type |

## API

### Definition

```typescript
const dbService = service({
  deps: { pool: poolAtom },
  factory: (ctx, { pool }) => ({
    query: (ctx, sql: string) => pool.query(sql),
    transaction: (ctx, fn: (tx: Transaction) => Promise<T>) => {
      return pool.withTransaction(fn)
    },
  }),
  tags: [infraTag('database')],  // optional
})
```

**Key points:**
- `factory` signature matches `atom`: `(ctx: ResolveContext, deps) => T`
- Methods write `(ctx, ...)` - TypeScript infers `ctx` as `ExecutionContext`
- `deps` and `tags` optional, same as atom

### Resolution

```typescript
const db = await scope.resolve(dbService)
```

Same as atom. Returns singleton instance per scope.

### Invocation

```typescript
await ctx.exec({ fn: db.query, params: ["SELECT * FROM users"] })
await ctx.exec({ fn: db.transaction, params: [async (tx) => { ... }] })
```

Reuses existing `ctx.exec({ fn, params })` pattern. Extensions wrap the call.

### Type Guard

```typescript
import { isService } from '@pumped-fn/lite'

if (isService(value)) {
  // value is Service<unknown>
}
```

## Type Definitions

```typescript
const serviceSymbol: unique symbol = Symbol.for("@pumped-fn/service")

interface Service<T> {
  readonly [serviceSymbol]: true
  readonly factory: ServiceFactory<T, Dependencies>
  readonly deps?: Dependencies
  readonly tags?: Tagged<unknown>[]
}

type ServiceMethod<TArgs extends unknown[], TReturn> =
  (ctx: ExecutionContext, ...args: TArgs) => MaybePromise<TReturn>

type ServiceMethods = {
  [key: string]: ServiceMethod<unknown[], unknown>
}
```

## Implementation Notes

### Method Binding

When `service()` factory returns an object, methods must be bound to preserve `this`:

```typescript
function wrapServiceMethods<T extends ServiceMethods>(obj: T): T {
  const wrapped = {} as T
  for (const key of Object.keys(obj)) {
    const value = obj[key]
    if (typeof value === 'function') {
      wrapped[key] = value.bind(obj)
    }
  }
  return wrapped
}
```

### Type Inference for ctx

The `service()` function signature should constrain return type so `ctx` param is inferred:

```typescript
function service<T extends ServiceMethods, D extends Dependencies>(config: {
  deps?: D
  factory: (ctx: ResolveContext, deps: InferDeps<D>) => T
  tags?: Tagged<unknown>[]
}): Service<T>
```

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/symbols.ts` | Add `serviceSymbol` |
| `src/service.ts` | New file: `service()`, `isService()` |
| `src/types.ts` | Add `Service`, `ServiceMethod` types to `Lite` namespace |
| `src/index.ts` | Export `service`, `isService` |
| `tests/service.test.ts` | New test file |

## Out of Scope

- Extension hooks specific to services (use existing `wrapExec`)
- Service-specific lifecycle (uses atom lifecycle)
- Nested service calls (just use `ctx.exec()`)
