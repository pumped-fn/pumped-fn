# Utilities

Supporting utilities for multi-value resolution, async handling, and error management.

## multi

Multi-value utilities create executors that dynamically generate instances based on keys. Use for connection pools, per-tenant resources, or any key-based resource management.

### multi.provide

Creates a multi-executor that generates instances without dependencies:

```typescript
import { multi, custom, createScope } from "@pumped-fn/core-next";

const connectionPool = multi.provide(
  {
    keySchema: custom<string>(),
    keyTransform: (dbName) => dbName.toLowerCase()
  },
  (dbName, ctl) => {
    return { connection: `postgres://${dbName}`, query: () => [] };
  }
);

const scope = createScope();

const userDb = await scope.resolve(connectionPool("users"));
const orderDb = await scope.resolve(connectionPool("orders"));

const poolAccessor = scope.accessor(connectionPool);
const getUserConnection = poolAccessor.get();
const userConn = getUserConnection("users");
```

**Key Transform**: Normalize keys before storage (e.g., lowercase, trim)

**Use for**: Connection pools, per-tenant services, cached resources

### multi.derive

Creates a multi-executor with dependencies:

```typescript
import { multi, custom, provide, createScope } from "@pumped-fn/core-next";

const config = provide(() => ({ host: "localhost", port: 5432 }));

const dbPool = multi.derive(
  {
    keySchema: custom<string>(),
    dependencies: { config }
  },
  ({ config }, dbName, ctl) => {
    return {
      connection: `postgres://${config.host}:${config.port}/${dbName}`,
      query: () => []
    };
  }
);

const scope = createScope();
const db = await scope.resolve(dbPool("analytics"));
```

**Dependencies**: Array or object format, same as `derive`

### multi-executor release

Clean up all instances from a multi-executor pool:

```typescript
import { multi, custom, createScope } from "@pumped-fn/core-next";

const pool = multi.provide(
  { keySchema: custom<string>() },
  (key, ctl) => {
    ctl.cleanup(() => console.log(`Cleanup: ${key}`));
    return { key, value: key };
  }
);

const scope = createScope();

await scope.resolve(pool("db1"));
await scope.resolve(pool("db2"));

await pool.release(scope);
```

## Promised

Enhanced promise wrapper with pod context and flow execution capabilities. Returned by flow executions and `ctx.run()`.

### Basic Operations

```typescript
import { flow, type Promised } from "@pumped-fn/core-next";

const processData = flow(async (ctx, data: string) => {
  return data.toUpperCase();
});

const result: Promised<string> = flow.execute(processData, "hello");

const value = await result;

const unwrapped = result.toPromise();

const pod = result.getPod();
```

### Transformation

```typescript
import { flow } from "@pumped-fn/core-next";

const process = flow(async (ctx, value: number) => value * 2);

const result = flow.execute(process, 5)
  .map(val => val + 10)
  .map(val => `Result: ${val}`);

await result;
```

**`map`**: Transform success value

**`switch`**: Chain to another `Promised`

**`mapError`**: Transform error before throwing

**`switchError`**: Recover from error with new `Promised`

### Execution Details

```typescript
import { flow } from "@pumped-fn/core-next";

const handler = flow(async (ctx, input: number) => {
  ctx.set("metadata", { processed: Date.now() });
  return input * 2;
});

const promised = flow.execute(handler, 10);

const details = await promised.inDetails();

if (details.success) {
  console.log("Result:", details.result);
  console.log("Context:", details.ctx);
} else {
  console.log("Error:", details.error);
  console.log("Context:", details.ctx);
}
```

**Use for**: Capturing execution context for logging/debugging

### Promised Combinators

```typescript
import { flow, Promised } from "@pumped-fn/core-next";

const flow1 = flow(async (ctx, n: number) => n * 2);
const flow2 = flow(async (ctx, n: number) => n + 5);

const p1 = flow.execute(flow1, 10);
const p2 = flow.execute(flow2, 3);

const all = await Promised.all([p1, p2]);

const first = await Promised.race([p1, p2]);

const settled = await Promised.allSettled([p1, p2]);
```

### Promised.try

Wrap synchronous code with error handling:

```typescript
import { Promised, createScope } from "@pumped-fn/core-next";

