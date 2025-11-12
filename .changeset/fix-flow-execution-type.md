---
"@pumped-fn/core-next": patch
---

Fix Flow.Execution type references in scope implementation

Replace incorrect Flow.FlowExecution type with Flow.Execution in all scope.ts method signatures and internal tracking. Resolves type errors in exec method overloads.
