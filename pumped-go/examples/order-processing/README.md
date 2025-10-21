# Order Processing Example

Demonstrates flow execution with execution context trees and tracing.

## Concepts

This example shows:

1. **Executors for long-running resources** (database connections, config)
2. **Flows for short-span operations** (fetch user, fetch orders, process)
3. **Sub-flow execution** with parent-child context relationships
4. **Tag-based data flow** between flows
5. **Execution tree visualization** for debugging and tracing

## Architecture

```
Executors (Long-running):
├── Config (database host, API keys)
└── DB (database connection)

Flows (Short-span):
├── processOrder (root flow)
│   ├── fetchUser (sub-flow)
│   └── fetchOrders (sub-flow, uses data from parent)
```

## Running

```bash
go run .
```

## Output

```
2025/10/21 17:23:54 [req-001] Fetched user: User-123
2025/10/21 17:23:54 [req-001] Fetched 2 orders for user 123
2025/10/21 17:23:54 [req-001] Processed 2 orders for User-123

Result: Processed 2 orders for User-123
Flow Name: processOrder

Execution tree:
- processOrder [success] (ID: exec-1)
  - fetchUser [success] (ID: exec-2)
    - fetchOrders [success] (ID: exec-3)
```

## Key Patterns

### Executors vs Flows

**Use Executors for:**
- Database connections
- Service clients
- Configuration
- Caches
- Long-running resources

**Use Flows for:**
- HTTP request handlers
- Business logic operations
- Data transformations
- Short-lived computations

### Context Propagation

The example shows how `context.Context` flows through executions:

```go
ctx := context.WithValue(context.Background(), "requestID", "req-001")
result, execNode, err := pumped.Exec(scope, ctx, processOrderFlow)
```

Every flow and sub-flow can access the context:

```go
log.Printf("[%s] Processing...", execCtx.Context().Value("requestID"))
```

### Tag-based Data Flow

Parent flows can set data that children read:

```go
// Parent flow
execCtx.Set(pumped.Input(), "user-123")

// Child flow
userID, _ := childCtx.GetFromParent(pumped.Input())
```

This creates a natural data pipeline without global state.

### Execution Tree

The execution tree captures the complete execution hierarchy:

```go
tree := scope.GetExecutionTree()
roots := tree.GetRoots()

for _, root := range roots {
    children := tree.GetChildren(root.ID)
    // Traverse and visualize
}
```

Each node stores:
- Flow name
- Status (running/success/failed)
- Start/end times
- Input/output (via tags)
- Error information (if failed)
- Custom metadata (via tags)

## Use Cases

This pattern works well for:

1. **Web request handlers** - Each request is a flow, database queries are sub-flows
2. **Background jobs** - Job execution is a flow, tasks are sub-flows
3. **CLI commands** - Command execution is a flow, operations are sub-flows
4. **Data pipelines** - Pipeline run is a flow, transformations are sub-flows

The execution tree provides natural observability and debugging for all these scenarios.
