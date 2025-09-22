# Component Authoring - @pumped-fn/core-next

_Expert guide for creating reusable, configurable components using graph-based dependency resolution_

## Core Authoring Principle: Meta-Based Configuration

Components are designed around **configuration variation** through meta-based scope configuration. The graph's lazy evaluation combined with meta-driven configuration enables powerful configuration strategies impossible with traditional dependency injection.

### The Meta Configuration Strategy

1. **Lazy Graph Resolution**: Dependency graph remains unresolved until scope.resolve() is called
2. **Meta-Based Configuration**: Components export meta definitions; configuration applied to scope/pod
3. **Configuration Inheritance**: Child pods inherit parent scope configurations and add their own
4. **Multi-Environment Scopes**: Same component structure, different meta configurations per scope instance

### Meta vs Traditional Configuration

**Traditional DI Configuration**:
```typescript
// Manual configuration passing - rigid, imperative
const config = { timeout: 5000 };
const logger = new Logger(config);
const db = new Database(config, logger);
const service = new UserService(db, logger); // Fixed at construction
```

**Meta-Based Configuration**:
```typescript
// Declarative components with meta-driven configuration
const dbConfigMeta = meta("db-config", custom<{ timeout: number }>());
const logger = provide((ctl) => {
  const config = dbConfigMeta.get(ctl.scope);
  return new Logger(config);
});
const db = derive([logger], ([log], ctl) => {
  const config = dbConfigMeta.get(ctl.scope);
  return new Database(config, log);
});
const service = derive([db, logger], ([db, log]) => new UserService(db, log));

// Configuration variation without changing component structure
const testScope = createScope({
  meta: [dbConfigMeta({ timeout: 100 })] // Different config, same components
});
```

**Meta Configuration Benefits**:
- **Scope-Level Configuration**: Configure entire component hierarchies at scope creation
- **Composition-Friendly**: Combine multiple meta configurations
- **Type-Safe Configuration**: TypeScript ensures meta schema compatibility
- **Pod Inheritance**: Pods inherit scope meta and can add their own

---

## Essential APIs

### Meta Definition
```typescript
const configMeta = meta("config", custom<{ timeout: number; retries: number }>());
```

### Configuration Access in Executors
```typescript
const httpClient = provide((ctl) => {
  const config = configMeta.get(ctl.scope);
  return createClient(config);
}, name("http-client"));
```

### Meta Export
```typescript
export const meta = {
  config: configMeta
};
export const defaultConfig = configMeta({ timeout: 5000, retries: 3 });
```

### Scope Integration
```typescript
const scope = createScope({ meta: [configMeta({ timeout: 10000, retries: 1 })] });
```

---

## Component Patterns

### Complete Example: Multi-Service Component

