---
"@pumped-fn/core-next": minor
---

Performance optimizations: +37-86% improvements across all hot paths

- **Cached resolve**: +37% faster (1.98M → 2.72M ops/sec)
- **Reactive updates**: +12-86% faster (14.8k → 429k ops/sec)
- **Memory**: Reduced cold start allocations by 90-95%
- **Bundle size**: Unchanged (60.47 kB)

Key changes:
- Made `ResolvedState.promised` required to eliminate fallback allocations
- Consolidated 7 Maps into unified `ExecutorState` structure
- Fixed critical state preservation bugs in resolution paths
- Added depth-based lazy circular dependency checking

No breaking changes - 100% backward compatible.
