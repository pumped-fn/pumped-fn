# Pumped Go

A powerful dependency injection and reactive execution library for Go, inspired by pumped-fn.

## Features

- **Graph-based DI**: Declare dependencies explicitly, resolve lazily
- **Reactive Updates**: Automatic propagation of changes through dependency graph
- **Type-safe**: Full generic support with minimal casting
- **Controller Pattern**: Fine-grained lifecycle control (get, update, reload, release)
- **Tags**: Type-safe metadata system for executors and scopes
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

## License

MIT
