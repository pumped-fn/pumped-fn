# Code Reduction & Quality Improvement Plan
## pumped-fn/core-next Package

**Current LOC**: ~4,586 lines
**Target Reduction**: 15-20% (~700-900 lines)
**Goal**: Improve code quality, retain all meaning, eliminate duplication

---

## Analysis Summary

### Current State by File
```
scope.ts:          1,279 lines (27.9%)
flow.ts:           1,015 lines (22.1%)
types.ts:            758 lines (16.5%)
promises.ts:         291 lines (6.3%)
tag.ts:              270 lines (5.9%)
errors.ts:           263 lines (5.7%)
executor.ts:         168 lines (3.7%)
multi.ts:            159 lines (3.5%)
flow-execution.ts:   115 lines (2.5%)
others:              268 lines (5.9%)
```

---

## Critical Duplication Patterns Identified

### 1. Error Creation Functions (errors.ts) - **~80 lines savings**

**Problem**: Three similar error factory functions with 80% code overlap
- `createFactoryError` (lines 133-165)
- `createDependencyError` (lines 167-204)
- `createSystemError` (lines 206-235)

**Solution**: Single generic error factory
```typescript
function createError<T extends ExecutorResolutionError>(
  ErrorClass: new (...args: any[]) => T,
  code: Code,
  executorName: string,
  dependencyChain: string[],
  options: {
    resolutionStage?: ErrorContext['resolutionStage']
    missingDependency?: string
    originalError?: unknown
    category?: 'USER_ERROR' | 'SYSTEM_ERROR' | 'VALIDATION_ERROR'
    additionalContext?: Record<string, unknown>
  } = {}
): T
```

**Reduction**: 82 lines → 35 lines = **47 lines saved**

---

### 2. Extension Wrapping Duplication - **~30 lines savings**

**Problem**: `wrapWithExtensions` duplicated in:
- flow.ts lines 12-33 (standalone function)
- flow.ts lines 199-214 (FlowContext method)
- scope.ts lines 721-736 (BaseScope method)

**Solution**: Extract to `internal/extension-utils.ts`
```typescript
export function wrapWithExtensions<T>(
  extensions: Extension.Extension[],
  baseExecutor: () => Promised<T>,
  scope: Core.Scope,
  operation: Extension.Operation
): () => Promised<T>
```

**Reduction**: 51 lines → 25 lines = **26 lines saved**

---

### 3. Type Guard Generalization (executor.ts) - **~20 lines savings**

**Problem**: Four similar type guards:
- `isLazyExecutor` (lines 77-81)
- `isReactiveExecutor` (lines 83-87)
- `isStaticExecutor` (lines 89-93)
- `isMainExecutor` (lines 95-99)

**Solution**: Generic type guard factory
```typescript
function createExecutorTypeGuard<T extends Core.UExecutor>(
  kind: Core.Kind
) {
  return (executor: Core.UExecutor): executor is T =>
    executor[executorSymbol] === kind
}

export const isLazyExecutor = createExecutorTypeGuard<Core.Lazy<unknown>>('lazy')
export const isReactiveExecutor = createExecutorTypeGuard<Core.Reactive<unknown>>('reactive')
export const isStaticExecutor = createExecutorTypeGuard<Core.Static<unknown>>('static')
export const isMainExecutor = createExecutorTypeGuard<Core.AnyExecutor>('main')
```

**Reduction**: 28 lines → 12 lines = **16 lines saved**

---

### 4. Executor Creation Pattern (executor.ts) - **~25 lines savings**

**Problem**: Repetitive executor object creation (lines 29-51)
```typescript
const lazyExecutor = { [executorSymbol]: "lazy", ... }
const reactiveExecutor = { [executorSymbol]: "reactive", ... }
const staticExecutor = { [executorSymbol]: "static", ... }
```

**Solution**: Factory function with loop
```typescript
function createDerivedExecutors<T>(
  executor: Core.Executor<T>,
  tags: Tag.Tagged[] | undefined
) {
  const variants = [
    { kind: 'lazy', accessor: true },
    { kind: 'reactive', accessor: false },
    { kind: 'static', accessor: true }
  ] as const

  return Object.fromEntries(
    variants.map(({ kind, accessor }) => [
      kind,
      {
        [executorSymbol]: kind,
        executor,
        factory: undefined,
        dependencies: undefined,
        tags
      }
    ])
  )
}
```

**Reduction**: 30 lines → 15 lines = **15 lines saved**

---

### 5. Tag Cache Logic (tag.ts) - **~20 lines savings**

**Problem**: Cache building duplicated in `extract` and `collect`
- extract: lines 54-62
- collect: lines 75-83

**Solution**: Extract cache retrieval
```typescript
function getOrBuildCache(source: Tag.Source): Map<symbol, unknown[]> {
  if (isStore(source)) return new Map()

  let cache = tagCacheMap.get(source)
  if (!cache) {
    const tags = Array.isArray(source) ? source : ((source as any).tags ?? [])
    cache = buildTagCache(tags)
    tagCacheMap.set(source, cache)
  }
  return cache
}
```

