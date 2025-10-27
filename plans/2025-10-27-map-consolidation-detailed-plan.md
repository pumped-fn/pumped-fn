# Map Consolidation - Detailed Implementation Plan

**Date**: 2025-10-27  
**Priority**: P0  
**Estimated Effort**: 1 day  
**Expected Impact**: 3-4x faster update propagation, 32-55% memory reduction

---

## Problem Analysis

### Current State: 6 Separate Maps

```typescript
// BaseScope class has 6 Maps keyed by executor:
protected cache: Map<UE, CacheEntry>                        // 9 accesses
protected cleanups: Map<UE, Set<Cleanup>>                   // 3 accesses  
protected onUpdateCallbacks: Map<UE, Set<OnUpdateFn>>       // 8 accesses
protected onUpdateExecutors: Map<UE, Set<UE>>               // 7 accesses
protected onErrors: Map<UE, Set<ErrorCallback>>             // ~5 accesses
private resolutionChain: Map<UE, Set<UE>>                   // ~3 accesses
private resolutionDepth: Map<UE, number>                    // ~3 accesses
```

### Access Pattern Analysis

**Hot path**: `~triggerUpdate()` (lines 528-553)
- Accesses: cache (2x), onUpdateExecutors (3x), onUpdateCallbacks (2x)
- **Total**: 7 Map lookups per update
- **10-deep reactive chain**: 70 Map lookups!

**Moderate path**: `~resolveExecutor()` (lines 588-629)
- Accesses: resolutionDepth (2x), cache (1x), onUpdateExecutors (2x)
- **Total**: 5 Map lookups per dependency resolution

**Cold path**: `release()` (lines 726-886)
- Accesses: cache (2x), onUpdateExecutors (2x), onUpdateCallbacks (1x), cleanups (1x)
- **Total**: 6 Map lookups per release

### Memory Overhead

**Current** (100 executors, 50% with callbacks):
- 7 Maps × 100 entries = ~700 Map entries
- Each Map: ~40 bytes overhead
- Sets (avg 2 items): ~80 bytes each
- **Total**: ~40KB for 100 executors

**After consolidation**:
- 1 Map × 100 entries = 100 Map entries
- Single unified structure per executor
- **Estimated**: ~26KB (35% reduction)

---

## Proposed Solution: Unified Cache Entry

### New Structure

```typescript
type ExecutorState = {
  // Core resolution state (always present after resolve)
  accessor: Core.Accessor<unknown>;
  value?: Core.ResolveState<unknown>;
  
  // Lifecycle management (optional, only if registered)
  cleanups?: Set<Core.Cleanup>;
  
  // Reactive relationships (optional, only for reactive executors)
  onUpdateCallbacks?: Set<OnUpdateFn>;
  onUpdateExecutors?: Set<UE>;  // Dependents that need update
  
  // Error handling (optional, only if registered)
  onErrors?: Set<Core.ErrorCallback<unknown>>;
  
  // Circular dependency tracking (optional, only during resolution)
  resolutionChain?: Set<UE>;
  resolutionDepth?: number;
};

// Main cache map
protected cache: Map<UE, ExecutorState> = new Map();
```

### Design Rationale

**Why optional fields?**
- Most executors don't have callbacks (saves 3-5 Set allocations)
- Resolution tracking only needed during active resolution
- Memory efficient: only allocate what's used

**Why keep Sets?**
- Sets are efficient for add/delete/has operations
- Iteration is same performance as arrays
- No need to change callback registration logic

**Access pattern**:
```typescript
// Before (4 Map lookups):
const ce = this.cache.get(e);
const executors = this.onUpdateExecutors.get(e);
const callbacks = this.onUpdateCallbacks.get(e);
const cleanups = this.cleanups.get(e);

// After (1 Map lookup):
const state = this.cache.get(e);
const executors = state?.onUpdateExecutors;
const callbacks = state?.onUpdateCallbacks;
const cleanups = state?.cleanups;
```

---

## Implementation Steps

### Phase 1: Type Definitions (30 mins)

**File**: `packages/next/src/scope.ts` (top of file)

1. Define new `ExecutorState` type:
```typescript
type ExecutorState = {
  accessor: Core.Accessor<unknown>;
  value?: Core.ResolveState<unknown>;
  cleanups?: Set<Core.Cleanup>;
  onUpdateCallbacks?: Set<OnUpdateFn>;
  onUpdateExecutors?: Set<UE>;
  onErrors?: Set<Core.ErrorCallback<unknown>>;
  resolutionChain?: Set<UE>;
  resolutionDepth?: number;
};
```

