# DataAccessor - @pumped-fn/core-next

_Type-safe Map-like data access with validation, defaults, and context inheritance_

**Important**: Always refer to [api.md](./api.md) for actual API signatures and available methods. Do not make assumptions about APIs.

## Core Concept

DataAccessor provides type-safe access to Map-like structures (DataStore, MetaContainer, Meta arrays) with StandardSchema validation, symbol keys to avoid conflicts, optional defaults, and easy testing with Map instances.

```typescript
import { accessor, custom } from "@pumped-fn/core-next";

// Type-safe accessor with validation
const userPrefs = accessor("user.preferences", custom<{
  theme: "light" | "dark";
  notifications: boolean;
}>());

// With default value
const timestamp = accessor("request.time", custom<number>(), Date.now());

// Use with any DataStore
const context = new Map();
userPrefs.set(context, { theme: "dark", notifications: true });
const prefs = userPrefs.get(context); // Fully typed, throws if missing
const time = timestamp.find(context); // Uses default if missing
```

## Core API

```typescript
// Accessor creation
accessor<T>(key: string | symbol, schema: StandardSchemaV1<T>): Accessor<T>;
accessor<T>(key: string | symbol, schema: StandardSchemaV1<T>, defaultValue: T): AccessorWithDefault<T>;

// Accessor methods
interface Accessor<T> {
  get(source: AccessorSource): T;              // Throws if not found
  find(source: AccessorSource): T | undefined; // Returns undefined if not found
  set(source: DataStore, value: T): void;      // Set with validation
  preset(value: T): [symbol, T];               // Create initialization tuple
}

interface AccessorWithDefault<T> extends Accessor<T> {
  find(source: AccessorSource): T;             // Always returns value (default if missing)
}

// Container types
type AccessorSource = DataStore | MetaContainer | Meta[];
interface DataStore {
  get(key: unknown): unknown;
  set(key: unknown, value: unknown): unknown;
}
```

## Primary Use: Flow Context

FlowContext implements DataStore - use accessors instead of direct Map operations:

```typescript
import { accessor, custom, flow } from "@pumped-fn/core-next";

// Define context accessors
const RequestContext = {
  TRACE_ID: accessor("trace.id", custom<string>()),
  USER_ID: accessor("user.id", custom<string>()),
  USER_ROLE: accessor("user.role", custom<"admin" | "user" | "guest">(), "guest"),
  TIMESTAMP: accessor("request.time", custom<number>(), Date.now())
};

const handler = flow.handler(async (ctx, input) => {
  // Type-safe context access (no 'any' types)
  const traceId = RequestContext.TRACE_ID.get(ctx);   // Throws if missing
  const userId = RequestContext.USER_ID.find(ctx);    // Returns undefined if missing
  const role = RequestContext.USER_ROLE.find(ctx);    // Returns default "guest"

  // Set context data
  RequestContext.USER_ID.set(ctx, "user-123");

  // Child flows inherit parent context automatically
  const result = await ctx.execute(childFlow, data);
  return ctx.ok({ processed: true });
});

// Testing with presets
const initialContext = [
  RequestContext.TRACE_ID.preset("test-trace"),
  RequestContext.USER_ID.preset("test-user")
];

const result = await flow.execute(handler, input, { initialContext });
```

## Built-in Flow Context

```typescript
// Library-provided flow execution context
export const FlowExecutionContext = {
  depth: accessor("flow.depth", custom<number>(), 0),
  flowName: accessor("flow.name", custom<string | undefined>()),
  parentFlowName: accessor("flow.parentName", custom<string | undefined>()),
  isParallel: accessor("flow.isParallel", custom<boolean>(), false),
};

// Use in extensions for tracing
const tracingExtension: Extension.Extension = {
  name: "tracing",
  async wrapExecute(context, next, execution) {
    const depth = FlowExecutionContext.depth.find(context);
    const flowName = FlowExecutionContext.flowName.find(context);
    console.log(`${"  ".repeat(depth)}→ ${flowName}`);
    return await next();
  }
};
```

## Extension State Management

