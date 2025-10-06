# Flow System

Flow orchestrates short-span operations with context forking, journaling, and parallel execution.

## Core Concepts

**Flow** = Short-lived execution unit with isolated context
**Context** = Forked data structure for operation isolation
**Journal** = Deterministic replay mechanism
**Pod** = Isolated execution environment (forked from scope)

## Execution Model

Each flow execution:
1. Creates a pod (isolated from scope, no reactivity)
2. Forks context from parent (if sub-flow)
3. Journals all operations for replay
4. Disposes pod after completion

```typescript
// Root flow execution
flow.execute(handler, input)
  → creates scope → creates pod → executes → disposes pod → disposes scope

// With existing scope
flow.execute(handler, input, { scope })
  → uses scope → creates pod → executes → disposes pod

// Sub-flow execution (via ctx.exec)
ctx.exec(subFlow, input)
  → uses parent pod → forks context → executes → context disposed
```

### Context Forking

Each flow execution creates a forked context:
- **Root flow**: New context, depth = 0
- **Sub-flow**: Child context inherits parent data, depth = parent.depth + 1
- **Parallel flows**: Each gets independent forked context

```typescript
const main = flow(async (ctx, input: number) => {
  ctx.set(customKey, "parent-data");

  const result = await ctx.exec(subFlow, input);
});

const subFlow = flow(async (ctx, input: number) => {
  const parentData = ctx.find(customKey);
  ctx.set(childKey, "child-data");

  return input * 2;
});
```

