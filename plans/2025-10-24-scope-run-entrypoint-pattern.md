# Scope.run() - Entrypoint Pattern Simplification

**Date**: 2025-10-24
**Status**: Design Complete

## Problem

Entrypoint code (HTTP handlers, CLI commands, cron jobs) has repetitive pattern:
```typescript
const service = await scope.resolve(userService)
const result = service.getUser(userId)
```

While `derive()` exists for creating executors with dependencies, there's no lightweight utility for one-shot operations that:
- Resolve dependencies from scope
- Run callback with resolved values
- Return result as Promise/Promised
- Cache resolved dependencies (not callback result)

## Solution

Add `scope.run()` method for ephemeral execution with cached dependency resolution.

### API Signature

Two overloads based on whether extra parameters needed:

```typescript
// No extra params
scope.run<T, D extends Core.DependencyLike>(
  dependencies: D,
  callback: (deps: Core.InferOutput<D>) => T | Promise<T>
): Promised<T>

// With extra params (array, not spread)
scope.run<T, D extends Core.DependencyLike, Args extends readonly unknown[]>(
  dependencies: D,
  callback: (deps: Core.InferOutput<D>, ...args: Args) => T | Promise<T>,
  args: Args
): Promised<T>
```

### Usage Examples

**Basic - No Extra Params**:
```typescript
await scope.run(
  { userService },
  ({ userService }) => userService.listAll()
)
```

**With Extra Params**:
```typescript
await scope.run(
  { userService, postDb },
  ({ userService, postDb }, userId, page) => {
    return {
      user: userService.getUser(userId),
      posts: postDb.getPosts(page)
    }
  },
  ["user123", 1]  // array, not spread
)
```

**Before/After Comparison**:
```typescript
// Before
const service = await scope.resolve(userService)
const result = service.getUser(userId)

// After
const result = await scope.run(
  { userService },
  ({ userService }, userId) => userService.getUser(userId),
  [userId]
)
```

## Implementation Details

### Resolution Process

1. `scope.run(deps, callback, args?)` invoked
2. Dependencies resolved via `scope["~resolveDependencies"](deps, ref)` (same mechanism as `derive`)
3. Resolved values cached in scope (normal caching behavior)
4. Callback executed: `callback(resolvedDeps, ...args)`
5. Result wrapped in `Promised<T>` (callback can return `T` or `Promise<T>`)

### Key Behaviors

**Caching**:
- Dependencies: Cached in scope (reuses existing resolutions)
- Callback result: NOT cached (runs fresh every time)
- Pattern: Ephemeral execution with persistent dependency cache

**Type Safety**:
- Full type inference through `Core.InferOutput<D>`
- Args tuple type preserved
- Return type inferred from callback

**Error Handling**:
- Dependency resolution errors → thrown immediately
- Callback errors → wrapped in rejected `Promised`
- Consistent with existing `Promised` error patterns

### Design Alignment

Similar to `ctx.run()` in flow.ts:283-294, which already uses parameter array pattern:
```typescript
ctx.run<T, P extends readonly unknown[]>(
  key: string,
  fn: (...args: P) => Promise<T> | T,
  ...params: P
): Promised<T>
```

Note: `ctx.run` uses spread (`...params`), but `scope.run` uses array to avoid empty array handling issues.

## Impact Areas

### Core Package Changes

**Files**:
- `packages/next/src/scope.ts` - Add `run()` method to `BaseScope` class
- `packages/next/src/types.ts` - Add `run()` signature to `Core.Scope` interface

**Implementation Location**:
Add after `scope.resolve()` method (around line 734)

### Testing

**New Test File**: `packages/next/tests/scope-run.test.ts`

**Test Cases**:
1. Basic resolution - no params
2. With parameters - array form
3. Type inference validation
4. Error handling - dependency resolution failure
5. Error handling - callback throws
6. Caching behavior - dependencies cached, callback not cached
7. Multiple dependency types - object, array, single executor
8. Async callback returns Promise
9. Sync callback returns value

### Documentation

**Files to Update**:
- `claude-skill/skills/pumped-fn-typescript/pattern-reference.md` - Add entrypoint pattern
- `examples/` - Add example showing scope.run() usage at entrypoints

## Non-Goals

- `ctx.exec()` parameter support - deferred for separate discussion
- Top-level `run()` helper function - scope method sufficient
- Callback result caching - intentionally ephemeral

## Design Rationale

**Why scope method over top-level function?**
- Natural extension of scope API
- Consistent with other scope operations (resolve, update, etc.)
- No need to pass scope explicitly

**Why array over spread for params?**
- Empty array case cleaner (omit parameter entirely)
- Avoids TypeScript spread/rest parameter edge cases
- Clear distinction between "no params" and "empty params"

**Why not cache callback result?**
- Entrypoint operations are request-scoped, not app-scoped
- Callback might have side effects
- Dependencies already cached (main performance benefit)

## Validation

Design validated through:
1. Comparison with existing `ctx.run()` pattern
2. Alignment with `derive()` dependency resolution
3. Type safety verification with inference
4. Usage pattern review in examples/

Ready for implementation.
