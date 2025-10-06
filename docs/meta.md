# Meta System - Typed Metadata Decoration

Meta provides type-safe metadata attachment to executors, flows, and other components without affecting their core logic. It uses StandardSchema for validation and enables powerful extension patterns.

## Core Concept

Meta provides typed metadata decoration without logic inference. Components operate independently; meta decorates them for extensibility and configuration.

```ts twoslash
import { meta, custom, provide } from "@pumped-fn/core-next";

// Define meta type
const route = meta("route", custom<{ path: string; method: string }>());

// Attach to executor
const handler = provide(() => ({ process: () => "result" }), route({ path: "/api/users", method: "GET" }));

// Query meta
const routeConfig = route.find(handler); // { path: "/api/users", method: "GET" } | undefined
```

## Core API

### Meta Creation

```ts twoslash
import { meta, custom } from "@pumped-fn/core-next";

// Create meta function with schema
const description = meta("description", custom<string>());
const config = meta("config", custom<{ timeout: number; retries: number }>());
const tags = meta("tags", custom<string[]>());

// Create meta instances
const descMeta = description("User service for authentication");
const configMeta = config({ timeout: 5000, retries: 3 });
const tagsMeta = tags(["auth", "user", "api"]);
```

### Query Methods

```ts twoslash
import { meta, custom, provide } from "@pumped-fn/core-next";

const name = meta("name", custom<string>());
const priority = meta("priority", custom<number>());

const service = provide(() => {}, name("auth-service"), priority(1), priority(2));

// Query methods
const serviceName = name.find(service);     // "auth-service" | undefined
const firstPriority = priority.find(service); // 1 | undefined (first match)
const allPriorities = priority.some(service);  // [1, 2] (all matches)
const nameRequired = name.get(service);     // "auth-service" (throws if not found)
```

### MetaContainer Interface

```ts twoslash

interface MetaContainer {
  metas?: Meta.Meta[]
}

// Executors, Accessors, Flows all implement MetaContainer
// You can attach meta to any of these types
```

## Integration Patterns

### 1. Executor Decoration

```ts twoslash
import { provide, derive, meta, custom, name } from "@pumped-fn/core-next";

// Define meta types
const serviceName = meta("service-name", custom<string>());
const version = meta("version", custom<string>());
const tags = meta("tags", custom<string[]>());

// Attach meta during executor creation
const database = provide(() => ({
  query: async (sql: string) => []
}),
  serviceName("database"),
  version("2.1.0"),
  tags(["persistence", "sql"])
);

const userService = derive([database], ([db]) => ({
  getUser: (id: string) => db.query(`SELECT * FROM users WHERE id = ${id}`)
}),
  serviceName("user-service"),
  version("1.0.0"),
  tags(["business-logic", "users"])
);

// Query meta from executors
const dbName = serviceName.find(database);        // "database"
const dbVersion = version.find(database);         // "2.1.0"
const dbTags = tags.find(database);               // ["persistence", "sql"]
```

### 2. Executor Variants

Meta is accessible from all executor variants:

```ts twoslash
import { provide, meta, custom } from "@pumped-fn/core-next";

const description = meta("description", custom<string>());
const service = provide(() => "value", description("Main service"));

// Access via any executor variant
const desc1 = description.find(service);         // Via main executor
const desc2 = description.find(service.static);  // Via .static
const desc3 = description.find(service.lazy);    // Via .lazy
const desc4 = description.find(service.reactive); // Via .reactive

// All return: "Main service"
```

### 3. Flow Integration

```ts twoslash

import { flow, meta, custom } from "@pumped-fn/core-next";

// Flow-specific meta
const apiMeta = meta("api", custom<{
  version: string;
  auth: boolean;
  rateLimit?: number
}>());

const endpoint = meta("endpoint", custom<{
  path: string;
  method: "GET" | "POST" | "PUT" | "DELETE"
}>());

// Attach meta to flow definitions
const userFlow = flow.define({
  name: "user.create",
  input: custom<{ email: string; name: string }>(),
  success: custom<{ userId: string }>(),
  error: custom<{ code: string; message: string }>(),
},
  apiMeta({ version: "v1", auth: true, rateLimit: 100 }),
  endpoint({ path: "/api/users", method: "POST" })
);

// Extensions can query flow meta
const apiConfig = apiMeta.find(userFlow);     // { version: "v1", auth: true, rateLimit: 100 }
const endpointInfo = endpoint.find(userFlow); // { path: "/api/users", method: "POST" }
```

### 4. Extension Integration

Extensions can use meta for conditional behavior:

