# Integration Patterns - CLI vs HTTP Server

This document compares integration patterns between CLI and HTTP server applications.

## Side-by-Side Comparison

| Aspect | CLI (Command-Based) | HTTP Server (Handler-Based) |
|--------|---------------------|----------------------------|
| **Scope Lifetime** | One per command execution | Long-lived across all requests |
| **Resolution Point** | Command functions | HTTP handler functions |
| **Resolution Frequency** | Once per command run | Once per request (cached in scope) |
| **Leaf Nodes** | Commands (add, list, stats) | Handlers (GET /users, POST /posts) |
| **Shutdown** | Automatic (defer scope.Dispose()) | Graceful (HTTP shutdown → scope.Dispose()) |
| **State Persistence** | None (new scope each run) | In-memory for server lifetime |
| **Best For** | Batch operations, scripts, tools | Long-running services, APIs |

## Architecture Comparison

### CLI App Structure

```
main.go                    # Parse args, create scope, dispatch to command
└─ commands/
   ├─ add.go              # Leaf: Resolve taskService, call Add()
   ├─ list.go             # Leaf: Resolve taskService, call List()
   └─ stats.go            # Leaf: Resolve statsService, call GetStats()
└─ graph/
   └─ graph.go            # Define all executors (no resolution)
└─ services/
   └─ task_service.go     # Business logic (no pumped-go)
```

**Flow:**
```
User: cli-tasks add "Task"
↓
main.go: Create scope → Define graph → Dispatch to commands.Add()
↓
commands.Add(): Resolve(scope, g.TaskService) → Call taskSvc.Add()
↓
services.TaskService.Add(): Business logic (no pumped-go)
↓
Exit: defer scope.Dispose()
```

### HTTP Server Structure

```
main.go                    # Create scope, register handlers, start server
└─ handlers/
   ├─ users.go            # Leaf: Resolve userService per request
   └─ posts.go            # Leaf: Resolve postService per request
└─ graph/
   └─ graph.go            # Define all executors (no resolution)
└─ services/
   ├─ user_service.go     # Business logic (no pumped-go)
   └─ post_service.go     # Business logic (no pumped-go)
```

**Flow:**
```
Server Start: Create scope → Define graph → Register handlers → Listen
↓
Request: GET /users
↓
handlers.handleUsers(): Resolve(scope, g.UserService) → Call userSvc.List()
↓
services.UserService.List(): Business logic (no pumped-go)
↓
Response
↓
(Scope stays alive for next request)
↓
Server Stop: HTTP shutdown → scope.Dispose()
```

## Code Examples

### main.go Comparison

**CLI:**
```go
func main() {
    scope := pumped.NewScope()
    defer scope.Dispose()  // Auto cleanup

    g := graph.Define()

    cmd := os.Args[1]
    args := os.Args[2:]

    switch cmd {
    case "add":
        commands.Add(scope, g, args)  // Resolve inside
    case "list":
        commands.List(scope, g, args)
    }
}
```

**HTTP:**
```go
func main() {
    scope := pumped.NewScope()
    defer scope.Dispose()

    g := graph.Define()

    mux := http.NewServeMux()
    handlers.Register(mux, scope, g)  // Pass scope to handlers

    srv := &http.Server{Addr: ":8080", Handler: mux}

    // Graceful shutdown
    go srv.ListenAndServe()
    <-sigCh
    srv.Shutdown(ctx)    // Stop HTTP first
    scope.Dispose()      // Then cleanup resources
}
```

**Key Difference:** CLI exits after each command; HTTP server keeps scope alive.

### Leaf Node Comparison

**CLI Command:**
```go
// commands/add.go
func Add(scope *pumped.Scope, g *graph.Graph, args []string) error {
    title := strings.Join(args, " ")

    // Resolve once (fresh scope each run)
    taskSvc, err := pumped.Resolve(scope, g.TaskService)
    if err != nil {
        return err
    }

    task, err := taskSvc.Add(title)
    fmt.Printf("Added task #%d: %s\n", task.ID, task.Title)
    return nil
}
```