const scope = createScope();
const pod = scope.createPod();

const result = Promised.try(pod, () => {
  if (Math.random() > 0.5) {
    throw new Error("Random failure");
  }
  return "success";
});

const value = await result;
```

**Use for**: Converting sync code to async flow context

## errors

Error types, codes, and utilities for handling executor resolution failures.

### Error Types

All errors extend `ExecutorResolutionError`:

```typescript
import type { ExecutorResolutionError, FactoryExecutionError, DependencyResolutionError } from "@pumped-fn/core-next";

type ErrorContext = {
  readonly executorName?: string;
  readonly resolutionStage: "dependency-resolution" | "factory-execution" | "post-processing" | "validation";
  readonly dependencyChain: string[];
  readonly scopeId?: string;
  readonly timestamp: number;
  readonly additionalInfo?: Record<string, unknown>;
};
```

**`FactoryExecutionError`**: Factory function threw or returned invalid type

**`DependencyResolutionError`**: Dependency missing or circular dependency detected

**`ExecutorResolutionError`**: Base error for resolution failures

### Error Codes

```typescript
import { errors } from "@pumped-fn/core-next";

errors.codes.FACTORY_EXECUTION_FAILED
errors.codes.FACTORY_THREW_ERROR
errors.codes.DEPENDENCY_NOT_FOUND
errors.codes.CIRCULAR_DEPENDENCY
errors.codes.SCOPE_DISPOSED
errors.codes.REACTIVE_EXECUTOR_IN_POD
```

**Categories**:
- `F00x`: Factory errors
- `D00x`: Dependency errors
- `S00x`: Scope errors
- `V00x`: Validation errors
- `SYS00x`: Internal errors
- `C00x`: Configuration errors
- `FL00x`: Flow errors

### Error Handling

```typescript
import { createScope, provide, errors, type FactoryExecutionError } from "@pumped-fn/core-next";

const scope = createScope();

scope.onError((error, executor, scope) => {
  if (error instanceof errors.FactoryExecutionError) {
    console.error("Factory failed:", error.context.executorName);
    console.error("Stage:", error.context.resolutionStage);
    console.error("Chain:", error.context.dependencyChain);
    console.error("Code:", error.code);
  }
});

const failing = provide(() => {
  throw new Error("Database connection failed");
});

try {
  await scope.resolve(failing);
} catch (error) {
  if (error instanceof errors.FactoryExecutionError) {
    console.log("Error code:", error.code);
    console.log("Category:", error.category);
    console.log("Timestamp:", error.context.timestamp);
  }
}
```

### Error Context Usage

```typescript
import { createScope, provide, derive, type DependencyResolutionError } from "@pumped-fn/core-next";

const db = provide(() => {
  throw new Error("Connection failed");
});

const service = derive({ db }, ({ db }) => {
  return { query: () => [] };
});

const scope = createScope();

scope.onError((error, executor, scope) => {
  console.log("Dependency chain:", error.context.dependencyChain);
  console.log("Failed at:", error.context.resolutionStage);

  if ("missingDependency" in error) {
    console.log("Missing:", error.missingDependency);
  }
});

await scope.resolve(service).catch(() => {});
```

### Error Code Messages

```typescript
import { errors } from "@pumped-fn/core-next";

const message = errors.formatMessage(
  errors.codes.FACTORY_EXECUTION_FAILED,
  { executorName: "database", cause: "Network timeout" }
);
```

**Template Variables**: `executorName`, `cause`, `dependencyChain`, etc.

### When Errors Occur

**`FACTORY_EXECUTION_FAILED` / `FACTORY_THREW_ERROR`**: Factory function throws during `scope.resolve()`

**`DEPENDENCY_NOT_FOUND`**: Dependency not in scope (rare - usually type error)

**`CIRCULAR_DEPENDENCY`**: Executor depends on itself through chain

**`SCOPE_DISPOSED`**: Operation on disposed scope

**`REACTIVE_EXECUTOR_IN_POD`**: `.reactive` used in pod (not allowed)

**`SCHEMA_VALIDATION_FAILED`**: Input/output schema validation failed

**`FLOW_EXECUTION_FAILED`**: Flow handler threw during execution
