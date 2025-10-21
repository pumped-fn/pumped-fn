# Pumped Go - Design Document

## Overview

Pumped Go is a Go port of the TypeScript pumped-fn library, providing graph-based dependency injection with reactive updates.

## Core Concepts

### 1. Executors

Executors are units of computation with explicit dependencies.

```go
// No dependencies
config := pumped.Provide(func(ctx *pumped.ResolveCtx) (string, error) {
    return "value", nil
})

// With dependencies - always receive controllers
service := pumped.Derive1(
    pumped.Static(config),
    func(ctx *pumped.ResolveCtx, configCtrl *pumped.Controller[string]) (*Service, error) {
        cfg, _ := configCtrl.Get()
        return &Service{config: cfg}, nil
    },
)
```

### 2. Dependency Modes

**Static** (default): Resolve once, cache forever
```go
pumped.Static(executor)
```

**Reactive**: Invalidate when dependency changes
```go
pumped.Reactive(executor)
```

### 3. Controllers

All dependencies are passed as controllers for maximum flexibility:

- `Get()` - Resolve and return value
- `Peek()` - Get cached value without resolving
- `Update(val)` - Update value and trigger reactivity
- `Release()` - Invalidate cache
- `Reload()` - Release + Get
- `IsCached()` - Check cache status

### 4. Scope

The scope manages executor lifecycle:

```go
scope := pumped.NewScope(
    pumped.WithScopeTag(envTag, "production"),
    pumped.WithExtension(loggingExt),
)
defer scope.Dispose()
```

Key functions:
- `Accessor(scope, executor)` - Create controller
- `Resolve(scope, executor)` - Resolve value
- `Update(scope, executor, value)` - Update and propagate

### 5. Tags

Type-safe metadata for executors and scopes:

```go
versionTag := pumped.NewTag[string]("version")

executor := pumped.Provide(
    func(ctx *pumped.ResolveCtx) (int, error) { return 42, nil },
    pumped.WithTag(versionTag, "1.0.0"),
)

version, ok := versionTag.Get(executor)
```

### 6. Extensions

Middleware for cross-cutting concerns:

```go
type Extension interface {
    Name() string
    Init(scope *Scope) error
    Wrap(ctx context.Context, next func() (any, error), op *Operation) (any, error)
    OnError(err error, op *Operation, scope *Scope)
    Dispose(scope *Scope) error
}
```

## Design Decisions

### TypeScript vs Go Differences

| Feature | TypeScript | Go |
|---------|-----------|-----|
| Type Parameters | On everything | Standalone functions for Resolve/Accessor/Update |
| Casting | Minimal with generics | One controlled cast point in framework |
| Executor Keys | Executor object itself | Executor pointer |
| Dependency Injection | Auto-injection via factory params | Controllers passed explicitly |
| Reactivity | `.reactive` property | `Reactive(exec)` wrapper |

### Why Controllers for Everything?

Initially considered passing resolved values directly, but controllers provide:
- Flexibility to read, update, reload, or check cache
- Uniform API regardless of dependency mode
- Ability to update other executors (event handlers)
- Explicit control over when resolution happens

### Why Standalone Functions?

Go doesn't support type parameters on methods (as of Go 1.23), so:
- `scope.Resolve[T](exec)` → `Resolve[T](scope, exec)`
- `scope.Accessor[T](exec)` → `Accessor[T](scope, exec)`
- `scope.Update[T](exec, val)` → `Update[T](scope, exec, val)`

This maintains type safety while working with Go's constraints.

### Why No IDs?

Unlike some DI frameworks, executors don't need string IDs:
- Executor pointers serve as unique keys
- No name conflicts
- Refactoring-friendly (rename variables without breaking)
- Type-safe at compile time

## Performance Considerations

- **Lazy Resolution**: Executors only resolve when accessed
- **Caching**: Values cached per scope
- **Reactive Invalidation**: Only reactive dependents re-resolve
- **Graph Tracking**: Upstream/downstream maps for O(1) lookups
- **Thread Safety**: RWMutex for concurrent access

## Extension Examples

Built-in extensions in `extensions/`:
- `LoggingExtension` - Logs all operations with timing
- More to come: caching, metrics, tracing, retry logic

## Future Enhancements

Potential additions:
- Flows (short-lived operations with context isolation)
- Multi executors (parameterized factories)
- Lazy/Static accessor variants
- More extension examples (circuit breaker, retry, distributed cache)
- Code generation tools for less boilerplate

## Comparison with TypeScript Version

| Feature | TypeScript | Go | Status |
|---------|-----------|-----|--------|
| Core Executors | ✅ | ✅ | Complete |
| Tags | ✅ | ✅ | Complete |
| Reactive | ✅ | ✅ | Complete |
| Controller | ✅ | ✅ | Complete |
| Extensions | ✅ | ✅ | Complete |
| Flows | ✅ | ❌ | Planned |
| Multi | ✅ | ❌ | Planned |
| Lazy/Static | ✅ | ❌ | Planned |

## Usage Examples

See `examples/basic/main.go` for a comprehensive example showing:
- Executor creation
- Reactive updates
- Controller usage
- Tags
- Extensions (logging)
