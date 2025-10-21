# HTTP API - Handler-Based Integration Example

This example demonstrates integrating pumped-go into an HTTP server with handler-based architecture.

## Integration Pattern: Handler Boundary

**Key principle:** Resolve dependencies once per request at the handler boundary, pass plain values to business logic.

### Architecture

```
main.go                 # Single integration point (scope + graceful shutdown)
├── graph/              # Wiring layer (executor definitions)
├── handlers/           # Leaf nodes (resolve + route to business logic)
├── services/           # Business logic (NO pumped-go dependency)
└── storage/            # Infrastructure (NO pumped-go dependency)
```

### Integration Flow

1. **Setup Phase** (main.go)
   - Create scope with extensions
   - Define executor graph (no resolution)
   - Register handlers with scope + graph
   - Start HTTP server

2. **Per-Request Phase** (handlers/*.go)
   - Handler resolves executors it needs
   - One-time resolution per request
   - Route to business logic with plain values

3. **Business Logic Phase** (services/*.go)
   - Pure business logic with no pumped-go awareness
   - Receives plain dependencies
   - Returns plain results

4. **Shutdown Phase** (main.go)
   - Graceful HTTP shutdown
   - Scope disposal (cleanup resources)

### Example: User Handler

```go
// handlers/handlers.go - Leaf node resolution
func handleUsers(scope *pumped.Scope, g *graph.Graph) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        // Resolve ONCE at boundary
        userSvc, err := pumped.Resolve(scope, g.UserService)
        if err != nil {
            respondError(w, err, 500)
            return
        }

        // Route to business logic with plain value
        switch r.Method {
        case "GET":
            listUsers(w, r, userSvc)
        case "POST":
            createUser(w, r, userSvc)
        }
    }
}

// Business logic - no pumped-go
func listUsers(w http.ResponseWriter, r *http.Request,
               userSvc interface { List() (interface{}, error) }) {
    users, err := userSvc.List()
    // ...
}
```

### Why This Works

✅ **Handler isolation** - Each handler resolves only what it needs
✅ **Cached resolution** - Same scope across all requests (services resolved once)
✅ **Easy testing** - Test handlers with mock services, no pumped-go
✅ **Graceful shutdown** - Scope disposal cleans up resources
✅ **Extension hooks** - Logging extension wraps all resolutions

### Running

```bash
# Build
go build -o http-api ./examples/http-api

# Run
./http-api

# Test endpoints
curl http://localhost:8080/

# Create user
curl -X POST http://localhost:8080/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice","email":"alice@example.com"}'

# List users
curl http://localhost:8080/users

# Get user
curl http://localhost:8080/users/1

# Create post
curl -X POST http://localhost:8080/posts \
  -H "Content-Type: application/json" \
  -d '{"user_id":1,"title":"Hello","content":"World"}'

# List posts
curl http://localhost:8080/posts

# Stats
curl http://localhost:8080/stats
```

### Reactive Example

The `StatsService` demonstrates reactive dependencies:

```go
// graph/graph.go
statsService := pumped.Derive2(
    pumped.Static(storageExec),
    pumped.Reactive(config),  // Reactive to config changes
    func(ctx *pumped.ResolveCtx,
         storageCtrl *pumped.Controller[storage.Storage],
         configCtrl *pumped.Controller[*Config]) (*services.StatsService, error) {
        store, _ := storageCtrl.Get()
        cfg, _ := configCtrl.Get()
        return services.NewStatsService(store, cfg.MaxUsersCache), nil
    },
)
```

If you update the config:
```go
pumped.Update(scope, g.Config, &graph.Config{MaxUsersCache: 200})
```

The `StatsService` will be invalidated and re-resolved on next access.

### Testing Strategy

**Layer 1: Business Logic (No pumped-go)**
```go
func TestUserService_Create(t *testing.T) {
    storage := storage.NewMemoryStorage()
    svc := services.NewUserService(storage)

    user, err := svc.Create("Alice", "alice@example.com")
    assert.NoError(t, err)
    assert.Equal(t, "Alice", user.Name)
}
```

**Layer 2: Handler Logic (Mock services)**
```go
func TestHandleUsers(t *testing.T) {
    mockSvc := &MockUserService{
        users: []*storage.User{{ID: 1, Name: "Alice"}},
    }

    req := httptest.NewRequest("GET", "/users", nil)
    w := httptest.NewRecorder()

    listUsers(w, req, mockSvc)

    assert.Equal(t, 200, w.Code)
}
```

**Layer 3: Graph Wiring**
```go
func TestGraph_Resolves(t *testing.T) {
    scope := pumped.NewScope()
    defer scope.Dispose()

    g := graph.Define()
    userSvc, err := pumped.Resolve(scope, g.UserService)

    assert.NoError(t, err)
    assert.NotNil(t, userSvc)
}
```

**Layer 4: Integration**
```go
func TestAPI_Integration(t *testing.T) {
    scope := pumped.NewScope()
    defer scope.Dispose()

    g := graph.Define()
    userSvc, _ := pumped.Resolve(scope, g.UserService)

    user, err := userSvc.Create("Alice", "alice@example.com")
    assert.NoError(t, err)

    users, _ := userSvc.List()
    assert.Len(t, users, 1)
}
```

### Anti-Patterns Avoided

❌ Calling `Resolve()` inside `UserService.Create()`
❌ Passing `*pumped.Scope` to business logic
❌ Creating new scope per request (wrong! scope is long-lived)
❌ Resolving all services in main.go (defeats lazy evaluation)
❌ Mocking pumped-go in business logic tests

### Graceful Shutdown

```go
// main.go
sigCh := make(chan os.Signal, 1)
signal.Notify(sigCh, os.Interrupt, syscall.SIGTERM)

go func() {
    srv.ListenAndServe()
}()

<-sigCh
srv.Shutdown(ctx)      // HTTP shutdown first
scope.Dispose()        // Then cleanup resources
```

This ensures:
1. Stop accepting new requests
2. Finish in-flight requests
3. Dispose scope (cleanup DB connections, etc.)
