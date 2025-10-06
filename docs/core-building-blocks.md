# Core Building Blocks

The fundamental APIs for creating graph nodes: `provide`, `derive`, and `preset`.

## provide

Creates an executor with no dependencies. This is the foundation of your dependency graph.

### Type Signature

```typescript
function provide<T>(
  factory: (controller: Core.Controller) => T | Promise<T>,
  ...metas: Meta.Meta[]
): Core.Executor<T>
```

### Parameters

- **factory**: Function that returns the value. Receives a controller for lifecycle management.
- **metas**: Optional metadata decorators (e.g., `name()`, custom meta).

### Return Value

Returns `Core.Executor<T>` - a graph node that can be:
- Resolved in a scope
- Used as a dependency in `derive`
- Overridden with `preset`
- Modified with `.lazy`, `.static`, `.reactive`

### Use Cases

**Configuration and Constants**
```typescript
const config = provide(() => ({
  dbUrl: "postgresql://localhost/prod",
  apiKey: process.env.API_KEY
}));
```

**External Resources**
```typescript
const database = provide(async () => {
  const pool = await createPool(/* ... */);
  return {
    query: (sql: string) => pool.query(sql)
  };
});
```

**Services Without Dependencies**
```typescript
const logger = provide(() => ({
  log: (msg: string) => console.log(`[${new Date().toISOString()}] ${msg}`),
  error: (msg: string) => console.error(`[${new Date().toISOString()}] ${msg}`)
}));
```

### Graph Resolution

Each `provide` creates a node in your dependency graph. The scope resolves it exactly once per resolution cycle (singleton by default).

```typescript
const value = provide(() => ({ data: "hello" }));

const scope = createScope();
const result1 = await scope.resolve(value);
const result2 = await scope.resolve(value);

// Same instance - resolved once, cached
result1 === result2 // true
```

### Controller Access

The factory receives a controller for lifecycle management:

```typescript
const websocket = provide((controller) => {
  const ws = new WebSocket('ws://localhost:8080');

  controller.cleanup(async () => {
    ws.close();
    await waitForClose(ws);
  });

  return ws;
});
```

**Controller API**:
- `cleanup(fn: () => void | Promise<void>)`: Register cleanup function
- `release()`: Manually trigger release of this executor
- `reload()`: Force re-resolution of this executor
- `scope`: Access to the parent scope

## derive

Creates an executor that depends on other executors. This is where you compose your dependency graph.

### Type Signatures

**Single Dependency**
```typescript
function derive<T, D extends Core.BaseExecutor<unknown>>(
  dependency: D,
  factory: (dep: Core.InferOutput<D>, controller: Core.Controller) => T | Promise<T>,
  ...metas: Meta.Meta[]
): Core.Executor<T>
```

**Array Dependencies**
```typescript
function derive<T, D extends ReadonlyArray<Core.BaseExecutor<unknown>>>(
  dependencies: D,
  factory: (deps: Core.InferOutput<D>, controller: Core.Controller) => T | Promise<T>,
  ...metas: Meta.Meta[]
): Core.Executor<T>
```

**Object Dependencies**
```typescript
function derive<T, D extends Record<string, Core.BaseExecutor<unknown>>>(
  dependencies: D,
  factory: (deps: Core.InferOutput<D>, controller: Core.Controller) => T | Promise<T>,
  ...metas: Meta.Meta[]
): Core.Executor<T>
```

### Parameters

- **dependencies**: Single executor, array of executors, or object of executors
- **factory**: Function receiving resolved dependencies and controller
- **metas**: Optional metadata decorators

### Return Value

Returns `Core.Executor<T>` with full type inference from dependencies.

### Use Cases

**Single Dependency**
```typescript
const config = provide(() => ({ apiUrl: "https://api.example.com" }));

const apiClient = derive(config, (cfg) => ({
  fetch: (path: string) => fetch(`${cfg.apiUrl}${path}`)
}));
```

**Multiple Dependencies (Array)**
```typescript
const db = provide(async () => createDatabase());
const cache = provide(async () => createCache());
const logger = provide(() => createLogger());

const userRepository = derive([db, cache, logger], ([db, cache, log]) => ({
  async findById(id: string) {
    const cached = await cache.get(`user:${id}`);
    if (cached) return cached;

    log.log(`Fetching user ${id}`);
    const user = await db.query('SELECT * FROM users WHERE id = $1', [id]);
    await cache.set(`user:${id}`, user);
    return user;
  }
}));
```

**Multiple Dependencies (Object)**

Prefer object syntax when you have many dependencies or want clear parameter names:

```typescript
const userService = derive(
  { db, cache, logger, config },
  ({ db, cache, logger, config }) => ({
    async createUser(data: UserData) {
      logger.log('Creating user');
      const user = await db.insert('users', data);
      await cache.invalidate(`users:*`);
      return user;
    }
  })
);
```

### Dependency Destructuring

When using `derive` with `@pumped-fn/core-next`, prefer destructuring in the factory function for cleaner code:

```typescript
const app = derive(
  { config, db, logger },
  ({ config, db, logger }) => ({
    // Dependencies already destructured, ready to use
    start: () => logger.log(`Starting app on ${config.port}`)
  })
);
```

### Graph Resolution Order

Dependencies always resolve before the dependent node:

```typescript
const a = provide(() => {
  console.log('A');
  return 1;
});

const b = derive(a, (aValue) => {
  console.log('B');
  return aValue + 1;
});

const c = derive([a, b], ([aValue, bValue]) => {
  console.log('C');
  return aValue + bValue;
});

await scope.resolve(c);
// Output: A, B, C
// Graph: a -> b -> c
```

