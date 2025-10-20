# Tag System - Typed Metadata Decoration

Tag provides type-safe metadata attachment to executors, flows, and other components without affecting their core logic. It uses StandardSchema for validation and enables powerful extension patterns.

## Core Concept

Tag provides typed metadata decoration without logic inference. Components operate independently; tags decorate them for extensibility and configuration.

```typescript
import { tag, custom, provide } from "@pumped-fn/core-next";

// Define tag type
const route = tag(custom<{ path: string; method: string }>(), { label: "route" });

// Attach to executor
const handler = provide(() => ({ process: () => "result" }), route({ path: "/api/users", method: "GET" }));

// Query tag
const routeConfig = route.find(handler); // { path: "/api/users", method: "GET" } | undefined
```

## Core API

### Tag Creation

```typescript
import { tag, custom } from "@pumped-fn/core-next";

// Create tag function with schema
const description = tag(custom<string>(), { label: "description" });
const config = tag(custom<{ timeout: number; retries: number }>(), { label: "config" });
const tags = tag(custom<string[]>(), { label: "tags" });

// Create tagged instances
const descTag = description("User service for authentication");
const configTag = config({ timeout: 5000, retries: 3 });
const tagsTag = tags(["auth", "user", "api"]);
```

### Query Methods

```typescript
import { tag, custom, provide } from "@pumped-fn/core-next";

const name = tag(custom<string>(), { label: "name" });
const priority = tag(custom<number>(), { label: "priority" });

const service = provide(() => {}, name("auth-service"), priority(1), priority(2));

// Query methods
const serviceName = name.find(service);     // "auth-service" | undefined
const firstPriority = priority.find(service); // 1 | undefined (first match)
const allPriorities = priority.some(service);  // [1, 2] (all matches)
const nameRequired = name.get(service);     // "auth-service" (throws if not found)
```

### Tag.Container Interface

```typescript
interface Container {
  tags?: Tag.Tagged[]
}

// Executors, Accessors, Flows all implement Tag.Container
// You can attach tags to any of these types
```

## Integration Patterns

### 1. Executor Decoration

```typescript
import { provide, derive, tag, custom, name } from "@pumped-fn/core-next";

// Define tag types
const serviceName = tag(custom<string>(), { label: "service-name" });
const version = tag(custom<string>(), { label: "version" });
const tags = tag(custom<string[]>(), { label: "tags" });

// Attach tags during executor creation
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

// Query tags from executors
const dbName = serviceName.find(database);        // "database"
const dbVersion = version.find(database);         // "2.1.0"
const dbTags = tags.find(database);               // ["persistence", "sql"]
```

### 2. Executor Variants

Tags are accessible from all executor variants:

```typescript
import { provide, tag, custom } from "@pumped-fn/core-next";

const description = tag(custom<string>(), { label: "description" });
const service = provide(() => "value", description("Main service"));

// Access via any executor variant
const desc1 = description.find(service);         // Via main executor
const desc2 = description.find(service.static);  // Via .static
const desc3 = description.find(service.lazy);    // Via .lazy
const desc4 = description.find(service.reactive); // Via .reactive

// All return: "Main service"
```

### 3. Flow Integration

```typescript

import { flow, tag, custom } from "@pumped-fn/core-next";

// Flow-specific tags
const apiTag = tag(custom<{
  version: string;
  auth: boolean;
  rateLimit?: number
}>(), { label: "api" });

const endpoint = tag(custom<{
  path: string;
  method: "GET" | "POST" | "PUT" | "DELETE"
}>(), { label: "endpoint" });

// Attach tags to flow definitions
const userFlow = flow.define({
  name: "user.create",
  input: custom<{ email: string; name: string }>(),
  success: custom<{ userId: string }>(),
  error: custom<{ code: string; message: string }>(),
},
  apiTag({ version: "v1", auth: true, rateLimit: 100 }),
  endpoint({ path: "/api/users", method: "POST" })
);

// Extensions can query flow tags
const apiConfig = apiTag.find(userFlow);     // { version: "v1", auth: true, rateLimit: 100 }
const endpointInfo = endpoint.find(userFlow); // { path: "/api/users", method: "POST" }
```

