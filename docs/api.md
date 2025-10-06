## Graph Construction

Build dependency graphs by defining nodes and their relationships. Each node represents a value or service in your application.

```typescript
import { provide, derive } from "@pumped-fn/core-next";
```

### Core Graph Building APIs

#### provide - Graph Root Nodes

Creates a graph node with no dependencies. These are typically configuration, constants, or root services.

```typescript
import { provide } from "@pumped-fn/core-next";

// ---cut---
const config = provide(() => ({ apiUrl: "https://api.example.com" }));
const database = provide(async () => ({ query: async () => [] }));
```

**Use for**: Configuration, external connections, constants

#### derive - Graph Dependency Nodes

Creates a graph node that depends on other nodes. This is where you compose services and create derived values.

```typescript
import { provide, derive } from "@pumped-fn/core-next";

const config = provide(() => ({ apiUrl: "https://api.example.com", database: "db://localhost" }));
const logger = provide(() => ({ log: (msg: string) => console.log(msg) }));

// ---cut---
// Single dependency
const apiClient = derive(config, (cfg) => ({ url: cfg.apiUrl, fetch: () => Promise.resolve({}) }));

// Multiple dependencies (array)
const userService = derive([config, logger], ([cfg, log]) => ({
  createUser: (data: any) => {
    log.log("Creating user");
    return { id: "123", ...data };
  }
}));

// Multiple dependencies (object - better for many deps)
const application = derive(
  { config, logger, userService: userService },
  ({ config, logger, userService }) => ({
    start: () => logger.log("App started"),
    users: userService
  })
);
```

**Use for**: Services, computed values, anything depending on other graph nodes

#### accessing controller

```typescript
import { provide, derive, type Core } from "@pumped-fn/core-next";

// ---cut---
const value = provide((ctl) => "string");
const otherValue = provide((ctl) => 20);

const derived = derive(value, (value, ctl) => {
  return value;
});
const derivedUsingArray = derive(
  [value, otherValue],
  ([value, otherValue], ctl) => {
    return value + otherValue;
  }
);
const derivedUsingObject = derive(
  { value, otherValue },
  ({ value, otherValue }, ctl) => {
    const cleanup = ctl.cleanup
    const scope = ctl.scope
    return value + otherValue;
  }
);

type Controller = Core.Controller
```

#### Graph Node Variations

Control how dependencies are resolved using node variations:

```typescript
import { provide, derive } from "@pumped-fn/core-next";

const expensiveService = provide(() => ({ process: (data: any) => data }));
const configValue = provide(() => ({ setting: 'value' }));

const smartService = derive(
  [expensiveService.lazy, configValue.static, configValue.reactive],
  ([lazyService, staticConfig, reactiveConfig]) => ({
    // .lazy: resolve only when needed (conditional dependencies)
    // .static: resolve dependencies but don't create reactive subscriptions
    // .reactive: auto-update when configValue changes (reactive programming)
    process: (data: any) => data
  })
);
```

**Variations**:
- **`.lazy`**: Conditional resolution, performance optimization
- **`.static`**: Break reactive chains, manual control
- **`.reactive`**: Auto-updating derived values (pure functions only)

#### preset - Graph Node Override

Replace any graph node with a different value. This is the key to testing and environment configuration.

```typescript
import { provide, derive, createScope, preset } from "@pumped-fn/core-next";

const config = provide(() => ({ dbUrl: 'prod-db://example.com' }));
const database = derive([config], ([cfg]) => ({ url: cfg.dbUrl, query: () => [] }));

// Override config for testing
const testConfigPreset = preset(config, { dbUrl: 'test-db://localhost' });
const testScope = createScope(testConfigPreset);

// database will now use test config
const testDb = await testScope.resolve(database);
```

**Use for**: Testing, environment switching, dependency injection

## Graph Resolution

Scope is the execution environment that resolves your dependency graph. It handles topological sorting, caching, and lifecycle management.

```typescript
import { createScope } from "@pumped-fn/core-next";
```

