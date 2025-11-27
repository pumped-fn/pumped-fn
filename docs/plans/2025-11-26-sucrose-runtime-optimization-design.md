# Sucrose Runtime Optimization Design

**Date:** 2025-11-26
**Status:** Ready for implementation
**Goal:** Maximize runtime performance and minimize code footprint using static analysis inference data

## Context

Sucrose static analysis extracts inference data at executor creation time:
- `usesCleanup`, `usesRelease`, `usesReload`, `usesScope` - controller method usage
- `dependencyShape` - 'none' | 'single' | 'array' | 'record'
- `dependencyAccess` - which dependencies are actually accessed

This data enables compile-time decisions that eliminate runtime overhead.

## Design Principles

1. **Extreme performance** - eliminate conditionals, reduce allocations
2. **Shortest LOC** - remove redundant fields and code paths
3. **Internal API flexibility** - public API stable, internals can change freely
4. **Debugging preserved** - keep original function and call site for stack traces

## Changes

### 1. Metadata Restructure

**Before:**
```typescript
interface Metadata {
  inference: Inference
  compiled: ((deps, ctl) => unknown) | undefined
  original: Function
  callSite: string
  name: string | undefined
  skipReason: CompilationSkipReason | undefined
  skipDetail: string | undefined
}
```

**After:**
```typescript
interface Metadata {
  fn: (deps: unknown, ctl: unknown) => unknown  // always exists, always normalized
  inference: Inference
  controllerFactory: ControllerFactory
  callSite: string
  name: string | undefined
  original: Function
  skipReason?: CompilationSkipReason
}

type ControllerFactory =
  | 'none'
  | ((scope: BaseScope, executor: UE) => Controller)
```

Key changes:
- `fn` always populated (compiled or normalized wrapper)
- `compiled` renamed to `fn`, never undefined
- `controllerFactory` pre-computed at creation time
- `skipDetail` removed (skipReason sufficient)

### 2. Inference Changes

**Remove `async` field:**
- `async` keyword detection is unreliable (sync function can return Promise)
- `instanceof Promise` is wrong (cross-realm, thenables)
- Runtime thenable check is unavoidable and correct

**After:**
```typescript
interface Inference {
  usesCleanup: boolean
  usesRelease: boolean
  usesReload: boolean
  usesScope: boolean
  dependencyShape: DependencyShape
  dependencyAccess: (number | string)[]
}
```

### 3. Executor Object Slimming

**Before:**
```typescript
{
  [executorSymbol]: "main",
  factory: wrappedFn,
  dependencies,
  tags,
  lazy: {...},      // eager
  reactive: {...},  // eager
  static: {...},    // eager
}
```

**After:**
```typescript
{
  [executorSymbol]: "main",
  dependencies,
  tags,
  // lazy, reactive, static → lazy getters
  // factory → removed, use metadata.fn
}
```

Lazy variant implementation:
```typescript
let _lazy: Core.Lazy<T> | undefined;
Object.defineProperty(executor, 'lazy', {
  get() {
    return _lazy ??= {
      [executorSymbol]: "lazy",
      executor,
      dependencies: undefined,
      factory: undefined,
      tags
    };
  },
  enumerable: false,
});
// same for reactive, static
```

### 4. Controller Factory Pre-computation

**At compile time, generate appropriate factory:**

```typescript
const NOOP_CONTROLLER: Core.Controller = Object.freeze({
  cleanup: () => {},
  release: () => Promised.resolve(),
  reload: () => Promised.resolve(),
  scope: null as any,
});

function createControllerFactory(inference: Inference): ControllerFactory {
  const { usesCleanup, usesRelease, usesReload, usesScope } = inference;

  if (!usesCleanup && !usesRelease && !usesReload && !usesScope) {
    return 'none';
  }

  return (scope, executor) => {
    const ctl: any = {};
    if (usesCleanup) {
      ctl.cleanup = (fn: Core.Cleanup) => {
        const state = scope["getOrCreateState"](executor);
        scope["ensureCleanups"](state).add(fn);
      };
    }
    if (usesRelease) {
      ctl.release = () => scope.release(executor);
    }
    if (usesReload) {
      ctl.reload = () => scope.resolve(executor, true).map(() => undefined);
    }
    if (usesScope) {
      ctl.scope = scope;
    }
    return ctl as Core.Controller;
  };
}
```

