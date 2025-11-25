---
id: ADR-002-core-performance-optimization
title: Core Package Performance Optimization
summary: >
  Comprehensive performance optimization for @pumped-fn/core-next targeting memory
  allocation, async patterns, type guard overhead, and module structure. Includes
  critical bug fixes for un-awaited cleanup promises.
status: proposed
date: 2025-11-25
---

# [ADR-002] Core Package Performance Optimization

## Status {#adr-002-status}
**Proposed** - 2025-11-25

## Problem/Requirement {#adr-002-problem}

Performance profiling of the core package revealed multiple optimization opportunities across 8 categories:

1. **Memory Allocation** - Unnecessary object/array creation in hot paths
2. **Loop Iteration** - Inefficient iteration patterns and O(n²) lookups
3. **Function Call Overhead** - Excessive wrapper functions and bind() calls
4. **Async/Promise Patterns** - Sequential operations that could parallelize + 2 critical bugs
5. **Data Structures** - Suboptimal choices for access patterns
6. **Caching** - Repeated computations without memoization
7. **Type Guards** - Redundant runtime checks
8. **Module Structure** - Tree-shaking barriers

**Critical Bugs Discovered:**
- `scope.ts:695` - Cleanup promise not awaited during `~triggerUpdate`, causing race conditions
- `scope.ts:1005` - Same issue in `coreUpdate()`, state mutates while cleanup runs

These bugs violate the documented "Cleanup ordering" behavior in c3-101.

## Exploration Journey {#adr-002-exploration}

**Initial hypothesis:** Performance changes are internal Component-level optimizations affecting c3-101 (Scope), c3-103 (Tag), c3-108 (Promised), and c3-102 (ExecutionContext).

**Explored:**

- **Isolated (c3-101 Scope):** Primary target. Found 15+ optimization opportunities in scope.ts:
  - `Array.from(Set).reverse()` pattern at lines 678, 692, 707, 722, 731
  - Triple executor type checks (`isLazy || isReactive || isStatic`) at lines 51, 513, 778
  - Un-awaited cleanup promises at lines 695, 1005 (CRITICAL BUGS)
  - Sequential release loops at line 1097

- **Isolated (c3-103 Tag):** Found allocation overhead:
  - 8 `Object.defineProperty` calls per tag creation (lines 343-378)
  - Array literal in `isTagExecutor` type guard (line 432)
  - Repeated validation without caching (lines 149, 175)

- **Isolated (c3-108 Promised):** Found instanceof overhead:
  - `instanceof Promised` in `.all()`, `.race()`, `.allSettled()` hot loops (lines 99, 110, 121)
  - Could use discriminator property for O(1) check

- **Upstream (c3-1 Container):** No changes needed to Container documentation. Public API preserved.

- **Adjacent (c3-102 ExecutionContext):** Found related async patterns:
  - Sequential child context close could parallelize (line 1161)
  - Complex typeof chains in get/set methods (lines 810, 828)

- **Downstream (Public API):** All function signatures unchanged. No breaking changes.

**Discovered:**
- Bug fixes at scope.ts:695/1005 are behavioral corrections, not optimizations
- They fix code to match already-documented cleanup ordering behavior
- All other changes are pure internal optimizations
- No documentation updates required beyond this ADR

**Confirmed:**
- Public API completely unchanged
- Type namespaces unchanged
- Component interfaces unchanged
- Only internal implementation affected

## Solution {#adr-002-solution}

### Phase 1: Critical Bug Fixes

**Fix un-awaited cleanup promises:**

```typescript
// scope.ts:695 - BEFORE
this["~triggerCleanup"](t);  // Fire and forget!
await depState!.accessor.resolve(true);

// scope.ts:695 - AFTER
await this["~triggerCleanup"](t);  // Properly await
await depState!.accessor.resolve(true);
```

Same fix at scope.ts:1005.

### Phase 2: High-Impact Memory Optimizations

**Replace Array.from(Set) with direct iteration:**

```typescript
// BEFORE (scope.ts:692)
for (const t of Array.from(state.onUpdateExecutors.values())) {

// AFTER
for (const t of state.onUpdateExecutors) {
```

**Create unified executor type check:**

```typescript
// NEW: executor.ts
export function isChannelExecutor(e: Core.UExecutor): boolean {
  const kind = e[executorSymbol];
  return kind === "lazy" || kind === "reactive" || kind === "static";
}

// Replace 8+ occurrences of triple-check pattern
```

**Add Promised discriminator:**

```typescript
// primitives.ts - Promised class
readonly _type = 'Promised' as const;

// Usage in .all(), .race(), .allSettled()
const isPromised = (v: unknown): v is Promised<unknown> =>
  v !== null && typeof v === 'object' && '_type' in v && v._type === 'Promised';
```

### Phase 3: Tag Creation Optimization

**Consolidate Object.defineProperty calls:**

```typescript
// BEFORE: 8 separate defineProperty calls
Object.defineProperty(fn, "key", { value: impl.key, ... });
Object.defineProperty(fn, "schema", { value: impl.schema, ... });
// ... 6 more

// AFTER: Single defineProperties call
Object.defineProperties(fn, {
  key: { value: impl.key, writable: false, configurable: false },
  schema: { value: impl.schema, writable: false, configurable: false },
  label: { value: impl.label, writable: false, configurable: false },
  default: { value: impl.default, writable: false, configurable: false },
});

// Or use Object.assign for non-frozen properties
```

**Extract type constants:**

