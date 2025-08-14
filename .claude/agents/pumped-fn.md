# @pumped-fn/core-next Expert (v2.0)

TypeScript DI/reactive programming library. Function-based architecture, lazy evaluation, type-safe resolution, graph-based testing.

## Quick Patterns

| Pattern            | Code                                         | Use When             |
| ------------------ | -------------------------------------------- | -------------------- |
| **Basic DI**       | `derive(deps, factory)`                      | Service dependencies |
| **No Deps**        | `provide(factory)`                           | Config/singletons    |
| **Reactive**       | `derive(dep.reactive, f)`                    | Auto-updates needed  |
| **Lazy**           | `executor.lazy`                              | Defer resolution     |
| **Static Control** | `executor.static`                            | Manual state control |
| **Test Mock**      | `createScope(preset(exec, mock))`            | Testing              |
| **Cleanup**        | `(ctl) => { ctl.cleanup(() => r.close()); }` | Resource disposal    |
| **Batch Resolve**  | `resolves(exec1, exec2, exec3)`              | Multiple executors   |
| **Flow Pattern**   | `flow.provide(spec, factory)`                | Structured workflows |

## Critical Rules ⚠️

| ✅ DO                                           | ❌ NEVER                                      |
| ----------------------------------------------- | --------------------------------------------- |
| Store main executor: `const e = provide(f)`     | Store variants: `const r = e.reactive`        |
| Use inline: `derive(e.reactive, f)`             | Use with scope: `scope.update(e.reactive, v)` |
| Resolve first: `await resolve(e); update(e, v)` | Update unresolved: `update(e, v)`             |
| Functions: `(db) => ({get: () => db.query()})`  | Classes: `new Service(db)`                    |
| Graph testing: Test entire flows                | Unit testing: Test isolated pieces            |

## Core API Reference

### Executor Creation

```typescript
provide(factory, ...metas); // No dependencies
derive(deps, factory, ...metas); // With dependencies
preset(executor, value); // Override value
placeholder<T>(); // Throws if resolved
resolves(...executors); // Batch resolution helper
```

### Scope Operations

```typescript
scope.resolve(executor); // Get value
scope.update(executor, value); // Update & trigger reactive
scope.onUpdate(executor, cb); // Subscribe to changes
scope.onChange(cb); // Global change events
scope.onRelease(executor, cb); // Cleanup events
scope.use(middleware); // Add middleware
scope.pod(...presets); // Create sub-scope
scope.dispose(); // Cleanup all
```

### Variants (inline only)

```typescript
executor.reactive  // Triggers updates
executor.lazy      // Returns Accessor<T>
executor.static    // Returns Accessor<T> (eager)

// Accessor<T> interface:
accessor.get(): T              // Current value
accessor.update(v | fn): void  // Update value
accessor.resolve(force?): T    // Re-resolve
accessor.release(): void       // Release
accessor.lookup(): State<T>    // Check state without resolving
```

## Meta System 🏷️

Type-safe metadata with StandardSchema:

```typescript
// Define meta with schema
const serviceName = meta("service", string());
const version = meta("version", object({ major: number() }));

// Apply to executors
const api = provide(factory, serviceName("user-api"), version({ major: 2 }));

// Retrieve meta
serviceName.find(api); // 'user-api'
version.get(api); // [{ major: 2 }]
serviceName.some(api); // true

// Use in middleware
const telemetry = middleware({
  init: (scope) =>
    scope.onChange((event, exec) => {
      const name = serviceName.find(exec);
      if (name) metrics.record(event, name);
    }),
});
```

## Controller Parameter 🎮

Every factory receives controller with enhanced capabilities:

```typescript
// provide((ctl) => ...) or derive(deps, (deps, ctl) => ...)
ctl.cleanup(() => dispose()); // Register cleanup
ctl.release(); // Release self
ctl.scope; // Access parent scope
ctl.meta; // Access executor metadata

// Scope access patterns
const manager = provide((ctl) => {
  // Create sub-scope
  const pod = ctl.scope.pod(preset(config, override));
  ctl.cleanup(() => pod.dispose());

  // Access other executors
  const other = await ctl.scope.resolve(otherExec);

  // Self-management
  if (shouldStop) ctl.release();
});
```

## Advanced Patterns

### Static Accessor Control

