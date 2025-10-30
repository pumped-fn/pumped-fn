# Tag Lookup Performance Analysis - @pumped-fn/core-next

## Executive Summary

**Performance Issue**: O(n*m) complexity on tag lookups via linear `.find()` search through tags arrays.

**Impact**: Medium priority - affects every Flow context operation but typical tag arrays are small (3-7 tags).

**Recommendation**: Implement lazy Map-based caching with WeakMap at Source level.

---

## 1. Current Implementation Analysis

### 1.1 Core Lookup Function (tag.ts:25-42)

```typescript
function extract<T>(
  source: Tag.Source,
  key: symbol,
  schema: StandardSchemaV1<T>
): T | undefined {
  if (source === null || source === undefined) {
    return undefined;
  }

  if (isStore(source)) {
    const value = source.get(key);  // O(1) for Map-based stores
    return value === undefined ? undefined : validate(schema, value);
  }

  const tags = Array.isArray(source) ? source : ((source as any).tags ?? []);
  const tagged = tags.find((t: Tag.Tagged) => t.key === key);  // ⚠️ O(n) LINEAR SEARCH
  return tagged ? validate(schema, tagged.value) : undefined;
}
```

**Problem**: `tags.find()` performs linear search through entire array on every lookup.

### 1.2 Lookup Call Sites

#### Flow.ts - High Frequency Lookups

**Per Flow Execution** (counted from flow.ts analysis):
- `initializeExecutionContext`: 4 lookups (depth, flowName, parentFlowName, isParallel)
- `run()`: 2 lookups per call (flowName, depth)
- `exec()`: 3 lookups per subflow (flowName, depth, parentFlowName)
- `parallel()`: 2 lookups (flowName, depth)
- `executeWithExtensions`: 4 lookups (flowName, depth, isParallel, parentFlowName)

**Estimated lookups per typical Flow**:
- Simple flow: ~8-12 lookups
- Flow with 2 subflows: ~20-30 lookups
- Flow with journal + parallel: ~30-50 lookups

#### FlowContext.get() - User-Facing API (flow.ts:209-218)

```typescript
if (this.tags && typeof key === "symbol") {
  const tagged = this.tags.find((m: Tag.Tagged) => m.key === key);  // ⚠️ O(n)
  if (tagged) {
    return tagged.value;
  }
}
```

Falls back to parent context, creating O(n*m) where:
- n = tags array length
- m = context hierarchy depth

---

## 2. Typical Tags Array Size Distribution

### 2.1 Common Scenarios

**Scope-level tags** (from examples/flow-composition.ts):
```typescript
createScope({
  tags: [appConfig({ port: 3000, env: 'dev', dbHost: 'localhost' })]
})
// Tags count: 1
```

**Flow-level tags** (from flow.ts:39-55):
```typescript
const flowMeta = {
  depth: tag(..., { label: "flow.depth", default: 0 }),
  flowName: tag(..., { label: "flow.name" }),
  parentFlowName: tag(..., { label: "flow.parentName" }),
  isParallel: tag(..., { label: "flow.isParallel", default: false }),
  journal: tag(..., { label: "flow.journal" })
}
// Tags count: 5
```

**Executor tags** (from executor.ts:12-26):
```typescript
createExecutor(factory, dependencies, tags)
// Tags typically: 1-3 tags (flowDefinitionMeta + user tags)
```

**Distribution estimate**:
- 70%: 1-3 tags (simple executors)
- 25%: 4-7 tags (Flow contexts)
- 5%: 8-15 tags (complex compositions)

**Average**: 3-5 tags per Source

---

## 3. O(n*m) Complexity Proof

### 3.1 Real Scenario: Nested Flow with 3 levels

```typescript
// Level 0: Root context with scope tags
const scope = createScope({ tags: [appConfig()] })  // 1 tag

// Level 1: Parent flow
flow.execute(parentFlow, input, {
  scope,
  executionTags: [customTag1(), customTag2()]  // 2 tags
})

// Level 2: Child flow via ctx.exec()
// Creates new FlowContext with parent chain
// Level 3: Grandchild flow
```

**Lookup cost for `ctx.get(someTag)` in grandchild**:
1. Search current context tags (5 flow meta tags): O(5)
2. Search parent tags (2 custom tags): O(2)
3. Search grandparent tags (1 scope tag): O(1)
4. Total: O(8) = O(n*m) where n=avg 3 tags, m=3 depth