#### createScope - Graph Execution Environment

Create an isolated environment for resolving your dependency graph.

```typescript
import { createScope, preset, provide } from "@pumped-fn/core-next";

const config = provide(() => ({ env: 'prod' }));
const database = provide(() => ({ url: 'prod-db' }));

// ---cut---
// Basic scope
const scope = createScope();

// Scope with presets (testing/environment configuration)
const testScope = createScope(
  preset(config, { env: 'test' }),
  preset(database, { url: 'test-db' })
);
```

#### scope.resolve - Execute the Graph

Resolve any node in your dependency graph. The scope automatically resolves all dependencies in the correct order.

```typescript
import { provide, derive, createScope } from "@pumped-fn/core-next";

const config = provide(() => ({ port: 3000, env: 'dev' }));
const logger = derive([config], ([cfg]) => ({ log: (msg: string) => console.log(`[${cfg.env}] ${msg}`) }));
const app = derive([config, logger], ([cfg, log]) => ({
  start: () => log.log(`Server starting on port ${cfg.port}`)
}));

const scope = createScope();
// ---cut---
// Resolves entire dependency chain: config → logger → app
const application = await scope.resolve(app);

// Resolve multiple nodes individually
const appInstance = await scope.resolve(app);
const loggerInstance = await scope.resolve(logger);
```

**Key Features**:
- Automatic dependency ordering
- Singleton caching (each node resolves once)
- Parallel resolution where possible

#### scope.update

```typescript
import { provide, createScope } from "@pumped-fn/core-next";
const value = provide(() => 0);
const scope = createScope();
// ---cut---
let resolvedValue = await scope.resolve(value);
//  0
await scope.update(value, 1);
await scope.update(value, (current) => 1); // react setState style

resolvedValue = await scope.resolve(value);
//  1
```

- Updating requires the executor to be resolved upfront, via direct resolve or as a part of the graph

On update, the following mechanism happen

- cleanups got called
- The .reactive dependencies got triggered
- factory function is called

#### scope.release

Release a reference and its value (and also all of dependencies relying on the reference)

```typescript
import { provide, derive, createScope } from "@pumped-fn/core-next";
const value = provide(() => 0);

const scope = createScope();
// ---cut---
const derivedValue = derive(value, (value) => value + "1");
let resolvedValue = await scope.resolve(derivedValue);
await scope.release(value);

// will also release derivedValue
```

#### scope.accessor

Retrieve the singleton of an executor respresentative in a scope

```typescript
import { provide, createScope, type Core } from "@pumped-fn/core-next";
const value = provide(() => 0);

const scope = createScope();
// ---cut---

const valueAccessor = scope.accessor(value);

const getValue = valueAccessor.get();
const maybeValue = valueAccessor.lookup();
const resolvedValue = await valueAccessor.resolve();
```

#### scope.dispose

```typescript

import { provide, createScope, type Core } from "@pumped-fn/core-next";
const value = provide((ctl) => {
  // acquire connection

  ctl.cleanup(() => {
    /** cleanup logic */
  });

  return 0;
});

const scope = createScope();
await scope.dispose();
```

Dispose will cleanup all resources resolved in the scope, also mark the scope as `disposed`. Disposed scope will not be able to do anything afteward

## plugins

Plugins provide cross-cutting concerns without modifying core logic. They can intercept resolution, updates, and releases.

#### scope.use

Register plugins to intercept scope operations:

```typescript
import { createScope, plugin } from "@pumped-fn/core-next";

const scope = createScope();

const cleanup = scope.use(plugin({
  init: (scope) => {
    // Called when plugin is registered
  },
  dispose: async (scope) => {
    // Called when scope is disposed
  }
}));
```

#### scope.onChange

Intercept resolution and update events:

```typescript

import { createScope, preset, provide } from "@pumped-fn/core-next";

const scope = createScope();
const value = provide(() => "original");

scope.onChange((event, executor, value, scope) => {
  if (event === "resolve") {
    console.log("Resolved:", value);
  }
  if (event === "update") {
    console.log("Updated:", value);
  }
  // Return preset() to transform the value
  if (value === "transform-me") {
    return preset(executor, "transformed");
  }
});
```

