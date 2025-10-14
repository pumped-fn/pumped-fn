---
"@pumped-fn/core-next": patch
---

Updated all flow() creation methods to consistently return Flow.Flow<I, O> type instead of Core.Executor, providing better type inference and direct access to flow definition across all flow creation patterns
