# Component Authoring - Building Reusable Components

Learn how to create reusable, configurable components using graph-based dependency resolution with meta-driven configuration strategies.

## Core Authoring Principle: Meta-Based Configuration

Components are designed around **configuration variation** through meta-based scope configuration. The graph's lazy evaluation combined with meta-driven configuration enables powerful configuration strategies impossible with traditional dependency injection.

### The Meta Configuration Strategy

1. **Lazy Graph Resolution**: Dependency graph remains unresolved until `scope.resolve()` is called
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
import { meta, custom, provide, derive, createScope } from "@pumped-fn/core-next";

const dbConfigMeta = meta("db-config", custom<{ timeout: number }>());

class Logger {
  constructor(config: { timeout: number }) {}
}
class Database {
  constructor(config: { timeout: number }, log: Logger) {}
}
class UserService {
  constructor(db: Database, log: Logger) {}
}

const logger = provide((ctl) => {
  const config = dbConfigMeta.get(ctl.scope);
  return new Logger(config);
});
const db = derive([logger], ([log], ctl) => {
  const config = dbConfigMeta.get(ctl.scope);
  return new Database(config, log);
});
const service = derive([db, logger], ([db, log]) => new UserService(db, log));

const testScope = createScope({
  meta: [dbConfigMeta({ timeout: 100 })]
});
```

**Meta Configuration Benefits**:
- **Scope-Level Configuration**: Configure entire component hierarchies at scope creation
- **Composition-Friendly**: Combine multiple meta configurations
- **Type-Safe Configuration**: TypeScript ensures meta schema compatibility
- **Pod Inheritance**: Pods inherit scope meta and can add their own

## Essential APIs

### Meta Definition
```typescript
import { meta, custom } from "@pumped-fn/core-next";

const configMeta = meta("config", custom<{ timeout: number; retries: number }>());
```

### Configuration Access in Executors
```typescript
import { provide, meta, custom, name } from "@pumped-fn/core-next";

const configMeta = meta("http-config", custom<{ timeout: number }>());

function createClient(config: { timeout: number }) {
  return { fetch: (url: string) => Promise.resolve({}) };
}

const httpClient = provide((ctl) => {
  const config = configMeta.get(ctl.scope);
  return createClient(config);
}, name("http-client"));
```

### Meta Export Pattern
```typescript
import { meta, custom } from "@pumped-fn/core-next";

const configMeta = meta("http-config", custom<{ timeout: number; retries: number }>());

export { configMeta as meta };
export const defaultConfig = configMeta({ timeout: 5000, retries: 3 });
```

### Scope Integration
```typescript
import { createScope, meta, custom } from "@pumped-fn/core-next";

const configMeta = meta("http-config", custom<{ timeout: number; retries: number }>());

const scope = createScope({
  meta: [configMeta({ timeout: 10000, retries: 1 })]
});
```

## Component Patterns

### 1. Basic Configurable Component

```typescript
import { provide, derive, meta, custom, name } from "@pumped-fn/core-next";

// Define configuration meta
const httpConfigMeta = meta("http-config", custom<{
  baseUrl: string;
  timeout: number;
  retries: number;
}>());

// Create HTTP client component
const httpClient = provide((ctl) => {
  const config = httpConfigMeta.get(ctl.scope);

  return {
    get: async (path: string) => {
      // Implementation using config.baseUrl, config.timeout
      return fetch(`${config.baseUrl}${path}`, {
        signal: AbortSignal.timeout(config.timeout)
      });
    }
  };
}, name("http-client"));

// Create API service that uses HTTP client
const apiService = derive([httpClient], ([http], ctl) => {
  const config = httpConfigMeta.get(ctl.scope);

  return {
    getUser: (id: string) => http.get(`/users/${id}`),
    createUser: (data: any) => http.post('/users', data)
  };
}, name("api-service"));

// Export component with meta
export { httpClient, apiService, httpConfigMeta };
export const defaultHttpConfig = httpConfigMeta({
  baseUrl: "https://api.example.com",
  timeout: 5000,
  retries: 3
});
```

### 2. Multi-Environment Configuration

```typescript
import { provide, derive, meta, custom, name, createScope } from "@pumped-fn/core-next";