#### scope.onRelease

Handle executor cleanup:

```typescript

import { createScope, provide } from "@pumped-fn/core-next";

const scope = createScope();
const connection = provide(() => ({ id: "db-1" }));

scope.onRelease(async (event, executor, scope) => {
  // Cleanup when executor is released
  console.log("Releasing executor");
});
```

#### practical plugin examples

```typescript

import { createScope, plugin, provide, derive, preset } from "@pumped-fn/core-next";

// Analytics plugin
const analytics = plugin({
  init: (scope) => {
    scope.onChange((event, executor, value) => {
      if (event === "resolve") {
        // Track resolution metrics
      }
    });
  }
});

// Value sanitizer
const sanitizer = plugin({
  init: (scope) => {
    scope.onChange((event, executor, value, scope) => {
      if (typeof value === "string" && value.includes("unsafe")) {
        return preset(executor, value.replace("unsafe", "safe"));
      }
    });
  }
});

const scope = createScope();
scope.use(analytics);
scope.use(sanitizer);
```

## meta

Meta provides type-safe decorative information attached to executors. It uses StandardSchema for validation and integrates seamlessly with middleware for runtime inspection.

#### creating meta functions

```typescript
import { meta, custom } from "@pumped-fn/core-next";

// Create a meta function with a schema
const name = meta("service-name", custom<string>());
const port = meta("port", custom<number>());
const config = meta("config", custom<{ url: string; timeout: number }>());
```

#### attaching meta to executors

```typescript
import { provide, derive, meta, custom } from "@pumped-fn/core-next";

const name = meta("name", custom<string>());
const priority = meta("priority", custom<number>());

// Attach meta during creation
const database = provide(
  () => ({ connection: "postgres://..." }),
  name("database"),
  priority(1)
);

// Multiple metas
const cache = provide(
  () => new Map(),
  name("cache"),
  priority(2)
);
```

#### accessing meta values

```typescript
import { provide, meta, custom } from "@pumped-fn/core-next";

const name = meta("name", custom<string>());
const service = provide(() => {}, name("auth"));

// Get meta value from executor
const serviceName = name.get(service); // "auth"

// Find first matching meta
const maybeName = name.find(service); // "auth" | undefined

// Get all matching metas (executors can have multiple of same type)
const allNames = name.some(service); // string[]
```

#### meta with plugins

```typescript

import { createScope, plugin, provide, meta, custom } from "@pumped-fn/core-next";

const name = meta("name", custom<string>());
const metrics = meta("metrics", custom<boolean>());

// Plugin that uses meta for conditional logic
const metricsPlugin = plugin({
  init: (scope) => {
    scope.onChange((event, executor, value) => {
      // Check if executor has metrics enabled
      if (metrics.find(executor)) {
        const serviceName = name.get(executor) ?? "unknown";
        console.log(`[${serviceName}] ${event}:`, value);
      }
    });
  }
});

const api = provide(
  () => ({ endpoint: "/api" }),
  name("api-service"),
  metrics(true) // Enable metrics for this executor
);

const internal = provide(
  () => ({ data: "internal" }),
  name("internal-service")
  // No metrics meta - won't be tracked
);
```

#### meta accessor integration

```typescript
import { createScope, provide, meta, custom } from "@pumped-fn/core-next";

const description = meta("description", custom<string>());
const service = provide(() => "service", description("Main service"));

const scope = createScope();
const accessor = scope.accessor(service);

// Accessor includes metas
const desc = description.find(accessor); // "Main service"
```

#### practical meta patterns