### Dependency Variations

Control dependency resolution behavior:

**`.lazy` - Conditional Resolution**
```typescript
const expensiveService = provide(async () => {
  await heavy_computation();
  return { process: (data: any) => data };
});

const smartService = derive(expensiveService.lazy, (lazyService) => ({
  async process(data: any, useExpensive: boolean) {
    if (useExpensive) {
      const service = await lazyService.resolve();
      return service.process(data);
    }
    return data;
  }
}));
```

**`.static` - Non-Reactive Access**
```typescript
const config = provide(() => ({ port: 3000 }));

const controller = derive(config.static, (configAccessor) => ({
  updatePort: (port: number) => configAccessor.update((c) => ({ ...c, port }))
}));
```

**`.reactive` - Auto-Update on Changes**
```typescript
const counter = provide(() => 0);

const doubled = derive(counter.reactive, (count) => count * 2);

const scope = createScope();
const accessor = await scope.resolveAccessor(doubled);

console.log(accessor.get()); // 0
await scope.update(counter, 1);
console.log(accessor.get()); // 2 - auto-updated
```

## preset

Overrides an executor's value in a scope. This is the key mechanism for testing and configuration.

### Type Signature

```typescript
function preset<T>(
  executor: Core.Executor<T> | Escapable<T>,
  value: T | Core.Executor<T>
): Core.Preset<T>
```

### Parameters

- **executor**: The executor to override
- **value**: The replacement value (can be a static value or another executor)

### Return Value

Returns `Core.Preset<T>` - used when creating scopes or pods.

### Use Cases

**Testing with Mock Values**
```typescript
const database = provide(async () => createRealDatabase());
const userService = derive(database, (db) => ({
  findUser: (id: string) => db.query('SELECT * FROM users WHERE id = $1', [id])
}));

// Production
const prodScope = createScope();
const prodService = await prodScope.resolve(userService);

// Testing
const mockDb = { query: () => Promise.resolve([{ id: '1', name: 'Test' }]) };
const testScope = createScope(preset(database, mockDb));
const testService = await testScope.resolve(userService);
```

**Environment Configuration**
```typescript
const config = provide(() => ({
  apiUrl: 'https://prod.example.com',
  timeout: 5000
}));

const testConfig = {
  apiUrl: 'http://localhost:3000',
  timeout: 1000
};

const testScope = createScope(preset(config, testConfig));
```

**Replacing with Another Executor**
```typescript
const realLogger = provide(() => ({
  log: (msg: string) => console.log(msg)
}));

const silentLogger = provide(() => ({
  log: (msg: string) => { /* no-op */ }
}));

const quietScope = createScope(preset(realLogger, silentLogger));
```

**Multiple Presets**
```typescript
const scope = createScope(
  preset(database, mockDb),
  preset(cache, mockCache),
  preset(logger, silentLogger)
);
```

### Graph Propagation

Presets affect the entire downstream graph:

```typescript
const config = provide(() => ({ version: 'v1' }));
const api = derive(config, (cfg) => ({ endpoint: `/${cfg.version}/users` }));
const client = derive(api, (api) => ({ fetch: () => api.endpoint }));

// Override config
const scope = createScope(preset(config, { version: 'v2' }));

const result = await scope.resolve(client);
// result.fetch() returns '/v2/users' - entire chain uses new config
```

### Pod-Level Presets

Create isolated contexts with different configurations:

```typescript
const requestId = provide(() => crypto.randomUUID());

const scope = createScope();

const pod1 = scope.pod(preset(requestId, 'request-1'));
const pod2 = scope.pod(preset(requestId, 'request-2'));

await pod1.resolve(requestId); // 'request-1'
await pod2.resolve(requestId); // 'request-2'
```

## Type Inference

All three APIs provide complete type inference:

```typescript
const config = provide(() => ({ port: 3000, host: 'localhost' }));
// Type: Core.Executor<{ port: number; host: string }>

const server = derive(config, (cfg) => ({
  // cfg is inferred as { port: number; host: string }
  start: () => `Server on ${cfg.host}:${cfg.port}`
}));
// Type: Core.Executor<{ start: () => string }>

const testPreset = preset(config, { port: 8080, host: '127.0.0.1' });
// Type: Core.Preset<{ port: number; host: string }>
```

## Practical Patterns

### Dependency Injection

```typescript
interface Database {
  query(sql: string): Promise<any[]>;
}

interface Logger {
  log(msg: string): void;
}

const database = provide<Database>(async () => createPostgresPool());
const logger = provide<Logger>(() => createPinoLogger());

const userService = derive({ database, logger }, ({ database, logger }) => ({
  async findUser(id: string) {
    logger.log(`Finding user ${id}`);
    return database.query('SELECT * FROM users WHERE id = $1', [id]);
  }
}));
```

### Configuration Management

```typescript
const baseConfig = provide(() => ({
  env: process.env.NODE_ENV || 'development',
  port: 3000
}));

const envConfig = derive(baseConfig, (base) => {
  if (base.env === 'production') {
    return { ...base, port: 8080, logLevel: 'error' };
  }
  return { ...base, logLevel: 'debug' };
});

// Test with different environment
const testScope = createScope(
  preset(baseConfig, { env: 'test', port: 9000 })
);
```

### Computed Resources

```typescript
const config = provide(() => ({
  dbHost: 'localhost',
  dbPort: 5432
}));

const connectionString = derive(config, (cfg) =>
  `postgresql://${cfg.dbHost}:${cfg.dbPort}/mydb`
);

const database = derive(connectionString, async (connStr) =>
  createPool(connStr)
);
```
