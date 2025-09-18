# Component Authoring - @pumped-fn/core-next

_Expert guide for creating reusable, configurable components using graph-based dependency resolution_

## Core Authoring Principle: Graph-Based Configuration

Components are designed around **configuration variation** through the dependency graph resolution system. The graph's lazy evaluation enables powerful configuration strategies impossible with traditional dependency injection.

### The Graph Configuration Strategy

1. **Lazy Graph Resolution**: Dependency graph remains unresolved until scope.resolve() is called
2. **Strategic Injection Points**: Use `preset` to override specific graph nodes before resolution
3. **Configuration Inheritance**: Child components inherit parent configurations through graph paths
4. **Multi-Environment Graphs**: Same graph structure, different configurations per scope instance

### Graph vs Traditional Configuration

**Traditional DI Configuration**:
```typescript
// Manual configuration passing - rigid, imperative
const config = { timeout: 5000 };
const logger = new Logger(config);
const db = new Database(config, logger);
const service = new UserService(db, logger); // Fixed at construction
```

**Graph-Based Configuration**:
```typescript
// Declarative graph with configuration injection points
const config = provide(() => ({ timeout: 5000 }));
const logger = derive([config], ([cfg]) => new Logger(cfg));
const db = derive([config, logger], ([cfg, log]) => new Database(cfg, log));
const service = derive([db, logger], ([db, log]) => new UserService(db, log));

// Configuration variation without changing graph structure
const testScope = createScope({
  initialValues: [preset(config, { timeout: 100 })] // Different config, same graph
});
```

**Graph Configuration Benefits**:
- **Flexible Substitution**: Replace any graph node without affecting structure
- **Composition-Friendly**: Combine multiple configuration presets
- **Type-Safe Overrides**: TypeScript ensures configuration compatibility
- **Testability**: Easy mocking of any dependency layer

---

## Essential APIs

### Configuration Source
```typescript
const config = provide(() => ({ timeout: 5000, retries: 3 }), name("config"));
```

### Derived Resources
```typescript
const httpClient = derive([config], ([cfg]) => createClient(cfg), name("http-client"));
```

### Configuration Variation
```typescript
export const useCustomConfig = (): Core.Preset<Config> =>
  preset(config, { timeout: 10000, retries: 1 });
```

### Scope Integration
```typescript
const scope = createScope({ initialValues: [useCustomConfig()] });
```

---

## Component Patterns

### Complete Example: Multi-Service Component

```typescript
// Configuration sources
const dbConfig = provide(() => ({ host: "localhost", port: 5432, ssl: false, poolSize: 10 }), name("db-config"));
const apiConfig = provide(() => ({ baseUrl: "http://localhost:3000", timeout: 5000 }), name("api-config"));
const cacheConfig = provide(() => ({ ttl: 300, maxSize: 1000 }), name("cache-config"));

// Service hierarchy
const logger = derive([dbConfig], ([db]) => createLogger(db.ssl ? "secure" : "basic"), name("logger"));
const database = derive([dbConfig], ([config]) => createDatabase(config), name("database"));
const cache = derive([cacheConfig, logger], ([cache, log]) => createCache({ ...cache, logger: log }), name("cache"));
const httpClient = derive([apiConfig, logger], ([api, log]) => createHttpClient({ ...api, logger: log }), name("http-client"));

const userService = derive(
  [database, cache, httpClient],
  ([db, cache, client]) => ({
    findUser: (id: string) => db.query("SELECT * FROM users WHERE id = ?", [id]),
    createUser: (data: UserData) => db.insert("users", data),
    syncUser: (id: string) => client.post(`/sync/${id}`)
  }),
  name("user-service")
);

// Configuration variations
export const presets = {
  test: (): Core.Preset<unknown>[] => [
    preset(dbConfig, { host: "test-db", port: 5433, ssl: true, poolSize: 5 }),
    preset(apiConfig, { baseUrl: "http://mock-api:3000", timeout: 1000 }),
    preset(cacheConfig, { ttl: 60, maxSize: 100 })
  ],
  production: (): Core.Preset<unknown>[] => [
    preset(dbConfig, { host: "prod-cluster.example.com", ssl: true, poolSize: 50 }),
    preset(apiConfig, { baseUrl: "https://api.example.com", timeout: 10000 }),
    preset(cacheConfig, { ttl: 3600, maxSize: 10000 })
  ],
  mock: (): Core.Preset<unknown>[] => [
    preset(database, createMockDatabase()),
    preset(httpClient, createMockHttpClient()),
    preset(cache, createMockCache())
  ]
};

// Usage
const testScope = createScope({ initialValues: presets.test() });
const prodScope = createScope({ initialValues: presets.production() });
```