```typescript
// Build control systems with .static
const ctrl = derive(config.static, (cfgAccessor) => ({
  update: (v) => cfgAccessor.update(v),
  reset: () => cfgAccessor.update(defaultConfig),
  get: () => cfgAccessor.get(),
  check: () => cfgAccessor.lookup(), // Check without resolving
}));

// Mixed reactive + control
const svc = derive([state.reactive, config.static], ([state, cfgCtl], ctl) => {
  // React to state changes, control config
  if (state.error) cfgCtl.update((c) => ({ ...c, retry: true }));
  ctl.cleanup(() => console.log("cleaning"));
  return { state, control: cfgCtl };
});
```

### Middleware System

```typescript
// Enhanced middleware with events
const analytics = middleware({
  init: (scope) => {
    scope.onChange((event, executor, value) => {
      // 'resolving' | 'resolved' | 'updated' | 'released'
      track(event, meta("name").find(executor));
    });

    scope.onUpdate(userState, (accessor) => {
      // React to specific executor updates
      logUserChange(accessor.get());
    });
  },

  // Transform values
  resolve: (value, executor) => {
    if (shouldSanitize(executor)) {
      return preset(executor, sanitize(value));
    }
    return value;
  },

  dispose: async () => {
    await analytics.flush();
  },
});
```

## Service Architecture

### Function-Based (✅ Preferred)

```typescript
// Handles async dependencies elegantly
const createAPI = async (config: Config, http: Http) => {
  await http.connect(config.baseUrl); // Async init

  return {
    async get(path: string) {
      return http.get(config.baseUrl + path);
    },
    async post(path: string, data: any) {
      return http.post(config.baseUrl + path, data);
    },
  };
};

const api = derive([config.reactive, httpClient], createAPI);
```

### Why Not Classes (❌)

```typescript
// PROBLEMS with classes:
class APIService {
  constructor(private config: Config, private http: Http) {
    // ❌ Can't handle async init in constructor
    // ❌ Can't react to config changes
    // ❌ Encourages mutable state
  }
}

// ❌ Classes break reactive updates
const api = derive(
  [config.reactive, http],
  (cfg, http) => new APIService(cfg, http)
); // Service never updates when config changes
```

## Graph-Based Testing 🧪

Test entire dependency graphs, not units:

```typescript
// Configure entire system for testing
const testScope = createScope(
  preset(environment, "test"),
  preset(database, mockDb),
  preset(logger, silentLogger)
);

// Test complete flows
test("user registration flow", async () => {
  const scope = createScope(
    preset(emailService, mockEmail),
    preset(database, inMemoryDb)
  );

  try {
    // Test entire registration graph
    const registration = await scope.resolve(registrationFlow);
    const result = await registration.execute({
      email: "test@example.com",
      password: "secure123",
    });

    // Verify side effects
    expect(mockEmail.sent).toHaveLength(1);
    expect(await inMemoryDb.users.count()).toBe(1);
  } finally {
    await scope.dispose();
  }
});

// Concurrent testing with isolated scopes
await Promise.all([test1WithScope(), test2WithScope(), test3WithScope()]); // No interference between tests
```

## Real-World Integration

### Framework Integration (Hono.js)

```typescript
// Shared executors module
const database = provide(async () => {
  const db = await connect(process.env.DATABASE_URL);
  return db;
});

const authService = derive(database, createAuthService);

// Hono app with DI
app.use("*", async (c, next) => {
  c.scope = createScope();
  await next();
  await c.scope.dispose();
});

app.post("/api/login", async (c) => {
  const auth = await c.scope.resolve(authService);
  const result = await auth.login(await c.req.json());
  return c.json(result);
});
```

### State Management Pattern

```typescript
// Global state with reactive updates
const appState = provide(() => ({
  user: null,
  theme: "light",
  notifications: [],
}));

// Derived states
const isAuthenticated = derive(
  appState.reactive,
  (state) => state.user !== null
);

const unreadCount = derive(
  appState.reactive,
  (state) => state.notifications.filter((n) => !n.read).length
);

// State updates
await scope.update(appState, (state) => ({
  ...state,
  user: { id: "123", name: "Alice" },
}));
```

## Performance Guidelines

### Container Selection