### 5. Execution Path Simplification

**Before (scope.ts executeFactory):**
```typescript
const meta = getMetadata(effectiveExecutor);
const factoryResult = meta?.compiled
  ? meta.compiled(resolvedDependencies, controller)
  : factory.length >= 2
    ? (factory as DependentFn)(resolvedDependencies, controller)
    : (factory as NoDependencyFn)(controller);
```

**After:**
```typescript
const meta = getMetadata(effectiveExecutor)!;
const result = meta.fn(resolvedDependencies, controller);
```

**Full resolveCore simplification:**
```typescript
private async resolveCore(): Promise<unknown> {
  const meta = getMetadata(this.requestor)!;

  // Dependency resolution - short circuit for provide()
  const deps = meta.inference.dependencyShape === 'none'
    ? undefined
    : await this.scope["~resolveDependencies"](
        this.requestor.dependencies,
        this.requestor,
        this.executionContext
      );

  // Controller - singleton or factory
  const ctl = meta.controllerFactory === 'none'
    ? NOOP_CONTROLLER
    : meta.controllerFactory(this.scope, this.requestor);

  // Execute
  const result = meta.fn(deps, ctl);

  // Thenable check (not instanceof Promise)
  return isThenable(result) ? await result : result;
}

const isThenable = (val: unknown): val is PromiseLike<unknown> =>
  val !== null &&
  typeof val === 'object' &&
  typeof (val as any).then === 'function';
```

### 6. Normalized Function Generation

When compilation skips (closures), still create normalized signature:

```typescript
function compile(...): Metadata {
  const result = generate(fn, dependencyShape, executorName);

  let normalizedFn: (deps: unknown, ctl: unknown) => unknown;

  if (result.compiled) {
    normalizedFn = result.compiled;
  } else {
    // Normalize signature even for skipped compilation
    normalizedFn = dependencyShape === 'none'
      ? (_deps: unknown, ctl: unknown) => (fn as any)(ctl)
      : fn as (deps: unknown, ctl: unknown) => unknown;
  }

  return {
    fn: normalizedFn,
    inference,
    controllerFactory: createControllerFactory(inference),
    callSite,
    name: executorName,
    original: fn,
    skipReason: result.skipReason,
  };
}
```

## Files Changed

| File | Changes |
|------|---------|
| `sucrose.ts` | Metadata shape, remove async, add controllerFactory, normalize fn |
| `executor.ts` | Remove factory field, lazy variant getters |
| `scope.ts` | Simplified execution path, NOOP_CONTROLLER, isThenable |
| `types.ts` | Update Core.Executor to remove factory requirement |

## Impact Summary

| Optimization | Memory | CPU | LOC |
|-------------|--------|-----|-----|
| Remove executor.factory | -1 field/executor | -1 conditional | -10 |
| Lazy variants | -3 objects/executor (typical) | getter overhead (rare) | +5 |
| NOOP_CONTROLLER | -1 object/simple-executor | -4 conditionals | +10 |
| Dependency short-circuit | - | -1 function call | -5 |
| Always-normalized fn | - | -2 conditionals | -15 |
| Remove async inference | - | - | -5 |

**Net LOC change:** ~-20 lines
**Net memory:** Significant reduction for typical apps
**Net CPU:** Fewer conditionals per resolution

## Verification Checklist

- [ ] All existing tests pass
- [ ] `provide()` executors use NOOP_CONTROLLER
- [ ] `derive()` executors use appropriate controller factory
- [ ] Lazy/reactive/static variants created on-demand
- [ ] Closures (skipped compilation) still work with normalized fn
- [ ] Error stack traces include callSite
- [ ] Thenable check works for cross-realm promises