```typescript

import { provide, derive, meta, custom, createScope, plugin } from "@pumped-fn/core-next";

// Version tracking
const version = meta("version", custom<string>());

// Deprecation warnings
const deprecated = meta("deprecated", custom<{ since: string; alternative?: string }>());

// Service classification
const tier = meta("tier", custom<"critical" | "standard" | "low">());

// Deprecation plugin
const deprecationWarning = plugin({
  init: (scope) => {
    scope.onChange((event, executor) => {
      const deprecation = deprecated.find(executor);
      if (deprecation && event === "resolve") {
        console.warn(
          `Deprecated since ${deprecation.since}`,
          deprecation.alternative ? `Use ${deprecation.alternative} instead` : ""
        );
      }
    });
  }
});

// Usage
const oldApi = provide(
  () => ({ v1: true }),
  version("1.0.0"),
  deprecated({ since: "2.0.0", alternative: "newApi" }),
  tier("low")
);

const newApi = provide(
  () => ({ v2: true }),
  version("2.0.0"),
  tier("critical")
);
```

## Flow API

Flow provides structured business logic with input/output validation, dependency injection, and context management. It extends the graph-based executor system with workflow-specific features.

```typescript
import { flow, custom } from "@pumped-fn/core-next";
```

#### flow.define - Create Flow Definition

Define a flow specification with input/output schemas:

```typescript
const userFlow = flow({
  name: "user.create",
  input: custom<{ email: string; name: string }>(),
  output: custom<{ userId: string; created: boolean }>(),
  error: custom<{ code: string; message: string }>()
}, async (ctx, input) => {
  return { userId: "123", created: true };
});
```

#### flow.handler - Create Flow Implementation

Create a handler for the flow definition:

```typescript
import { flow, custom, provide } from "@pumped-fn/core-next";

const dbExecutor = provide(() => ({ save: (data: any) => Promise.resolve("123") }));

const createUser = flow(async (ctx, input: { email: string; name: string }) => {
  if (!input.email.includes("@")) {
    throw new Error("Invalid email format");
  }
  return { userId: "123", created: true };
});

const createUserWithDb = flow(
  { db: dbExecutor },
  async ({ db }, ctx, input: { email: string; name: string }) => {
    const userId = await db.save(input);
    return { userId, created: true };
  }
);
```

#### flow.execute - Execute Flow

Execute a flow handler with input:

```typescript
import { flow, custom, createScope } from "@pumped-fn/core-next";

const handler = flow(async (ctx, input: { email: string; name: string }) => {
  return { userId: "123", created: true };
});

const result = await flow.execute(handler, { email: "user@example.com", name: "John" });

console.log("User created:", result.userId);

const scope = createScope();
const result2 = await flow.execute(handler, { email: "test@test.com", name: "Test" }, {
  scope
});
```

#### Flow Context API

The context object provides flow execution capabilities:

```typescript
import { flow, custom, accessor } from "@pumped-fn/core-next";

const startTimeAccessor = accessor("startTime", custom<number>());

const subFlowHandler = flow(async (ctx, input: { item: string }) => {
  return { result: input.item.toUpperCase() };
});

const processor = flow(async (ctx, input: { data: string[] }) => {
  startTimeAccessor.set(ctx, Date.now());
  const startTime = startTimeAccessor.get(ctx);

  const itemResult = await ctx.exec(subFlowHandler, { item: input.data[0] });

  const results = await ctx.parallel([
    ctx.exec(subFlowHandler, { item: input.data[0] }),
    ctx.exec(subFlowHandler, { item: input.data[1] }),
  ]);

  return { processed: input.data.length };
});
```

#### Inline Flow Creation

Create flows with handler in one call:

```typescript

import { flow, custom, provide } from "@pumped-fn/core-next";

const loggerExecutor = provide(() => ({ info: (msg: string, data: any) => console.log(msg, data) }));

// ---cut---
// Simple inline flow
const simpleFlow = flow(
  {
    name: "simple.process",
    input: custom<{ value: number }>(),
    output: custom<{ result: number }>(),
    error: custom<{ error: string }>(),
  },
  async (ctx, input) => {
    return ctx.ok({ result: input.value * 2 });
  }
);

// Inline flow with dependencies
const flowWithDeps = flow(
  {
    name: "process.with.deps",
    input: custom<{ data: string }>(),
    output: custom<{ processed: boolean }>(),
    error: custom<{ error: string }>(),
  },
  { logger: loggerExecutor },
  async ({ logger }, ctx, input) => {
    logger.info("Processing", input.data);
    return ctx.ok({ processed: true });
  }
);
```

