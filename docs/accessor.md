# DataAccessor - Type-Safe Data Access

DataAccessor provides type-safe access to Map-like data structures with schema validation. It's the recommended way to manage context data in flows and extensions.

## Core Concept

Instead of using Map.get() and Map.set() with any types, use DataAccessor for type-safe, validated data access across DataStore, MetaContainer, and Meta arrays.

```typescript
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

```typescript
import { accessor, custom } from "@pumped-fn/core-next";

// Accessor without default (returns undefined if missing)
const userId = accessor("user.id", custom<string>());

// Accessor with default value
const theme = accessor("user.theme", custom<"light" | "dark">(), "light");
```

### Using Accessors

```typescript
import { accessor, custom } from "@pumped-fn/core-next";

const userId = accessor("user.id", custom<string>());
const source = new Map();

// Required access - throws if not found
const value = userId.get(source);

// Optional access - returns undefined if not found
const maybeValue = userId.find(source);

// Set with validation
userId.set(source, "123");

// Create preset for initialization
const [key, val] = userId.preset("initial-id");
```

## Integration with Flows

DataAccessor is the recommended way to access flow context data:

```typescript
import { accessor, custom, flow } from "@pumped-fn/core-next";

// Define context accessors
const traceId = accessor("trace.id", custom<string>());
const userId = accessor("user.id", custom<string>());
const timestamp = accessor("request.time", custom<number>(), Date.now());

const processFlow = flow(async (ctx, input: { data: string }) => {
  const trace = traceId.get(ctx);
  const user = userId.find(ctx);
  const time = timestamp.find(ctx);

  userId.set(ctx, "user-123");

  return { processed: true };
});
```

## Built-in Flow Context

The library provides built-in flow context accessors:

```typescript
import { accessor, custom } from "@pumped-fn/core-next";

const flowMeta = {
  depth: accessor("flow.depth", custom<number>(), 0),
  flowName: accessor("flow.name", custom<string | undefined>()),
  parentFlowName: accessor("flow.parentName", custom<string | undefined>()),
  isParallel: accessor("flow.isParallel", custom<boolean>(), false),
};

const tracingExtension = {
  name: "tracing",

  async wrap(context: any, next: any, operation: any) {
    if (operation.kind === "execute") {
      const depth = flowMeta.depth.find(context);
      const flowName = flowMeta.flowName.find(context);

      console.log(`${"  ".repeat(depth)}→ ${flowName}`);
      return await next();
    }
    return next();
  }
};
```

## Extension Data Management

Extensions use accessors for managing state across executions:

```typescript
import { accessor, custom } from "@pumped-fn/core-next";

const executionCount = accessor(
  Symbol.for("metrics.execution.count"),
  custom<number>(),
  0
);

const metricsExtension = {
  name: "metrics",

  async wrap(context: any, next: any, operation: any) {
    if (operation.kind === "execute") {
      const count = executionCount.find(context);
      executionCount.set(context, count + 1);

      return await next();
    }
    return next();
  }
};
```

## Context Inheritance

Flow contexts automatically inherit from parent contexts:

```typescript
import { flow, custom, accessor } from "@pumped-fn/core-next";

const traceId = accessor("trace.id", custom<string>());

const childFlow = flow(async (ctx, input: string) => {
  const trace = traceId.get(ctx);

  const operationId = accessor("operation.id", custom<string>());
  operationId.set(ctx, `${trace}-child`);

  return { processed: input };
});

const parentHandler = flow(async (ctx, input: { data: string }) => {
  traceId.set(ctx, `trace-${Date.now()}`);

  const result = await ctx.exec(childFlow, input.data);

  return result;
});
```

## Testing with Accessors

Use accessor presets for easy test setup:

```typescript
import { accessor, custom, flow } from "@pumped-fn/core-next";

const traceId = accessor("trace.id", custom<string>());
const userId = accessor("user.id", custom<string>());
const timestamp = accessor("timestamp", custom<number>(), Date.now());

const handler = flow(async (ctx, input: any) => {
  return { processed: true };
});

describe("Flow with Context", () => {
  test("handles context correctly", async () => {
    const initialContext = [
      traceId.preset("test-trace-123"),
      userId.preset("test-user-456")
    ];

    const result = await flow.execute(handler, {}, {
      initialContext
    });

    expect(result.processed).toBe(true);
  });

  test("uses defaults when missing", () => {
    const emptyContext = new Map();

    expect(timestamp.find(emptyContext)).toBeTypeOf("number");
    expect(userId.find(emptyContext)).toBeUndefined();
  });
});
```

## vs Tag System

| Feature | Accessor | Tag |
|---------|----------|------|
| **Purpose** | Runtime data access | Component decoration |
| **Mutability** | Mutable (get/set) | Immutable (attached at creation) |
| **Defaults** | Built-in support | Not supported |
| **Storage** | DataStore, Tag.Container | Tag.Container only |
| **Inheritance** | Context hierarchy | No inheritance |

**Use Accessor for**: Runtime data, execution context, mutable state, configuration
**Use Tag for**: Component metadata, static decoration, API configuration

## Best Practices

1. **Use Symbol Keys** for extension/library accessors to avoid conflicts
2. **Use String Keys** for application-specific accessors
3. **Prefer Defaults** with `AccessorWithDefault` to reduce undefined checks
4. **Group Related Accessors** into objects for better organization
5. **Test with Maps** using `preset()` for easy setup

```typescript
import { accessor, custom } from "@pumped-fn/core-next";

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