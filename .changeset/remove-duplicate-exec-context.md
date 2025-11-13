---
"@pumped-fn/core-next": patch
---

Fix duplicate ExecutionContext creation in Scope.~executeFlow

- Remove redundant executionContext creation in Scope.~executeFlow
- Use FlowContext as single ExecutionContext instance per Flow execution
- Remove executionContext field from Extension.ExecutionOperation type
- Remove executionContext field from Flow.Execution interface
- Update documentation to reflect Tag.Store-based extension API