**Key Flow Features**:
- **Input/Output Validation**: Automatic schema validation
- **Structured Error Handling**: ok/ko pattern for business logic errors
- **Dependency Injection**: Graph-based dependency resolution
- **Context Management**: Isolated context per execution
- **Nested Execution**: Execute sub-flows with context inheritance
- **Parallel Execution**: Execute multiple flows concurrently

## Type Guards

Type guards verify executor types at runtime. Use them for conditional logic based on executor variations.

```typescript
import {
  isExecutor,
  isMainExecutor,
  isReactiveExecutor,
  isStaticExecutor,
  isLazyExecutor,
  isPreset
} from "@pumped-fn/core-next";
```

#### isExecutor - Check if value is an executor

```typescript
import { isExecutor, provide } from "@pumped-fn/core-next";

const maybeExecutor = provide(() => 42);
const notExecutor = { value: 42 };

if (isExecutor(maybeExecutor)) {
  // Type narrowed to Core.BaseExecutor<unknown>
}
```

#### isMainExecutor - Check if executor is main type

```typescript
import { isMainExecutor, provide } from "@pumped-fn/core-next";

const executor = provide(() => 42);

if (isMainExecutor(executor)) {
  // Type narrowed to Core.Executor<unknown>
  // Has .lazy, .reactive, .static properties
  const lazy = executor.lazy;
}
```

#### isReactiveExecutor - Check if executor is reactive variant

```typescript
import { isReactiveExecutor, provide } from "@pumped-fn/core-next";

const base = provide(() => 42);
const reactive = base.reactive;

if (isReactiveExecutor(reactive)) {
  // Type narrowed to Core.Reactive<unknown>
}
```

#### isStaticExecutor - Check if executor is static variant

```typescript
import { isStaticExecutor, provide } from "@pumped-fn/core-next";

const base = provide(() => 42);
const static_ = base.static;

if (isStaticExecutor(static_)) {
  // Type narrowed to Core.Static<unknown>
}
```

#### isLazyExecutor - Check if executor is lazy variant

```typescript
import { isLazyExecutor, provide } from "@pumped-fn/core-next";

const base = provide(() => 42);
const lazy = base.lazy;

if (isLazyExecutor(lazy)) {
  // Type narrowed to Core.Lazy<unknown>
}
```

#### isPreset - Check if value is a preset

```typescript
import { isPreset, preset, provide } from "@pumped-fn/core-next";

const executor = provide(() => 42);
const presetValue = preset(executor, 100);

if (isPreset(presetValue)) {
  // Type narrowed to Core.Preset<unknown>
}
```

**Use for**: Plugin development, conditional dependency resolution, debugging

## Helpers

Utility functions for common execution patterns.

```typescript
import { resolves, prepare, adapt } from "@pumped-fn/core-next";
```

#### resolves - Batch resolve executors

Resolve multiple executors in one call. Returns results in same structure (array or object).

```typescript
import { provide, derive, createScope, resolves } from "@pumped-fn/core-next";

const a = provide(() => 1);
const b = provide(() => 2);
const c = derive([a, b], ([x, y]) => x + y);

const scope = createScope();

// Array form
const [valA, valB, valC] = await resolves(scope, [a, b, c]);
// valA: 1, valB: 2, valC: 3

// Object form
const { x, y, sum } = await resolves(scope, { x: a, y: b, sum: c });
// x: 1, y: 2, sum: 3
```

**Use for**: Resolving multiple executors, cleaner than multiple await calls

#### prepare - Create callable executor

Prepare an executor for repeated execution without passing scope.

