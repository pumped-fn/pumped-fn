// Package pumped provides a graph-based dependency injection and reactive execution framework for Go.
//
// # Overview
//
// Pumped organizes code around three core concepts:
//
//  1. Executors: Units of computation with explicit dependencies
//  2. Scopes: Lifecycle managers that resolve and cache executor values
//  3. Flows: Short-span executable operations with hierarchical execution contexts
//
// # Basic Usage
//
// Create executors to define your application graph:
//
//	scope := pumped.NewScope()
//
//	config := pumped.Provide(func(ctx *pumped.ResolveCtx) (*Config, error) {
//	    return &Config{Port: 8080}, nil
//	})
//
//	server := pumped.Derive1(
//	    config,
//	    func(ctx *pumped.ResolveCtx, cfg *pumped.Controller[*Config]) (*Server, error) {
//	        c, _ := cfg.Get()
//	        return NewServer(c.Port), nil
//	    },
//	)
//
// Access values through controllers:
//
//	serverCtrl := pumped.Accessor(scope, server)
//	srv, err := serverCtrl.Get()
//
// # Dependency Modes
//
// Dependencies can be resolved in different modes:
//
//	// Static: resolve once, cache forever (default)
//	service := pumped.Derive1(
//	    config,  // implicitly static
//	    func(ctx *pumped.ResolveCtx, cfg *pumped.Controller[*Config]) (*Service, error) {
//	        // Only called once
//	    },
//	)
//
//	// Reactive: invalidate and re-resolve when dependency changes
//	counter := pumped.Provide(func(ctx *pumped.ResolveCtx) (int, error) {
//	    return 0, nil
//	})
//
//	doubled := pumped.Derive1(
//	    counter.Reactive(),  // explicitly reactive
//	    func(ctx *pumped.ResolveCtx, c *pumped.Controller[int]) (int, error) {
//	        val, _ := c.Get()
//	        return val * 2, nil
//	    },
//	)
//
//	counterCtrl := pumped.Accessor(scope, counter)
//	counterCtrl.Update(5)  // triggers re-resolution of doubled
//
//	// Lazy: defer resolution until explicitly requested
//	logger := pumped.Derive1(
//	    config.Lazy(),  // won't resolve unless explicitly used
//	    func(ctx *pumped.ResolveCtx, cfg *pumped.Controller[*Config]) (*Logger, error) {
//	        // Only called when logger is explicitly accessed
//	    },
//	)
//
// # Controllers
//
// Controllers provide lifecycle operations for executor values:
//
//	ctrl := pumped.Accessor(scope, executor)
//
//	// Get resolves and caches the value
//	val, err := ctrl.Get()
//
//	// Peek returns cached value without resolving
//	val, ok := ctrl.Peek()
//
//	// Update sets new value and propagates to reactive dependents
//	ctrl.Update(newVal)
//
//	// Release invalidates the cached value
//	ctrl.Release()
//
//	// Reload invalidates and immediately re-resolves
//	val, err = ctrl.Reload()
//
//	// IsCached checks if value is currently cached
//	if ctrl.IsCached() { ... }
//
// # Flows
//
// Flows represent short-span operations with execution contexts:
//
//	db := pumped.Provide(func(ctx *pumped.ResolveCtx) (*DB, error) {
//	    return OpenDB(), nil
//	})
//
//	fetchUser := pumped.Flow1(db,
//	    func(execCtx *pumped.ExecutionCtx, dbCtrl *pumped.Controller[*DB]) (*User, error) {
//	        database, _ := dbCtrl.Get()
//	        return database.Query("SELECT * FROM users WHERE id = ?", 123)
//	    },
//	    pumped.WithFlowTag(pumped.FlowName(), "fetchUser"),
//	)
//
//	result, execNode, err := pumped.Exec(scope, context.Background(), fetchUser)
//
// Sub-flows create hierarchical execution trees:
//
//	parentFlow := pumped.Flow1(db,
//	    func(execCtx *pumped.ExecutionCtx, dbCtrl *pumped.Controller[*DB]) (string, error) {
//	        user, userCtx, err := pumped.Exec1(execCtx, fetchUserFlow)
//	        if err != nil {
//	            return "", err
//	        }
//
//	        orders, _, err := pumped.Exec1(userCtx, fetchOrdersFlow)
//	        return fmt.Sprintf("%s has %d orders", user.Name, len(orders)), nil
//	    },
//	)
//
// # Execution Context
//
// ExecutionCtx provides data isolation and hierarchical lookups:
//
//	// Set data in current context
//	execCtx.Set(pumped.Input(), "user-123")
//
//	// Get from current context only
//	val, ok := execCtx.Get(someTag)
//
//	// Get from parent contexts (walk upward)
//	val, ok := execCtx.GetFromParent(someTag)
//
//	// Get from scope
//	val, ok := execCtx.GetFromScope(someTag)
//
//	// Lookup: try self, then parents, then scope
//	val, ok := execCtx.Lookup(someTag)
//
// # Tags
//
// Tags provide type-safe metadata for executors, scopes, and flows:
//
//	versionTag := pumped.NewTag[string]("version")
//	dbPoolTag := pumped.NewTag[int]("db.pool_size")
//
//	// Tag executors
//	exec := pumped.Provide(
//	    func(ctx *pumped.ResolveCtx) (int, error) { return 42, nil },
//	    pumped.WithTag(versionTag, "1.0.0"),
//	)
//
//	// Tag scopes
//	scope := pumped.NewScope(
//	    pumped.WithScopeTag(dbPoolTag, 10),
//	)
//
//	// Tag flows
//	flow := pumped.Flow0(
//	    func(execCtx *pumped.ExecutionCtx, resolveCtx *pumped.ResolveCtx) (int, error) {
//	        return 42, nil
//	    },
//	    pumped.WithFlowTag(pumped.FlowName(), "myFlow"),
//	)
//
//	// Retrieve tags
//	version, ok := versionTag.Get(exec)
//	poolSize, ok := dbPoolTag.GetFromScope(scope)
//
// # Extensions
//
// Extensions provide cross-cutting concerns through lifecycle hooks:
//
//	type LoggingExtension struct {
//	    pumped.BaseExtension
//	}
//
//	func (e *LoggingExtension) Wrap(ctx context.Context, next func() (any, error), op *pumped.Operation) (any, error) {
//	    log.Printf("Starting %s", op.Kind)
//	    result, err := next()
//	    log.Printf("Finished %s", op.Kind)
//	    return result, err
//	}
//
//	func (e *LoggingExtension) OnFlowStart(execCtx *pumped.ExecutionCtx, flow pumped.AnyFlow) error {
//	    log.Printf("Flow started: %s", execCtx.Get(pumped.FlowName()))
//	    return nil
//	}
//
//	scope := pumped.NewScope(
//	    pumped.WithExtension(&LoggingExtension{
//	        BaseExtension: pumped.NewBaseExtension("logging"),
//	    }),
//	)
//
// # Resource Cleanup
//
// Register cleanup functions for automatic resource management:
//
//	db := pumped.Provide(func(ctx *pumped.ResolveCtx) (*DB, error) {
//	    database := OpenDB()
//	    ctx.OnCleanup(func() error {
//	        return database.Close()
//	    })
//	    return database, nil
//	})
//
// Cleanup functions are called when:
//   - Reactive dependents are invalidated (OnUpdate)
//   - Scope is disposed (scope.Dispose())
//
// # Testing with Presets
//
// Replace executors with test doubles:
//
//	realDB := pumped.Provide(func(ctx *pumped.ResolveCtx) (*DB, error) {
//	    return ConnectToDB(), nil
//	})
//
//	mockDB := &DB{mock: true}
//
//	testScope := pumped.NewScope(
//	    pumped.WithPreset(realDB, mockDB),  // value preset
//	)
//
//	// Or replace with another executor
//	mockDBExecutor := pumped.Provide(func(ctx *pumped.ResolveCtx) (*DB, error) {
//	    return &DB{mock: true}, nil
//	})
//
//	testScope := pumped.NewScope(
//	    pumped.WithPreset(realDB, mockDBExecutor),  // executor preset
//	)
//
// # Execution Tree
//
// Query execution history and build observability:
//
//	tree := scope.GetExecutionTree()
//
//	// Get all root executions
//	roots := tree.GetRoots()
//
//	// Walk execution tree
//	tree.Walk(rootID, func(node *pumped.ExecutionNode) bool {
//	    name, _ := node.GetTag(pumped.FlowName())
//	    status, _ := node.GetTag(pumped.Status())
//	    fmt.Printf("Flow: %s, Status: %v\n", name, status)
//	    return true  // continue walking
//	})
//
//	// Filter executions
//	failed := tree.Filter(func(node *pumped.ExecutionNode) bool {
//	    status, ok := node.GetTag(pumped.Status())
//	    return ok && status == pumped.ExecutionStatusFailed
//	})
//
// # Parallel Execution
//
// Execute multiple flows concurrently:
//
//	parallel := execCtx.Parallel(pumped.WithCollectErrors())
//	results, errors := parallel.Run(
//	    flow1,
//	    flow2,
//	    flow3,
//	)
//
//	// Or fail fast
//	parallel := execCtx.Parallel(pumped.WithFailFast())
//	results, errors := parallel.Run(flows...)
//
// # Best Practices
//
//  1. Use executors for long-lived resources (DB connections, configs, services)
//  2. Use flows for short-span operations (HTTP requests, queries, computations)
//  3. Prefer static dependencies unless you need reactivity
//  4. Use tags for metadata, not data passing (use execution context for data)
//  5. Register cleanup functions for all resources that need disposal
//  6. Use extensions for cross-cutting concerns (logging, metrics, transactions)
//  7. Use presets for testing to replace real dependencies with mocks
//
// # Thread Safety
//
// All operations are thread-safe:
//   - Scopes can be accessed concurrently
//   - Controllers can be used from multiple goroutines
//   - Flows can execute in parallel using Parallel()
package pumped
