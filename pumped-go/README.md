# Pumped Go

A powerful dependency injection and reactive execution library for Go, inspired by pumped-fn.

## Features

- **Graph-based DI**: Declare dependencies explicitly, resolve lazily
- **Reactive Updates**: Automatic propagation of changes through dependency graph
- **Flow Execution**: Short-span operations with execution context trees and tracing
- **Type-safe**: Full generic support with minimal casting
- **Controller Pattern**: Fine-grained lifecycle control (get, update, reload, release)
- **Tags**: Type-safe metadata system for executors, scopes, and flows
- **Extensions**: Powerful middleware system for cross-cutting concerns
- **No IDs Required**: Executors are their own keys

## Installation

```bash
go get github.com/pumped-fn/pumped-go
```

## Quick Example

```go
package main

import (
    "fmt"
    pumped "github.com/pumped-fn/pumped-go"
)

func main() {
    scope := pumped.NewScope()

    // Define executors
    counter := pumped.Provide(func(ctx *pumped.ResolveCtx) (int, error) {
        return 0, nil
    })

    doubled := pumped.Derive1(
        pumped.Reactive(counter),
        func(ctx *pumped.ResolveCtx, counterCtrl *pumped.Controller[int]) (int, error) {
            count, _ := counterCtrl.Get()
            return count * 2, nil
        },
    )

    // Use accessors
    doubledAcc := scope.Accessor(doubled)
    val, _ := doubledAcc.Get()
    fmt.Printf("Result: %d\n", val) // 0

    // Update triggers reactivity
    counterAcc := scope.Accessor(counter)
    counterAcc.Update(5)

    val, _ = doubledAcc.Get()
    fmt.Printf("Result: %d\n", val) // 10
}
```

## Concepts

### Executors

Executors are units of computation with explicit dependencies:

```go
// No dependencies
config := pumped.Provide(func(ctx *pumped.ResolveCtx) (string, error) {
    return "config-value", nil
})

// With dependencies - receive controllers
service := pumped.Derive1(
    pumped.Static(config),
    func(ctx *pumped.ResolveCtx, configCtrl *pumped.Controller[string]) (*Service, error) {
        cfg, _ := configCtrl.Get()
        return &Service{config: cfg}, nil
    },
)
```

### Dependency Modes

- **Static**: Resolve once, cache forever (default)
- **Reactive**: Invalidate when dependency changes

```go
// This executor re-resolves when counter changes
reactive := pumped.Derive1(
    pumped.Reactive(counter),
    func(ctx *pumped.ResolveCtx, ctrl *pumped.Controller[int]) (int, error) {
        // ...
    },
)

// This executor doesn't re-resolve
static := pumped.Derive1(
    pumped.Static(counter),
    func(ctx *pumped.ResolveCtx, ctrl *pumped.Controller[int]) (int, error) {
        // ...
    },
)
```

### Controllers

All dependencies are passed as controllers for maximum flexibility:

```go
button := pumped.Derive1(
    pumped.Static(counter),
    func(ctx *pumped.ResolveCtx, counterCtrl *pumped.Controller[int]) (*Button, error) {
        return &Button{
            onClick: func() error {
                current, _ := counterCtrl.Get()      // Get value
                return counterCtrl.Update(current + 1) // Update
            },
        }, nil
    },
)
```

### Tags

Type-safe metadata for executors and scopes:

```go
versionTag := pumped.NewTag[string]("version")

executor := pumped.Provide(
    func(ctx *pumped.ResolveCtx) (int, error) { return 42, nil },
    pumped.WithTag(versionTag, "1.0.0"),
)

version, _ := versionTag.Get(executor)
```

### Extensions

Powerful middleware for cross-cutting concerns:

```go
logging := pumped.NewLoggingExtension()
metrics := pumped.NewMetricsExtension()

scope := pumped.NewScope(
    pumped.WithExtension(logging),
    pumped.WithExtension(metrics),
)
```

### Flows

Flows are short-span executable units with context trees and tracing:

```go
// Define long-running resources as executors
db := pumped.Derive1(config, func(ctx *pumped.ResolveCtx, cfg *pumped.Controller[*Config]) (*DB, error) {
    return NewDB(cfg.Get().DBHost)
})

// Define short-span operations as flows
fetchUser := pumped.Flow1(db,
    func(execCtx *pumped.ExecutionCtx, db *pumped.Controller[*DB]) (*User, error) {
        database, _ := db.Get()
        return database.QueryUser("123")
    },
    pumped.WithFlowTag(pumped.FlowName(), "fetchUser"),
)

// Execute flow with context
result, execNode, err := pumped.Exec(scope, context.Background(), fetchUser)

// Query execution tree
tree := scope.GetExecutionTree()
roots := tree.GetRoots()
for _, root := range roots {
    children := tree.GetChildren(root.ID)
    // Visualize execution tree
}
```

**Sub-flow execution:**

```go
parentFlow := pumped.Flow1(db, func(execCtx *pumped.ExecutionCtx, db *pumped.Controller[*DB]) (string, error) {
    // Execute sub-flows
    user, userCtx, _ := pumped.Exec1(execCtx, fetchUserFlow)
    orders, _, _ := pumped.Exec1(userCtx, fetchOrdersFlow)

    // Child contexts can read parent data via tags
    userID, _ := execCtx.Lookup(customTag)

    return fmt.Sprintf("User %s has %d orders", user, len(orders)), nil
})
```

**Tag-based data flow:**

```go
// Set data in parent flow
execCtx.Set(pumped.Input(), "user-123")

// Child flows can read upward (but not write)
userID, _ := childCtx.GetFromParent(pumped.Input())
userID, _ := childCtx.Lookup(pumped.Input()) // checks self, then parents, then scope
```

**Execution lifecycle:**

- Flows execute with `ExecutionCtx` (execution-specific context tree)
- Executors resolve with `ResolveCtx` (scope-level resolution)
- Extensions hook into flow lifecycle: `OnFlowStart`, `OnFlowEnd`, `OnFlowPanic`
- Execution tree automatically tracks all executions with tags

## Examples

See [examples/](./examples/) for complete working examples:

- `basic/` - Executor fundamentals with reactivity
- `health-monitor/` - Production-ready health monitoring service
- `order-processing/` - Flow execution with context trees
- `http-api/` - REST API with dependency injection
- `cli-tasks/` - CLI application with services

## License

MIT