2. Rename old `CacheEntry` to `ExecutorState`
3. Add migration helper type (for gradual migration):
```typescript
type CacheEntry = ExecutorState; // Temporary alias
```

### Phase 2: Update Map Declarations (15 mins)

**File**: `packages/next/src/scope.ts` (lines 402-428)

**Before**:
```typescript
protected cache: Map<UE, CacheEntry> = new Map();
protected cleanups: Map<UE, Set<Core.Cleanup>> = new Map();
protected onUpdateCallbacks: Map<UE, Set<OnUpdateFn>> = new Map();
protected onUpdateExecutors: Map<UE, Set<UE>> = new Map();
protected onErrors: Map<UE, Set<Core.ErrorCallback<unknown>>> = new Map();
private resolutionChain: Map<UE, Set<UE>> = new Map();
private resolutionDepth: Map<UE, number> = new Map();
```

**After**:
```typescript
protected cache: Map<UE, ExecutorState> = new Map();
// All other Maps removed - data moved into ExecutorState
```

### Phase 3: Update Helper Methods (1 hour)

Create helper methods to encapsulate state access:

```typescript
// Get or create state entry
private getOrCreateState(executor: UE): ExecutorState {
  let state = this.cache.get(executor);
  if (!state) {
    state = { accessor: null as any }; // Accessor set later
    this.cache.set(executor, state);
  }
  return state;
}

// Get state (may be undefined)
private getState(executor: UE): ExecutorState | undefined {
  return this.cache.get(executor);
}

// Ensure callbacks set exists
private ensureCallbacks(state: ExecutorState): Set<OnUpdateFn> {
  if (!state.onUpdateCallbacks) {
    state.onUpdateCallbacks = new Set();
  }
  return state.onUpdateCallbacks;
}

// Similar helpers for other Sets
private ensureExecutors(state: ExecutorState): Set<UE> { ... }
private ensureCleanups(state: ExecutorState): Set<Core.Cleanup> { ... }
private ensureErrors(state: ExecutorState): Set<Core.ErrorCallback> { ... }
```

### Phase 4: Migrate Access Patterns (3-4 hours)

**Priority order**: Start with hot paths first

#### 4.1: ~triggerUpdate (HOTTEST PATH)

**File**: scope.ts, lines 528-553

**Before**:
```typescript
protected async "~triggerUpdate"(e: UE): Promise<void> {
  const ce = this.cache.get(e);
  if (!ce) {
    throw new Error("Executor is not yet resolved");
  }

  const executors = this.onUpdateExecutors.get(e);
  if (executors) {
    for (const t of Array.from(executors.values())) {
      // ...
      const a = this.cache.get(t);
      await a!.accessor.resolve(true);
      
      if (this.onUpdateExecutors.has(t) || this.onUpdateCallbacks.has(t)) {
        await this["~triggerUpdate"](t);
      }
    }
  }

  const callbacks = this.onUpdateCallbacks.get(e);
  if (callbacks) {
    for (const cb of Array.from(callbacks.values())) {
      await cb(ce.accessor);
    }
  }
}
```

**After**:
```typescript
protected async "~triggerUpdate"(e: UE): Promise<void> {
  const state = this.cache.get(e);  // Single lookup
  if (!state) {
    throw new Error("Executor is not yet resolved");
  }

  if (state.onUpdateExecutors) {
    for (const t of Array.from(state.onUpdateExecutors.values())) {
      // ...
      const depState = this.cache.get(t);
      await depState!.accessor.resolve(true);
      
      if (depState!.onUpdateExecutors || depState!.onUpdateCallbacks) {
        await this["~triggerUpdate"](t);
      }
    }
  }

  if (state.onUpdateCallbacks) {
    for (const cb of Array.from(state.onUpdateCallbacks.values())) {
      await cb(state.accessor);
    }
  }
}
```

**Improvement**: 7 Map lookups → 1-2 Map lookups (3.5-7x faster)

#### 4.2: ~resolveExecutor

**File**: scope.ts, lines 588-629

**Before**:
```typescript
const currentDepth = (this.resolutionDepth.get(ref) ?? 0) + 1;
this.resolutionDepth.set(e, currentDepth);

if (currentDepth > this.CIRCULAR_CHECK_THRESHOLD) {
  this["~checkCircularDependency"](e, ref);
  this["~propagateResolutionChain"](ref, e);
}

const a = this["~makeAccessor"](e);

if (isReactiveExecutor(ie)) {
  const c = this.onUpdateExecutors.get(ie.executor) ?? new Set();
  this.onUpdateExecutors.set(ie.executor, c);
  c.add(ref);
}
```

