# Scenario: Error Propagation and Handling

## Purpose

Understand how errors propagate through execution stack and how cleanup behaves during errors.

## Prerequisites

- [01-flow-lifecycle-happy-path.md](./01-flow-lifecycle-happy-path.md)

## Diagram

```mermaid
sequenceDiagram
    participant User as User Code
    participant Scope as Scope
    participant Factory as Flow Factory
    participant ExecCtx as ExecutionContext
    participant Cleanup as Cleanup System
    participant Extension as Error Extensions

    User->>Scope: resolve(flowExecutor)
    Scope->>Factory: execute(deps)

    rect rgb(255, 200, 200)
        Note over Factory: Error Thrown
        Factory--xExecCtx: throw new Error("...")
        ExecCtx->>ExecCtx: details.error = error
        ExecCtx->>ExecCtx: end() - set completedAt
    end

    rect rgb(200, 220, 255)
        Note over Cleanup: Cleanup Still Executes
        Scope->>Cleanup: triggerCleanup(executor)

        loop Each Cleanup (LIFO)
            Cleanup->>Cleanup: await cleanup()

            alt Cleanup Throws
                Cleanup--xExtension: CleanupError
                Extension->>Extension: onError handler
                Note over Extension: Logs but doesn't<br/>stop other cleanups
            else Cleanup Success
                Cleanup->>Cleanup: continue to next
            end
        end
    end

    Scope->>Extension: triggerError(error)

    alt Has Error Handler
        Extension->>Extension: onError(error, context)
        Extension-->>Scope: handled
    else No Handler
        Scope--xUser: throw error
    end
```

## State Chart: Error States

```mermaid
stateDiagram-v2
    [*] --> Pending
    Pending --> Executing: resolve()
    Executing --> Completed: success
    Executing --> Failed: error thrown
    Executing --> Cancelled: abort signal

    Completed --> Cleaning: invalidation
    Failed --> Cleaning: cleanup always runs
    Cancelled --> Cleaning: cleanup always runs

    Cleaning --> Disposed: cleanups complete
    Cleaning --> Disposed: cleanup errors logged

    Disposed --> [*]

    note right of Failed
        Cleanup guaranteed
        even on failure
    end note

    note right of Cleaning
        LIFO order
        errors logged
        continues to next
    end note
```

## Key Points

- **Cleanup Guarantee**: Cleanups execute even when flow throws (scope.ts:566-574)
- **Error Isolation**: Cleanup errors logged but don't stop other cleanups
- **Extension Hooks**: Extensions can intercept via `onError` handler
- **Execution Context**: Error stored in `details.error` before cleanup (execution-context.ts:82, 91)

## Code References

- `packages/next/src/scope.ts:566-574` - cleanup execution regardless of error
- `packages/next/src/execution-context.ts:81-94` - error capture and context ending
- `packages/next/src/scope.ts:633` - triggerError via extensions

## Related Scenarios

- [01-flow-lifecycle-happy-path.md](./01-flow-lifecycle-happy-path.md) - normal execution
- [04-error-tracing-root-cause.md](./04-error-tracing-root-cause.md) - debugging errors

## Common Issues

- **Cleanup not running after error**: Check if error thrown before cleanup registration
- **Error swallowed**: Extension error handler may be catching without re-throwing
- **Cleanup errors hidden**: Cleanup errors logged to console, check stderr