```ts twoslash

import { meta, custom, provide, createScope, plugin } from "@pumped-fn/core-next";

// Define extension-specific meta
const monitor = meta("monitor", custom<boolean>());
const logLevel = meta("log-level", custom<"debug" | "info" | "warn" | "error">());

// Mark executors with meta
const criticalService = provide(() => ({
  process: () => "critical-result"
}),
  monitor(true),
  logLevel("error")
);

const backgroundService = provide(() => ({
  process: () => "background-result"
}),
  monitor(false),
  logLevel("debug")
);

// Extension uses meta for behavior
const monitoringExtension = plugin({
  init: (scope) => {
    scope.onChange((event, executor, value) => {
      const shouldMonitor = monitor.find(executor);
      const level = logLevel.find(executor) || "info";

      if (shouldMonitor && event === "resolve") {
        console.log(`[${level.toUpperCase()}] Resolved:`, executor.toString());
      }
    });
  }
});

const scope = createScope();
scope.use(monitoringExtension);

// Only criticalService will be logged due to monitor(true)
const critical = await scope.resolve(criticalService);
const background = await scope.resolve(backgroundService);
```

## Advanced Patterns

### 1. Configuration Meta

Use meta for component configuration:

```ts twoslash

import { meta, custom, provide, createScope } from "@pumped-fn/core-next";

// Configuration meta
const httpConfig = meta("http-config", custom<{
  baseUrl: string;
  timeout: number;
  retries: number;
}>());

// Component uses configuration meta
const httpClient = provide((ctl) => {
  const config = httpConfig.get(ctl.scope); // Throws if not found

  return {
    get: async (path: string) => {
      return fetch(`${config.baseUrl}${path}`, {
        signal: AbortSignal.timeout(config.timeout)
      });
    }
  };
});

// Configure via scope meta
const scope = createScope({
  meta: [httpConfig({
    baseUrl: "https://api.example.com",
    timeout: 5000,
    retries: 3
  })]
});

const client = await scope.resolve(httpClient);
```

### 2. Validation and Documentation

```ts twoslash

import { meta, custom, provide } from "@pumped-fn/core-next";
import { z } from "zod";

// Runtime validation with zod
const apiConfig = meta("api-config", z.object({
  version: z.string().regex(/^v\d+$/),
  deprecated: z.boolean().optional(),
  maintainer: z.string().email()
}));

const documentation = meta("docs", custom<{
  description: string;
  examples?: string[];
  since?: string;
}>());

// Well-documented, validated component
const userApi = provide(() => ({
  getUser: (id: string) => ({ id, name: "John" })
}),
  apiConfig({
    version: "v2",
    deprecated: false,
    maintainer: "dev@example.com"
  }),
  documentation({
    description: "User management API with CRUD operations",
    examples: [
      "const user = await userApi.getUser('123')",
      "const users = await userApi.listUsers()"
    ],
    since: "2.0.0"
  })
);
```

### 3. Multiple Meta of Same Type

```ts twoslash
import { meta, custom, provide } from "@pumped-fn/core-next";

const tag = meta("tag", custom<string>());

// Multiple tags on same executor
const service = provide(() => "service",
  tag("auth"),
  tag("user-management"),
  tag("v2-api"),
  tag("critical")
);

// Query strategies
const firstTag = tag.find(service);  // "auth" (first match)
const allTags = tag.some(service);   // ["auth", "user-management", "v2-api", "critical"]

// Filter by tag
const hasCriticalTag = tag.some(service).includes("critical"); // true
```

### 4. Symbol-Based Meta Keys

For extension-specific meta, use symbols to avoid conflicts:

```ts twoslash
import { meta, custom, provide } from "@pumped-fn/core-next";

// Private meta keys
const EAGER_INIT = Symbol.for("@myapp/eager-init");
const CACHE_TTL = Symbol.for("@myapp/cache-ttl");

const eager = meta(EAGER_INIT, custom<boolean>());
const cacheTtl = meta(CACHE_TTL, custom<number>());

// Extension-specific decoration
const eagerService = provide(() => initializeService(),
  eager(true),
  cacheTtl(300)
);

// Extensions can safely query without conflicts
const shouldEagerInit = eager.find(eagerService); // true
const ttl = cacheTtl.find(eagerService);          // 300
```

## Scope Meta Integration

Meta works with scope configuration for powerful composition:

```ts twoslash
import { createScope, meta, custom } from "@pumped-fn/core-next";

const dbConfig = meta("db", custom<{ host: string; port: number }>());
const cacheConfig = meta("cache", custom<{ ttl: number }>());

// Configure multiple meta at scope level
const appScope = createScope({
  meta: [
    dbConfig({ host: "localhost", port: 5432 }),
    cacheConfig({ ttl: 600 })
  ]
});

// All executors in this scope can access the configuration
const database = provide((ctl) => {
  const config = dbConfig.get(ctl.scope);
  return createDatabase(config.host, config.port);
});
```

## Key Benefits

- **Type Safety**: Full TypeScript support with schema validation
- **Non-Intrusive**: Meta doesn't affect core component logic
- **Extensible**: Extensions can define their own meta types
- **Composable**: Multiple meta can be attached to same component
- **Query Flexible**: Find first, get all, or require presence
- **Scope Integration**: Meta configuration at scope level
- **Symbol Support**: Private meta keys prevent conflicts

Meta transforms components from simple executors into rich, self-describing, configurable building blocks for complex applications.