# DataAccessor - Type-Safe Data Access

DataAccessor provides type-safe access to Map-like data structures with schema validation. It's the recommended way to manage context data in flows and extensions.

## Core Concept

Instead of using Map.get() and Map.set() with any types, use DataAccessor for type-safe, validated data access across DataStore, MetaContainer, and Meta arrays.

```ts twoslash
import { accessor, custom } from "@pumped-fn/core-next";

// Create typed accessor
const userPrefs = accessor("user.preferences", custom<{
  theme: "light" | "dark";
  notifications: boolean;
}>());

// Type-safe usage with any Map-like structure
const context = new Map();
userPrefs.set(context, { theme: "dark", notifications: true });
const prefs = userPrefs.get(context); // Fully typed, no 'any'
```

## API Reference

### Creating Accessors

```ts twoslash
// Accessor without default (returns undefined if missing)
const userId = accessor("user.id", custom<string>());

// Accessor with default value
const theme = accessor("user.theme", custom<"light" | "dark">(), "light");
```

### Using Accessors

```ts twoslash
// Required access - throws if not found
const value = accessor.get(source);

// Optional access - returns undefined if not found
const maybeValue = accessor.find(source);

// Set with validation
accessor.set(dataStore, newValue);

// Create preset for initialization
const [key, value] = accessor.preset(initialValue);
```

## Integration with Flows

DataAccessor is the recommended way to access flow context data:

```ts twoslash
import { accessor, custom, flow } from "@pumped-fn/core-next";

// Define context accessors
const traceId = accessor("trace.id", custom<string>());
const userId = accessor("user.id", custom<string>());
const timestamp = accessor("request.time", custom<number>(), Date.now);

const processFlow = flow.define({
  name: "process.request",
  input: custom<{ data: string }>(),
  success: custom<{ processed: boolean }>(),
  error: custom<{ error: string }>()
});

const handler = processFlow.handler(async (ctx, input) => {
  // Type-safe context access (no 'any' types)
  const trace = traceId.get(ctx); // string - throws if missing
  const user = userId.find(ctx); // string | undefined
  const time = timestamp.find(ctx); // number - uses default

  // Set context data
  userId.set(ctx, "user-123");

  return ctx.ok({ processed: true });
});
```

## Built-in Flow Context

The library provides built-in flow context accessors:

```ts twoslash
export const flowMeta = {
  depth: accessor("flow.depth", custom<number>(), 0),
  flowName: accessor("flow.name", custom<string | undefined>()),
  parentFlowName: accessor("flow.parentName", custom<string | undefined>()),
  isParallel: accessor("flow.isParallel", custom<boolean>(), false),
};

// Usage in extensions
const tracingExtension: Extension.Extension = {
  name: "tracing",

  async wrapExecute(context, next, execution) {
    const depth = flowMeta.depth.find(context);
    const flowName = flowMeta.flowName.find(context);

    console.log(`${"  ".repeat(depth)}→ ${flowName}`);
    return await next();
  }
};
```

## Extension Data Management

Extensions use accessors for managing state across executions:

```ts twoslash
// Extension-specific accessors with symbol keys
const executionCount = accessor(
  Symbol.for("metrics.execution.count"),
  custom<number>(),
  0
);

const metricsExtension: Extension.Extension = {
  name: "metrics",

  async wrapExecute(context, next, execution) {
    // Type-safe state management
    const count = executionCount.find(context);
    executionCount.set(context, count + 1);

    return await next();
  }
};
```

## Context Inheritance

Flow contexts automatically inherit from parent contexts:

```ts twoslash
// Parent sets global context
const parentHandler = flow.handler(async (ctx, input) => {
  traceId.set(ctx, `trace-${Date.now()}`);

  // Child inherits parent context
  const result = await ctx.execute(childHandler, input.data);

  return result;
});

// Child accesses inherited + sets its own
const childHandler = childFlow.handler(async (ctx, input) => {
  const trace = traceId.get(ctx); // From parent

  // Child-specific context (doesn't affect parent)
  const operationId = accessor("operation.id", custom<string>());
  operationId.set(ctx, `${trace}-child`);

  return ctx.ok({ processed: input });
});
```

## Testing with Accessors

Use accessor presets for easy test setup:

```ts twoslash
describe("Flow with Context", () => {
  test("handles context correctly", async () => {
    // Setup test context
    const initialContext = [
      traceId.preset("test-trace-123"),
      userId.preset("test-user-456")
    ];

    const result = await flow.execute(handler, input, {
      initialContext
    });

    expect(result.type).toBe("ok");
  });

  test("uses defaults when missing", () => {
    const emptyContext = new Map();

    // AccessorWithDefault returns default
    expect(timestamp.find(emptyContext)).toBeTypeOf("number");

    // Regular accessor returns undefined
    expect(userId.find(emptyContext)).toBeUndefined();
  });
});
```

## vs Meta System

| Feature | Accessor | Meta |
|---------|----------|------|
| **Purpose** | Runtime data access | Component decoration |
| **Mutability** | Mutable (get/set) | Immutable (attached at creation) |
| **Defaults** | Built-in support | Not supported |
| **Storage** | DataStore, MetaContainer | MetaContainer only |
| **Inheritance** | Context hierarchy | No inheritance |

**Use Accessor for**: Runtime data, execution context, mutable state, configuration
**Use Meta for**: Component metadata, static decoration, API configuration

## Best Practices

1. **Use Symbol Keys** for extension/library accessors to avoid conflicts
2. **Use String Keys** for application-specific accessors
3. **Prefer Defaults** with `AccessorWithDefault` to reduce undefined checks
4. **Group Related Accessors** into objects for better organization
5. **Test with Maps** using `preset()` for easy setup

```ts twoslash
// Good: Organized accessor groups
const RequestContext = {
  TRACE_ID: accessor("trace.id", custom<string>()),
  USER_ID: accessor("user.id", custom<string>()),
  SESSION_ID: accessor("session.id", custom<string>(), "anonymous")
};

// Good: Symbol keys for extensions
const METRICS_COUNT = accessor(
  Symbol.for("@myorg/metrics.count"),
  custom<number>(),
  0
);
```

DataAccessor transforms Map-like data access from error-prone any types to type-safe, validated operations with excellent testing support.