```typescript
// Meta definitions
const dbConfigMeta = meta("db-config", custom<{ host: string; port: number; ssl: boolean; poolSize: number }>());
const apiConfigMeta = meta("api-config", custom<{ baseUrl: string; timeout: number }>());
const cacheConfigMeta = meta("cache-config", custom<{ ttl: number; maxSize: number }>());

// Service hierarchy
const logger = provide((ctl) => {
  const dbConfig = dbConfigMeta.get(ctl.scope);
  return createLogger(dbConfig.ssl ? "secure" : "basic");
}, name("logger"));

const database = provide((ctl) => {
  const config = dbConfigMeta.get(ctl.scope);
  return createDatabase(config);
}, name("database"));

const cache = derive([logger], ([log], ctl) => {
  const config = cacheConfigMeta.get(ctl.scope);
  return createCache({ ...config, logger: log });
}, name("cache"));

const httpClient = derive([logger], ([log], ctl) => {
  const config = apiConfigMeta.get(ctl.scope);
  return createHttpClient({ ...config, logger: log });
}, name("http-client"));

const userService = derive(
  [database, cache, httpClient],
  ([db, cache, client]) => ({
    findUser: (id: string) => db.query("SELECT * FROM users WHERE id = ?", [id]),
    createUser: (data: UserData) => db.insert("users", data),
    syncUser: (id: string) => client.post(`/sync/${id}`)
  }),
  name("user-service")
);

// Meta exports and configurations
export const meta = {
  dbConfig: dbConfigMeta,
  apiConfig: apiConfigMeta,
  cacheConfig: cacheConfigMeta
};

export const configurations = {
  test: (): Meta.Meta[] => [
    dbConfigMeta({ host: "test-db", port: 5433, ssl: true, poolSize: 5 }),
    apiConfigMeta({ baseUrl: "http://mock-api:3000", timeout: 1000 }),
    cacheConfigMeta({ ttl: 60, maxSize: 100 })
  ],
  production: (): Meta.Meta[] => [
    dbConfigMeta({ host: "prod-cluster.example.com", ssl: true, poolSize: 50 }),
    apiConfigMeta({ baseUrl: "https://api.example.com", timeout: 10000 }),
    cacheConfigMeta({ ttl: 3600, maxSize: 10000 })
  ],
  development: (): Meta.Meta[] => [
    dbConfigMeta({ host: "localhost", port: 5432, ssl: false, poolSize: 10 }),
    apiConfigMeta({ baseUrl: "http://localhost:3000", timeout: 5000 }),
    cacheConfigMeta({ ttl: 300, maxSize: 1000 })
  ]
};

// For testing with mocks, still use presets for executor replacement
export const mockPresets = {
  all: (): Core.Preset<unknown>[] => [
    preset(database, createMockDatabase()),
    preset(httpClient, createMockHttpClient()),
    preset(cache, createMockCache())
  ]
};

// Usage
const testScope = createScope({ meta: configurations.test() });
const prodScope = createScope({ meta: configurations.production() });

// Mixed usage: meta for configuration, presets for mocks
const mockTestScope = createScope({
  meta: configurations.test(),
  initialValues: mockPresets.all()
});
```

### Configuration Pattern Variations

| Pattern | Use Case | Example |
|---------|----------|---------|
| **Single Meta** | Simple service configuration | `configMeta({ timeout: 5000 })` |
| **Multi-Meta** | Complex app configuration | Multiple meta definitions per scope |
| **Environment** | Runtime environment switching | `createScope({ meta: envConfigs[env] })` |
| **Pod-Based** | Request-scoped configuration | `scope.pod({ meta: [reqMeta(request)] })` |
| **Factory** | Dynamic component creation | `createComponent(baseMetas)` function |

### Environment-Aware Configuration

```typescript
const environmentMeta = meta("environment", custom<"development" | "production" | "test">());
const dbConfigMeta = meta("db-config", custom<{ host: string; pool: number }>());

const createEnvConfigs = (env: string): Meta.Meta[] => {
  const configs = {
    development: { host: "localhost", pool: 5 },
    production: { host: "prod-cluster", pool: 50 },
    test: { host: "test-db", pool: 1 }
  };

  return [
    environmentMeta(env as any),
    dbConfigMeta(configs[env] || configs.development)
  ];
};

// Usage in executor
const database = provide((ctl) => {
  const config = dbConfigMeta.get(ctl.scope);
  const env = environmentMeta.get(ctl.scope);
  return createDatabase({ ...config, environment: env });
});
```

---

## Testing Strategies

### Unified Test Setup

```typescript
// Test helper with configuration isolation
export const createTestScope = (env: 'test' | 'mock' = 'test', metaOverrides: Meta.Meta[] = []) => {
  const baseMeta = configurations[env === 'mock' ? 'test' : env]();
  const mockPresets = env === 'mock' ? mockPresets.all() : [];

  return createScope({
    meta: [...baseMeta, ...metaOverrides],
    initialValues: mockPresets
  });
};

// Test examples
test("user service with test config", async () => {
  const scope = createTestScope('test', [dbConfigMeta({ poolSize: 1 })]);
  const service = await scope.resolve(userService);
  expect(service.findUser).toBeDefined();
});

test("user service with mocks", async () => {
  const scope = createTestScope('mock');
  const service = await scope.resolve(userService);
  const result = await service.createUser({ name: "Test" });
  expect(result.id).toBe("mock-id");
});
```

