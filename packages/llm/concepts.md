# Core Concepts - @pumped-fn/core-next

_Foundation concepts for understanding pumped-fn's dependency graph orchestration_

## 🎯 The Dependency Graph

Pumped-fn orchestrates applications through **dependency graphs** where nodes represent executors and edges represent dependencies. Resolution flows through the graph automatically, eliminating manual wiring.

```typescript
// Define dependency graph declaratively
const config = provide(() => configData);
const logger = derive([config], ([cfg]) => new LoggerService(cfg));
const db = derive([config, logger], ([cfg, log]) => new DatabaseService(cfg, log));
const userService = derive([db, logger], ([db, log]) => new UserService(db, log));

// Single resolve triggers entire graph resolution
await scope.resolve(userService);
// Automatically resolves: config → logger → db → userService
```

### Graph Properties

- **Automatic Ordering**: Topological sort ensures correct resolution order
- **Smart Caching**: Each node resolved once per scope
- **Reactive Updates**: Changes propagate through `.reactive` edges
- **Circular Detection**: Prevented at definition time
- **Lazy Evaluation**: Nodes resolve only when needed

## Core Building Blocks

### Executors (Graph Nodes)

Executors are the fundamental units that hold dependencies and factory functions:

```typescript
// Source executor - no dependencies (leaf node)
const config = provide(() => loadConfig());

// Derived executor - with dependencies
const service = derive(
  [database, logger],     // Dependencies
  ([db, log]) => {        // Factory function
    return new Service(db, log);
  }
);
```

**Executor Variants:**
- `executor` - Standard resolution
- `executor.reactive` - Triggers downstream updates
- `executor.static` - Returns accessor for manual control
- `executor.lazy` - Deferred resolution

### Scope (Graph Container)

Scope manages the dependency graph lifecycle:

```typescript
const scope = createScope();

// Resolution
await scope.resolve(executor);  // Resolves entire dependency chain

// Updates
await scope.update(executor, newValue);  // Triggers reactive updates

// Cleanup
await scope.dispose();  // Runs all cleanup callbacks
```

### Flows (Structured Business Logic)

Flows provide validated, structured operations with context propagation:

```typescript
// Define contract
const createUserFlow = flow.define({
  input: schema<{ email: string }>(),
  success: schema<{ userId: string }>(),
  error: schema<{ code: string }>()
});

// Implement with dependencies from graph
const handler = createUserFlow.handler(
  { db, validator },  // Dependencies
  async ({ db, validator }, ctx, input) => {
    // Business logic with validated input
    return ctx.ok({ userId: "123" });
  }
);
```

### Meta (Type-Safe Configuration)

Meta provides typed metadata decoration for components:

```typescript
// Define configuration schema
const dbConfigMeta = meta("db", schema<{ host: string; port: number }>());

// Components access configuration
const database = provide((ctl) => {
  const config = dbConfigMeta.get(ctl.scope);
  return createDB(config);
});

// Inject configuration at scope level
const scope = createScope({
  meta: [dbConfigMeta({ host: "localhost", port: 5432 })]
});
```

### Accessor (Runtime Data Access)

Accessors provide type-safe access to runtime data:

```typescript
// Define accessor with validation
const userId = accessor("user.id", schema<string>());

// Use in flows
const handler = flow.handler(async (ctx, input) => {
  userId.set(ctx, input.userId);  // Type-safe set
  const id = userId.get(ctx);     // Type-safe get
  return ctx.ok({ processed: true });
});
```

## 🔄 Resolution Lifecycle

### Graph Traversal Phases

```
1. createScope() → Initialize empty dependency graph

2. scope.resolve(executor) → Graph Traversal
   ├─ Analyze dependency graph
   ├─ Topological sort of dependencies
   ├─ Resolve dependencies (depth-first)
   │  ├─ config (no deps) → resolved first
   │  ├─ logger (needs config) → resolved second
   │  └─ service (needs logger) → resolved last
   ├─ Execute factory ONCE per executor
   └─ Cache in graph nodes

3. On update → Graph Propagation
   ├─ Identify affected downstream nodes
   ├─ Run cleanup for affected nodes
   ├─ Re-execute factories
   └─ Trigger reactive updates

4. scope.dispose() → Cleanup
   ├─ Traverse graph (reverse order)
   ├─ Run cleanup callbacks
   └─ Clear cache
```

