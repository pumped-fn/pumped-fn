# Flow API - @pumped-fn/core-next

_Extension to pumped-fn for structured business logic flows with input/output validation_

## Core Concepts

Flow consists Validated Business Logic + Dependency Injection + Context Management
Flow makes use of standardschem v1 standard to declare different cases.

library comes with `custom` which does no validation, just to retain the type, but implementation always can use zod or similar library where availables

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
const calcFlow = flow.define({
  name: "calc.add",
  input: schema<{ a: number; b: number }>(),
  success: schema<{ result: number }>(),
  error: schema<{ code: string }>(),
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
const userFlow = flow.define({
  name: "user.get",
  input: schema<{ userId: string }>(),
  success: schema<{ user: User }>(),
  error: schema<{ code: string; message: string }>(),
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

## Plugin System

```typescript
import { flow } from "@pumped-fn/core-next";

const tracingPlugin = flow.plugin({
  name: "tracing",

  async init(pod, context) {
    context.set(TRACE_ID, generateTraceId());
  },

  async wrap(context, next) {
    const start = Date.now();
    try {
      return await next();
    } finally {
      console.log(`Flow took ${Date.now() - start}ms`);
    }
  },
});
```

## Key Rules

1. **Input/Output Validation**: All inputs are validated against schemas before handler execution
2. **Error Handling**: Use ctx.ko() for business errors, exceptions for system errors
3. **Dependency Injection**: Dependencies resolved before handler execution
4. **Context Isolation**: Each flow execution has isolated context (child contexts inherit from parent)
5. **Type Safety**: Full TypeScript inference for inputs, outputs, and dependencies

## Flow coding styles

External facing flow (normally the composing one closer to the entrypoint) meant to be explicit, the spec is likely to be shared with client for RPC. Those flows go with this style: definition -> handler separately. This normally applies to main business process. Prefer using flow.define -> `.handler`

Internal facing flow (normally the step in the other flow) meant to be implicit, the spec is unlikely to be used anywhere but the current environment. Prefer using flow(def, handler) or flow(def, dependency, handler)

Common standardSchemas are meant to be reusable and composable
