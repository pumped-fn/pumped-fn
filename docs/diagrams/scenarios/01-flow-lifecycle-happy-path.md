# Scenario: Flow Lifecycle Happy Path

## Purpose

Understand normal flow execution from creation through execution, context building, and cleanup.

## Prerequisites

Basic understanding of reactive programming and dependency injection.

## Diagram

```mermaid
sequenceDiagram
    participant User as User Code
    participant Scope as Scope
    participant Accessor as Accessor
    participant Factory as Flow Factory
    participant ExecCtx as ExecutionContext
    participant Cleanup as Cleanup System

    User->>Scope: resolve(flowExecutor)
    Scope->>Accessor: create accessor
    Accessor->>Accessor: processReplacer()

    alt Immediate Value
        Accessor->>Accessor: queueMicrotask delay
        Accessor->>Accessor: store resolved value
    else Factory Execution
        Accessor->>ExecCtx: create child context
        ExecCtx->>ExecCtx: inherit parent tags
        Accessor->>Factory: execute(dependencies)
        Factory->>Factory: business logic

        opt Register Cleanup
            Factory->>Cleanup: controller.cleanup(fn)
            Cleanup->>Cleanup: add to Set (LIFO)
        end

        Factory-->>Accessor: return result
        Accessor->>Accessor: cache result
    end

    Accessor-->>Scope: Promised<T>
    Scope-->>User: resolved value

    Note over User,Cleanup: Lifecycle States: Pending → Executing → Completed

    alt Reactive Invalidation
        Scope->>Cleanup: triggerCleanup(executor)
        Cleanup->>Cleanup: reverse() - LIFO order
        loop Each Cleanup Function
            Cleanup->>Cleanup: await cleanup()
        end
        Note over Cleanup: Cleanups run in reverse<br/>registration order
    end
```

## Key Points

- **Context Hierarchy**: ExecutionContext inherits tags from parent via `tagStore.get(key)` (execution-context.ts:46)
- **Cleanup Order**: LIFO (Last In First Out) - `Array.from(state.cleanups.values()).reverse()` (scope.ts:569)
- **Immediate Values**: Queued via microtask for consistency (scope.ts:86)
- **State Caching**: Results cached in `ExecutorState` (scope.ts:30-40)

## Code References

- `packages/next/src/scope.ts:566-574` - cleanup execution in reverse order
- `packages/next/src/execution-context.ts:57-98` - ExecutionContext.exec() lifecycle
- `packages/next/src/scope.ts:82-97` - immediate value handling
- `packages/next/src/scope.ts:389-393` - cleanup registration

## Related Scenarios

- [02-error-propagation.md](./02-error-propagation.md) - what happens when flow throws
- [03-parallel-execution-order.md](./03-parallel-execution-order.md) - timing of concurrent flows

## Common Issues

- **Cleanup not running**: Check if executor was actually resolved (cached state exists)
- **Unexpected execution order**: Immediate values have microtask delay
- **Context data missing**: Parent context must have tag set before child creation
