---
"@pumped-fn/core-next": patch
---

Extract ExecutionContext as standalone primitive

- Add `ExecutionContext.Context` interface with lifecycle tracking
- Add `ExecutionContext.Details` for execution metadata
- Add `Scope.createExecution()` for creating execution contexts
- Consolidate Flow.Context and Flow.Execution around ExecutionContext
- Add tag inheritance through parent context chain
- Add `ExecutionOperation.executionContext` field for extensions
- Enable new patterns beyond Flow (streaming, long-running tasks)
- Maintain backward compatibility with Flow API