```typescript
// Extension accessors with symbol keys to avoid conflicts
const MetricsAccessors = {
  COUNT: accessor(Symbol.for("metrics.count"), custom<number>(), 0),
  DURATION: accessor(Symbol.for("metrics.duration"), custom<number>(), 0),
  ERRORS: accessor(Symbol.for("metrics.errors"), custom<number>(), 0)
};

const metricsExtension: Extension.Extension = {
  name: "metrics",

  async wrapExecute(context, next, execution) {
    const start = Date.now();
    const count = MetricsAccessors.COUNT.find(context);
    MetricsAccessors.COUNT.set(context, count + 1);

    try {
      const result = await next();
      const duration = Date.now() - start;
      MetricsAccessors.DURATION.set(context, MetricsAccessors.DURATION.find(context) + duration);
      return result;
    } catch (error) {
      MetricsAccessors.ERRORS.set(context, MetricsAccessors.ERRORS.find(context) + 1);
      throw error;
    }
  }
};
```

## Configuration Pattern

```typescript
// Group related accessors with defaults
const DatabaseConfig = {
  HOST: accessor("db.host", custom<string>(), "localhost"),
  PORT: accessor("db.port", custom<number>(), 5432),
  NAME: accessor("db.name", custom<string>()),  // Required - no default
  TIMEOUT: accessor("db.timeout", custom<number>(), 30000)
};

// Use in services
const dbService = provide((ctl) => {
  const config = ctl.scope;
  return createDatabase({
    host: DatabaseConfig.HOST.find(config),
    port: DatabaseConfig.PORT.find(config),
    database: DatabaseConfig.NAME.get(config), // Throws if missing
    timeout: DatabaseConfig.TIMEOUT.find(config)
  });
});
```

## Context Inheritance

```typescript
// Parent-child context pattern
const parentHandler = flow.handler(async (ctx, input) => {
  // Set parent context
  RequestContext.TRACE_ID.set(ctx, `trace-${Date.now()}`);
  RequestContext.USER_ID.set(ctx, input.userId);

  // Child inherits parent context
  const result = await ctx.execute(childHandler, { data: input.payload });
  return result;
});

const childHandler = childFlow.handler(async (ctx, input) => {
  // Access inherited parent context
  const traceId = RequestContext.TRACE_ID.get(ctx);
  const userId = RequestContext.USER_ID.get(ctx);

  // Set child-specific context (doesn't affect parent)
  const OperationContext = {
    ID: accessor("operation.id", custom<string>())
  };
  OperationContext.ID.set(ctx, `${traceId}-child`);

  return ctx.ok({ result: `Processed by ${userId}` });
});
```

## Testing Pattern

```typescript
describe("Flow with Context", () => {
  test("handles context correctly", async () => {
    // Setup test context with presets
    const initialContext = [
      RequestContext.TRACE_ID.preset("test-trace"),
      RequestContext.USER_ID.preset("test-user"),
      RequestContext.USER_ROLE.preset("admin")
    ];

    const result = await flow.execute(handler, input, { initialContext });
    expect(result.type).toBe("ok");
  });

  test("uses defaults when missing", () => {
    const emptyContext = new Map();
    expect(RequestContext.USER_ROLE.find(emptyContext)).toBe("guest");  // Default
    expect(RequestContext.USER_ID.find(emptyContext)).toBeUndefined();  // No default
  });
});
```

## vs Meta System

| Aspect | Accessor | Meta |
|--------|----------|------|
| **Purpose** | Runtime data access | Static component decoration |
| **Mutability** | Mutable (get/set) | Immutable (attached at creation) |
| **Defaults** | Built-in support | Not supported |
| **Storage** | DataStore, MetaContainer, Meta[] | MetaContainer only |
| **Inheritance** | Context hierarchy | No inheritance |
| **Use for** | Execution context, mutable state | API config, component metadata |

## Best Practices

### Key Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| **Built-in** | Symbol with library prefix | `Symbol.for("pumped-fn.flow.depth")` |
| **Extension** | Symbol with namespace | `Symbol.for("@myorg/metrics.count")` |
| **Application** | Descriptive string keys | `"user.preferences"`, `"request.id"` |
| **Configuration** | Grouped with defaults | `DatabaseConfig.HOST`, `CacheConfig.TTL` |

### Key Rules

1. **Always use StandardSchema** for type safety and validation
2. **Prefer AccessorWithDefault** for optional data to reduce undefined checks
3. **Group related accessors** into objects for organization
4. **Use symbols for library/extension** accessors to avoid conflicts
5. **Use string keys for application** accessors for readability
6. **Test with Map and preset()** for easy setup
7. **Leverage context inheritance** in flows for hierarchical data

Common StandardSchemas should be reusable across accessor definitions.