### 4. Extension Integration

Extensions can use tags for conditional behavior:

```typescript

import { tag, custom, provide, createScope, plugin } from "@pumped-fn/core-next";

// Define extension-specific tags
const monitor = tag(custom<boolean>(), { label: "monitor" });
const logLevel = tag(custom<"debug" | "info" | "warn" | "error">(), { label: "log-level" });

// Mark executors with tags
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

// Extension uses tags for behavior
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

### 1. Configuration Tags

Use tags for component configuration:

```typescript

import { tag, custom, provide, createScope } from "@pumped-fn/core-next";

// Configuration tag
const httpConfig = tag(custom<{
  baseUrl: string;
  timeout: number;
  retries: number;
}>(), { label: "http-config" });

// Component uses configuration tag
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

// Configure via scope tags
const scope = createScope({
  tags: [httpConfig({
    baseUrl: "https://api.example.com",
    timeout: 5000,
    retries: 3
  })]
});

const client = await scope.resolve(httpClient);
```

### 2. Validation and Documentation

```typescript

import { tag, custom, provide } from "@pumped-fn/core-next";
import { z } from "zod";

// Runtime validation with zod
const apiConfig = tag(z.object({
  version: z.string().regex(/^v\d+$/),
  deprecated: z.boolean().optional(),
  maintainer: z.string().email()
}), { label: "api-config" });

const documentation = tag(custom<{
  description: string;
  examples?: string[];
  since?: string;
}>(), { label: "docs" });

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

### 3. Multiple Tags of Same Type

```typescript
import { tag, custom, provide } from "@pumped-fn/core-next";

const serviceTag = tag(custom<string>(), { label: "tag" });

// Multiple tags on same executor
const service = provide(() => "service",
  serviceTag("auth"),
  serviceTag("user-management"),
  serviceTag("v2-api"),
  serviceTag("critical")
);

// Query strategies
const firstTag = serviceTag.find(service);  // "auth" (first match)
const allTags = serviceTag.some(service);   // ["auth", "user-management", "v2-api", "critical"]

// Filter by tag
const hasCriticalTag = serviceTag.some(service).includes("critical"); // true
```

### 4. Symbol-Based Tag Keys

For extension-specific tags, use symbols to avoid conflicts:

```typescript
import { tag, custom, provide } from "@pumped-fn/core-next";

// Private tag keys
const EAGER_INIT = Symbol.for("@myapp/eager-init");
const CACHE_TTL = Symbol.for("@myapp/cache-ttl");

const eager = tag(custom<boolean>(), { label: EAGER_INIT });
const cacheTtl = tag(custom<number>(), { label: CACHE_TTL });

// Extension-specific decoration
const eagerService = provide(() => initializeService(),
  eager(true),
  cacheTtl(300)
);

// Extensions can safely query without conflicts
const shouldEagerInit = eager.find(eagerService); // true
const ttl = cacheTtl.find(eagerService);          // 300
```

## Scope Tag Integration

Tags work with scope configuration for powerful composition:

```typescript
import { createScope, tag, custom } from "@pumped-fn/core-next";

const dbConfig = tag(custom<{ host: string; port: number }>(), { label: "db" });
const cacheConfig = tag(custom<{ ttl: number }>(), { label: "cache" });

// Configure multiple tags at scope level
const appScope = createScope({
  tags: [
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
- **Non-Intrusive**: Tags don't affect core component logic
- **Extensible**: Extensions can define their own tag types
- **Composable**: Multiple tags can be attached to same component
- **Query Flexible**: Find first, get all, or require presence
- **Scope Integration**: Tag configuration at scope level
- **Symbol Support**: Private tag keys prevent conflicts

Tags transform components from simple executors into rich, self-describing, configurable building blocks for complex applications.