---

## Export Patterns

```typescript
// Standard export
export { userService as component } from "./executors";
export { meta, configurations, mockPresets } from "./configurations";
export type { UserService, DbConfig } from "./types";

// Namespace export
export namespace UserManagement {
  export const service = userService;
  export const meta = { dbConfig: dbConfigMeta, apiConfig: apiConfigMeta };
  export const configurations = { test, production, development };
  export const mockPresets = { all };
  export type Service = UserService;
}

// Factory pattern
export const createUserComponent = (baseMeta: Meta.Meta[] = []) => ({
  meta: { dbConfig: dbConfigMeta, apiConfig: apiConfigMeta },
  service: userService,
  createScope: (additionalMeta: Meta.Meta[] = []) =>
    createScope({ meta: [...baseMeta, ...additionalMeta] })
});
```

---

## Best Practices

### Configuration Design
- **Meta Definitions**: One meta definition per logical configuration unit
- **Schema Validation**: Use StandardSchema for runtime validation
- **Typing**: Use strong TypeScript types for all meta schemas
- **Scope Configuration**: Configure at scope/pod level, not individual executors

### Meta Creation
- **Pure Functions**: Meta creation functions should be pure and side-effect free
- **Descriptive Keys**: Use clear, intention-revealing keys for meta definitions
- **Type Safety**: Ensure meta schemas maintain type compatibility
- **Composition**: Design meta configurations to be composable

### Testing Patterns
- **Isolation**: Each test should use its own scope
- **Mixed Strategy**: Use meta for configuration, presets for mocks
- **Configuration Variation**: Test components with different meta configurations
- **Cleanup**: Always dispose scopes after tests

### Component Design
- **Configuration Access**: Access configuration via `ctl.scope` parameter
- **Resource Management**: Use cleanup callbacks for resources requiring disposal
- **Error Handling**: Let errors bubble up through the dependency chain
- **Naming**: Use descriptive names with the `name()` meta for debugging

---

## Anti-Patterns

### ❌ Direct Meta Mutation
```typescript
// Don't modify meta values directly after scope creation
const scope = createScope({ meta: [configMeta({ host: "localhost" })] });
const config = configMeta.get(scope);
config.host = "new-host"; // Breaks immutability
```

### ❌ Ignoring Controller Parameter
```typescript
// Don't ignore the ctl parameter when you need configuration
const service = provide(() => {
  // Missing ctl parameter - can't access scope meta
  return createService({ defaultConfig });
});
```

### ❌ Side Effects in Reactive
```typescript
// Don't put side effects in reactive dependencies
const display = derive(
  [data.reactive],
  ([value]) => {
    console.log(value); // Side effect in reactive
    return value;
  }
);
```

### ❌ Circular Dependencies
```typescript
// Don't create circular dependencies
const a = derive([b], ([b]) => b + 1);
const b = derive([a], ([a]) => a + 1); // Circular
```

---

## Component Lifecycle

### Definition Phase
```typescript
// 1. Define meta schemas
const configMeta = meta("config", custom<ConfigType>());

// 2. Define derived resources with configuration access
const service = provide((ctl) => {
  const config = configMeta.get(ctl.scope);
  return createService(config);
});

// 3. Export component and meta definitions
export { service };
export const meta = { config: configMeta };
export const defaultConfig = configMeta(defaultValues);
```

### Usage Phase
```typescript
// 1. Create scope with desired configuration
const scope = createScope({ meta: [configMeta(customValues)] });

// 2. Resolve entry point
const resolvedService = await scope.resolve(service);

// 3. Use resolved service
const result = await resolvedService.process(data);

// 4. Cleanup when done
await scope.dispose();
```

This approach ensures components are reusable, testable, and configurable while maintaining type safety and clear dependency relationships through the graph resolution system.