## Schema System
Uses [standardschema v1](https://github.com/standard-schema/standard-schema).

```typescript
import { custom } from "@pumped-fn/core-next";
import { z } from "zod";

const typeOnly = custom<{ id: string }>();
const withValidation = z.object({ email: z.string().email() });
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

### 4. Journaling for Deterministic Replay

```typescript
const fetchData = flow(async (ctx, url: string) => {
  const data = await ctx.run("fetch", async () => {
    const response = await fetch(url);
    return response.json();
  });

  const transformed = await ctx.run("transform", () => {
    return data.map((item: any) => ({ ...item, processed: true }));
  });

  return transformed;
});
```

**Key points:**
- Each `ctx.run()` call is journaled with a key
- Replaying the flow uses journaled values (no re-execution)
- Journal keys must be unique within a flow
- Use for non-deterministic operations (network, random, time)

### 5. Parallel Flow Execution

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

### 6. Parallel with Error Handling

```typescript
const processOrders = flow(async (ctx, orders: Order[]) => {
  const promises = orders.map(order =>
    ctx.exec(processOrder, order)
  );

  const result = await ctx.parallelSettled(promises);

  const successful = result.results
    .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled")
    .map(r => r.value);

  const failed = result.results
    .filter((r): r is PromiseRejectedResult => r.status === "rejected")
    .map(r => r.reason);

  return {
    processed: successful.length,
    failed: failed.length,
    errors: failed,
    stats: result.stats
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

## flowMeta - Flow Execution Metadata

`flowMeta` exposes flow execution state via accessors:

```typescript
import { flowMeta } from "@pumped-fn/core-next";

const flowMeta = {
  depth: Accessor.AccessorWithDefault<number>,
  flowName: Accessor.Accessor<string | undefined>,
  parentFlowName: Accessor.Accessor<string | undefined>,
  isParallel: Accessor.AccessorWithDefault<boolean>,
  journal: Accessor.Accessor<ReadonlyMap<string, unknown>>
};
```

### Usage in Flows

```typescript
const tracingFlow = flow(async (ctx, input: { userId: string }) => {
  const depth = ctx.get(flowMeta.depth);
  const name = ctx.find(flowMeta.flowName);
  const parent = ctx.find(flowMeta.parentFlowName);

  console.log(`[${depth}] ${parent} → ${name}`);

  return { processed: true };
});
```

### Usage in Extensions

```typescript
const loggingExtension: Extension.Extension = {
  name: "logging",

  async wrap(context, next, operation) {
    if (operation.kind === "execute") {
      const depth = context.get(flowMeta.depth);
      const flowName = context.find(flowMeta.flowName);

      console.log(`${"  ".repeat(depth)}→ ${flowName}`);

      const result = await next();

      console.log(`${"  ".repeat(depth)}← ${flowName}`);

      return result;
    }
    return next();
  }
};
```

### Journal Access

```typescript
const execution = flow.execute(handler, input);
await execution;

const ctx = await execution.ctx();
const journal = ctx.context.find(flowMeta.journal);

for (const [key, value] of journal) {
  console.log(`${key}: ${value}`);
}
```

## Flow + Executor Integration

| Feature | Executors | Flows |
|---------|-----------|-------|
| Lifespan | Long-running (scope) | Short-span (pod) |
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

## Use Cases

### Request Pipeline

```typescript
const authenticateUser = flow(
  { auth: authService },
  async ({ auth }, ctx, token: string) => {
    const user = await ctx.run("verify-token", () => auth.verify(token));
    ctx.set(userAccessor, user);
    return user;
  }
);

const validateRequest = flow(async (ctx, input: RequestData) => {
  const user = ctx.get(userAccessor);

  const valid = await ctx.run("validate-permissions", () =>
    hasPermission(user, input.resource)
  );

  if (!valid) {
    throw new FlowError("Insufficient permissions", "FORBIDDEN");
  }

  return { validated: true };
});

const processRequest = flow(
  { db: database },
  async ({ db }, ctx, input: RequestData) => {
    await ctx.exec(authenticateUser, input.token);
    await ctx.exec(validateRequest, input);

    const result = await ctx.run("process", () =>
      db.process(input.resource)
    );

    return { success: true, data: result };
  }
);
```

### Batch Processing

```typescript
const processItem = flow(
  { processor: itemProcessor },
  async ({ processor }, ctx, item: Item) => {
    const validated = await ctx.run("validate", () => processor.validate(item));

    if (!validated) {
      throw new FlowError("Invalid item", "VALIDATION_ERROR");
    }

    const processed = await ctx.run("process", () => processor.process(item));

    return { itemId: item.id, processed };
  }
);

const batchProcess = flow(async (ctx, items: Item[]) => {
  const chunkSize = 10;
  const results = [];

  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);

    const chunkResults = await ctx.parallel(
      chunk.map(item => ctx.exec(processItem, item))
    );

    results.push(...chunkResults.results);
  }

  return {
    total: items.length,
    processed: results.length,
    results
  };
});
```

### Multi-Step Workflow

```typescript
const createOrder = flow(
  { db: database, inventory: inventoryService },
  async ({ db, inventory }, ctx, order: OrderInput) => {
    const reserved = await ctx.run("reserve-inventory", () =>
      inventory.reserve(order.items)
    );

    if (!reserved) {
      throw new FlowError("Items unavailable", "OUT_OF_STOCK");
    }

    const orderId = await ctx.run("create-order", () =>
      db.orders.create(order)
    );

    ctx.set(orderIdAccessor, orderId);

    return { orderId, status: "created" };
  }
);

const processPayment = flow(
  { payment: paymentService },
  async ({ payment }, ctx, paymentInfo: PaymentInput) => {
    const orderId = ctx.get(orderIdAccessor);

    const result = await ctx.run("charge", () =>
      payment.charge(paymentInfo)
    );

    return { orderId, transactionId: result.txnId };
  }
);

const fulfillOrder = flow(
  { fulfillment: fulfillmentService },
  async ({ fulfillment }, ctx, shippingInfo: ShippingInput) => {
    const orderId = ctx.get(orderIdAccessor);

    const shipment = await ctx.run("create-shipment", () =>
      fulfillment.ship(orderId, shippingInfo)
    );

    return { orderId, trackingId: shipment.trackingId };
  }
);

const completeCheckout = flow(async (ctx, checkout: CheckoutInput) => {
  const order = await ctx.exec(createOrder, checkout.order);
  const payment = await ctx.exec(processPayment, checkout.payment);
  const shipment = await ctx.exec(fulfillOrder, checkout.shipping);

  return {
    orderId: order.orderId,
    transactionId: payment.transactionId,
    trackingId: shipment.trackingId
  };
});
```

## Key Rules

1. **Input/Output Validation**: All inputs validated against schemas before execution
2. **Error Handling**: Use exceptions (throw Error or FlowError)
3. **Dependency Injection**: Dependencies resolved before handler execution
4. **Context Isolation**: Each execution has isolated context (child contexts inherit parent)
5. **Type Safety**: Full TypeScript inference for inputs, outputs, dependencies
6. **Context Access**: Use accessors for type-safe context data
7. **Journaling**: Use `ctx.run()` for deterministic replay
8. **Short-Span Only**: Flows are for short-lived operations (requests, jobs)