**After**:
```typescript
const refState = this.cache.get(ref);
const currentDepth = (refState?.resolutionDepth ?? 0) + 1;

const state = this.getOrCreateState(e);
state.resolutionDepth = currentDepth;

if (currentDepth > this.CIRCULAR_CHECK_THRESHOLD) {
  this["~checkCircularDependency"](e, ref);
  this["~propagateResolutionChain"](ref, e);
}

const a = this["~makeAccessor"](e);

if (isReactiveExecutor(ie)) {
  const parentState = this.cache.get(ie.executor)!;
  const executors = this.ensureExecutors(parentState);
  executors.add(ref);
}
```

#### 4.3: ~makeAccessor

**File**: scope.ts, lines 680-705

**Before**:
```typescript
protected "~makeAccessor"(e: UE): Core.Accessor<unknown> {
  let requestor = isLazyExecutor(e) ? e.executor : e;
  const cached = this.cache.get(requestor);
  if (cached?.accessor) return cached.accessor;

  const accessor = new AccessorImpl(this, requestor, e.tags);
  
  this.cache.set(requestor, {
    accessor: accessor,
    value: cached?.value,
  });

  return accessor;
}
```

**After**:
```typescript
protected "~makeAccessor"(e: UE): Core.Accessor<unknown> {
  let requestor = isLazyExecutor(e) ? e.executor : e;
  const state = this.cache.get(requestor);
  if (state?.accessor) return state.accessor;

  const accessor = new AccessorImpl(this, requestor, e.tags);
  
  if (state) {
    state.accessor = accessor;  // Update existing state
  } else {
    this.cache.set(requestor, { accessor });  // Create new state
  }

  return accessor;
}
```

#### 4.4: onUpdate registration

**File**: scope.ts, lines 922-945

**Before**:
```typescript
onUpdate<T>(e: Core.Executor<T>, cb: OnUpdateFn): Core.Cleanup {
  const s = this.onUpdateCallbacks.get(e as UE) ?? new Set<OnUpdateFn>();
  this.onUpdateCallbacks.set(e as UE, s);
  s.add(cb);

  return () => {
    s.delete(cb);
    if (s.size === 0) {
      this.onUpdateCallbacks.delete(e as UE);
    }
  };
}
```

**After**:
```typescript
onUpdate<T>(e: Core.Executor<T>, cb: OnUpdateFn): Core.Cleanup {
  const state = this.getOrCreateState(e as UE);
  const callbacks = this.ensureCallbacks(state);
  callbacks.add(cb);

  return () => {
    callbacks.delete(cb);
    if (callbacks.size === 0) {
      delete state.onUpdateCallbacks;  // Free memory when empty
    }
  };
}
```

#### 4.5: Cleanup registration

**File**: scope.ts (AccessorImpl.createController)

**Before**:
```typescript
const cleanup = (fn: Core.Cleanup): void => {
  const s = this.scope.cleanups.get(this.requestor) ?? new Set();
  this.scope.cleanups.set(this.requestor, s);
  s.add(fn);
};
```

**After**:
```typescript
const cleanup = (fn: Core.Cleanup): void => {
  const state = this.scope.getOrCreateState(this.requestor);
  const cleanups = this.scope["ensureCleanups"](state);
  cleanups.add(fn);
};
```

#### 4.6: ~triggerCleanup

**File**: scope.ts, lines 517-525

**Before**:
```typescript
protected async "~triggerCleanup"(e: UE): Promise<void> {
  const cs = this.cleanups.get(e);
  if (cs) {
    for (const c of Array.from(cs.values()).reverse()) {
      await c();
    }
    this.cleanups.delete(e);
  }
}
```

**After**:
```typescript
protected async "~triggerCleanup"(e: UE): Promise<void> {
  const state = this.cache.get(e);
  if (state?.cleanups) {
    for (const c of Array.from(state.cleanups.values()).reverse()) {
      await c();
    }
    delete state.cleanups;  // Free memory
  }
}
```

#### 4.7: release() method

**File**: scope.ts, lines 726-886

Multiple accesses to consolidate - similar pattern to above.

#### 4.8: dispose() method

**File**: scope.ts, lines 897-920

**Before**:
```typescript
this.cache.clear();
this.cleanups.clear();
this.onUpdateCallbacks.clear();
this.onUpdateExecutors.clear();
this.onEvents.change.clear();
this.onEvents.release.clear();
this.onEvents.error.clear();
this.onErrors.clear();
this.resolutionDepth.clear();
this.resolutionChain.clear();
```