**Per-flow operation cost**:
- 12 lookups/flow × 3 contexts × 3 avg tags = **108 linear searches**
- Each search compares symbols via `t.key === key` (O(1) comparison)
- Total complexity: O(nm) = O(12 × 3 × 3) = **O(108)** operations

### 3.2 Hot Path Identification

**Hottest paths** (ordered by frequency):
1. `FlowContext.get(flowMeta.depth)` - called on every flow operation
2. `FlowContext.find(flowMeta.flowName)` - called for logging/tracking
3. `FlowContext.get(flowMeta.isParallel)` - called in extensions
4. User-facing `ctx.get(customTag)` - variable frequency

**NOT a bottleneck** because:
- Symbol equality (`===`) is O(1)
- Small array sizes (3-7 items)
- Linear search on small arrays faster than Map for n < 10
- Lookups not in tight loops (per-flow, not per-iteration)

**COULD become bottleneck** if:
- Large tag arrays (>15 tags)
- Deep context hierarchies (>5 levels)
- High-frequency lookups in extensions
- Future: Tag-based middleware chains

---

## 4. Tag Source Types Analysis

### 4.1 Three Source Types

#### Store (Map-based) - Already O(1)
```typescript
interface Store {
  get(key: unknown): unknown;
  set(key: unknown, value: unknown): unknown | undefined;
}
```
Used by: `FlowContext.contextData` (Map)
Performance: **Already optimal** (Map.get is O(1))

#### Container (Object with tags array)
```typescript
interface Container {
  tags?: Tagged[];
}
```
Used by: Executors, FlowContext, Scope
Performance: **Linear search** on `tags` array

#### Plain Tagged[] Array
```typescript
type Source = Store | Container | Tagged[];
```
Used by: Direct tag collections
Performance: **Linear search**

### 4.2 Mutability Analysis

**Tags are APPEND-ONLY after creation:**

From executor.ts:5-27:
```typescript
createExecutor(factory, dependencies, tags: Tag.Tagged[] | undefined)
```
Tags passed at construction, never mutated.

From flow.ts:147-156:
```typescript
constructor(scope, extensions, tags?, parent?) {
  this.tags = tags;  // Assigned once, never modified
}
```

From scope.ts:448-459:
```typescript
constructor(options?: ScopeOption) {
  if (options?.tags) {
    this.tags = options.tags;  // Assigned once
  }
}
```

**Conclusion**: Tags are **immutable** after Source creation → **Safe to cache**.

---

## 5. Caching Strategy Proposals

### 5.1 Strategy A: WeakMap + Lazy Map Creation

**Implementation**:
```typescript
// Global cache: Source → Map<symbol, value>
const tagCacheMap = new WeakMap<Tag.Source, Map<symbol, unknown>>();

function extract<T>(
  source: Tag.Source,
  key: symbol,
  schema: StandardSchemaV1<T>
): T | undefined {
  if (source === null || source === undefined) {
    return undefined;
  }

  if (isStore(source)) {
    const value = source.get(key);
    return value === undefined ? undefined : validate(schema, value);
  }

  // Check cache first
  let cache = tagCacheMap.get(source);
  if (!cache) {
    // Build cache on first access
    const tags = Array.isArray(source) ? source : ((source as any).tags ?? []);
    cache = new Map<symbol, unknown>();
    for (const tagged of tags) {
      cache.set(tagged.key, tagged.value);
    }
    tagCacheMap.set(source, cache);
  }

  const value = cache.get(key);
  return value === undefined ? undefined : validate(schema, value);
}
```

**Pros**:
- O(1) lookup after first access
- Automatic garbage collection (WeakMap)
- Zero memory overhead if tags never accessed
- No API changes required

**Cons**:
- First lookup still O(n) to build cache
- Memory overhead: ~40 bytes/tag + Map overhead
- WeakMap lookup has slight overhead vs direct Map

**Memory Cost**:
- Map object: ~100 bytes
- Per entry: ~40 bytes (key + value pointers)
- Example: 5 tags = 100 + 5×40 = **300 bytes per Source**

### 5.2 Strategy B: Precomputed Cache at Construction

