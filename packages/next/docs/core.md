# Core Library - @pumped-fn/core-next

_Dependency graph resolution, scope lifecycle, and reactive patterns_

**Important**: Always refer to [api.md](./api.md) for actual API signatures.

## Architecture

### Graph Resolution

The library is designed around the concept of graph resolution. Each node of the graph (called an "executor") contains:
- **Factory Function**: Resolves into a value when executed
- **Upstream Declaration**: Dependencies that must resolve before this executor
- **Caching Strategy**: Values cached per resolution by default

Nodes don't resolve themselves - they're resolved within a "Scope" that actualizes the graph.

### Actualization Process

Actualization is how the scope brings the graph to life:
1. **Dependency Detection**: Scope analyzes upstream declarations
2. **Ordered Resolution**: Resolves each dependency in topological order
3. **Value Caching**: Stores resolved values for reuse
4. **Downstream Updates**: Propagates changes through reactive edges

### Long-span vs Short-span Operations

The system distinguishes between two operational contexts:

**Scope (Long-span)**:
- Long-running operations (servers, cron jobs)
- Holds persistent resources (database connections, configs)
- Maintains reference to services
- Lives for application lifetime

**Pod (Short-span)**:
- Fork version of scope for isolated operations
- Copies already-resolved values from parent scope
- Keeps everything local to the pod
- Disposal doesn't affect parent scope
- Perfect for request handling, transactions

```typescript
// Long-span: Application scope
const appScope = createScope();
const dbConnection = await appScope.resolve(database);

// Short-span: Request pod
const requestPod = appScope.pod();
const handler = await requestPod.resolve(requestHandler);
// Pod disposal won't affect appScope
await appScope.disposePod(requestPod);
```

### Pod Examples

**Request Handling with Pod Isolation**
```typescript
const database = provide(() => new DatabaseConnection());
const userService = derive([database], ([db]) => new UserService(db));

const appScope = createScope();
await appScope.resolve(database); // Initialize once

// Handle each request in isolated pod
async function handleRequest(req: Request) {
  const pod = appScope.pod();

  try {
    const service = await pod.resolve(userService);
    const result = await service.process(req);
    return result;
  } finally {
    await appScope.disposePod(pod);
  }
}
```

**Transaction Management with Pods**
```typescript
const transactionManager = derive([database], ([db]) => ({
  begin: () => db.beginTransaction(),
  commit: (tx) => tx.commit(),
  rollback: (tx) => tx.rollback()
}));

const orderProcessor = derive(
  [database, transactionManager],
  ([db, txManager]) => async (order: Order) => {
    const tx = await txManager.begin();
    try {
      await db.insert('orders', order, { transaction: tx });
      await db.update('inventory', order.items, { transaction: tx });
      await txManager.commit(tx);
      return { success: true };
    } catch (error) {
      await txManager.rollback(tx);
      throw error;
    }
  }
);

// Each order in isolated pod with transaction
async function processOrder(order: Order) {
  const pod = appScope.pod();
  try {
    const processor = await pod.resolve(orderProcessor);
    return await processor(order);
  } finally {
    await appScope.disposePod(pod);
  }
}
```

**Parallel Pod Execution**
```typescript
const itemProcessor = derive([database], ([db]) => async (item: Item) => {
  return db.process(item);
});

// Process items in parallel pods
async function processBatch(items: Item[]) {
  const results = await Promise.all(
    items.map(async (item) => {
      const pod = appScope.pod();
      try {
        const processor = await pod.resolve(itemProcessor);
        return await processor(item);
      } finally {
        await appScope.disposePod(pod);
      }
    })
  );
  return results;
}
```

### Reactivity Architecture

Scope manages reactivity by knowing the upstream and downstream graph:
- **Update Propagation**: When a value updates, scope reinvokes actualization for affected nodes
- **Selective Reactivity**: Not everything is reactive by default (performance)
- **Reactive Declaration**: Nodes must explicitly use `.reactive` for automatic updates
- **Controlled Re-actualization**: Only reactive paths trigger recalculation

```typescript
// Non-reactive (default) - won't auto-update
const consumer = derive([source], ([val]) => val * 2);

// Reactive - auto-updates when source changes
const reactiveConsumer = derive([source.reactive], ([val]) => val * 2);
```

## Core Concepts

- **Executor**: Node in dependency graph containing factory function and upstream dependencies
- **Scope**: Container managing graph lifecycle and resolution
- **Pod**: Isolated fork of scope for request-scoped operations
- **Accessor**: Handle to executor's value with get/update/subscribe methods
- **Reactive**: Executors marked `.reactive` trigger downstream updates

## Reactive Updates

