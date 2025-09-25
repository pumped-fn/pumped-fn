# Configuration Flow - @pumped-fn/core-next

_Managing configuration from userland sources to library components through meta system_

## 📋 Configuration Journey

Configuration in pumped-fn flows through three stages:

1. **Reading** - Gathering configuration from userland sources
2. **Transformation** - Converting to type-safe meta configuration
3. **Injection** - Providing configuration to components via scope

## 🔄 Stage 1: Reading Userland Configuration

### Traditional Direct Approach

```typescript
// Direct reading - works but not optimal
const rawConfig = provide(() => {
  return {
    dbUrl: process.env.DATABASE_URL || "postgres://localhost",
    apiKey: process.env.API_KEY,
    logLevel: process.env.LOG_LEVEL || "info",
    cacheSettings: JSON.parse(fs.readFileSync("./cache.json", "utf-8"))
  };
});

// Components directly consume - tight coupling
const database = derive([rawConfig], ([cfg]) => {
  return createDB(cfg.dbUrl);  // Direct consumption
});
```

### Common Configuration Sources

```typescript
// Environment variables
const dbUrl = process.env.DATABASE_URL;
const apiKey = process.env.API_KEY;
const nodeEnv = process.env.NODE_ENV || "development";

// Configuration files
const configFile = JSON.parse(fs.readFileSync("./config.json", "utf-8"));
const secrets = JSON.parse(fs.readFileSync("./secrets.json", "utf-8"));

// CLI arguments
const args = process.argv.slice(2);
const port = args.includes("--port") ?
  args[args.indexOf("--port") + 1] : "3000";

// Runtime detection
const isProduction = nodeEnv === "production";
const isDevelopment = nodeEnv === "development";
const isTest = nodeEnv === "test";
```

## 🔧 Stage 2: Transform to Meta Configuration

### Define Meta Schemas

```typescript
import { meta, custom } from "@pumped-fn/core-next";
// Use actual validation library if available
import { z } from "zod";

// Define configuration schemas
const dbConfigMeta = meta("db", z.object({
  host: z.string(),
  port: z.number().min(1).max(65535),
  database: z.string(),
  ssl: z.boolean(),
  poolSize: z.number().min(1).max(100)
}));

const cacheConfigMeta = meta("cache", custom<{
  driver: "redis" | "memory";
  ttl: number;
  maxSize: number;
}>());

const apiConfigMeta = meta("api", custom<{
  baseUrl: string;
  timeout: number;
  retries: number;
  apiKey: string;
}>());

const logConfigMeta = meta("logging", custom<{
  level: "debug" | "info" | "warn" | "error";
  format: "json" | "pretty";
}>());
```

### Configuration Factory Pattern

```typescript
// Transform raw configuration to meta
function createConfiguration(env: string): Meta.Meta[] {
  // Read from various sources
  const dbUrl = process.env.DATABASE_URL || getDefaultDbUrl(env);
  const redisUrl = process.env.REDIS_URL;
  const apiKey = process.env.API_KEY || readSecretFile("api-key");

  // Read config files with fallbacks
  const configPath = `./config.${env}.json`;
  const configFile = fs.existsSync(configPath)
    ? JSON.parse(fs.readFileSync(configPath, "utf-8"))
    : {};

  // Parse complex configurations
  const parsedDb = parseDbUrl(dbUrl);

  // Return typed meta configuration
  return [
    dbConfigMeta({
      host: parsedDb.host,
      port: parsedDb.port,
      database: parsedDb.database,
      ssl: env === "production",
      poolSize: configFile.dbPoolSize || (env === "production" ? 50 : 5)
    }),

    cacheConfigMeta({
      driver: redisUrl ? "redis" : "memory",
      ttl: configFile.cacheTtl || 300,
      maxSize: configFile.cacheMaxSize || 1000
    }),

    apiConfigMeta({
      baseUrl: configFile.apiBaseUrl || "http://localhost:3000",
      timeout: configFile.apiTimeout || 5000,
      retries: env === "production" ? 3 : 1,
      apiKey: apiKey
    }),

    logConfigMeta({
      level: (process.env.LOG_LEVEL || (env === "production" ? "info" : "debug")) as any,
      format: env === "production" ? "json" : "pretty"
    })
  ];
}

// Helper functions
function parseDbUrl(url: string): { host: string; port: number; database: string } {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port) || 5432,
    database: parsed.pathname.slice(1)
  };
}

function getDefaultDbUrl(env: string): string {
  const defaults = {
    production: "postgres://prod-server/app",
    development: "postgres://localhost/app_dev",
    test: "postgres://localhost/app_test"
  };
  return defaults[env] || defaults.development;
}
```

