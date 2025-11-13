# Scenario: Error Tracing for Root Cause

## Purpose

Debug errors by tracing back through execution context hierarchy to find root cause.

## Prerequisites

- [02-error-propagation.md](./02-error-propagation.md)

## Diagram

```mermaid
flowchart TD
    Start([User Observes Error]) --> GetExec[Get FlowExecution object]
    GetExec --> CheckStatus{Check execution.status}

    CheckStatus -->|failed| GetCtx[Access execution.ctx]
    CheckStatus -->|completed| NotError[Error elsewhere]
    CheckStatus -->|cancelled| CheckAbort[Check abort reason]

    GetCtx --> HasError{ctx.details.error exists?}
    HasError -->|Yes| InspectError[Inspect error object]
    HasError -->|No| CheckParent{Has parent context?}

    CheckParent -->|Yes| TraverseUp[ctx = ctx.parent]
    TraverseUp --> HasError
    CheckParent -->|No| NoErrorFound[Error not in context tree]

    InspectError --> CheckType{Error type?}
    CheckType -->|FactoryExecutionError| FactoryFailed[Flow factory threw<br/>Check factory implementation]
    CheckType -->|DependencyResolutionError| DepFailed[Dependency failed to resolve<br/>Check dependency chain]
    CheckType -->|ExecutorResolutionError| ExecutorFailed[Executor setup failed<br/>Check executor configuration]
    CheckType -->|Other| CustomError[Custom error<br/>Check business logic]

    FactoryFailed --> FindSource[Check error stack trace]
    DepFailed --> FindSource
    ExecutorFailed --> FindSource
    CustomError --> FindSource

    FindSource --> Root([Root cause identified])

    CheckAbort --> AbortReason{Abort reason?}
    AbortReason -->|Timeout| TimeoutRoot[Flow exceeded timeout<br/>Check flow duration]
    AbortReason -->|User cancelled| UserCancel[Explicit cancellation<br/>Check abort controller]
    AbortReason -->|Parent aborted| ParentAbort[Parent context aborted<br/>Trace parent chain]

    style Start fill:#e1f5ff
    style Root fill:#d4edda
    style FactoryFailed fill:#f8d7da
    style DepFailed fill:#fff3cd
    style ExecutorFailed fill:#f8d7da
```

## Debugging Workflow

```mermaid
sequenceDiagram
    participant Dev as Developer
    participant Exec as FlowExecution
    participant Ctx as ExecutionContext
    participant Scope as Scope

    Note over Dev: Error observed in application

    Dev->>Exec: Check execution.status
    Exec-->>Dev: "failed"

    Dev->>Exec: Access execution.ctx
    Exec-->>Dev: ExecutionData

    Dev->>Ctx: Check details.error
    Ctx-->>Dev: Error object

    Dev->>Dev: Inspect error.message<br/>and error.stack

    alt Error in this context
        Dev->>Dev: Found root cause
    else Error from parent
        Dev->>Ctx: Access ctx.parent
        Ctx-->>Dev: Parent ExecutionContext
        Dev->>Dev: Repeat inspection
    end

    Dev->>Scope: Check executor state
    Scope-->>Dev: ExecutorState with value

    Note over Dev: Root cause identified
```

## Key Points

- **ExecutionContext Chain**: Follow `parent` property to traverse hierarchy (execution-context.ts:7)
- **Error Storage**: Errors stored in `details.error` (execution-context.ts:32)
- **Status Tracking**: Use `execution.status` to determine failure type (flow-execution.ts:47)
- **Error Types**: Framework defines specific error types (types.ts, errors.ts)

## Code References

- `packages/next/src/execution-context.ts:5-55` - ExecutionContext structure and parent chain
- `packages/next/src/flow-execution.ts:47-50` - status property
- `packages/next/src/types.ts` - error type definitions
- `packages/next/src/errors.ts` - error classes

## Related Scenarios

- [02-error-propagation.md](./02-error-propagation.md) - how errors propagate
- [01-flow-lifecycle-happy-path.md](./01-flow-lifecycle-happy-path.md) - normal execution context

## Common Issues

- **Error not in ctx**: Error may have been caught by extension handler
- **Parent chain incomplete**: Context created without proper parent reference
- **Wrong execution object**: Ensure inspecting correct FlowExecution instance
