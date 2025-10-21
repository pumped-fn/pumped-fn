# Service Health Monitor System

Production-ready service health monitoring demonstrating pumped-go dependency injection, testing with presets, and reactive configuration.

## Features

- Service registry with HTTP/TCP health checks
- Automatic incident detection and tracking
- Background scheduler for periodic checks
- Reactive configuration (hot-reload)
- SQLite storage with indexed queries
- REST API for management

## Structure

Flat package - all files in main:

- `types.go` - Domain types (Service, HealthCheck, Incident, Config)
- `interfaces.go` - Repository interfaces (enables mocking)
- `database.go` - SQLite setup
- `repositories.go` - ServiceRepository, HealthCheckRepository, IncidentRepository
- `health_checker.go` - HTTP/TCP health checks
- `incident_detector.go` - Incident detection
- `scheduler.go` - Background scheduler
- `handlers.go` - ServiceHandler, HealthHandler, IncidentHandler
- `graph.go` - Dependency graph
- `graph_test.go` - Tests using presets
- `main.go` - Entry point

## Running

```bash
CGO_ENABLED=1 go build -o health-monitor
./health-monitor
```

Server runs on `:8080`

## Testing

```bash
CGO_ENABLED=1 go test -v
```

**Tests demonstrate preset technique for mocking:**

1. `TestIncidentDetectorStartsIncidentOnUnhealthy` - Mock incident repo with preset
2. `TestIncidentDetectorRecoveryClosesIncident` - Tests recovery flow
3. `TestHealthCheckerHTTPCheck` - Real HTTP check to httpbin.org
4. `TestServiceRepositoryWithMockDB` - In-memory SQLite via config preset
5. `TestHealthCheckRepositoryWithMockDB` - Repository CRUD testing
6. `TestSchedulerWithMockRepositories` - Scheduler with both repos mocked
7. `TestConfigReactivityReinitializesDB` - Reactive config changes DB

## pumped-go Patterns

### Interface-based Mocking

```go
// interfaces.go
type ServiceRepo interface {
    Create(service *Service) error
    Get(id string) (*Service, error)
    // ...
}

// graph.go - executors return interfaces
ServiceRepo: *pumped.Executor[ServiceRepo]

// graph_test.go - mocks implement interface
type MockServiceRepository struct { ... }
func (m *MockServiceRepository) Create(...) error { ... }

// Use preset with executor returning mock
mockRepoExecutor := pumped.Provide(func(ctx *pumped.ResolveCtx) (ServiceRepo, error) {
    return mockServiceRepo, nil
})
testScope := pumped.NewScope(
    pumped.WithPreset(g.ServiceRepo, mockRepoExecutor),
)
```

### Reactive Config

```go
db := pumped.Derive1(
    config.Reactive(), // DB reinit on config change
    func(ctx *pumped.ResolveCtx, cfgCtrl *pumped.Controller[*Config]) (*sql.DB, error) {
        cfg, _ := cfgCtrl.Get()
        return NewDB(cfg.DBPath)
    },
)
```

### Testing Real Components with In-Memory DB

```go
testConfig := &Config{DBPath: ":memory:", ...}
testScope := pumped.NewScope(
    pumped.WithPreset(g.Config, testConfig),
)
// All repos use in-memory SQLite
```

## API Examples

Register service:
```bash
curl -X POST http://localhost:8080/services -d '{
  "name": "API",
  "type": "http",
  "endpoint": "https://api.example.com/health",
  "checkInterval": 60,
  "timeout": 5000,
  "criticality": "high"
}'
```

List services:
```bash
curl http://localhost:8080/services
```

View active incidents:
```bash
curl http://localhost:8080/incidents/active
```

## Design Decisions

1. **Flat structure** - Single package, no import overhead
2. **Interface-based repos** - Enables clean mocking with presets
3. **Explicit lifecycle** - Scheduler start/stop in main
4. **Config reactivity** - Demonstrates hot-reload

## License

See parent project.
