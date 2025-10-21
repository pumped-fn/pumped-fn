# Pumped-Go Examples

Production-ready examples demonstrating integration patterns for pumped-go.

## Examples

### 1. Order Processing - Flow Execution Pattern

**Path:** `order-processing/`

**Pattern:** Flow-based execution with context trees

A simple order processing system demonstrating:
- Executors for long-running resources (DB, config)
- Flows for short-span operations (fetch user, fetch orders, process)
- Sub-flow execution with parent-child context relationships
- Tag-based data flow between flows
- Execution tree visualization for debugging

```bash
cd order-processing
go run .
```

**Key takeaway:** Use Executors for resources that live for the scope lifetime (DB connections, caches), use Flows for request-scoped operations that need tracing and context propagation.

### 2. CLI Tasks - Command-Based Integration

**Path:** `cli-tasks/`

**Pattern:** Resolve once per command at command boundary

A task manager CLI demonstrating:
- Single integration point in main.go
- Command-based resolution (each command resolves what it needs)
- Business logic with no pumped-go dependency
- Clean separation: graph → commands → services

```bash
cd cli-tasks
go build -o cli-tasks .

./cli-tasks add "Write documentation"
./cli-tasks list
./cli-tasks stats
```

**Key takeaway:** Each CLI command is a "leaf node" that resolves dependencies once, then passes plain values to business logic.

### 2. HTTP API - Handler-Based Integration

**Path:** `http-api/`

**Pattern:** Resolve once per request at handler boundary

A REST API server demonstrating:
- Single integration point in main.go
- Handler-based resolution (handlers resolve per request)
- Graceful shutdown (HTTP → scope disposal)
- Reactive dependencies (StatsService reactive to config)
- Extension hooks (logging wraps all resolutions)

```bash
cd http-api
go build -o http-api .

./http-api

# In another terminal:
curl -X POST http://localhost:8080/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice","email":"alice@example.com"}'

curl http://localhost:8080/users
curl http://localhost:8080/stats
```

**Key takeaway:** HTTP handlers are "leaf nodes" that resolve dependencies once per request, leveraging scope caching across requests.

### 4. Health Monitor - Production Service

**Path:** `health-monitor/`

**Pattern:** Production-ready health monitoring service

A comprehensive health monitoring service demonstrating:
- Scheduler for periodic health checks
- Database persistence with SQLite
- Incident detection and alerting
- REST API with multiple handlers
- Reactive configuration updates

```bash
cd health-monitor
go build -o health-monitor .
./health-monitor

# In another terminal:
curl -X POST http://localhost:8080/services \
  -H "Content-Type: application/json" \
  -d '{"name":"API","url":"http://example.com","check_interval":30}'

curl http://localhost:8080/services
```

**Key takeaway:** Complete production service showing resource lifecycle management, scheduled tasks, and graceful shutdown.

## Integration Principles

Both examples follow the same core principles:

### 1. Single Integration Point

```go
// main.go - ONE place for scope creation
func main() {
    scope := pumped.NewScope(
        pumped.WithExtension(extensions.NewLoggingExtension()),
    )
    defer scope.Dispose()

    g := graph.Define()  // Define graph, no resolution

    // Pass scope + graph to leaf nodes
    // ...
}
```

### 2. Graph as Wiring Layer

```go
// graph/graph.go - All executor definitions in one place
type Graph struct {
    Config      *pumped.Executor[*Config]
    Storage     *pumped.Executor[Storage]
    UserService *pumped.Executor[*UserService]
}

func Define() *Graph {
    // Pure wiring, no side effects
    config := pumped.Provide(...)
    storage := pumped.Derive1(...)
    userService := pumped.Derive1(...)
    return &Graph{...}
}
```

### 3. Leaf Node Resolution

```go
// CLI: commands/commands.go
func Add(scope *pumped.Scope, g *graph.Graph, args []string) error {
    // Resolve ONCE at boundary
    taskSvc, err := pumped.Resolve(scope, g.TaskService)
    if err != nil {
        return err
    }
    // Business logic receives plain value
    return taskSvc.Add(title)
}

// HTTP: handlers/handlers.go
func handleUsers(scope *pumped.Scope, g *graph.Graph) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        // Resolve ONCE per request at boundary
        userSvc, err := pumped.Resolve(scope, g.UserService)
        if err != nil {
            respondError(w, err, 500)
            return
        }
        // Business logic receives plain value
        users, _ := userSvc.List()
        respondJSON(w, users)
    }
}
```

### 4. Business Logic Isolation

```go
// services/task_service.go - NO pumped-go dependency
type TaskService struct {
    storage Storage  // Plain interface
}

func (s *TaskService) Add(title string) (*Task, error) {
    // Pure business logic
    // Easy to test with plain mocks
}
```

## Testing Strategy

### Layer 1: Business Logic (No pumped-go)
Test services with plain mocks, no DI framework involved.

### Layer 2: Graph Wiring
Test that graph definitions resolve correctly, dependencies are cached.

### Layer 3: Integration
Test full flow with real components (in-memory storage or test DB).

## Anti-Patterns Avoided

❌ Calling `Resolve()` inside business logic
❌ Passing `*pumped.Scope` to services
❌ Scattering executor definitions across packages
❌ Mocking pumped-go in business logic tests
❌ Creating new scope per request (HTTP)
❌ Resolving all services in main.go (defeats lazy evaluation)

## What Makes This "Production-Ready"?

1. **Clear boundaries** - Pumped-go isolated to wiring layer
2. **Testable** - Business logic independent of DI framework
3. **Maintainable** - All wiring in one place (`graph/`)
4. **Extensible** - Easy to add new services/commands
5. **Observable** - Extensions provide logging/metrics/tracing
6. **Graceful** - Proper resource cleanup (scope disposal)
7. **Performant** - Lazy resolution, caching, minimal overhead

## Next Steps

To adapt these examples to your project:

1. Copy the structure (`main.go`, `graph/`, `handlers/` or `commands/`, `services/`)
2. Replace storage with your real infrastructure (DB, cache, APIs)
3. Add your business logic to services
4. Define your graph in `graph/graph.go`
5. Add extensions for cross-cutting concerns
6. Keep resolution at the boundaries (handlers/commands)
7. Keep business logic pure (no pumped-go)

## Learn More

- [DESIGN.md](../DESIGN.md) - Technical design decisions
- [README.md](../README.md) - API reference
- [executor_test.go](../executor_test.go) - Core functionality tests