**HTTP Handler:**
```go
// handlers/users.go
func handleUsers(scope *pumped.Scope, g *graph.Graph) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        // Resolve once per request (cached in long-lived scope)
        userSvc, err := pumped.Resolve(scope, g.UserService)
        if err != nil {
            respondError(w, err, 500)
            return
        }

        users, err := userSvc.List()
        respondJSON(w, users)
    }
}
```

**Key Difference:** CLI creates new scope per run; HTTP reuses scope across requests (caching).

## When Caching Matters

### CLI (No Benefit from Caching)

Each command run creates a new scope:
```bash
$ cli-tasks add "Task 1"    # New scope, resolve TaskService
$ cli-tasks add "Task 2"    # New scope, resolve TaskService again
$ cli-tasks list            # New scope, resolve TaskService again
```

No caching benefit because scope lives only for one command.

### HTTP (Big Benefit from Caching)

Single scope across all requests:
```bash
# Request 1: GET /users
Handler resolves UserService → Cached in scope

# Request 2: GET /users
Handler gets cached UserService (no re-resolution!)

# Request 3: POST /users
Handler gets cached UserService

# Request 4: GET /posts
Handler resolves PostService → Cached in scope
Handler accesses UserService → Already cached
```

Massive performance benefit from caching, especially for:
- Database connections (resolve once, use forever)
- Heavy initialization (config parsing, connection pools)
- Service dependencies (no repeated resolution)

## When to Use Each Pattern

### Use CLI Pattern When:

✅ Batch operations (cron jobs, scripts)
✅ One-shot commands
✅ No state between runs
✅ Simple workflows
✅ Quick startup/shutdown

**Examples:** Database migrations, data exports, admin tools, CI/CD scripts

### Use HTTP Pattern When:

✅ Long-running services
✅ Stateful operations
✅ Shared resources (DB pools, caches)
✅ High request throughput
✅ Need graceful shutdown

**Examples:** REST APIs, GraphQL servers, WebSocket servers, gRPC services

## Hybrid Pattern: Worker with Jobs

For background workers processing jobs:

```go
// Hybrid: Long-lived scope + per-job resolution
func main() {
    scope := pumped.NewScope()
    defer scope.Dispose()

    g := graph.Define()
    queue, _ := pumped.Resolve(scope, g.Queue)

    for {
        job := queue.Pop()

        // Resolve per job (like CLI per command)
        handler, _ := pumped.Resolve(scope, g.JobHandler)
        handler.Process(job)

        // But scope lives on (like HTTP server)
    }
}
```

Benefits:
- Long-lived scope for shared resources (DB, queue connection)
- Per-job resolution for job-specific logic
- Graceful shutdown on signal

## Reactive Updates: More Useful in HTTP

### CLI (Limited Benefit)
```go
// Rare: config changes between command runs
// Usually just read config each time
```

### HTTP (Very Useful)
```go
// Config hot-reload without restart
statsService := pumped.Derive1(
    pumped.Reactive(config),  // Invalidate on config change
    func(ctx *pumped.ResolveCtx, cfgCtrl *pumped.Controller[*Config]) (*StatsService, error) {
        cfg, _ := cfgCtrl.Get()
        return NewStatsService(cfg), nil
    },
)

// In another goroutine:
func watchConfig(scope *pumped.Scope, g *graph.Graph) {
    for newConfig := range configWatcher {
        pumped.Update(scope, g.Config, newConfig)
        // StatsService automatically invalidated
        // Next request gets new instance with new config
    }
}
```

Enables:
- Hot reload without restart
- Feature flag updates
- Dynamic rate limiting
- A/B test config changes

## Summary

**CLI Pattern:**
- Short-lived scope per command
- No caching benefit
- Simple integration
- One resolution point per command
- Auto cleanup

**HTTP Pattern:**
- Long-lived scope across requests
- Huge caching benefit
- Graceful shutdown required
- One resolution point per handler
- Shared resources

**Both Follow Same Principle:**
- Single integration point (main.go)
- Graph as wiring layer (graph/)
- Leaf node resolution (commands/ or handlers/)
- Business logic isolation (services/)
- No pumped-go in business logic

Choose based on your application lifetime and caching needs!