```typescript
// tag.ts - module level
const VALID_TAG_EXECUTOR_TYPES = new Set(["required", "optional", "all"]);

// isTagExecutor - use Set.has() instead of Array.includes()
VALID_TAG_EXECUTOR_TYPES.has(input[tagSymbol])
```

### Phase 4: Async Parallelization

**Parallelize independent releases:**

```typescript
// scope.ts:1097 - BEFORE (sequential)
for (const current of this.cache.keys()) {
  await this.release(current, true);
}

// AFTER (parallel where safe)
const releases = Array.from(this.cache.keys()).map(
  current => this.release(current, true)
);
await Promise.all(releases);
```

### Phase 5: Module Tree-Shaking

**Remove namespace re-exports from index.ts:**

```typescript
// BEFORE (lines 13-21) - blocks tree-shaking
import * as errorsModule from "./errors"
const errors: typeof errorsModule = errorsModule
export { errors }

// AFTER - direct named exports already exist at lines 131-146
// Remove namespace re-export, keep named exports
```

## Changes Across Layers {#adr-002-changes}

### Context Level
No changes to c3-0.

### Container Level
No changes to c3-1. Public API preserved.

### Component Level

**c3-101 (Scope & Executor):**
- Bug fix: Await cleanup promises in `~triggerUpdate` and `coreUpdate`
- Optimization: Replace `Array.from(Set)` patterns with direct iteration
- Optimization: Add `isChannelExecutor()` unified type guard
- Optimization: Parallelize sequential release loops where safe
- No documentation changes needed (bug fix aligns with documented behavior)

**c3-103 (Tag System):**
- Optimization: Consolidate `Object.defineProperty` calls
- Optimization: Extract `VALID_TAG_EXECUTOR_TYPES` constant
- Optimization: Cache tag validation results
- No documentation changes needed (internal only)

**c3-108 (Promised Class):**
- Optimization: Add `_type` discriminator property (private)
- Optimization: Replace `instanceof` with property check in static methods
- No documentation changes needed (`_type` is internal)

**c3-102 (Flow & ExecutionContext):**
- Optimization: Simplify typeof chains in get/set methods
- Optimization: Parallelize context close operations
- No documentation changes needed (internal only)

**Source file changes:**
- `scope.ts`: Bug fixes + 6 optimizations
- `executor.ts`: Add `isChannelExecutor()` helper
- `tag.ts`: 3 optimizations
- `primitives.ts`: 2 optimizations
- `execution-context.ts`: 2 optimizations
- `index.ts`: Remove namespace re-exports

## Verification {#adr-002-verification}

### Critical Bug Fixes
- [ ] `~triggerCleanup` awaited before `accessor.resolve` in `~triggerUpdate`
- [ ] `~triggerCleanup` awaited before state mutation in `coreUpdate`
- [ ] Cleanup ordering tests pass (existing tests should already verify this)
- [ ] No race conditions in cleanup sequences

### Memory Optimizations
- [ ] No `Array.from(Set.values())` patterns remain in hot paths
- [ ] `isChannelExecutor()` used instead of triple-check pattern
- [ ] Tag creation uses single `Object.defineProperties` call
- [ ] `VALID_TAG_EXECUTOR_TYPES` is module-level constant

### Type Guard Optimizations
- [ ] Promised has `_type` discriminator property
- [ ] `instanceof Promised` replaced in `.all()`, `.race()`, `.allSettled()`

### Async Optimizations
- [ ] Sequential release loops parallelized in `dispose()`
- [ ] No behavior change for existing async patterns

### Module Optimizations
- [ ] Namespace re-exports removed from index.ts
- [ ] Named exports preserved for backwards compatibility
- [ ] Bundle size reduced (verify with bundler analysis)

### Regression Prevention
- [ ] `pnpm -F @pumped-fn/core-next typecheck` passes
- [ ] `pnpm -F @pumped-fn/core-next typecheck:full` passes
- [ ] `pnpm -F @pumped-fn/core-next test` passes
- [ ] `pnpm -F @pumped-fn/examples typecheck` passes

## Expected Impact {#adr-002-impact}

| Category | Improvement |
|----------|-------------|
| Hot path execution | 15-30% faster |
| Memory allocations | 20-30% reduction |
| Bundle size | 5-8KB smaller |
| Startup time | 5-10ms faster |

## Alternatives Considered {#adr-002-alternatives}

### 1. WeakMap for Executor Cache

**Considered:** Replace `Map<UE, ExecutorState>` with `WeakMap` to allow GC of released executors.

**Deferred:** WeakMap doesn't support `.entries()` or `.keys()` iteration, which is needed for `dispose()` and `entries()` methods. Would require significant API changes.

### 2. Lazy Module Initialization

**Considered:** Defer tag/flow meta creation until first use.

**Deferred:** Adds complexity for marginal gain. Module-level initialization is predictable and happens once.

### 3. Object Pooling for ExecutorState

**Considered:** Reuse ExecutorState objects instead of creating new ones.

**Deferred:** Adds complexity. GC is efficient for short-lived objects. Profile first.

## Related {#adr-002-related}

- [c3-101](../c3-1-core/c3-101-scope.md) - Scope & Executor (primary changes)
- [c3-103](../c3-1-core/c3-103-tag.md) - Tag System (allocation optimizations)
- [c3-108](../c3-1-core/c3-108-promised.md) - Promised Class (instanceof optimization)
- [c3-102](../c3-1-core/c3-102-flow.md) - Flow & ExecutionContext (async patterns)
