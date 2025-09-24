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
const spec = { input: custom<MyType>() };

// With runtime validation (zod example)
import { z } from "zod";
const schema = z.object({ email: z.string().email() });
const spec2 = { input: schema };
```

### Quick Start

```typescript
import { flow, custom, provide } from "@pumped-fn/core-next";

const dbExecutor = provide(() => ({ create: (input: any) => "123" }));
const loggerExecutor = provide(() => ({ info: (msg: string, data: any) => console.log(msg, data) }));

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
  // return ctx.ko({ code: "ERROR", message: "Failed" }); // Error
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

## Context API

The flow context provides validated input, result helpers, nested execution, and storage:

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

## Execution

```typescript

// Direct execution
const result = await flow.execute(handler, { email: "test@example.com" });
if (result.isOk()) {
  console.log(result.data.userId);
} else {
  console.log(result.data.code);
}

// With scope and plugins
const result = await flow.execute(handler, input, {
  scope: myScope,
  plugins: [loggingPlugin, tracingPlugin],
  initialContext: [[contextKey, contextValue]],
});
```

## Patterns

### 1. Simple Flow

```typescript

import { flow, custom } from "@pumped-fn/core-next";

const calcFlow = flow.define({
  name: "calc.add",
  input: custom<{ a: number; b: number }>(),
  success: custom<{ result: number }>(),
  error: custom<{ code: string }>(),
});

const calc = calcFlow.handler(async (ctx, input) => {
  if (isNaN(input.a) || isNaN(input.b)) {
    return ctx.ko({ code: "INVALID_INPUT" });
  }
  return ctx.ok({ result: input.a + input.b });
});
```

### 2. Flow with Dependencies

```typescript

import { flow, custom, provide } from "@pumped-fn/core-next";

type User = { id: string; name: string };

const dbExecutor = provide(() => ({
  findUser: async (id: string): Promise<User | null> => ({ id, name: "John" })
}));

const userFlow = flow.define({
  name: "user.get",
  input: custom<{ userId: string }>(),
  success: custom<{ user: User }>(),
  error: custom<{ code: string; message: string }>(),
});

const getUser = userFlow.handler(
  { db: dbExecutor },
  async ({ db }, ctx, input) => {
    const user = await db.findUser(input.userId);
    if (!user) {
      return ctx.ko({
        code: "USER_NOT_FOUND",
        message: `User ${input.userId} not found`,
      });
    }
    return ctx.ok({ user });
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

### 4. Parallel Flow Execution

```typescript

const processOrder = orderFlow.handler(async (ctx, input) => {
  // Execute multiple flows in parallel
  const [inventory, payment, shipping] = await ctx.executeParallel([
    [checkInventoryFlow, { items: input.items }],
    [processPaymentFlow, { amount: input.total }],
    [calculateShippingFlow, { address: input.address }],
  ]);

  if (inventory.type === "ko" || payment.type === "ko") {
    return ctx.ko({ code: "ORDER_FAILED", message: "..." });
  }

  return ctx.ok({
    orderId: generateId(),
    shippingCost: shipping.data.cost,
  });
});
```

## Extension Integration

Flows integrate with the extension system for cross-cutting concerns:

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

## Flow Coding Styles

**External-facing flows** (composing flows near entrypoints) should be explicit. The spec is often shared with clients for RPC. These flows use the definition → handler pattern:

```typescript

const apiFlow = flow.define({
  name: "user.create",
  input: z.object({ email: z.string().email() }),
  success: z.object({ userId: z.string() }),
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
    success: custom<{ valid: boolean }>(),
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
    success: custom<{ processed: boolean }>(),
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
const timestamp = accessor("request.time", custom<number>(), Date.now);

const processFlow = flow.define({
  name: "process.request",
  input: custom<{ data: string }>(),
  success: custom<{ processed: boolean }>(),
  error: custom<{ error: string }>()
});

const handler = processFlow.handler(async (ctx, input) => {
  // Type-safe context access (no 'any' types)
  const trace = traceId.get(ctx); // throws if missing
  const user = userId.find(ctx); // undefined if missing
  const time = timestamp.find(ctx); // uses default

  // Set context data with validation
  userId.set(ctx, "user-123");

  return ctx.ok({ processed: true });
});

// Test with accessor presets
const initialContext = [
  traceId.preset("test-trace"),
  userId.preset("test-user")
];

const result = await flow.execute(handler, input, { initialContext });
```

## Key Rules

1. **Input/Output Validation**: All inputs are validated against schemas before handler execution
2. **Error Handling**: Use ctx.ko() for business errors, exceptions for system errors
3. **Dependency Injection**: Dependencies resolved before handler execution
4. **Context Isolation**: Each flow execution has isolated context (child contexts inherit from parent)
5. **Type Safety**: Full TypeScript inference for inputs, outputs, and dependencies
6. **Context Access**: Use DataAccessor for type-safe context data instead of direct Map operations

Common `standardSchemas` should be reusable and composable across your application flows.