const httpConfigMeta = meta("http-config", custom<{
  baseUrl: string;
  timeout: number;
  retries: number;
}>());

const httpClient = provide((ctl) => {
  const config = httpConfigMeta.get(ctl.scope);
  return {
    get: async (path: string) => {
      return fetch(`${config.baseUrl}${path}`, {
        signal: AbortSignal.timeout(config.timeout)
      });
    }
  };
}, name("http-client"));

const apiService = derive([httpClient], ([http], ctl) => {
  const config = httpConfigMeta.get(ctl.scope);
  return {
    getUser: (id: string) => http.get(`/users/${id}`),
    createUser: (data: any) => http.get('/users')
  };
}, name("api-service"));

const devConfig = httpConfigMeta({
  baseUrl: "http://localhost:3000",
  timeout: 1000,
  retries: 1
});

const stagingConfig = httpConfigMeta({
  baseUrl: "https://staging-api.example.com",
  timeout: 3000,
  retries: 2
});

const prodConfig = httpConfigMeta({
  baseUrl: "https://api.example.com",
  timeout: 5000,
  retries: 3
});

const devScope = createScope({ meta: [devConfig] });
const stagingScope = createScope({ meta: [stagingConfig] });
const prodScope = createScope({ meta: [prodConfig] });

const devApi = await devScope.resolve(apiService);
const prodApi = await prodScope.resolve(apiService);
```

### 3. Composable Configuration

```typescript
import { provide, meta, custom, createScope } from "@pumped-fn/core-next";

const dbConfigMeta = meta("db-config", custom<{
  host: string;
  port: number;
  database: string;
}>());

const cacheConfigMeta = meta("cache-config", custom<{
  host: string;
  port: number;
  ttl: number;
}>());

const logConfigMeta = meta("log-config", custom<{
  level: 'debug' | 'info' | 'warn' | 'error';
  format: 'json' | 'text';
}>());

class Database {
  constructor(config: { host: string; port: number; database: string }) {}
}
class Cache {
  constructor(config: { host: string; port: number; ttl: number }) {}
}
class Logger {
  constructor(config: { level: string; format: string }) {}
}

const database = provide((ctl) => {
  const config = dbConfigMeta.get(ctl.scope);
  return new Database(config);
});

const cache = provide((ctl) => {
  const config = cacheConfigMeta.get(ctl.scope);
  return new Cache(config);
});

const logger = provide((ctl) => {
  const config = logConfigMeta.get(ctl.scope);
  return new Logger(config);
});

const appScope = createScope({
  meta: [
    dbConfigMeta({ host: "localhost", port: 5432, database: "myapp" }),
    cacheConfigMeta({ host: "localhost", port: 6379, ttl: 300 }),
    logConfigMeta({ level: "info", format: "json" })
  ]
});
```

### 4. Component Library Structure

```typescript
// lib/http/index.ts
export const httpComponents = {
  client: httpClient,
  service: apiService
};

export const httpMeta = {
  config: httpConfigMeta
};

export const httpDefaults = {
  dev: httpConfigMeta({
    baseUrl: "http://localhost:3000",
    timeout: 1000,
    retries: 1
  }),
  prod: httpConfigMeta({
    baseUrl: "https://api.example.com",
    timeout: 5000,
    retries: 3
  })
};

// lib/database/index.ts
export const dbComponents = {
  connection: database,
  repository: userRepository
};

export const dbMeta = {
  config: dbConfigMeta
};

export const dbDefaults = {
  dev: dbConfigMeta({
    host: "localhost",
    port: 5432,
    database: "myapp_dev"
  }),
  test: dbConfigMeta({
    host: "localhost",
    port: 5432,
    database: "myapp_test"
  })
};

// app/index.ts - Compose components
import { httpComponents, httpDefaults } from '../lib/http';
import { dbComponents, dbDefaults } from '../lib/database';

const application = derive(
  [httpComponents.service, dbComponents.repository],
  ([api, repo]) => ({
    start: () => console.log("App started"),
    api,
    repo
  })
);

const devScope = createScope({
  meta: [httpDefaults.dev, dbDefaults.dev]
});