### Trigger Conditions
- `accessor.update(value)` on source
- `scope.update(executor, value)`
- NOT direct assignment

### Subscription Rules
- Created: Only when using `.reactive` in dependencies
- Updates: Sequential and batched
- Cleanup: Automatic on scope.dispose()
- Performance: Each `.reactive` adds overhead

### Example
```typescript
const source = provide(() => 0);
const consumer = derive([source.reactive], ([val]) => val * 2);
// consumer auto-updates when source changes via:
await scope.update(source, 1);
```

## Lifecycle Timeline: Graph Traversal & Resolution

```
1. createScope() → Initialize empty dependency graph cache

2. scope.resolve(executor) → Graph Traversal Phase
   ┌─ Analyze dependency graph for executor
   ├─ Identify unresolved dependencies
   ├─ Resolve dependencies recursively (depth-first)
   │  ├─ config (leaf node) → resolved first
   │  ├─ logger (depends on config) → resolved second
   │  └─ userService (depends on config, logger) → resolved last
   ├─ Call factory ONCE per executor (singleton)
   └─ Cache results in graph nodes

3. On update → Graph Propagation Phase
   ├─ Run cleanup callbacks for affected nodes
   ├─ Re-execute factories for updated nodes
   ├─ Trigger reactive updates along graph edges
   └─ Maintain graph consistency

4. scope.dispose() → Graph Cleanup Phase
   ├─ Traverse entire dependency graph
   ├─ Run all cleanup callbacks (reverse dependency order)
   ├─ Clear graph cache
   └─ Dispose child pods
```

**Graph Efficiency**: Only unresolved paths traversed, resolved nodes reused across multiple dependents.

### Cleanup Timing
- `ctl.cleanup()` runs on:
  - Manual release
  - Before re-resolve (on update)
  - Scope disposal

### Reactive Rule

**Use `.reactive` only for pure transformations without side effects**

## Decision Guide

| Scenario | Use | Example |
|----------|-----|---------|
| Config/constants | `provide()` | `provide(() => config)` |
| Resources with cleanup | `derive() + ctl.cleanup()` | DB connections |
| Auto-updating UI | `.reactive` (not in flows) | Display components |
| Manual control | `.static` | Controllers |
| Business logic | `flow.define()` | API handlers |
| Testing | `preset() + initialValues` | Mock services |
| Fresh value in callbacks | `accessor.get()` | Timers |

**Usage Flow:** Define → Resolve → Use → Dispose


---

## ⚡ API REFERENCE

### Core Operations

```typescript
// Sources (no dependencies)
provide(() => ({ count: 0 }), name("state")); // name() is debug-only

// Derived (with dependencies)
derive([dep1, dep2], ([a, b]) => a + b, name("sum"));

// Controllers (for updates)
derive(
  state.static,
  (accessor) => ({
    increment: () => accessor.update((s) => ({ count: s.count + 1 })),
  }),
  name("controller")
);

// Display (pure transformations)
derive(
  state.reactive,
  (data) => ({
    formatted: `Count: ${data.count}`,
  }),
  name("display")
);

// Scope operations
const scope = createScope();
const result = await scope.resolve(executor);
await scope.dispose();
```

### Access Patterns

```typescript
executor.reactive; // Auto-updates (pure functions only)
executor.static; // Returns Accessor<T> for manual access
accessor.get(); // Read current value (always fresh)
accessor.update(v); // Write new value
```

## Error Handling

### Key Rules
- Errors bubble up and fail entire resolution chain
- No global handler - wrap `scope.resolve()` in try/catch
- No built-in retry - implement via scope plugins
- `force: true` re-executes, doesn't retry failures

### Examples
```typescript
// Executor errors propagate
const risky = derive([source], async ([data]) => {
  try {
    return await process(data);
  } catch (e) {
    // Log and rethrow or return default
    throw new Error(`Processing failed: ${e.message}`);
  }
});

// Handle at resolution
try {
  const result = await scope.resolve(risky);
} catch (error) {
  // Handle ExecutorResolutionError
  console.error(error.dependencyChain);
}
```

---

## 📋 THREE CANONICAL PATTERNS

### Pattern 0: Scope and entrypoint stays very close to each other

To make testings relevant for very long time, the escape (resolve utitilies) should happen in a very centralized place, that'll reduce the chance of making side-effects.

Entrypoint here meant the place you kickstart the whole application flow as well as handling application termination (inside out or outside in). Some example

- application entrypoint (node run etc)
- test entry
- webserver starts

### Pattern 1: State + Controller + Display (Most Common)

