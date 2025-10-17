# @pumped-fn/core-next

## 0.5.77

### Patch Changes

- 071f415: Expose scope in Flow.Context, add multi.ts tests, improve coverage to 90.72%

## [Unreleased]

### Breaking Changes

- **REMOVED: Pod concept entirely**
  - Removed `Scope.pod()` and `Scope.disposePod()` methods
  - Removed `Core.Pod` type
  - Flows now execute directly on scope instead of creating intermediate pod layer
  - Extensions: Removed `initPod` and `disposePod` lifecycle hooks
  - Flow context provides data isolation (no need for pod layer)

### Migration Guide

**Before:**

```typescript
const pod = scope.pod({ initialValues: [...], meta: [...] });
const result = await pod.resolve(executor);
await scope.disposePod(pod);
```

**After:**

```typescript
// Flows execute directly on scope
const result = await scope.exec(
  flow((c) => c.resolve(executor)),
  undefined,
  { presets: [...], meta: [...] }
);
// Flow cleanup is automatic
```

**Extension Authors:**

```typescript
// Before: initPod/disposePod hooks
const extension: Extension = {
  initPod: async (pod, context) => {
    /* setup */
  },
  disposePod: async (pod) => {
    /* cleanup */
  },
};

// After: Use flow context and wrap operations
const extension: Extension = {
  wrap: async (context, next, operation) => {
    // Setup per-execution state in context
    context.set("state", initState());
    const result = await next();
    // Cleanup if needed
    return result;
  },
};
```

### Rationale

Removing pods simplifies the architecture:

- **Simpler mental model**: `scope → flow → context` instead of `scope → pod → flow → context`
- **Fewer footguns**: No more `.static` linkage bugs or cache delegation issues
- **Less cognitive overhead**: Two places for data (scope resources, flow context) instead of three (scope, pod, context)
- **Flow context sufficient**: Already provides data isolation and sharing between executions

## 0.5.76

### Patch Changes

- 767238b: fix: pod resolves .static dependencies as accessors

  Previously, pods would return values instead of accessors for .static dependencies, breaking code that expected accessor methods like get(), update(), and subscribe().

  Fixed by adding explicit handling for isStaticExecutor() in Pod.~resolveExecutor(), ensuring .static dependencies return accessors while still delegating to parent scope cache for resolution.

## 0.5.75

### Patch Changes

- 5338a68: fix: pod resolves dependencies through parent scope cache

  Previously, pods would re-resolve executors already cached in the scope when executing flows via scope.exec(). This caused unnecessary re-resolution of expensive resources like database connections.

  Fixed by making Pod.~resolveExecutor() call this.resolve() for dependencies, ensuring parent scope cache is checked before re-resolving.

## 0.5.74

### Patch Changes

- 8a4b199: Fix pod cache delegation to reuse scope-cached resources without re-resolution

  Previously, pods would re-resolve executors whenever any dependency had a preset, even if the executor was already cached in the parent scope. This caused unnecessary re-resolution of expensive resources like database connections and services.

  The fix reorders resolution checks in Pod.resolve to prioritize parent scope cache lookup before checking for dependency presets. Now pods correctly copy cached values from scope, only re-resolving when the executor itself has a preset or isn't cached in the parent scope.

  This significantly improves pod performance and prevents resource duplication in real-world applications.

## 0.5.73

### Patch Changes

- bdf29a0: Add Promised.create static factory method and make extension API accept both Promise and Promised types

  - Add `Promised.create()` static method as preferred way to create Promised instances
  - Replace all 43 internal uses of `new Promised` with `Promised.create`
  - Extension API now accepts both `Promise<T>` and `Promised<T>` return types
  - Extension methods (init, initPod, wrap, dispose, disposePod) handle both types seamlessly
  - Internal automatic wrapping to Promised for better ergonomics
  - No breaking changes - fully backward compatible

## 0.5.72

### Patch Changes

- a4aa66e: Performance and code quality improvements across three optimization phases:

  **Phase 1 - Hot Path Optimizations:**

  - Extract try-catch from resolution hot path for V8 JIT optimization
  - Pre-cache Promised wrapper instances to eliminate repeated allocations
  - Lazy initialize FlowContext journal Map (50% memory reduction in non-journaling flows)
  - Cache reversed extension arrays to eliminate hot path array reversals

  **Phase 2 - V8 Inline Caching:**

  - Split polymorphic onUpdates Map into monomorphic Maps for better V8 performance
  - Parallelize dependency resolution with Promise.all (40% speedup)

  **Phase 3 - Code Compactness:**

  - Extract extension wrapping helper to eliminate 150+ lines of duplication
  - Optimize error message formatting with replaceAll() instead of RegExp
  - Consolidate Promised utility methods with mapResults() helper

  **Results:**

  - Cached resolution: 1.29M ops/sec
  - Near-zero memory allocation on hot paths
  - Net reduction: 213 lines of code
  - Reorganized index.ts exports with professional grouping
  - All 132 tests passing

