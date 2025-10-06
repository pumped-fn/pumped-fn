# Schema Validation

Schema validation ensures type safety at runtime, validating inputs before execution.

## standardSchema

`@pumped-fn/core-next` adopts [Standard Schema v1](https://github.com/standard-schema/standard-schema), enabling integration with popular validation libraries (Zod, Valibot, ArkType, Yup, etc).

### Integration with Validation Libraries

```ts twoslash
import { flow } from "@pumped-fn/core-next";
import { z } from "zod";

const userSchema = z.object({
  email: z.string().email(),
  age: z.number().min(18),
});

const createUser = flow(
  {
    name: "user.create",
    input: userSchema,
    output: z.object({ userId: z.string() }),
  },
  async (_ctx, input) => {
    return { userId: `user-${Date.now()}` };
  }
);

const result = await flow.execute(createUser, {
  email: "test@example.com",
  age: 25,
});
```

### Supported Libraries

```ts twoslash
import { z } from "zod";
import * as v from "valibot";
import { type } from "arktype";

const zodSchema = z.string().email();
const valibotSchema = v.string([v.email()]);
const arkTypeSchema = type("string.email");
```

All libraries implementing Standard Schema v1 are compatible.

### Runtime Validation

```ts twoslash
import { standardSchema } from "@pumped-fn/core-next";
import { z } from "zod";

const schema = z.object({ value: z.number() });

try {
  const validated = standardSchema.validate(schema, { value: "invalid" });
} catch (error) {
  console.error(error);
}
```

## custom

`custom<T>()` creates type-only schemas without runtime validation.

### Basic Usage

```ts twoslash
import { custom } from "@pumped-fn/core-next";

type User = { id: string; name: string };

const input = custom<User>();
```

### When to Use

**Use `custom<T>()`:**
- Internal flows where types are guaranteed
- Performance-critical paths
- Type-only contracts between trusted components

**Use standard schemas:**
- External API boundaries
- User input validation
- Third-party integrations

### With Flows

```ts twoslash
import { flow, custom } from "@pumped-fn/core-next";

type Request = { userId: string };
type Response = { user: { id: string; name: string } };

const getUser = flow(
  {
    name: "internal.getUser",
    input: custom<Request>(),
    output: custom<Response>(),
  },
  async (_ctx, input) => {
    return {
      user: { id: input.userId, name: "John" },
    };
  }
);
```

### With Meta

```ts twoslash
import { meta, custom } from "@pumped-fn/core-next";

const apiKey = meta("config.apiKey", custom<string>());
const timeout = meta("config.timeout", custom<number>());
```

## Validation Patterns

### Input Validation

```ts twoslash
import { flow } from "@pumped-fn/core-next";
import { z } from "zod";

const processPayment = flow(
  {
    name: "payment.process",
    input: z.object({
      amount: z.number().positive(),
      currency: z.enum(["USD", "EUR", "GBP"]),
      cardToken: z.string().min(1),
    }),
    output: z.object({
      transactionId: z.string(),
      status: z.enum(["success", "failed"]),
    }),
  },
  async (_ctx, input) => {
    return {
      transactionId: `txn-${Date.now()}`,
      status: "success" as const,
    };
  }
);
```

### Nested Schema Validation

```ts twoslash
import { z } from "zod";

const addressSchema = z.object({
  street: z.string(),
  city: z.string(),
  zip: z.string().regex(/^\d{5}$/),
});

const orderSchema = z.object({
  items: z.array(
    z.object({
      productId: z.string(),
      quantity: z.number().int().positive(),
    })
  ),
  shippingAddress: addressSchema,
  billingAddress: addressSchema,
});

const createOrder = flow(
  {
    name: "order.create",
    input: orderSchema,
    output: z.object({ orderId: z.string() }),
  },
  async (_ctx, input) => {
    return { orderId: `order-${Date.now()}` };
  }
);
```

### Error Handling

```ts twoslash
import { SchemaError } from "@pumped-fn/core-next";

try {
  const result = await flow.execute(createUser, {
    email: "invalid-email",
    age: 15,
  });
} catch (error) {
  if (error instanceof SchemaError) {
    console.error("Validation failed:", error.issues);
  }
}
```

### Hybrid Approach

```ts twoslash
import { flow, custom } from "@pumped-fn/core-next";
import { z } from "zod";

const publicAPI = flow(
  {
    name: "api.publicEndpoint",
    input: z.object({ email: z.string().email() }),
    output: z.object({ userId: z.string() }),
  },
  async (ctx, input) => {
    const internal = await ctx.exec(internalFlow, { userId: "123" });
    return { userId: internal.id };
  }
);

const internalFlow = flow(
  {
    name: "internal.process",
    input: custom<{ userId: string }>(),
    output: custom<{ id: string }>(),
  },
  async (_ctx, input) => {
    return { id: input.userId };
  }
);
```

## Key Points

1. **Standard Schema Integration**: Use any validation library implementing Standard Schema v1
2. **Type Inference**: Full TypeScript inference from schema definitions
3. **Runtime Safety**: Input validated before handler execution
4. **Error Reporting**: Detailed validation errors via `SchemaError`
5. **Performance**: Use `custom<T>()` for type-only contracts when validation is unnecessary
6. **Boundary Pattern**: Validate at system boundaries, trust internal flows