**Implementation**:
```typescript
// Add optional cache field to Container
interface Container {
  tags?: Tagged[];
  __tagCache?: Map<symbol, unknown>;  // Private field
}

// Modify executor creation
export function createExecutor<T>(
  factory, dependencies, tags: Tag.Tagged[] | undefined
): Core.Executor<T> {
  const tagCache = tags ? buildTagMap(tags) : undefined;
  
  const executor = {
    [executorSymbol]: "main",
    factory, dependencies,
    tags,
    __tagCache: tagCache  // Precompute
  };
  // ...
}

function extract<T>(source, key, schema): T | undefined {
  // ...
  const cache = (source as any).__tagCache;
  if (cache) {
    const value = cache.get(key);
    return value === undefined ? undefined : validate(schema, value);
  }
  
  // Fallback to linear search for uncached sources
  const tags = Array.isArray(source) ? source : ((source as any).tags ?? []);
  const tagged = tags.find((t: Tag.Tagged) => t.key === key);
  return tagged ? validate(schema, tagged.value) : undefined;
}
```

**Pros**:
- O(1) lookup always (no first-access penalty)
- No WeakMap overhead
- Explicit opt-in via `__tagCache`

**Cons**:
- Immediate memory cost (even if never used)
- Requires changes to executor/Container creation
- Cache invalidation if tags mutate (currently impossible)

### 5.3 Strategy C: Symbol.for() Global Registry

**Current usage** (tag.ts:112):
```typescript
this.key = options?.label ? Symbol.for(options.label) : Symbol();
```

**Optimization**:
Labels like `"flow.depth"` create global symbols → Could use Map keyed by label string.

**NOT RECOMMENDED**:
- Only works for labeled tags
- Anonymous tags (majority) use unique symbols
- Breaks encapsulation
- Marginal benefit

---

## 6. Performance Benchmark Estimates

### 6.1 Current Performance (Linear Search)

**Assumptions**:
- 5 tags average
- 12 lookups per flow
- 3-level context hierarchy

**Cost per lookup**:
- 5 symbol comparisons × 1ns = 5ns
- Total per flow: 12 × 5ns = 60ns

**NOT A BOTTLENECK**: 60ns negligible compared to:
- Promise resolution: ~1-10μs
- Function calls: ~100ns
- Validation: ~500ns

### 6.2 With WeakMap Cache

**Cost per lookup**:
- First access: O(n) = 5 comparisons = 5ns + Map creation ~100ns
- Subsequent: Map.get() = ~10ns

**Speedup**: Minimal (10ns vs 5ns per lookup after warmup)

### 6.3 Real-World Impact

**When caching helps**:
- Extensions doing heavy tag lookups (10+ tags, 100+ lookups)
- Future: Tag-based routing/middleware (1000+ lookups)
- Analytics/logging extensions reading flowMeta repeatedly

**Current state**: Premature optimization for typical use cases.

---

## 7. Recommendations

### 7.1 Immediate Action: NONE

**Reasoning**:
1. Current performance acceptable for typical workloads
2. Small tag arrays (3-7) make linear search competitive
3. No user-reported performance issues
4. Implementation complexity not justified by gains

### 7.2 Monitor These Signals

Implement caching IF you observe:
- Tag arrays regularly >10 tags
- Context hierarchies >5 levels
- Extensions doing >50 tag lookups per flow
- Profiling shows `extract()` >5% of execution time

### 7.3 Future-Proof Design

**Add caching hook WITHOUT changing API**:

```typescript
// tag.ts - Add private cache accessor
const ENABLE_TAG_CACHE = process.env.PUMPED_TAG_CACHE === 'true';

function extract<T>(...) {
  // Existing code unchanged
  if (ENABLE_TAG_CACHE) {
    return extractCached(source, key, schema);
  }
  return extractLinear(source, key, schema);
}
```

**Feature flag approach**:
- Default: OFF (current behavior)
- Opt-in: `PUMPED_TAG_CACHE=true` for benchmarking
- Future: Auto-enable if tag count >10

### 7.4 Recommended Implementation (If Needed)

**Use Strategy A (WeakMap + Lazy Cache)**:

1. Add to tag.ts:
```typescript
const tagCacheMap = new WeakMap<Tag.Source, Map<symbol, unknown>>();

function buildTagCache(tags: Tag.Tagged[]): Map<symbol, unknown> {
  const map = new Map<symbol, unknown>();
  for (const tagged of tags) {
    map.set(tagged.key, tagged.value);
  }
  return map;
}

function extractCached<T>(
  source: Tag.Source,
  key: symbol,
  schema: StandardSchemaV1<T>
): T | undefined {
  if (source === null || source === undefined) return undefined;
  
  if (isStore(source)) {
    const value = source.get(key);
    return value === undefined ? undefined : validate(schema, value);
  }

  let cache = tagCacheMap.get(source);
  if (!cache) {
    const tags = Array.isArray(source) ? source : ((source as any).tags ?? []);
    cache = buildTagCache(tags);
    tagCacheMap.set(source, cache);
  }

  const value = cache.get(key);
  return value === undefined ? undefined : validate(schema, value);
}
```

