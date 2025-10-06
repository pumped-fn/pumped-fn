# Flow API - Structured Business Logic

Flow extends pumped-fn with validated business logic, dependency injection, and context management for complex application workflows.

## Core Concepts

Flow = Validated Business Logic + Dependency Injection + Context Management

### Schema System
Uses [standardschema v1](https://github.com/standard-schema/standard-schema) - a standard for validation libraries.

```typescript
// Type-only (no runtime validation)
import { custom } from "@pumped-fn/core-next";
type MyType = { id: string };
const input = custom<MyType>();

// With runtime validation (zod example)
import { z } from "zod";
const schema = z.object({ email: z.string().email() });
```

### Quick Start

```typescript
import { flow, custom, provide } from "@pumped-fn/core-next";

const dbExecutor = provide(() => ({ create: (input: any) => "123" }));
const loggerExecutor = provide(() => ({ info: (msg: string, data: any) => console.log(msg, data) }));

// Simplest form - handler only
const simple = flow(async (ctx, input: number) => input * 2);

// With dependencies
const withDeps = flow(
  { db: dbExecutor, logger: loggerExecutor },
  async ({ db, logger }, ctx, input: { email: string }) => {
    logger.info("Processing", input);
    return { userId: db.create(input) };
  }
);

// With explicit definition (for external APIs)
const defined = flow.define({
  name: "user.create",
  input: custom<{ email: string }>(),
  output: custom<{ userId: string }>(),
});

const handler = defined.handler(
  { db: dbExecutor, logger: loggerExecutor },
  async ({ db, logger }, ctx, input) => {
    logger.info("Processing", input);
    return { userId: db.create(input) };
  }
);
```

## Context API

The flow context provides data access, nested execution, journaling, and parallel operations:

```typescript

interface Context {
  readonly pod: Core.Pod;

  // Context data access (use with accessors)
  get<T>(accessor: Accessor<T>): T;
  find<T>(accessor: Accessor<T>): T | undefined;
  set<T>(accessor: Accessor<T>, value: T): void;

  // Execute nested flows
  exec<F>(flow: F, input: Input): Promised<Output>;

  // Journaling for deterministic replay
  run<T>(key: string, fn: () => Promise<T> | T): Promised<T>;
  run<T, P extends readonly unknown[]>(
    key: string,
    fn: (...args: P) => Promise<T> | T,
    ...params: P
  ): Promised<T>;

  // Parallel execution
  parallel<T extends readonly Promised<any>[]>(
    promises: [...T]
  ): Promise<ParallelResult<T>>;

  parallelSettled<T extends readonly Promised<any>[]>(
    promises: [...T]
  ): Promise<ParallelSettledResult<T>>;
}
```

**Key Points:**
- Handlers return `T` directly, not `ctx.ok(T)`
- Errors thrown as exceptions, not `ctx.ko(E)`
- Use `Promised<T>` for flow results (extends Promise with flow metadata)
- Context data uses `accessor` for type safety

## Execution

```typescript

// Direct execution
const result = await flow.execute(handler, { email: "test@example.com" });
console.log(result.userId);

// With options
const result = await flow.execute(handler, input, {
  scope: myScope,
  extensions: [loggingExtension, tracingExtension],
  initialContext: [[contextKey, contextValue]],
});

// Error handling
try {
  const result = await flow.execute(handler, input);
  console.log(result);
} catch (error) {
  console.error("Flow failed:", error);
}
```

## Patterns

### 1. Simple Flow

```typescript

import { flow } from "@pumped-fn/core-next";

const calc = flow(async (ctx, input: { a: number; b: number }) => {
  if (isNaN(input.a) || isNaN(input.b)) {
    throw new Error("INVALID_INPUT");
  }
  return { result: input.a + input.b };
});

const result = await flow.execute(calc, { a: 5, b: 3 });
console.log(result.result); // 8
```

### 2. Flow with Dependencies

```typescript

import { flow, provide } from "@pumped-fn/core-next";

type User = { id: string; name: string };

const dbExecutor = provide(() => ({
  findUser: async (id: string): Promise<User | null> => ({ id, name: "John" })
}));

const getUser = flow(
  { db: dbExecutor },
  async ({ db }, ctx, input: { userId: string }) => {
    const user = await db.findUser(input.userId);
    if (!user) {
      throw new Error(`User ${input.userId} not found`);
    }
    return { user };
  }
);

const result = await flow.execute(getUser, { userId: "123" });
console.log(result.user);
```

### 3. Nested Flow Execution

```typescript

const validateEmail = flow(async (ctx, input: { email: string }) => {
  if (!input.email.includes("@")) {
    throw new Error("Invalid email format");
  }
  return { valid: true };
});

const register = flow(async (ctx, input: { email: string; password: string }) => {
  const emailCheck = await ctx.exec(validateEmail, { email: input.email });

  if (!emailCheck.valid) {
    throw new Error("VALIDATION_FAILED");
  }

  return { userId: "123", token: "abc" };
});

const result = await flow.execute(register, {
  email: "user@example.com",
  password: "secret"
});
```

### 4. Parallel Flow Execution

```typescript

const checkInventory = flow(async (ctx, items: string[]) => {
  return { available: true, items };
});

const processPayment = flow(async (ctx, amount: number) => {
  return { charged: amount, transactionId: "txn-123" };
});

const calculateShipping = flow(async (ctx, address: string) => {
  return { cost: 10, address };
});

const processOrder = flow(async (ctx, input: { items: string[]; total: number; address: string }) => {
  const result = await ctx.parallel([
    ctx.exec(checkInventory, input.items),
    ctx.exec(processPayment, input.total),
    ctx.exec(calculateShipping, input.address),
  ]);

  const [inventory, payment, shipping] = result.results;

  return {
    orderId: "order-123",
    inventory,
    payment,
    shippingCost: shipping.cost,
  };
});
```

## Extension Integration

Flows integrate with the extension system for cross-cutting concerns:

```typescript

import type { Extension } from "@pumped-fn/core-next";
import { accessor, custom } from "@pumped-fn/core-next";

const traceId = accessor("trace.id", custom<string>());

const tracingExtension: Extension.Extension = {
  name: "tracing",

  async initPod(pod, context) {
    traceId.set(context, `trace-${Date.now()}`);
  },

  async wrap(context, next, operation) {
    if (operation.kind === "execute") {
      const start = Date.now();
      try {
        return await next();
      } finally {
        console.log(`Flow '${operation.definition.name}' took ${Date.now() - start}ms`);
      }
    }
    return next();
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
| Error handling | Exceptions | Exceptions |
| Return type | T | T (via `Promised<T>`) |

## Flow Coding Styles

**External-facing flows** (composing flows near entrypoints) should be explicit. The spec is often shared with clients for RPC. These flows use the definition → handler pattern:

```typescript

const apiFlow = flow.define({
  name: "user.create",
  input: z.object({ email: z.string().email() }),
  output: z.object({ userId: z.string() }),
  error: z.object({ code: z.string(), message: z.string() })
});

const handler = apiFlow.handler(/* implementation */);
```

**Internal-facing flows** (flow steps within other flows) should be implicit. The spec is unlikely to be used outside the current environment. Use the inline pattern:

```typescript

const validateEmail = flow(
  {
    name: "internal.validateEmail",
    input: custom<{ email: string }>(),
    output: custom<{ valid: boolean }>(),
    error: custom<{ reason: string }>()
  },
  async (ctx, input) => {
    // Implementation
    return ctx.ok({ valid: true });
  }
);

// With dependencies
const processUser = flow(
  {
    name: "internal.processUser",
    input: custom<{ userId: string }>(),
    output: custom<{ processed: boolean }>(),
    error: custom<{ error: string }>()
  },
  { db: dbExecutor, logger: loggerExecutor },
  async ({ db, logger }, ctx, input) => {
    // Implementation
    return ctx.ok({ processed: true });
  }
);
```

## DataAccessor Integration

**Recommended**: Use DataAccessor for all context data in flows instead of direct Map access.

```typescript
import { accessor, custom, flow } from "@pumped-fn/core-next";

// Define context accessors
const traceId = accessor("trace.id", custom<string>());
const userId = accessor("user.id", custom<string>());
const timestamp = accessor("request.time", custom<number>(), Date.now());

const processFlow = flow(async (ctx, input: { data: string }) => {
  // Type-safe context access (no 'any' types)
  const trace = traceId.get(ctx); // throws if missing
  const user = userId.find(ctx); // undefined if missing
  const time = timestamp.find(ctx); // uses default

  // Set context data with validation
  userId.set(ctx, "user-123");

  return { processed: true };
});

// Test with accessor presets
const initialContext = [
  traceId.preset("test-trace"),
  userId.preset("test-user")
];

const result = await flow.execute(processFlow, { data: "test" }, { initialContext });
```

## Key Rules

1. **Input/Output Validation**: All inputs are validated against schemas before handler execution
2. **Error Handling**: Use exceptions for all errors (business and system)
3. **Dependency Injection**: Dependencies resolved before handler execution
4. **Context Isolation**: Each flow execution has isolated context (child contexts inherit from parent)
5. **Type Safety**: Full TypeScript inference for inputs, outputs, and dependencies
6. **Context Access**: Use DataAccessor for type-safe context data instead of direct Map operations
7. **Journaling**: Use `ctx.run()` for deterministic replay of operations

Common `standardSchemas` should be reusable and composable across your application flows.