## 0.5.71

### Patch Changes

- 402aef4: Add Flow router utility types for path-based type inference with nested router support
- b44d622: Fix Flow.InferInput and Flow.InferOutput to properly infer types from Flow.Flow return values, and update flow.execute signatures to accept Flow.Flow type
- 97463df: Fix scope.exec return types to properly infer Promised<S> instead of any, providing better type safety and IDE autocomplete support

## 0.5.70

### Patch Changes

- 86f7c8f: Updated all flow() creation methods to consistently return Flow.Flow<I, O> type instead of Core.Executor, providing better type inference and direct access to flow definition across all flow creation patterns

## 0.5.69

### Patch Changes

- 9efebeb: Added Flow<I, O> type that extends UFlow with generic Input/Output types and includes definition property for direct access to flow metadata at Executor level

## 0.5.68

### Patch Changes

- b0969a9: Changed parallel() and parallelSettled() return type from Promise to Promised, added Promised settled result utilities: fulfilled(), rejected(), partition(), firstFulfilled(), firstRejected(), findFulfilled(), mapFulfilled(), assertAllFulfilled()

## 0.5.67

### Patch Changes

- [`ab870ee`](https://github.com/pumped-fn/pumped-fn/commit/ab870ee31e3d3c8565b02498566208b096cc991c) Thanks [@lagz0ne](https://github.com/lagz0ne)! - chore: bring back is\* api

- [`e5d33df`](https://github.com/pumped-fn/pumped-fn/commit/e5d33dfe593d9a7057c59bffa5553839cec0d9f0) Thanks [@lagz0ne](https://github.com/lagz0ne)! - improve the flow aapi

## 0.5.66

### Patch Changes

- [`1d3e85b`](https://github.com/pumped-fn/pumped-fn/commit/1d3e85ba3ea2aff508634d30aff3647be40784aa) Thanks [@lagz0ne](https://github.com/lagz0ne)! - expose executor reference to extension on pod resolve, so extension can extract the config from that

## 0.5.65

### Patch Changes

- [`4d87548`](https://github.com/pumped-fn/pumped-fn/commit/4d87548a3eaad1ad0cf5b90e96a078434900e5d9) Thanks [@lagz0ne](https://github.com/lagz0ne)! - - feat: changed plugin to extension, unified the API for both scope and plugin
  - feat: made scope and pod to be MetaContainer. As such, executors and flows can read meta from scope, that'll be the way to configure
  - chore: cleanup tests, reduce amount of test bloats
  - chore: removed placeholder, prepare and adapt

## 0.5.64

### Patch Changes

- [`d73cdd3`](https://github.com/pumped-fn/pumped-fn/commit/d73cdd3ef852d10e387daf76a36e68868346dd7a) Thanks [@lagz0ne](https://github.com/lagz0ne)! - fix: corrected pod behavior along with presets

## 0.5.63

### Patch Changes

- [`f5bab28`](https://github.com/pumped-fn/pumped-fn/commit/f5bab28ba2b1e7fdb42f5f3eef55f39666c7f557) Thanks [@lagz0ne](https://github.com/lagz0ne)! - improved execute api of flow

## 0.5.62

### Patch Changes

- [`272106d`](https://github.com/pumped-fn/pumped-fn/commit/272106ded793db0ab7777ce7a17113c8aca1068a) Thanks [@lagz0ne](https://github.com/lagz0ne)! - added llm docs

- [`e282097`](https://github.com/pumped-fn/pumped-fn/commit/e2820973ae51ade8441f1d22252b4efcc5875791) Thanks [@lagz0ne](https://github.com/lagz0ne)! - updated llm docs

## 0.5.61

### Patch Changes

- [`59751a4`](https://github.com/pumped-fn/pumped-fn/commit/59751a420f87269d058d1eb8f1a2ee0dd97e7a93) Thanks [@lagz0ne](https://github.com/lagz0ne)! - improve scope plugin spi

## 0.5.60

### Patch Changes

- [`4c5c608`](https://github.com/pumped-fn/pumped-fn/commit/4c5c608591e8774820f8fcd49eee0b9f367d054a) Thanks [@lagz0ne](https://github.com/lagz0ne)! - Improve QOL of the flow API

  - Added isOk and isKo to narrow result type
  - flow now has `flow.define` to define config, `flow.execute` to execute flow, `flow.plugin` to create plugin for flow
  - Added flow.md instruction in llm to instruct AI to use flow features

## 0.5.59

### Patch Changes

- [`f407114`](https://github.com/pumped-fn/pumped-fn/commit/f407114d49b269748debbcd91def73efcb2e2711) Thanks [@lagz0ne](https://github.com/lagz0ne)! - simplify the flow api for core-next