### Configuration Pattern Variations

| Pattern | Use Case | Example |
|---------|----------|---------|
| **Single Config** | Simple service configuration | `preset(config, { timeout: 5000 })` |
| **Multi-Layer** | Complex app configuration | Multiple config executors with dependencies |
| **Environment** | Runtime environment switching | `createEnvConfig({ dev: ..., prod: ... })` |
| **Plugin-Based** | Extensible service enhancement | Service with `.use()` method for plugins |
| **Factory** | Dynamic component creation | `createComponent(baseConfig)` function |

### Environment-Aware Factory

```typescript
const createEnvConfig = <T>(configs: { development: T; production: T; test: T }) =>
  derive([environment], ([env]) => configs[env.name as keyof typeof configs] || configs.development);

// Apply to any config type
const databaseConfig = createEnvConfig({
  development: { host: "localhost", pool: 5 },
  production: { host: "prod-cluster", pool: 50 },
  test: { host: "test-db", pool: 1 }
});
```

---

## Testing Strategies

### Unified Test Setup

```typescript
// Test helper with configuration isolation
export const createTestScope = (env: 'test' | 'mock' = 'test', overrides: Core.Preset<unknown>[] = []) => {
  const basePresets = env === 'mock' ? presets.mock() : presets.test();
  return createScope({ initialValues: [...basePresets, ...overrides] });
};

// Test examples
test("user service with test config", async () => {
  const scope = createTestScope('test', [preset(dbConfig, { poolSize: 1 })]);
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
export { presets } from "./presets";
export type { UserService, DbConfig } from "./types";

// Namespace export
export namespace UserManagement {
  export const service = userService;
  export const presets = { test, production, mock };
  export type Service = UserService;
}

// Factory pattern
export const createUserComponent = (baseConfig: Partial<DbConfig> = {}) => ({
  config: preset(dbConfig, { ...defaultDbConfig, ...baseConfig }),
  service: userService,
  createScope: (additionalPresets: Core.Preset<unknown>[] = []) =>
    createScope({ initialValues: [customConfig, ...additionalPresets] })
});
```

---

## Best Practices

### Configuration Design
- **Single Source**: One config executor per logical configuration unit
- **Composition**: Derive complex configs from simpler ones
- **Typing**: Use strong TypeScript types for all configurations
- **Validation**: Validate configuration at the source, not in consumers

### Preset Creation
- **Pure Functions**: Preset functions should be pure and side-effect free
- **Descriptive Names**: Use clear, intention-revealing names for preset functions
- **Type Safety**: Ensure presets maintain type compatibility
- **Composition**: Design presets to be composable

### Testing Patterns
- **Isolation**: Each test should use its own scope
- **Mock Strategy**: Create comprehensive mock presets for testing
- **Configuration Variation**: Test components with different configurations
- **Cleanup**: Always dispose scopes after tests

### Component Design
- **Dependency Clarity**: Make dependencies explicit through executor parameters
- **Resource Management**: Use cleanup callbacks for resources requiring disposal
- **Error Handling**: Let errors bubble up through the dependency chain
- **Naming**: Use descriptive names with the `name()` meta for debugging

---

## Anti-Patterns

### ❌ Direct Configuration Mutation
```typescript
// Don't modify config objects directly
const config = await scope.resolve(dbConfig);
config.host = "new-host"; // Breaks immutability
```

### ❌ Scope Passing
```typescript
// Don't pass scope to executors
const service = derive([config], ([cfg], ctl, scope) => {
  // scope parameter is anti-pattern
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
// 1. Define configuration sources
const config = provide(() => defaultConfig);

// 2. Define derived resources
const service = derive([config], ([cfg]) => createService(cfg));

// 3. Export component and variations
export { service, config };
export const useCustomConfig = () => preset(config, customValues);
```

### Usage Phase
```typescript
// 1. Create scope with desired configuration
const scope = createScope({ initialValues: [useCustomConfig()] });

// 2. Resolve entry point
const resolvedService = await scope.resolve(service);

// 3. Use resolved service
const result = await resolvedService.process(data);

// 4. Cleanup when done
await scope.dispose();
```

This approach ensures components are reusable, testable, and configurable while maintaining type safety and clear dependency relationships through the graph resolution system.