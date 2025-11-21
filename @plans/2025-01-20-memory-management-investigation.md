# Memory Management Investigation

## Current Behavior

1. Each execution context creates new AccessorImpl instances
2. contextResolvedValue stored in accessor, not cleaned on context disposal
3. No accessor disposal mechanism exists
4. Accessors may persist after context disposal

## Questions to Investigate

1. Are accessors garbage collected when execution contexts are disposed?
2. Does contextResolvedValue prevent garbage collection?
3. What is typical accessor count in production scenarios?
4. Is there observable memory growth?

## Investigation Tasks

- [ ] Add memory profiling test
- [ ] Track accessor creation/disposal
- [ ] Measure memory with long-running contexts
- [ ] Compare memory usage before/after PR

## Decision Needed

Should we:
A. Add explicit accessor disposal (immediate fix)
B. Use WeakMap for context values (architectural change)
C. Accept current behavior if no measurable impact (defer)

**Status:** Investigation needed before implementation