| Type        | Best For              | Avoid When        | Performance      |
| ----------- | --------------------- | ----------------- | ---------------- |
| Normal      | Standard deps         | Need lazy loading | O(n) resolution  |
| `.reactive` | Auto-updates          | Static values     | O(m) propagation |
| `.lazy`     | Expensive/conditional | Always need value | Deferred O(n)    |
| `.static`   | Manual control        | Frequent updates  | O(1) access      |

### Optimization Patterns

```typescript
// Conditional resolution with lazy
const service = derive(
  { cfg: config.reactive, db: database.lazy },
  async ({ cfg, db }) => {
    // Only resolve DB if needed
    if (cfg.useDb) {
      const database = await db.resolve();
      return createDbService(database);
    }
    return createMemoryService();
  }
);

// Batch updates for performance
await scope.update(state, (s) => ({
  ...s,
  multiple: "changes",
  at: "once",
})); // Single reactive propagation
```

## Debugging Tools

```typescript
// Comprehensive tracing
scope.onChange((event, exec, val) => {
  const name = meta("name").find(exec);
  console.log(`[${event}] ${name || "anonymous"}: ${val}`);
});

// State inspection
const state = accessor.lookup();
switch (state?.kind) {
  case "resolved":
    console.log("Value:", state.value);
    break;
  case "rejected":
    console.error("Error:", state.error);
    break;
  case "pending":
    console.log("Still resolving...");
    break;
}

// Debug metadata
const debug = meta(
  "debug",
  object({
    created: string(),
    purpose: string(),
  })
);

const svc = provide(
  factory,
  debug({
    created: new Date().toISOString(),
    purpose: "User authentication",
  })
);
```

## Common Issues & Solutions

| Error                   | Cause                   | Fix                                      |
| ----------------------- | ----------------------- | ---------------------------------------- |
| "Executor not resolved" | `.get()` before resolve | `await scope.resolve(e)` first           |
| "Maximum call stack"    | Circular reactive deps  | Break with `.static` or restructure      |
| Missing updates         | Not using `.reactive`   | Change to `derive(dep.reactive, f)`      |
| Memory leaks            | No cleanup/disposal     | Add `ctl.cleanup()` or `scope.dispose()` |
| Type inference fails    | Complex deps            | Use `as const` or explicit types         |
| Async in constructor    | Using classes           | Switch to functions                      |
| Flow validation fails   | Schema mismatch         | Check input/output schemas               |

## Decision Tree

```
Need DI? → provide/derive
├─ Changes? → .reactive
├─ Expensive? → .lazy
├─ Control? → .static
├─ Testing? → preset + graph testing
└─ Workflow? → flow.provide/derive

Service Layer?
├─ Sync deps → (deps) => service
├─ Async deps → async (deps) => service
├─ Cleanup → (deps, ctl) => { ctl.cleanup(...); }
├─ Control → derive(e.static, (accessor) => controlApi)
├─ Scope access → (ctl) => { /* use ctl.scope */ }
└─ Validation → flow.provide({ input, output }, factory)

State Management?
├─ Local → single reactive executor
├─ Derived → derive(state.reactive, transform)
├─ Global → shared scope with executors
└─ Updates → scope.update(executor, value)

Testing Strategy?
├─ Unit → Individual executor with mocks
├─ Integration → Graph with presets
├─ E2E → Full scope with real deps
└─ Concurrent → Isolated scopes
```

## Anti-Pattern Gallery

```typescript
// ❌ WRONG
const r = counter.reactive;           // Storing variant
scope.onUpdate(counter.reactive, cb); // Using variant with scope
class Svc { constructor(db) {} }      // Class with deps
await scope.update(exec, val);        // Update before resolve
new Database() in derive()            // Side effects in factory
derive([a, b, c, d, e, f, g])        // Too many deps (refactor!)

// ✅ CORRECT
const c = provide(() => 0);           // Store main
derive(c.reactive, v => v * 2);       // Inline variant
const svc = (db) => ({ query: db.q }); // Function factory
await scope.resolve(exec); scope.update(exec, val); // Resolve first
derive(deps, async () => new Database()) // Async for side effects
derive(serviceGroup, ([a, b, c]) => ...) // Group related deps
```

---

**v2.0 Key**: Executors for DI. Variants inline only. Functions over classes. Graph testing over units. Flows for workflows. Meta for introspection. Middleware for cross-cutting. Resolve before update.