```typescript
import { provide, createScope, prepare } from "@pumped-fn/core-next";

const counter = provide(() => Math.random());
const scope = createScope();

const getCounter = prepare(scope, counter);

// Call without passing scope
const value1 = await getCounter();
const value2 = await getCounter(); // Same value (cached)

// Access original executor
const original = getCounter.escape();
```

**Use for**: Simplified executor access, API boundaries

#### adapt - Create function from executor

Transform an executor returning a function into a callable function.

```typescript
import { provide, derive, createScope, adapt } from "@pumped-fn/core-next";

const config = provide(() => ({ prefix: "[LOG]" }));
const logger = derive(config, (cfg) => (msg: string) => {
  console.log(`${cfg.prefix} ${msg}`);
});

const scope = createScope();
const log = adapt(scope, logger);

// Call directly
await log("Hello"); // Logs: [LOG] Hello

// Access original executor
const originalLogger = log.escape();
```

**Use for**: Converting service executors to functions, cleaner API

## Validation

Schema validation using StandardSchema.

```typescript
import { validate, custom } from "@pumped-fn/core-next";
```

#### validate - Validate against schema

```typescript
import { validate, custom } from "@pumped-fn/core-next";

const numberSchema = custom<number>();

// Throws if validation fails
const validated = await validate(numberSchema, 42);
```

**Use for**: Input validation, runtime type checking

#### custom - Create type-only schema

Create a schema without validation. Useful for TypeScript-only type safety.

```typescript
import { custom } from "@pumped-fn/core-next";

// Schema with no runtime validation
const userSchema = custom<{ id: string; name: string }>();

// Use with flow definitions
const flow = flow.define({
  name: "user.process",
  input: custom<{ userId: string }>(),
  output: custom<{ success: boolean }>(),
  error: custom<{ error: string }>()
});
```

**Use for**: Type-safe schemas without runtime overhead

## Utilities

Additional utilities for advanced patterns.

#### multi - Multi-keyed executors

Create executors that resolve different values based on a key parameter.

```typescript
import { multi, custom, createScope } from "@pumped-fn/core-next";

// Provider form
const userCache = multi.provide(
  { keySchema: custom<string>() },
  async (userId, ctl) => {
    // Fetch user by ID
    return { id: userId, name: "User" };
  }
);

// Derive form
const config = provide(() => ({ apiUrl: "https://api.example.com" }));
const userService = multi.derive(
  {
    keySchema: custom<string>(),
    dependencies: { config }
  },
  async ({ config }, userId, ctl) => {
    // Fetch from API using config
    return { id: userId, name: "User" };
  }
);

const scope = createScope();

// Access by key
const user1Executor = userCache("user-1");
const user1 = await scope.resolve(user1Executor);

// Get accessor
const user2Accessor = await scope.resolve(userCache.lazy)("user-2");
const user2 = await user2Accessor.resolve();

// Release all cached values
await userCache.release(scope);
```

**Use for**: Keyed caches, per-ID services, dynamic executors

#### Promised - Async type helper

Type helper for promise-wrapped values.

```typescript
import { type Core } from "@pumped-fn/core-next";

type Promised<T> = T | Promise<T>;

// Used in Core.Output<T>
type Output<T> = Promised<T>;
```

#### Error types

Structured error types for executor resolution.

```typescript
import {
  ExecutorResolutionError,
  FactoryExecutionError,
  DependencyResolutionError,
  SchemaError,
  ErrorCodes,
  formatErrorMessage
} from "@pumped-fn/core-next";

// Catch specific errors
try {
  await scope.resolve(executor);
} catch (error) {
  if (error instanceof FactoryExecutionError) {
    console.error("Factory failed:", error.context);
  } else if (error instanceof DependencyResolutionError) {
    console.error("Dependency missing:", error.missingDependency);
  }
}

// Use error codes
const msg = formatErrorMessage(ErrorCodes.SCOPE_DISPOSED, { scopeId: "123" });
```

**Use for**: Error handling, debugging, logging