2. Update `extract()` and `collect()` to use cache
3. Add tests verifying cache correctness
4. Benchmark before/after with realistic workloads

---

## 8. Backward Compatibility

**All strategies maintain 100% backward compatibility**:
- No API changes
- No behavior changes
- Pure internal optimization
- Existing tests pass unchanged

**Migration**: None required - drop-in replacement.

---

## 9. Testing Strategy

### 9.1 Correctness Tests

```typescript
describe("Tag Cache", () => {
  test("cache returns same value as linear search", () => {
    const tag1 = tag(custom<string>(), { label: "a" });
    const tag2 = tag(custom<number>(), { label: "b" });
    const tags = [tag1("hello"), tag2(42)];
    
    // Compare cached vs uncached
    expect(extractCached(tags, tag1.key, tag1.schema))
      .toBe(extract(tags, tag1.key, tag1.schema));
  });

  test("cache handles undefined lookups", () => {
    const tag1 = tag(custom<string>());
    const tag2 = tag(custom<string>());
    const tags = [tag1("hello")];
    
    expect(extractCached(tags, tag2.key, tag2.schema)).toBeUndefined();
  });

  test("WeakMap allows garbage collection", () => {
    let tags: Tag.Tagged[] | null = [tag(custom<string>())("value")];
    const key = tags[0].key;
    
    extractCached(tags, key, custom<string>());
    const weakRef = new WeakRef(tags);
    tags = null;
    
    // Force GC (implementation-dependent)
    globalThis.gc?.();
    
    expect(weakRef.deref()).toBeUndefined();
  });
});
```

### 9.2 Performance Tests

```typescript
import { performance } from "perf_hooks";

describe("Tag Performance", () => {
  test("cache speedup on repeated lookups", () => {
    const tags = Array.from({ length: 20 }, (_, i) => 
      tag(custom<number>(), { label: `tag${i}` })(i)
    );
    const lastTag = tags[19];
    
    // Warmup cache
    extractCached(tags, lastTag.key, lastTag.schema);
    
    // Benchmark
    const iterations = 10000;
    
    const linearStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      extract(tags, lastTag.key, lastTag.schema);
    }
    const linearTime = performance.now() - linearStart;
    
    const cachedStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      extractCached(tags, lastTag.key, lastTag.schema);
    }
    const cachedTime = performance.now() - cachedStart;
    
    console.log(`Linear: ${linearTime}ms, Cached: ${cachedTime}ms`);
    expect(cachedTime).toBeLessThan(linearTime);
  });
});
```

---

## 10. Conclusion

### Current State
- ✅ Tag lookup is O(n) linear search
- ✅ Typical n=3-5 tags makes this acceptable
- ✅ No current performance bottleneck
- ✅ Tags are immutable (safe to cache)

### Performance Impact
- **Current**: ~5ns per lookup (5 comparisons)
- **With cache**: ~10ns per lookup (Map overhead)
- **Speedup**: **Not meaningful** for small arrays
- **Break-even**: n > 10 tags

### Recommendation
**Defer implementation** until evidence shows need:
1. Monitor production workloads
2. Profile if performance issues arise
3. Implement Strategy A (WeakMap) if needed
4. Use feature flag for gradual rollout

### Next Steps IF Implementing
1. Add WeakMap cache to `extract()` and `collect()`
2. Add benchmark suite
3. Add feature flag `PUMPED_TAG_CACHE`
4. Document in CHANGELOG as "internal optimization"
5. Update SKILL.md with caching behavior

---

## Appendix: Code Locations

**Tag lookup implementation**:
- packages/next/src/tag.ts:25-42 (`extract`)
- packages/next/src/tag.ts:44-56 (`collect`)
- packages/next/src/tag.ts:119-133 (TagImpl.get/find)

**Hot paths**:
- packages/next/src/flow.ts:184-192 (initializeExecutionContext)
- packages/next/src/flow.ts:209-218 (FlowContext.get)
- packages/next/src/flow.ts:260-261 (run method)
- packages/next/src/flow.ts:556-559 (executeWithExtensions)

**Tag creation**:
- packages/next/src/executor.ts:5-27 (createExecutor)
- packages/next/src/flow.ts:39-55 (flowMeta tags)
- packages/next/src/scope.ts:441 (scope.tags)

**Tests**:
- packages/next/tests/tag.test.ts (comprehensive tag tests)
- examples/http-server/flow-composition.ts (real usage)
