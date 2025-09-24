# Meta System - @pumped-fn/core-next

_Typed metadata decoration system for executors, flows, and extensions_

## Core Concept

Meta provides typed metadata attachment without logic inference. Resources operate independently; meta decorates for extensibility.

Uses [standardschema v1](https://github.com/standard-schema/standard-schema) for type-safe validation. If there's zod in the dependency, use it

```typescript
import { meta, custom } from "@pumped-fn/core-next";

// Define meta type
const route = meta("route", custom<{ path: string; method: string }>());

// Attach to executor
const handler = provide(
  () => processRequest(),
  route({ path: "/api/users", method: "GET" })
);

// Query meta
const routeConfig = route.find(handler);
```

## Core API

### Meta Creation

```typescript
// Create meta function
const metaFn = meta<V>(key: string | symbol, schema: StandardSchemaV1<V>);

// Call to create meta instance
const metaInstance = metaFn(value: V);
```

### Query Methods

```typescript
metaFn.find(source: MetaContainer): V | undefined;     // First match
metaFn.some(source: MetaContainer): V[];               // All matches
metaFn.get(source: MetaContainer): V;                  // First match (validated)
metaFn.partial<D>(d: D): D;                           // Partial meta object
```

### MetaContainer Interface

```typescript
interface MetaContainer {
  metas?: Meta.Meta[];
}

// Executors, Accessors, Flows all implement MetaContainer
```

## Integration Patterns

### With Executors

```typescript
import { provide, derive, meta, custom } from "@pumped-fn/core-next";

// Attach during creation
const logger = meta("logger", custom<{ level: string }>());
const dbExecutor = provide(() => createDB(), logger({ level: "debug" }));

// Access via any executor variant
const config = logger.find(dbExecutor.static); // Via .static
const config = logger.find(dbExecutor.lazy); // Via .lazy
const config = logger.find(dbExecutor); // Via main executor
```

### With Flows

```typescript
// Flows are MetaContainers
const apiMeta = meta("api", custom<{ version: string; auth: boolean }>());

const userFlow = flow.define(
  {
    name: "user.create",
    input: userSchema,
    success: resultSchema,
    error: errorSchema,
  },
  apiMeta({ version: "v1", auth: true })
);

// Access in extensions
const apiConfig = apiMeta.find(flowDefinition);
```

### With Extensions

```typescript
// Extension-specific meta
const eager = meta(Symbol.for("@pumped-fn/extension/eager"), custom<boolean>());

// Mark executors
const criticalService = provide(() => initService(), eager(true));

// Extension uses meta
const eagerExtension: Extension.Extension = {
  name: "eager",
  init(scope) {
    for (const [executor] of scope.entries()) {
      const isEager = eager.find(executor);
      if (isEager) scope.resolve(executor);
    }
  },
};
```

## Canonical Patterns

### Complete Example: Web Service with Meta

```typescript
import {
  meta,
  custom,
  provide,
  derive,
  flow,
  name,
} from "@pumped-fn/core-next";

// Define meta types
const auth = meta(
  "auth",
  custom<{ roles: string[]; permissions: string[]; public?: boolean }>()
);
const route = meta(
  "route",
  custom<{ path: string; method: string; middleware?: string[] }>()
);
const telemetry = meta(
  "telemetry",
  custom<{ service: string; metrics: string[]; sampleRate: number }>()
);

// Create monitored service
const userService = provide(
  () => createUserService(),
  name("user-service"),
  telemetry({
    service: "user",
    metrics: ["queries", "errors"],
    sampleRate: 0.1,
  })
);

// Flow with combined meta
const createUserFlow = flow.define(
  {
    name: "user.create",
    input: createUserSchema,
    success: userSchema,
    error: errorSchema,
  },
  auth({ roles: ["admin"], permissions: ["user:create"] }),
  route({ path: "/users", method: "POST", middleware: ["auth"] })
);

// Multi-purpose extension using all meta
const webExtension: Extension.Extension = {
  name: "web-framework",
  initPod(pod, context) {
    const routeConfig = route.find(context);
    const authConfig = auth.find(context);
    const telemetryConfig = telemetry.find(context);

    if (routeConfig) {
      registerRoute(routeConfig.path, routeConfig.method, handler, {
        middleware: routeConfig.middleware,
        auth: authConfig,
        telemetry: telemetryConfig,
      });
    }
  },
  wrapExecute(context, next, execution) {
    const config = telemetry.find(context);
    if (config && Math.random() < config.sampleRate) {
      return instrumentedNext(next, config.service);
    }
    return next();
  },
};
```

### Pattern Variations

| Pattern              | Meta Key          | Use Case          | Example Schema                                         |
| -------------------- | ----------------- | ----------------- | ------------------------------------------------------ |
| **Debugging**        | `name` (built-in) | Identification    | `custom<string>()`                                     |
| **Extension Config** | String key        | Feature flags     | `custom<{ enabled: boolean; options: T }>()`           |
| **Flow Context**     | Symbol key        | Built-in tracking | `custom<{ depth: number; parent?: string }>()`         |
| **Domain Logic**     | String key        | Business rules    | `custom<{ roles: string[]; permissions: string[] }>()` |

## Query Operations

### Finding Values

```typescript
const config = meta("config", custom<{ timeout: number }>());

// Single value (first match)
const setting = config.find(executor); // Returns value or undefined
const validated = config.get(executor); // Returns validated value or throws

// Multiple values
const allSettings = config.some([exec1, exec2]); // Returns array of all matches

// Partial objects
const partial = config.partial({ timeout: 5000 }); // Creates partial meta object
```

### Validation on Retrieval

```typescript
// With runtime validation (zod example)
import { z } from "zod";

const dbConfig = meta(
  "db",
  z.object({
    host: z.string(),
    port: z.number().min(1).max(65535),
    ssl: z.boolean().default(false),
  })
);

// get() validates against schema
try {
  const config = dbConfig.get(dbExecutor); // Validated at runtime
  console.log(config.host, config.port); // Type-safe access
} catch (error) {
  // Schema validation failed
}

// find() returns raw value (no validation)
const rawConfig = dbConfig.find(dbExecutor); // May be invalid
```

## Advanced Usage

### Monitoring Plugin Pattern

```typescript
const telemetryPlugin: Core.Plugin = {
  init(scope) {
    const collector = new MetricsCollector();
    for (const [executor] of scope.entries()) {
      const config = telemetry.find(executor);
      if (config) {
        collector.register(config.service, config.metrics);
      }
    }
  },
  wrap(next, { executor }) {
    const config = telemetry.find(executor);
    if (!config) return next();

    const start = Date.now();
    return next().finally(() => {
      collector.track(config.service, "duration", Date.now() - start);
    });
  },
};
```

### Built-in Flow Context

```typescript
// Access flow execution context
export const FlowExecutionContext = {
  depth: accessor("flow.depth", custom<number>(), 0),
  flowName: accessor("flow.name", custom<string | undefined>()),
  isParallel: accessor("flow.isParallel", custom<boolean>(), false),
};

// Usage in plugins
const tracingPlugin: Flow.Plugin = {
  wrap(context, next) {
    const depth = FlowExecutionContext.depth.find(context) || 0;
    const flowName = FlowExecutionContext.flowName.find(context);
    console.log(`${"  ".repeat(depth)}→ ${flowName}`);
    return next();
  },
};
```

## Key Rules

1. **Decoration Only**: Meta never influences core resource logic
2. **Type Safety**: Always use StandardSchemaV1 for validation
3. **Generic Design**: Domain-specific meta types extend core functionality
4. **Query Patterns**: Use `find()` for optional, `get()` for required values
5. **Container Agnostic**: Works with executors, flows, any MetaContainer

## vs DataAccessor

Meta and DataAccessor complement each other for different data access patterns:

| Feature         | Meta                             | DataAccessor                          |
| --------------- | -------------------------------- | ------------------------------------- |
| **Purpose**     | Static component decoration      | Runtime data access                   |
| **Mutability**  | Immutable (attached at creation) | Mutable (get/set operations)          |
| **Validation**  | On creation                      | On read/write                         |
| **Defaults**    | Not supported                    | Built-in AccessorWithDefault          |
| **Storage**     | MetaContainer only               | DataStore, MetaContainer, Meta arrays |
| **Scope**       | Component metadata               | Instance/execution data               |
| **Inheritance** | No inheritance                   | Context hierarchy supported           |
| **Testing**     | Static decoration                | Easy mocking with Map                 |

### Complementary Usage Patterns

```typescript
// Meta: Static component configuration
const apiMeta = meta("api", custom<{ version: string; auth: boolean }>());

const userApi = provide(
  () => createUserAPI(),
  apiMeta({ version: "v1", auth: true })
);

// Accessor: Runtime execution context
const RequestContext = {
  USER_ID: accessor("user.id", custom<string>()),
  API_VERSION: accessor("api.version", custom<string>(), "v1"),
};

const handler = flow.handler(async (ctx, input) => {
  // Static meta: component properties (immutable)
  const apiConfig = apiMeta.find(userApi);

  // Dynamic accessor: execution context (mutable)
  const currentUser = RequestContext.USER_ID.get(ctx);
  RequestContext.API_VERSION.set(ctx, apiConfig.version);

  // Use both: static config guides behavior, dynamic context tracks state
  return ctx.ok({ processed: true });
});
```

### Integration: Meta + Accessor

```typescript
// Use meta to declare what accessors a component uses
const accessorsMeta = meta(
  "accessors",
  custom<{
    required: string[];
    optional: string[];
  }>()
);

// Component declares its accessor dependencies via meta
const processingService = provide(
  () => createProcessor(),
  accessorsMeta({
    required: ["trace.id", "user.id"],
    optional: ["request.timeout"],
  })
);

// Extensions can inspect meta to understand accessor usage
const contextValidationExtension: Extension.Extension = {
  name: "context-validation",

  async wrapExecute(context, next, execution) {
    // Check if handler's components have accessor requirements
    const requirements = accessorsMeta.find(processingService);

    if (requirements) {
      // Validate required context is available
      for (const reqKey of requirements.required) {
        if (!context.get(Symbol.for(reqKey))) {
          throw new Error(`Required context missing: ${reqKey}`);
        }
      }
    }

    return await next();
  },
};
```

### When to Use Each

**Use Meta for**:

- Component API documentation
- Static configuration values
- Plugin markers and hints
- Version information
- Capability declarations

**Use DataAccessor for**:

- Flow execution context
- Extension runtime state
- Configuration that changes
- User session data
- Request/response tracking

## Meta Coding Styles

**Built-in Meta**: Use symbols for built-in library meta to avoid conflicts

```typescript
const depth = meta(Symbol.for("flow.depth"), custom<number>());
```

**Extension Meta**: Use string keys with extension namespaces

```typescript
const eager = meta("@pumped-fn/extension/eager", custom<boolean>());
```

**Domain Meta**: Use descriptive string keys for application-specific meta

```typescript
const route = meta("route", routeSchema);
const auth = meta("auth", authSchema);
```

Common StandardSchemas are meant to be reusable and composable across meta types.
