# CLI Tasks - Command-Based Integration Example

This example demonstrates integrating pumped-go into a CLI application with command-based architecture.

## Integration Pattern: Command Boundary

**Key principle:** Resolve dependencies once per command execution at the command boundary, pass plain values to business logic.

### Architecture

```
main.go                 # Single integration point (scope creation)
├── graph/              # Wiring layer (executor definitions)
├── commands/           # Leaf nodes (resolve + dispatch to business logic)
├── services/           # Business logic (NO pumped-go dependency)
└── storage/            # Infrastructure (NO pumped-go dependency)
```

### Integration Flow

1. **Setup Phase** (main.go)
   - Create scope with extensions
   - Define executor graph (no resolution)
   - Parse command-line arguments

2. **Resolution Phase** (commands/*.go)
   - Resolve ONLY executors needed for this command
   - One-time resolution at command boundary
   - Pass plain values to business logic

3. **Execution Phase** (services/*.go)
   - Pure business logic with no pumped-go awareness
   - Receives plain dependencies (interfaces/structs)
   - Easy to test without mocking pumped-go

### Example: Add Command

```go
// commands/commands.go - Leaf node resolution
func Add(scope *pumped.Scope, g *graph.Graph, args []string) error {
    title := strings.Join(args, " ")

    // Resolve ONCE at boundary
    taskSvc, err := pumped.Resolve(scope, g.TaskService)
    if err != nil {
        return err
    }

    // Business logic receives plain value
    task, err := taskSvc.Add(title)
    // ...
}
```

### Why This Works

✅ **Minimal surface area** - Only commands know about pumped-go
✅ **Easy testing** - Business logic tested with plain mocks
✅ **No over-resolution** - Each command resolves only what it needs
✅ **Clear boundaries** - Wiring separated from behavior

### Running

```bash
# Build
go build -o cli-tasks ./examples/cli-tasks

# Usage
./cli-tasks add "Write documentation"
./cli-tasks list
./cli-tasks complete 1
./cli-tasks stats
```

### Testing Strategy

**Layer 1: Business Logic (No pumped-go)**
```go
func TestTaskService_Add(t *testing.T) {
    storage := storage.NewMemoryStorage()
    svc := services.NewTaskService(storage)

    task, err := svc.Add("Test task")
    // Assert...
}
```

**Layer 2: Graph Wiring**
```go
func TestGraph_Resolves(t *testing.T) {
    scope := pumped.NewScope()
    defer scope.Dispose()

    g := graph.Define()
    taskSvc, err := pumped.Resolve(scope, g.TaskService)
    // Assert graph works...
}
```

**Layer 3: Integration**
```go
func TestAddCommand_Integration(t *testing.T) {
    scope := pumped.NewScope()
    defer scope.Dispose()

    g := graph.Define()
    err := commands.Add(scope, g, []string{"Test"})
    // Assert full flow...
}
```

### Anti-Patterns Avoided

❌ Calling `Resolve()` inside `TaskService.Add()`
❌ Passing `*pumped.Scope` to business logic
❌ Scattering executor definitions across packages
❌ Mocking pumped-go in business logic tests