const testScope = createScope({
  meta: [httpDefaults.dev, dbDefaults.test]
});
```

## Advanced Patterns

### 1. Conditional Configuration

```typescript
import { provide, derive, meta, custom, name } from "@pumped-fn/core-next";

const httpConfigMeta = meta("http-config", custom<{ baseUrl: string; timeout: number; retries: number }>());

const httpClient = provide((ctl) => {
  const config = httpConfigMeta.get(ctl.scope);
  return {
    get: async (path: string) => fetch(`${config.baseUrl}${path}`)
  };
}, name("http-client"));

const featureFlagMeta = meta("feature-flags", custom<{
  enableCache: boolean;
  enableMetrics: boolean;
}>());

function withCaching<T>(service: T): T {
  return service;
}

const dataService = derive([httpClient], ([http], ctl) => {
  const flags = featureFlagMeta.get(ctl.scope);

  const service = {
    getData: async (id: string) => {
      const data = await http.get(`/data/${id}`);

      if (flags.enableMetrics) {
      }

      return data;
    }
  };

  if (flags.enableCache) {
    return withCaching(service);
  }

  return service;
});
```

### 2. Meta Validation

```typescript
import { z } from "zod";

const configSchema = z.object({
  apiUrl: z.string().url(),
  timeout: z.number().min(100).max(30000),
  retries: z.number().min(0).max(5)
});

const validatedConfigMeta = meta("validated-config", configSchema);

// TypeScript + runtime validation
const httpService = provide((ctl) => {
  const config = validatedConfigMeta.get(ctl.scope);
  // config is properly typed AND runtime validated
  return createHttpService(config);
});
```

### 3. Configuration Inheritance

```typescript
import { provide, meta, custom, createScope } from "@pumped-fn/core-next";

const baseConfigMeta = meta("base-config", custom<{
  environment: 'dev' | 'staging' | 'prod';
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}>());

const serviceConfigMeta = meta("service-config", custom<{
  timeout: number;
  retries: number;
}>());

function createService(config: any) {
  return { process: () => "result" };
}

const configuredService = provide((ctl) => {
  const baseConfig = baseConfigMeta.get(ctl.scope);
  const serviceConfig = serviceConfigMeta.get(ctl.scope);

  return createService({
    ...baseConfig,
    ...serviceConfig
  });
});

const scope = createScope({
  meta: [
    baseConfigMeta({ environment: 'dev', logLevel: 'debug' }),
    serviceConfigMeta({ timeout: 1000, retries: 1 })
  ]
});
```

## Testing Strategies

### 1. Configuration-Based Testing

```typescript
// Test with different configurations
describe('User Service', () => {
  test('handles timeouts in production config', async () => {
    const testScope = createScope({
      meta: [httpConfigMeta({
        baseUrl: "http://slow-server",
        timeout: 100,
        retries: 0
      })]
    });

    const service = await testScope.resolve(userService);

    await expect(service.getUser('123')).rejects.toThrow('timeout');
  });

  test('works with test configuration', async () => {
    const testScope = createScope({
      meta: [httpConfigMeta({
        baseUrl: "http://localhost:3001",
        timeout: 5000,
        retries: 1
      })]
    });

    const service = await testScope.resolve(userService);
    const user = await service.getUser('123');

    expect(user.id).toBe('123');
  });
});
```

### 2. Mock Configuration

```typescript
// Mock HTTP client through configuration
const mockHttpConfig = httpConfigMeta({
  baseUrl: "mock://api",
  timeout: 1000,
  retries: 0
});

// Override HTTP client with mock
const mockScope = createScope({
  meta: [mockHttpConfig]
}, preset(httpClient, mockHttpService));
```

## Key Benefits

- **Declarative Configuration**: Define component configuration requirements clearly
- **Environment Flexibility**: Same components work across all environments
- **Type Safety**: Full TypeScript support for configuration schemas
- **Composition**: Mix and match configurations for different scenarios
- **Testing**: Easy to test components with different configurations
- **Lazy Resolution**: Configuration applied only when components are resolved
- **Inheritance**: Pods inherit and extend parent scope configurations

This meta-based approach transforms component authoring from imperative configuration passing to declarative, type-safe, composable configuration management.