**Reduction**: 18 lines → 8 lines = **10 lines saved**

---

### 6. Ensure* Methods Pattern (scope.ts) - **~50 lines savings**

**Problem**: Five similar methods (lines 463-498)
- `ensureCleanups`
- `ensureCallbacks`
- `ensureExecutors`
- `ensureErrors`
- `ensureResolutionChain`

**Solution**: Generic ensure function
```typescript
private ensure<K extends keyof ExecutorState>(
  state: ExecutorState,
  key: K,
  factory: () => NonNullable<ExecutorState[K]>
): NonNullable<ExecutorState[K]> {
  if (!state[key]) {
    state[key] = factory()
  }
  return state[key]!
}

private ensureCleanups = (state: ExecutorState) =>
  this.ensure(state, 'cleanups', () => new Set())
private ensureCallbacks = (state: ExecutorState) =>
  this.ensure(state, 'onUpdateCallbacks', () => new Set())
```

**Reduction**: 50 lines → 20 lines = **30 lines saved**

---

### 7. Multi Executor Functions (multi.ts) - **~40 lines savings**

**Problem**: `provide` and `derive` have 70% overlap (lines 112-159)

**Solution**: Extract common logic
```typescript
function createMultiProvider<T, K>(
  option: Multi.Option<K>,
  createExecutorFn: (key: K) => Core.Executor<T>,
  tags: Tag.Tagged[]
): Multi.MultiExecutor<T, K> {
  const poolId = tag(custom<null>(), {
    label: Symbol().toString(),
    default: null
  }) as Tag.Tag<null, true>

  const keyPool = new Map<unknown, Core.Executor<T>>()
  const createNewExecutor = (key: K) =>
    createValidatedExecutor(option, key, createExecutorFn)

  return createMultiExecutor(
    option, poolId, keyPool, createNewExecutor,
    [poolId(null), ...tags]
  )
}
```

**Reduction**: 47 lines → 25 lines = **22 lines saved**

---

### 8. Object.defineProperty Batch (tag.ts) - **~15 lines savings**

**Problem**: Multiple separate defineProperty calls (lines 231-267)

**Solution**: Use Object.defineProperties
```typescript
Object.defineProperties(fn, {
  key: { value: impl.key, writable: false, configurable: false },
  schema: { value: impl.schema, writable: false, configurable: false },
  label: { value: impl.label, writable: false, configurable: false },
  default: { value: impl.default, writable: false, configurable: false },
  [Symbol.toStringTag]: { get: () => impl[Symbol.toStringTag] },
  [inspectSymbol]: { value: (impl as any)[inspectSymbol].bind(impl) }
})
```

**Reduction**: 36 lines → 12 lines = **24 lines saved**

---

### 9. Flow Execution Logic (flow.ts & scope.ts) - **~100 lines savings**

**Problem**: Flow execution setup duplicated:
- flow.ts `executeSubflow` (lines 512-556)
- scope.ts `~executeFlow` (lines 1180-1246)

**Solution**: Extract to `internal/flow-execution-utils.ts`
```typescript
export function createFlowExecutor<S, I>(
  scope: Core.Scope,
  extensions: Extension.Extension[],
  flow: Core.Executor<Flow.Handler<S, I>>,
  input: I,
  options: {
    tags?: Tag.Tagged[]
    parent?: FlowContext
    abortController?: AbortController
  }
): Promised<S>
```

**Reduction**: 90 lines → 45 lines = **45 lines saved**

---

### 10. Promised Wrapper Methods (promises.ts) - **~30 lines savings**

**Problem**: Similar pattern in transformations:
- `map`, `switch`, `mapError`, `switchError`, `then`, `catch`, `finally`
- All wrap with executionDataPromise

**Solution**: Internal helper
```typescript
private transform<U>(
  transformer: (promise: Promise<T>) => Promise<U>
): Promised<U> {
  return Promised.create(
    transformer(this.promise),
    this.executionDataPromise
  )
}

map<U>(fn: (value: T) => U | Promise<U>): Promised<U> {
  return this.transform(p => p.then(fn))
}
```

**Reduction**: 45 lines → 25 lines = **20 lines saved**

---

### 11. Accessor Helper Extraction (scope.ts) - **~40 lines savings**

**Problem**: Repeated executor type checking
- getExecutor (lines 398-404)
- makeAccessor (lines 738-742)
- resolveExecutor (lines 629-679)

**Solution**: Extract to utility
```typescript
function unwrapExecutor(e: Core.UExecutor): Core.AnyExecutor {
  return (isLazyExecutor(e) || isReactiveExecutor(e) || isStaticExecutor(e))
    ? e.executor
    : e as Core.AnyExecutor
}

function isAccessorExecutor(e: Core.UExecutor): boolean {
  return isLazyExecutor(e) || isStaticExecutor(e)
}
```

**Reduction**: 25 lines → 15 lines = **10 lines saved**

---

### 12. Flow Context Method Consolidation - **~60 lines savings**

**Problem**: `exec` method has complex overload handling and duplicated execution logic

