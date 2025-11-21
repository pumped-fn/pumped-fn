# Per-Context Caching Investigation

## Current Behavior

1. Execution contexts bypass scope cache completely
2. Each resolution in same context re-executes
3. No memoization for expensive executors within context
4. Multiple flows using same tag = multiple resolutions

## Questions to Investigate

1. What is typical executor re-resolution frequency within same context?
2. Are there expensive executors commonly used in flows?
3. What is performance impact of cache bypass?
4. Is WeakMap-based per-context cache feasible?

## Investigation Tasks

- [ ] Add performance profiling test
- [ ] Measure resolution time for expensive executors
- [ ] Profile with/without per-context cache
- [ ] Design WeakMap cache strategy

## Options

A. WeakMap<ExecutionContext, Map<Executor, Value>> cache
B. Cache only specific executor types (lazy, static)
C. Add opt-in caching flag to resolve()
D. Accept current behavior (simplicity over performance)

**Status:** Investigation needed before implementation