## 💉 Stage 3: Component Configuration Access

### Components Declare Configuration Needs

```typescript
import { provide, derive } from "@pumped-fn/core-next";

// Database component with configuration
const database = provide((ctl) => {
  // Type-safe configuration access
  const config = dbConfigMeta.get(ctl.scope);

  const db = new Database({
    host: config.host,
    port: config.port,
    database: config.database,
    ssl: config.ssl,
    connectionLimit: config.poolSize
  });

  // Register cleanup
  ctl.cleanup(async () => {
    await db.close();
  });

  return db;
});

// Cache component
const cache = provide((ctl) => {
  const config = cacheConfigMeta.get(ctl.scope);

  if (config.driver === "redis") {
    const redis = new Redis({ /* redis config */ });
    ctl.cleanup(() => redis.disconnect());
    return redis;
  } else {
    return new MemoryCache({
      ttl: config.ttl,
      maxSize: config.maxSize
    });
  }
});

// Logger with configuration
const logger = provide((ctl) => {
  const config = logConfigMeta.get(ctl.scope);

  return createLogger({
    level: config.level,
    format: config.format,
    transports: config.format === "json"
      ? [new JsonTransport()]
      : [new PrettyTransport()]
  });
});

// Service layer using infrastructure
const userService = derive(
  [database, cache, logger],
  ([db, cache, log]) => {
    log.info("UserService initialized");

    return {
      async findUser(id: string) {
        const cached = await cache.get(`user:${id}`);
        if (cached) {
          log.debug("User found in cache", { id });
          return cached;
        }

        const user = await db.query("SELECT * FROM users WHERE id = ?", [id]);
        if (user) {
          await cache.set(`user:${id}`, user);
        }
        return user;
      }
    };
  }
);
```

## 🚀 Application Bootstrap

### Production Bootstrap

```typescript
async function createApp() {
  // 1. Determine environment
  const env = process.env.NODE_ENV || "development";

  // 2. Load configuration from all sources
  const configuration = createConfiguration(env);

  // 3. Create scope with configuration
  const scope = createScope({
    meta: configuration
  });

  // 4. Resolve main application components
  const app = await scope.resolve(applicationRoot);

  // 5. Return app interface
  return {
    start: () => app.start(),
    stop: async () => {
      await app.stop();
      await scope.dispose();
    }
  };
}

// Usage
const app = await createApp();
await app.start();

// Graceful shutdown
process.on("SIGTERM", async () => {
  await app.stop();
  process.exit(0);
});
```

### Environment-Specific Configurations

```typescript
// Configuration presets by environment
const configurations = {
  production: (): Meta.Meta[] => [
    dbConfigMeta({
      host: "prod-db-cluster.example.com",
      port: 5432,
      database: "app_prod",
      ssl: true,
      poolSize: 50
    }),
    cacheConfigMeta({
      driver: "redis",
      ttl: 3600,
      maxSize: 10000
    }),
    logConfigMeta({
      level: "info",
      format: "json"
    })
  ],

  development: (): Meta.Meta[] => [
    dbConfigMeta({
      host: "localhost",
      port: 5432,
      database: "app_dev",
      ssl: false,
      poolSize: 5
    }),
    cacheConfigMeta({
      driver: "memory",
      ttl: 60,
      maxSize: 100
    }),
    logConfigMeta({
      level: "debug",
      format: "pretty"
    })
  ],

  test: (): Meta.Meta[] => [
    dbConfigMeta({
      host: ":memory:",
      port: 0,
      database: "test",
      ssl: false,
      poolSize: 1
    }),
    cacheConfigMeta({
      driver: "memory",
      ttl: 1,
      maxSize: 10
    }),
    logConfigMeta({
      level: "error",
      format: "json"
    })
  ]
};

// Select configuration
const env = process.env.NODE_ENV || "development";
const scope = createScope({
  meta: configurations[env]()
});
```