**After**:
```typescript
this.cache.clear();  // Only one Map to clear!
this.onEvents.change.clear();
this.onEvents.release.clear();
this.onEvents.error.clear();
```

### Phase 5: Update Circular Dependency Methods (30 mins)

**~checkCircularDependency**, **~propagateResolutionChain**, **~removeFromResolutionChain**

Access `state.resolutionChain` instead of separate Map.

### Phase 6: Testing & Validation (2 hours)

#### 6.1: Type Check
```bash
pnpm typecheck:full
```
**Must pass**: Zero errors

#### 6.2: Unit Tests
```bash
pnpm test
```
**Must pass**: All 244 tests

#### 6.3: Benchmark - Update Propagation
Create new benchmark to test reactive update speed:

```javascript
// benchmark/reactive-updates.js
const base = provide(() => 0);
const chain = [base];
for (let i = 0; i < 10; i++) {
  chain.push(derive(chain[i], (v) => v + 1));
}

const scope = createScope();
const results = [];

// Measure update propagation
for (let i = 0; i < 1000; i++) {
  const start = performance.now();
  await scope.update(base, i);
  results.push(performance.now() - start);
}

console.log(`Mean: ${mean(results)}ms`);
```

**Expected improvement**: 3-4x faster

#### 6.4: Memory Benchmark
```bash
node --expose-gc benchmark/memory.js
```

**Expected**: Lower memory usage

### Phase 7: Cleanup (30 mins)

1. Remove `CacheEntry` type alias (if added for migration)
2. Remove any commented-out old code
3. Update comments to reflect new structure
4. Run final validation

---

## Risk Assessment

### High Risk Areas

**1. Reactive Update Propagation** (lines 528-553)
- Most complex code path
- Easy to miss an access pattern
- **Mitigation**: Add comprehensive reactive update tests

**2. Cleanup Lifecycle** (lines 517-525)
- Order matters (reverse iteration)
- Easy to leak memory if not properly deleted
- **Mitigation**: Test cleanup in various scenarios

**3. Error Callback Registration**
- Less frequently used, might miss edge cases
- **Mitigation**: Review error handling tests

### Medium Risk Areas

**1. Circular Dependency Tracking**
- Complex logic with Sets
- **Mitigation**: Existing tests should catch issues

**2. Accessor Creation**
- Central to caching logic
- **Mitigation**: Extensive existing test coverage

### Low Risk Areas

**1. Type Changes**
- TypeScript will catch most issues
- **Mitigation**: Full type check before tests

**2. Disposal**
- Straightforward simplification
- **Mitigation**: Test dispose in various states

---

## Rollback Plan

If issues arise:

**Option 1**: Revert commit
```bash
git revert <commit-hash>
```

**Option 2**: Feature flag (if we want to A/B test)
```typescript
const USE_CONSOLIDATED_CACHE = process.env.CONSOLIDATED_CACHE === 'true';
```

**Option 3**: Keep both implementations, switch based on flag

---

## Success Criteria

### Performance
- ✅ Update propagation: 3-4x faster (10-deep reactive chain)
- ✅ Benchmark: < 1ms for 10-deep update
- ✅ Memory: 30-40% reduction for 100 executors

### Quality  
- ✅ All 244 tests pass
- ✅ Type check passes (src + tests)
- ✅ Build succeeds
- ✅ No performance regression on other paths

### Code Quality
- ✅ Fewer Map operations in hot paths
- ✅ Better cache locality
- ✅ Cleaner disposal logic

---

## Timeline

| Phase | Duration | Cumulative |
|-------|----------|------------|
| 1. Type definitions | 30 min | 0.5 hr |
| 2. Map declarations | 15 min | 0.75 hr |
| 3. Helper methods | 1 hr | 1.75 hr |
| 4. Migrate access patterns | 4 hr | 5.75 hr |
| 5. Circular dependency | 30 min | 6.25 hr |
| 6. Testing & validation | 2 hr | 8.25 hr |
| 7. Cleanup | 30 min | **8.75 hr** |

**Total: ~9 hours** (just over 1 day)

---

## Next Steps

1. ✅ Review this plan
2. Create feature branch: `git checkout -b perf/map-consolidation`
3. Start with Phase 1 (type definitions)
4. Commit after each phase for safety
5. Validate continuously

---

**Ready to implement**: Detailed plan complete, ready to start Phase 1.