**Solution**: Simplify with better structure
- Extract journal execution to separate method
- Consolidate timeout handling
- Reduce overload complexity

**Reduction**: 115 lines → 75 lines = **40 lines saved**

---

## Additional Micro-optimizations

### 13. Inline Single-use Functions - **~30 lines**
- Several helper functions used once can be inlined
- Remove intermediate variables that aren't reused

### 14. Consolidate Type Assertions - **~20 lines**
- Multiple similar type casting patterns
- Create reusable type assertion helpers

### 15. Error Message Formatting - **~15 lines**
- Simplify formatMessage implementation
- Use template literals where applicable

---

## Implementation Priority

### Phase 1: High Impact, Low Risk (Days 1-2)
1. ✅ Error creation consolidation (errors.ts)
2. ✅ Extension wrapping extraction
3. ✅ Type guard generalization
4. ✅ Object.defineProperty batch
5. ✅ Tag cache extraction

**Expected savings**: ~145 lines

### Phase 2: Medium Impact (Days 3-4)
6. ✅ Ensure* methods pattern
7. ✅ Multi executor consolidation
8. ✅ Promised wrapper methods
9. ✅ Executor creation pattern
10. ✅ Accessor helper extraction

**Expected savings**: ~135 lines

### Phase 3: Complex Refactoring (Days 5-7)
11. ✅ Flow execution logic extraction
12. ✅ Flow context consolidation
13. ✅ Inline optimizations
14. ✅ Type assertion helpers

**Expected savings**: ~170 lines

---

## Total Expected Reduction

| Category | Savings |
|----------|---------|
| Error handling | 47 lines |
| Extension wrapping | 26 lines |
| Type guards | 16 lines |
| Executor creation | 15 lines |
| Tag utilities | 10 lines |
| Ensure methods | 30 lines |
| Multi functions | 22 lines |
| Object properties | 24 lines |
| Flow execution | 45 lines |
| Promised methods | 20 lines |
| Accessor helpers | 10 lines |
| Flow context | 40 lines |
| Micro-optimizations | 65 lines |
| **TOTAL** | **~370 lines (8%)** |

With additional careful refactoring: **~500-650 lines (11-14%)**

---

## Quality Improvements

Beyond LOC reduction:

1. **Maintainability**: Centralized logic easier to update
2. **Testability**: Extracted utilities easier to unit test
3. **Type Safety**: No reduction in type safety
4. **Performance**: No negative impact (some micro-improvements)
5. **Readability**: Less duplication = clearer intent
6. **API Surface**: No breaking changes

---

## Risk Assessment

### Low Risk (Can proceed immediately)
- Error consolidation
- Extension wrapping
- Type guards
- Property definitions
- Tag cache

### Medium Risk (Needs careful testing)
- Ensure methods
- Multi functions
- Promised methods
- Executor creation

### Higher Risk (Needs comprehensive testing)
- Flow execution extraction
- Flow context refactoring

---

## Testing Strategy

For each refactoring:

1. Run existing test suite: `pnpm -F @pumped-fn/core-next test`
2. Run typecheck: `pnpm -F @pumped-fn/core-next typecheck`
3. Run full typecheck: `pnpm -F @pumped-fn/core-next typecheck:full`
4. Verify examples: `pnpm -F @pumped-fn/examples typecheck`
5. Add new tests if extracting utilities
6. Check bundle size doesn't increase

---

## Implementation Notes

### Critical Requirements
- ✅ Zero breaking changes to public API
- ✅ Maintain 100% type safety
- ✅ All existing tests must pass
- ✅ No performance degradation
- ✅ Code remains self-documenting

### Non-Goals
- Don't sacrifice readability for LOC count
- Don't over-abstract (balance DRY with clarity)
- Don't remove helpful intermediate variables
- Don't inline complex logic just to save lines

---

## File-Specific Targets

| File | Current | Target | Reduction |
|------|---------|--------|-----------|
| scope.ts | 1,279 | 1,150 | 129 (10%) |
| flow.ts | 1,015 | 900 | 115 (11%) |
| errors.ts | 263 | 220 | 43 (16%) |
| tag.ts | 270 | 240 | 30 (11%) |
| promises.ts | 291 | 265 | 26 (9%) |
| multi.ts | 159 | 135 | 24 (15%) |
| executor.ts | 168 | 145 | 23 (14%) |

---

## Next Steps

1. Review this plan with team
2. Create feature branch: `refactor/code-reduction-2025-01`
3. Implement Phase 1 (low risk items)
4. Run full test suite + manual testing
5. Commit with detailed descriptions
6. Proceed to Phase 2
7. Update skill references if API signatures change
8. Update documentation if needed

---

## Success Metrics

- ✅ Reduce LOC by 8-14% (370-650 lines)
- ✅ All tests pass
- ✅ No type errors
- ✅ Examples still typecheck
- ✅ Bundle size unchanged or smaller
- ✅ No performance regression
- ✅ Improved code quality metrics (reduced complexity)

---

*Plan created*: 2025-11-10
*Target completion*: 2025-11-17
*Status*: Ready for implementation