## 📊 Graph Architecture Patterns

### Layered Architecture

```typescript
namespace Infrastructure {
  export const config = provide(() => loadConfig());
  export const logger = derive([config], ([cfg]) => createLogger(cfg));
}

namespace Data {
  export const database = derive(
    [Infrastructure.config, Infrastructure.logger],
    ([cfg, log]) => createDB(cfg, log)
  );
  export const cache = derive(
    [Infrastructure.config],
    ([cfg]) => createCache(cfg)
  );
}

namespace Services {
  export const users = derive(
    [Data.database, Data.cache],
    ([db, cache]) => new UserService(db, cache)
  );
}

namespace API {
  export const handlers = derive(
    [Services.users, Infrastructure.logger],
    ([users, log]) => createHandlers(users, log)
  );
}
```

### Graph Benefits Over Traditional DI

| Aspect | Traditional DI | Pumped-fn Graph |
|--------|---------------|-----------------|
| **Wiring** | Manual, imperative | Automatic, declarative |
| **Order** | Developer managed | Topologically sorted |
| **Caching** | Manual implementation | Built-in smart caching |
| **Updates** | Manual propagation | Reactive graph updates |
| **Testing** | Mock injection complexity | Graph node replacement |
| **Type Safety** | Runtime errors possible | Compile-time validation |

## 🔑 Key Principles

### 1. Single Responsibility
Each executor should have one clear purpose in the graph.

### 2. Explicit Dependencies
All dependencies declared upfront, no hidden coupling.

### 3. Immutable Configuration
Configuration injected at scope creation, not mutated during execution.

### 4. Lazy Evaluation
Graph nodes resolved only when needed, not eagerly.

### 5. Type Safety
Full TypeScript inference throughout the graph.

## 🚀 Quick Start Example

```typescript
import { provide, derive, createScope, flow, meta, accessor } from "@pumped-fn/core-next";

// 1. Define configuration
const dbMeta = meta("db", schema<{ url: string }>());

// 2. Build dependency graph
const database = provide((ctl) => {
  const cfg = dbMeta.get(ctl.scope);
  const db = createConnection(cfg.url);
  ctl.cleanup(() => db.close());
  return db;
});

const userService = derive([database], ([db]) => ({
  findUser: (id: string) => db.query(`SELECT * FROM users WHERE id = ?`, [id])
}));

// 3. Define business flow
const getUserFlow = flow.define({
  input: schema<{ userId: string }>(),
  success: schema<{ user: User }>(),
  error: schema<{ code: string }>()
});

const getUser = getUserFlow.handler(
  { service: userService },
  async ({ service }, ctx, input) => {
    const user = await service.findUser(input.userId);
    return user ? ctx.ok({ user }) : ctx.ko({ code: "NOT_FOUND" });
  }
);

// 4. Bootstrap application
async function createApp() {
  const scope = createScope({
    meta: [dbMeta({ url: process.env.DATABASE_URL })]
  });

  const handler = await scope.resolve(getUser);
  return { handler, shutdown: () => scope.dispose() };
}
```

## 📚 API Discovery

**Important**: When implementing with pumped-fn, always refer to [api.md](./api.md) for the complete API reference. This ensures you use actual APIs rather than making assumptions about available methods.

The API reference provides:
- Complete function signatures
- Type definitions
- Available methods and properties
- Import paths
- Usage patterns

## Next Steps

- [Configuration Flow](./configuration.md) - Managing configuration from userland to library
- [Testing Strategies](./testing.md) - Graph-aware testing patterns
- [API Reference](./api.md) - Complete API documentation
- [Flow Patterns](./flow.md) - Business logic implementation