## 🧪 Testing with Configuration Overrides

```typescript
describe("UserService", () => {
  // Test-specific configuration
  function createTestScope(overrides?: {
    db?: Partial<DbConfig>;
    cache?: Partial<CacheConfig>;
  }) {
    return createScope({
      meta: [
        dbConfigMeta({
          host: ":memory:",
          port: 0,
          database: "test",
          ssl: false,
          poolSize: 1,
          ...overrides?.db
        }),
        cacheConfigMeta({
          driver: "memory",
          ttl: 1,
          maxSize: 10,
          ...overrides?.cache
        })
      ]
    });
  }

  test("with default test config", async () => {
    const scope = createTestScope();
    const service = await scope.resolve(userService);
    // Test with in-memory database
  });

  test("with custom cache config", async () => {
    const scope = createTestScope({
      cache: { ttl: 100, maxSize: 50 }
    });
    const service = await scope.resolve(userService);
    // Test with custom cache settings
  });

  afterEach(async () => {
    await scope.dispose();
  });
});
```

## 🔄 Configuration Hot Reload Pattern

```typescript
// Configuration that can be reloaded
const reloadableConfig = provide((ctl) => {
  let config = loadConfigFile();

  // Watch for changes
  const watcher = fs.watch("./config.json", async () => {
    const newConfig = loadConfigFile();
    await ctl.reload();  // Trigger re-resolution
  });

  ctl.cleanup(() => watcher.close());

  return config;
});

// Components automatically get new config on reload
const service = derive([reloadableConfig], ([config]) => {
  return createService(config);
});
```

## 📊 Configuration Validation

```typescript
// Validate configuration completeness
function validateConfiguration(meta: Meta.Meta[]): void {
  const requiredKeys = ["db", "cache", "api", "logging"];
  const providedKeys = new Set<string>();

  for (const m of meta) {
    const key = (m as any).key;  // Access meta key
    providedKeys.add(key);
  }

  const missing = requiredKeys.filter(k => !providedKeys.has(k));
  if (missing.length > 0) {
    throw new Error(`Missing required configuration: ${missing.join(", ")}`);
  }
}

// Use in bootstrap
const configuration = createConfiguration(env);
validateConfiguration(configuration);  // Throws if incomplete
const scope = createScope({ meta: configuration });
```

## 🎯 Best Practices

### 1. Single Source of Truth
Define each configuration schema once and reuse.

### 2. Environment Hierarchy
```typescript
// Base → Environment → Runtime overrides
const baseConfig = loadBaseConfig();
const envConfig = loadEnvConfig(env);
const runtimeConfig = parseCliArgs();
const finalConfig = { ...baseConfig, ...envConfig, ...runtimeConfig };
```

### 3. Fail Fast
Validate configuration at startup, not during runtime.

### 4. Type Safety
Use validation libraries (zod, yup) for runtime validation.

### 5. Secret Management
Never commit secrets. Load from environment or secure stores.

## 📚 API Reference

For complete API documentation, refer to [api.md](./api.md). Key configuration APIs:

- `meta()` - Define configuration schemas
- `createScope({ meta })` - Inject configuration
- `metaFn.get(scope)` - Access configuration in components
- `metaFn.find(scope)` - Optional configuration access

## Next Steps

- [Testing Strategies](./testing.md) - Testing with different configurations
- [Core Concepts](./concepts.md) - Understanding dependency graphs
- [API Reference](./api.md) - Complete API documentation