```typescript
// State source
const state = provide(() => ({ count: 0 }), name("state"));

// Controller for updates
const controller = derive(
  state.static,
  (accessor) => ({
    increment: () => accessor.update((s) => ({ count: s.count + 1 })),
    reset: () => accessor.update({ count: 0 }),
  }),
  name("controller")
);

// Display for pure transformation
const display = derive(
  state.reactive,
  (data) => ({
    formatted: `Count: ${data.count}`,
  }),
  name("display")
);
```

### Pattern 2: Resource Management

```typescript
const service = derive(
  [config],
  ([cfg], ctl) => {
    const resource = createResource(cfg);
    ctl.cleanup(() => resource.dispose()); // ✅ Cleanup on disposal
    return resource;
  },
  name("service")
);
```

### Pattern 3: Timer/Fresh Access

```typescript
const timer = derive(
  [source.static, renderer.static],
  ([sourceAccessor, rendererAccessor], ctl) => {
    const tick = () => {
      sourceAccessor.update(new Date()); // Update source
      rendererAccessor.get().render(); // Access fresh renderer
    };

    const interval = setInterval(tick, 1000);
    ctl.cleanup(() => clearInterval(interval));

    tick(); // Initial run
  },
  name("timer")
);
```

### Pattern 4: Reactive Auto-Update (Graph-Based Circular Avoidance)

```typescript
// Source that changes over time
const dataSource = provide(() => initialValue, name("source"));

// Component that reacts to changes automatically
const consumer = derive(
  [dataSource.reactive],
  ([data]) => {
    // Automatically re-runs when dataSource updates
    return processData(data);
  },
  name("consumer")
);

// Updater that modifies source (separate from consumer)
const updater = derive(
  [dataSource.static],
  ([accessor], ctl) => {
    const interval = setInterval(() => {
      accessor.update(generateNewValue());
    }, 1000);
    ctl.cleanup(() => clearInterval(interval));
    return { update: () => accessor.update(generateNewValue()) };
  },
  name("updater")
);

// App coordination (all components resolved together)
const app = derive(
  [updater, consumer],
  ([update, result]) => ({
    ...update,
    result,
  }),
  name("app")
);

/*
Dependency Graph Structure:
dataSource (source)
├─.reactive→ consumer (reads)
└─.static──→ updater (writes)
             └─app──→ [consumer, updater] (coordinates)

Graph prevents circular dependencies by separating read/write access patterns.
*/
```

### Pattern 5: Complex Graph Composition

```typescript
// Multi-layer dependency graph with shared resources
const config = provide(() => ({ db: { host: "localhost" }, api: { timeout: 5000 } }), name("config"));

// Shared infrastructure layer
const logger = derive([config], ([cfg]) => createLogger(cfg.logLevel), name("logger"));
const metrics = derive([logger], ([log]) => createMetrics(log), name("metrics"));

// Data layer
const database = derive([config, logger], ([cfg, log]) => createDB(cfg.db, log), name("database"));
const cache = derive([config, metrics], ([cfg, met]) => createCache(cfg.cache, met), name("cache"));

// Service layer (multiple services sharing infrastructure)
const userService = derive([database, cache, logger], ([db, cache, log]) =>
  createUserService({ db, cache, logger: log }), name("user-service"));

const orderService = derive([database, cache, metrics], ([db, cache, met]) =>
  createOrderService({ db, cache, metrics: met }), name("order-service"));

// Application layer
const api = derive([userService, orderService, metrics], ([users, orders, met]) =>
  createAPI({ users, orders, metrics: met }), name("api"));

/*
Complex Dependency Graph:
                    config
                   /  |  \
               logger  |  metrics
                 /     |     \
            database   |     cache
              /  \     |    /  \
       userService  \  |  /  orderService
              \      \ | /      /
               \      api      /
                \    /  \    /
                 [resolved together]

Graph benefits:
- Shared infrastructure automatically reused
- Clear separation of concerns by layer
- Optimal resolution order guaranteed
- Easy testing with layer-specific mocks
*/
```

---

## Common Mistakes

- ❌ Side effects in `.reactive` → Re-runs on every change
- ❌ Missing cleanup → Memory leaks
- ❌ Direct value in callbacks → Use `accessor.get()` for fresh
- ❌ Circular deps → Use common source pattern
- ❌ Passing scope around → Use ctl parameter
- ❌ Grouping services unnecessarily → Use exact dependencies needed

---

## Testing with Presets

```typescript
// Replace implementations for testing
const testScope = createScope({
  initialValues: [
    preset(dbExecutor, mockDb),        // Replace with mock
    preset(configExecutor, testConfig), // Override config
  ]
});

// Original executors use test values
const result = await testScope.resolve(appExecutor);
```

---

## 💡 Complete Example

For comprehensive examples with working code, see [patterns/examples.md](./patterns/examples.md).

---

