# ExecutionContext

ExecutionContext provides short-lived execution boundaries with explicit lifecycle management.

## Requirements

### Requirement: Context Creation

The Scope SHALL provide methods to create ExecutionContext instances.

#### Scenario: Create via scope.createExecution()

- **WHEN** `scope.createExecution(options)` is called
- **THEN** an ExecutionContext is returned
- **AND** the context requires manual `close()` call

#### Scenario: Create via scope.exec()

- **WHEN** `scope.exec(flow, input)` is called
- **THEN** an internal ExecutionContext is created
- **AND** the context is auto-closed when the flow completes

### Requirement: Context Lifecycle States

ExecutionContext SHALL have explicit lifecycle states: `active | closing | closed`.

#### Scenario: Initial state

- **WHEN** an ExecutionContext is created
- **THEN** its state is `active`

#### Scenario: State during close

- **WHEN** `ctx.close()` is called
- **THEN** state transitions to `closing` during drain
- **AND** state transitions to `closed` after drain completes

### Requirement: Close Method

ExecutionContext SHALL provide a `close(options?)` method for explicit lifecycle control.

#### Scenario: Graceful close (default)

- **WHEN** `ctx.close()` or `ctx.close({ mode: 'graceful' })` is called
- **THEN** the context is marked as closing (rejects new exec calls)
- **AND** all in-flight executions are awaited to settle
- **AND** child contexts are cascaded with graceful close
- **AND** state transitions to `closed`

#### Scenario: Abort close

- **WHEN** `ctx.close({ mode: 'abort' })` is called
- **THEN** the AbortController is triggered
- **AND** pending executions reject with AbortError
- **AND** child contexts are cascaded with abort close

#### Scenario: Exec after close throws

- **WHEN** `ctx.exec()` is called on a closing or closed context
- **THEN** `ExecutionContextClosedError` is thrown

#### Scenario: Multiple close calls are idempotent

- **WHEN** `ctx.close()` is called multiple times
- **THEN** the same promise is returned
- **AND** no additional work is performed

### Requirement: State Change Subscription

ExecutionContext SHALL provide `onStateChange(callback)` for state monitoring.

#### Scenario: Subscribe to state changes

- **WHEN** `ctx.onStateChange((state, prev) => ...)` is called
- **THEN** the callback is invoked on each state transition
- **AND** an unsubscribe function is returned

### Requirement: Hierarchical Context

ExecutionContext SHALL support parent-child relationships with data isolation.

#### Scenario: Child context creation

- **WHEN** `ctx.exec(flow, input)` creates a nested execution
- **THEN** a child ExecutionContext is created
- **AND** the child has a reference to the parent
- **AND** the child has its own isolated data map

#### Scenario: Parent data access

- **WHEN** a child context needs parent data
- **THEN** it can access via `ctx.parent.data`
- **AND** parent data is not automatically inherited

### Requirement: In-Flight Execution Tracking

ExecutionContext SHALL track all in-flight executions for lifecycle management.

#### Scenario: Track flow executions

- **WHEN** `ctx.exec(flow, input)` is called
- **THEN** the execution is tracked in the in-flight set
- **AND** removed when the execution settles

#### Scenario: Track parallel executions

- **WHEN** `ctx.parallel([...])` or `ctx.parallelSettled([...])` is called
- **THEN** the parallel operation is tracked as a single unit

## Source ADRs

- ADR-001: ExecutionContext explicit lifecycle with close()
- ADR-016: Hierarchical ExecutionContext with parent-child per exec
