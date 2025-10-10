# Flow API - @pumped-fn/core-next

_Structured business logic flows with input/output validation_

**Important**: Always refer to [api.md](./api.md) for actual API signatures and available methods.

## Core Concepts

Flow consists Validated Business Logic + Dependency Injection + Context Management

## Designing a flow
A flow is a composed of steps, processing in a specific order. A flow must own its outputs, not only happy case but also all of its edge cases, as such, it'll be normal to wrap around some executions into flow's error specific.

Flow has access to input as well as a context. While it's easy to use Context for all type of data, those are defined for different purposes. Input should be sufficient to process the business flow. Context, on the other hand should be used to store information to support aspect oriented needs.

For example, a flow about hotel booking, input will look like
- an user information (who's booking)
- booking details (whereabout, dates, detail requirement etc)

in the context, information will be like
- ips, devices where the request happen
- database transaction to guarantee consistency
- trace id of the request

### Context Architecture

Flows are the unit for short-span operations. Each flow maintains:
- **Root Context**: Map-like data structure for flow-specific data
- **Context Forking**: Sub-flows receive forked version of parent context
- **Execution Control**: Parent flow controls all sub-executions
- **Isolation**: Each flow can store its own data while inheriting parent data

Sub-flows can execute in sequential or parallel mode, with context organized accordingly:
```typescript
// Sequential: Context flows through each step
const result1 = await ctx.execute(flow1, input1);
const result2 = await ctx.execute(flow2, input2);

// Parallel: Each gets isolated forked context
const results = await ctx.executeParallel([
  [flow1, input1],
  [flow2, input2]
]);

// Handle parallel results with utility methods
const values = await ctx.parallelSettled([p1, p2, p3]).fulfilled();
const firstError = await ctx.parallelSettled([p1, p2, p3]).firstRejected();
const { fulfilled, rejected } = await ctx.parallelSettled([p1, p2, p3]).partition();

// Or chain operations
const sum = await ctx
  .parallelSettled([p1, p2, p3])
  .fulfilled()
  .map(values => values.reduce((a, b) => a + b, 0));
```

### Schema System
Uses [standardschema v1](https://github.com/standard-schema/standard-schema) - a standard for validation libraries.

```typescript
// Type-only (no runtime validation)
import { custom } from "@pumped-fn/core-next";
const spec = { input: custom<MyType>() };

// With runtime validation (zod example)
import { z } from "zod";
const schema = z.object({ email: z.string().email() });
const spec = { input: schema };
```

### Quick start

```ts
import { flow, custom } from "@pumped-fn/core-next";
```

### Flow Structure

```typescript
// Define schemas and create flow
const myFlow = flow.define({
  name: "user.create",
  input: custom<{ email: string }>(),
  success: custom<{ userId: string }>(),
  error: custom<{ code: string; message: string }>(),
});

// Implement handler
const handler = myFlow.handler(async (ctx, input) => {
  return ctx.ok({ userId: "123" }); // Success
  return ctx.ko({ code: "ERROR", message: "Failed" }); // Error
});

// With dependencies
const handlerWithDeps = myFlow.handler(
  { db: dbExecutor, logger: loggerExecutor },
  async ({ db, logger }, ctx, input) => {
    logger.info("Processing", input);
    return ctx.ok({ userId: db.create(input) });
  }
);
```

### Context API

```typescript
interface Context<I, S, E> {
  input: I; // Validated input
  ok(data: S): OK<S>; // Success result
  ko(data: E): KO<E>; // Error result

  // Execute nested flows
  execute<F>(flow: F, input: Input): Promise<Output>;

  // Execute parallel flows
  executeParallel(
    flows: [[flow1, input1], [flow2, input2]]
  ): Promise<[Output1, Output2]>;

  // Context storage
  get(key: unknown): unknown;
  set(key: unknown, value: unknown): unknown;
}
```

### Execution

```typescript
// Direct execution
const result = await flow.execute(handler, { email: "test@example.com" });
if (result.isOk()) {
  console.log(result.data.userId);
} else {
  console.log(result.data.code);
}

// With scope and extensions
const result = await flow.execute(handler, input, {
  scope: myScope,
  extensions: [loggingExtension, tracingExtension],
  initialContext: [[contextKey, contextValue]],
});
```

## Patterns

### 1. Simple Flow with Validation and Logging

```typescript
const calcFlow = flow.define({
  name: "calc.add",
  input: custom<{ a: number; b: number }>(),
  success: custom<{ result: number }>(),
  error: custom<{ code: string; message: string }>(),
});

const calc = calcFlow.handler(
  { logger },
  async ({ logger }, ctx, input) => {
    const log = logger.child({ flow: "calc.add" });

    if (isNaN(input.a) || isNaN(input.b)) {
      log.warn("Invalid input received", { input });
      return ctx.ko({
        code: "INVALID_INPUT",
        message: "Both inputs must be valid numbers"
      });
    }

    const result = input.a + input.b;
    log.info("Calculation completed", { result });
    return ctx.ok({ result });
});
```

### 2. Flow with Dependencies and Error Handling

```typescript
const userFlow = flow.define({
  name: "user.get",
  input: custom<{ userId: string }>(),
  success: custom<{ user: User }>(),
  error: custom<{ code: string; message: string; details?: any }>(),
});

const getUser = userFlow.handler(
  { db: dbExecutor, logger },
  async ({ db, logger }, ctx, input) => {
    const log = logger.child({
      flow: "user.get",
      userId: input.userId,
      traceId: ctx.get("traceId")
    });

    log.debug("Fetching user from database");

    try {
      const user = await db.findUser(input.userId);

      if (!user) {
        log.warn("User not found", { userId: input.userId });
        return ctx.ko({
          code: "USER_NOT_FOUND",
          message: `User ${input.userId} not found`,
        });
      }

      log.info("User retrieved successfully");
      return ctx.ok({ user });
    } catch (error) {
      log.error("Database error", { error });
      return ctx.ko({
        code: "DB_ERROR",
        message: "Failed to retrieve user",
        details: error
      });
    }
  }
);
```

### 3. Nested Flow Execution

```typescript
const registerSpec = flow.define({
  name: "user.register",
  input: schema<{ email: string; password: string }>(),
  success: schema<{ userId: string; token: string }>(),
  error: schema<{ code: string; message: string }>(),
});

const register = registerFlow.handler(
  { validator: validatorExecutor },
  async ({ validator }, ctx, input) => {
    // Execute nested validation flow
    const emailCheck = await ctx.execute(validateEmailFlow, {
      email: input.email,
    });

    if (emailCheck.isKo()) {
      return ctx.ko({
        code: "VALIDATION_FAILED",
        message: emailCheck.data.message,
      });
    }

    // Continue with registration...
    return ctx.ok({ userId: "123", token: "abc" });
  }
);
```

### 4. Parallel Flow Execution with Utility Methods

The `parallelSettled()` method returns `Promised<ParallelSettledResult<T>>` with chainable utility methods for easy result processing:

```typescript
const processOrder = orderFlow.handler(async (ctx, input) => {
  // Execute multiple flows in parallel with automatic result handling
  const settled = ctx.parallelSettled([
    ctx.exec(checkInventoryFlow, { items: input.items }),
    ctx.exec(processPaymentFlow, { amount: input.total }),
    ctx.exec(calculateShippingFlow, { address: input.address }),
  ]);

  // Extract only successful values
  const [inventory, payment, shipping] = await settled.fulfilled();

  // Or check for errors first
  const firstError = await settled.firstRejected();
  if (firstError) {
    return ctx.ko({ code: "ORDER_FAILED", message: String(firstError) });
  }

  // Or partition results
  const { fulfilled, rejected } = await settled.partition();
  if (rejected.length > 0) {
    return ctx.ko({ code: "PARTIAL_FAILURE", failed: rejected.length });
  }

  // Or assert all succeeded (throws if any failed)
  const allValues = await settled.assertAllFulfilled(
    (reasons) => new Error(`${reasons.length} operations failed`)
  );

  return ctx.ok({
    orderId: generateId(),
    shippingCost: shipping.cost,
  });
});
```

**Available Utility Methods:**

- **`.fulfilled()`** - Extract all successful values as an array
- **`.rejected()`** - Extract all rejection reasons as an array
- **`.partition()`** - Split into `{ fulfilled: T[], rejected: unknown[] }`
- **`.firstFulfilled()`** - Get first successful value or undefined
- **`.firstRejected()`** - Get first rejection or undefined
- **`.findFulfilled(predicate)`** - Find first fulfilled value matching predicate
- **`.mapFulfilled(fn)`** - Map over only successful values
- **`.assertAllFulfilled(errorMapper?)`** - Throw if any failed, return fulfilled values

All methods are chainable with other `Promised` operations:

```typescript
// Complex chaining example
const totalAmount = await ctx
  .parallelSettled([
    ctx.exec(getOrderTotal, orderId1),
    ctx.exec(getOrderTotal, orderId2),
    ctx.exec(getOrderTotal, orderId3),
  ])
  .fulfilled()
  .map(totals => totals.reduce((sum, t) => sum + t, 0));
```

## Extension Integration

```typescript
import type { Extension } from "@pumped-fn/core-next";

const tracingExtension: Extension.Extension = {
  name: "tracing",

  async initPod(pod, context) {
    context.set(TRACE_ID, generateTraceId());
  },

  async wrapExecute(context, next, execution) {
    const start = Date.now();
    try {
      return await next();
    } finally {
      console.log(`Flow '${execution.flowName}' took ${Date.now() - start}ms`);
    }
  },
};

// Usage in flow execution
const result = await flow.execute(handler, input, {
  extensions: [tracingExtension]
});
```

## Flow + Executor Integration

### Execution Context
```typescript
// With scope: Uses scope.pod() (isolated, no reactive)
const result = await flow.execute(handler, input, { scope });

// Without scope: Creates temporary scope → pod → execute → dispose
const result = await flow.execute(handler, input);
```

### Key Differences
| Feature | Executors | Flows |
|---------|-----------|-------|
| Reactive | ✅ Supported | ❌ Not in pods |
| Validation | Manual | Built-in schemas |
| Context | Via scope | Via context param |
| Error handling | Exceptions | Structured ok/ko |

## DataAccessor Integration

**Recommended**: Use DataAccessor for all Map-like context data access in flows. FlowContext implements DataStore, making accessors the type-safe way to manage execution context.

### Built-in Flow Context Accessors

```typescript
// Built-in execution context (from flow.ts)
export const FlowExecutionContext = {
  depth: accessor("flow.depth", custom<number>(), 0),
  flowName: accessor("flow.name", custom<string | undefined>()),
  parentFlowName: accessor("flow.parentName", custom<string | undefined>()),
  isParallel: accessor("flow.isParallel", custom<boolean>(), false),
};

// Usage in extensions
const tracingExtension: Extension.Extension = {
  name: "tracing",

  async wrapExecute(context, next, execution) {
    const depth = FlowExecutionContext.depth.find(context);
    const flowName = FlowExecutionContext.flowName.find(context);
    const isParallel = FlowExecutionContext.isParallel.find(context);

    const indent = "  ".repeat(depth);
    const marker = isParallel ? "∥" : "→";
    console.log(`${indent}${marker} ${flowName}`);

    return await next();
  }
};
```

### Type-Safe Context Management

```typescript
import { accessor, custom } from "@pumped-fn/core-next";

// Define context accessors for your domain
const RequestContext = {
  TRACE_ID: accessor("trace.id", custom<string>()),
  USER_ID: accessor("user.id", custom<string>()),
  SESSION_ID: accessor("session.id", custom<string>()),
  REQUEST_TIME: accessor("request.time", custom<number>(), Date.now),
  CORRELATION_ID: accessor("correlation.id", custom<string>())
};

const processUserFlow = flow.define({
  name: "user.process",
  input: custom<{ userId: string; action: string }>(),
  success: custom<{ result: string; processed: boolean }>(),
  error: custom<{ code: string; message: string }>()
});

const handler = processUserFlow.handler(
  { userService: userServiceExecutor },
  async ({ userService }, ctx, input) => {
    // Type-safe context access (no any types)
    const traceId = RequestContext.TRACE_ID.get(ctx); // throws if missing
    const userId = RequestContext.USER_ID.find(ctx); // undefined if missing
    const requestTime = RequestContext.REQUEST_TIME.find(ctx); // uses default

    // Set context for downstream flows
    RequestContext.USER_ID.set(ctx, input.userId);
    RequestContext.CORRELATION_ID.set(ctx, `${traceId}-${Date.now()}`);

    // Process with type-safe context
    const result = await userService.process(input.userId, input.action);

    return ctx.ok({
      result: result.data,
      processed: true
    });
  }
);
```

### Context Inheritance Patterns

```typescript
// Parent flow sets global context
const parentFlow = flow.handler(async (ctx, input) => {
  // Set parent-level context
  RequestContext.TRACE_ID.set(ctx, `trace-${Date.now()}`);
  RequestContext.SESSION_ID.set(ctx, input.sessionId);

  // Execute child flow - inherits parent context
  const childResult = await ctx.execute(childFlowHandler, {
    data: input.payload
  });

  return childResult;
});

// Child flow accesses inherited context + sets its own
const childFlowHandler = childFlow.handler(async (ctx, input) => {
  // Access parent context (automatic inheritance)
  const traceId = RequestContext.TRACE_ID.get(ctx); // From parent
  const sessionId = RequestContext.SESSION_ID.get(ctx); // From parent

  // Set child-specific context (isolated from parent)
  const ChildContext = {
    OPERATION_ID: accessor("operation.id", custom<string>())
  };

  ChildContext.OPERATION_ID.set(ctx, `${traceId}-child`);

  // Child modifications don't affect parent context
  return ctx.ok({ processed: input.data });
});
```

### Testing with Accessor Presets

```typescript
describe("Flow Context Management", () => {
  test("handles context inheritance correctly", async () => {
    // Setup test context using accessor presets
    const initialContext = [
      RequestContext.TRACE_ID.preset("test-trace-123"),
      RequestContext.USER_ID.preset("user-456"),
      RequestContext.REQUEST_TIME.preset(1640995200000)
    ];

    const result = await flow.execute(handler, input, {
      initialContext
    });

    expect(result.type).toBe("ok");

    // Context state is predictable and type-safe
    expect(RequestContext.TRACE_ID.get(testContext)).toBe("test-trace-123");
  });

  test("uses defaults when context missing", () => {
    const emptyContext = new Map();

    // AccessorWithDefault provides safe defaults
    const requestTime = RequestContext.REQUEST_TIME.find(emptyContext);
    expect(typeof requestTime).toBe("number");

    // Regular accessor returns undefined for missing values
    const traceId = RequestContext.TRACE_ID.find(emptyContext);
    expect(traceId).toBeUndefined();
  });
});
```

### Extension Data Management

```typescript
// Extensions use accessors for cross-execution state
const MetricsAccessors = {
  EXECUTION_COUNT: accessor(
    Symbol.for("metrics.execution.count"),
    custom<number>(),
    0
  ),
  TOTAL_DURATION: accessor(
    Symbol.for("metrics.total.duration"),
    custom<number>(),
    0
  ),
  ERROR_COUNT: accessor(
    Symbol.for("metrics.error.count"),
    custom<number>(),
    0
  )
};

const metricsExtension: Extension.Extension = {
  name: "metrics",

  async wrapExecute(context, next, execution) {
    const start = Date.now();

    // Type-safe metrics access with defaults
    const execCount = MetricsAccessors.EXECUTION_COUNT.find(context);
    MetricsAccessors.EXECUTION_COUNT.set(context, execCount + 1);

    try {
      const result = await next();

      const duration = Date.now() - start;
      const totalDuration = MetricsAccessors.TOTAL_DURATION.find(context);
      MetricsAccessors.TOTAL_DURATION.set(context, totalDuration + duration);

      return result;
    } catch (error) {
      const errorCount = MetricsAccessors.ERROR_COUNT.find(context);
      MetricsAccessors.ERROR_COUNT.set(context, errorCount + 1);
      throw error;
    }
  }
};

## Key Rules

1. **Input/Output Validation**: All inputs are validated against schemas before handler execution
2. **Error Handling**: Use ctx.ko() for business errors, exceptions for system errors
3. **Dependency Injection**: Dependencies resolved before handler execution
4. **Context Isolation**: Each flow execution has isolated context (child contexts inherit from parent)
5. **Type Safety**: Full TypeScript inference for inputs, outputs, and dependencies
6. **Context Data Access**: Use DataAccessor for all Map-like context data - provides type safety, validation, and defaults

## Flow Patterns

### External vs Internal Flows
- **External flows**: Use `flow.define()` → `.handler()` for main business processes
- **Internal flows**: Use inline `flow(def, handler)` for sub-flows
- StandardSchemas should be reusable and composable
