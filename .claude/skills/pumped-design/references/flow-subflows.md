---
name: flow-subflows
tags: flow, add, reuse, orchestration, ctx.exec, composition, sub-flow, error-mapping
description: Flow orchestration using ctx.exec() to call sub-flows. Sub-flows are called via ctx.exec({ flow, input, key, timeout }) config object with no legacy ctx.run() wrapper. Covers error mapping, discriminated union outputs, and reusable vs non-reusable flow patterns.
---

# Flow: Sub-flows and Orchestration

## When to Use

Use `ctx.exec()` for sub-flows when:

- Orchestrating multi-step business processes by composing smaller flows
- Reusing flow logic across multiple parent flows
- Building flows that need discriminated union error handling from sub-flows
- Creating testable flow hierarchies (test sub-flows independently)

**Critical Pattern:**
- Sub-flows are called via `ctx.exec({ flow, input, key, timeout, retry, tags })` config object (no other wrapper)
- Use `ctx.exec({ fn, params, key })` for direct operations needing journaling
- `ctx.exec` is the single execution primitive (flows + functions)

**Don't use for:**
- Simple operations that don't need journaling (inline pure call)
- Operations that should share the same journal entry (reuse same `key`)

---

## Core Pattern: ctx.exec({ flow, input, key })

### Basic Sub-flow Execution


See: `doubleNumber` in skill-examples/flows-subflows.ts

```typescript
import { flow } from '@pumped-fn/core-next'

// Sub-flow: Reusable validation logic
export namespace ValidateOrder {
  export type Input = { items: string[]; userId: string }
  export type Success = { success: true; total: number }
  export type Error = { success: false; reason: 'INVALID_ITEMS' | 'EMPTY_ORDER' }
  export type Result = Success | Error
}

export const validateOrder = flow(
  async (_ctx, input: ValidateOrder.Input): Promise<ValidateOrder.Result> => {
    if (input.items.length === 0) {
      return { success: false, reason: 'EMPTY_ORDER' }
    }

    const hasInvalid = input.items.some(item => !item || item.trim() === '')
    if (hasInvalid) {
      return { success: false, reason: 'INVALID_ITEMS' }
    }

    return { success: true, total: input.items.length * 100 }
  }
)

// Parent flow: Orchestrates sub-flows
export namespace ProcessOrder {
  export type Input = { items: string[]; userId: string }
  export type Success = { success: true; orderId: string; total: number }
  export type Error = ValidateOrder.Error | { success: false; reason: 'PAYMENT_DECLINED' }
  export type Result = Success | Error
}

export const processOrder = flow(
  async (ctx, input: ProcessOrder.Input): Promise<ProcessOrder.Result> => {
    // ✅ CORRECT: ctx.exec() with config object, no extra wrapper
    const validated = await ctx.exec({
      flow: validateOrder,
      input: {
        items: input.items,
        userId: input.userId
      },
      key: 'validate-order',
      timeout: 5000
    })

    // Type narrowing via discriminated union
    if (!validated.success) {
      return validated  // Error flows through
    }

    // Continue with validated.total available
    const orderId = await ctx.exec({
      fn: () => `order-${Date.now()}`,
      key: 'generate-id'
    })

    return { success: true, orderId, total: validated.total }
  }
)
```

**Key Points:**
- `ctx.exec({ flow, input, key })` - config object with optional timeout, tags
- Type narrowing works: `if (!validated.success)` proves error type
- Parent flow can propagate or transform sub-flow errors

---

## Real Examples from Pumped-fn Tests

### Example 1: Simple Sub-flow Composition (flow-expected.test.ts)

```typescript
const doubleNumber = flow<{ n: number }, { doubled: number }>(
  (_ctx, input) => {
    return { doubled: input.n * 2 }
  }
)

const processValue = flow<{ value: number }, { result: number }>(
  async (ctx, input) => {
    // ✅ ctx.exec() with config object
    const doubled = await ctx.exec({
      flow: doubleNumber,
      input: { n: input.value },
      key: 'double'
    })
    return { result: doubled.doubled }
  }
)

const result = await flow.execute(processValue, { value: 10 })
// result.result === 20
```

### Example 2: Multiple Sub-flow Orchestration (flow-expected.test.ts)

```typescript
const fetchUserById = flow(apiService, async (api, ctx, userId: number) => {
  const response = await ctx.exec({
    fn: () => api.fetch(`/users/${userId}`),
    key: 'fetch-user-http'
  })
  return { userId, username: `user${userId}`, raw: response.data }
})

const fetchPostsByUserId = flow(
  { api: apiService },
  async ({ api }, ctx, userId: number) => {
    const response = await ctx.exec({
      fn: () => api.fetch(`/posts?userId=${userId}`),
      key: 'fetch-posts-http'
    })
    return { posts: [{ id: 1, title: "Post 1" }], raw: response.data }
  }
)

type UserWithPosts = {
  userId: number
  username: string
  raw: string
  postCount: number
}

const getUserWithPosts = flow(
  { api: apiService },
  async ({ api: _api }, ctx, userId: number): Promise<UserWithPosts> => {
    // ✅ Multiple ctx.exec() calls orchestrate sub-flows
    const user = await ctx.exec({
      flow: fetchUserById,
      input: userId,
      key: 'fetch-user'
    })
    const posts = await ctx.exec({
      flow: fetchPostsByUserId,
      input: userId,
      key: 'fetch-posts'
    })

    const enriched = await ctx.exec({
      fn: () => ({
        ...user,
        postCount: posts.posts.length
      }),
      key: 'enrich-user'
    })

    return enriched
  }
)
```

**Pattern:**
- Sub-flows (`fetchUserById`, `fetchPostsByUserId`) rely on `ctx.exec({ fn })` for HTTP calls
- Parent flow (`getUserWithPosts`) composes everything with `ctx.exec`
- Keys stay consistent (`fetch-user`, `fetch-posts`, `enrich-user`) for tracing

### Example 3: Void Input Sub-flow (flow-expected.test.ts)

```typescript
const getBaseValue = flow<void, number>(() => {
  return 100
})

const incrementValue = flow<void, number>(async (ctx) => {
  // ✅ ctx.exec() with void input
  const base = await ctx.exec({
    flow: getBaseValue,
    input: undefined,
    key: 'get-base'
  })
  return base + 1
})

const result = await flow.execute(incrementValue, undefined)
// result === 101
```

### Example 4: Sub-flow with Error Union (templates.md)

```typescript
export namespace CreateUser {
  export type Input = { email: string; name: string }
  export type Success = { success: true; user: User }
  export type Error =
    | { success: false; reason: 'INVALID_EMAIL' }
    | { success: false; reason: 'EMAIL_EXISTS' }
  export type Result = Success | Error
}

export const createUser = flow(
  { userRepo: userRepository },
  async ({ userRepo }, ctx, input: CreateUser.Input): Promise<CreateUser.Result> => {
    const validation = await ctx.exec({
      fn: () => {
        if (!input.email.includes('@')) {
          return { ok: false as const, reason: 'INVALID_EMAIL' as const }
        }
        return { ok: true as const }
      },
      key: 'validate-input'
    })

    if (!validation.ok) {
      return { success: false, reason: validation.reason }
    }

    const existing = await ctx.exec({
      fn: () => userRepo.findByEmail(input.email),
      key: 'check-existing'
    })

    if (existing !== null) {
      return { success: false, reason: 'EMAIL_EXISTS' }
    }

    const user = await ctx.exec({
      fn: () => userRepo.create(input),
      key: 'create-user-record'
    })

    return { success: true, user }
  }
)

export namespace RegisterUser {
  export type Input = { email: string; name: string; sendWelcomeEmail: boolean }
  export type Success = { success: true; user: User; emailSent: boolean }
  // ✅ Parent error union includes sub-flow errors
  export type Error = CreateUser.Error | { success: false; reason: 'EMAIL_SEND_FAILED' }
  export type Result = Success | Error
}

export const registerUser = flow(
  { userRepo: userRepository },
  async ({ userRepo }, ctx, input: RegisterUser.Input): Promise<RegisterUser.Result> => {
    // ✅ ctx.exec() propagates discriminated union
    const userResult = await ctx.exec({
      flow: createUser,
      input: {
        email: input.email,
        name: input.name
      },
      key: 'create-user',
      timeout: 10000
    })

    // Type narrowing
    if (!userResult.success) {
      return userResult  // All CreateUser.Error variants flow through
    }

    // userResult.user is available after narrowing
    let emailSent = false
    if (input.sendWelcomeEmail) {
      const emailResult = await ctx.exec({
        fn: () => ({ success: true as const }),
        key: 'send-welcome-email'
      })

      if (!emailResult.success) {
        return { success: false, reason: 'EMAIL_SEND_FAILED' }
      }
      emailSent = true
    }

    return {
      success: true,
      user: userResult.user,
      emailSent
    }
  }
)
```

---

## Error Mapping and Discriminated Unions

### Pattern 1: Direct Error Propagation

```typescript
// Sub-flow returns discriminated union
const validateInput = flow(
  async (_ctx, input: string): Promise<
    | { success: true; validated: string }
    | { success: false; reason: 'EMPTY' | 'INVALID' }
  > => {
    if (!input) return { success: false, reason: 'EMPTY' }
    if (input.length < 3) return { success: false, reason: 'INVALID' }
    return { success: true, validated: input }
  }
)

// Parent propagates sub-flow errors
const processInput = flow(
  async (ctx, input: string): Promise<
    | { success: true; result: string }
    | { success: false; reason: 'EMPTY' | 'INVALID' | 'PROCESSING_FAILED' }
  > => {
    const validated = await ctx.exec({
      flow: validateInput,
      input,
      key: 'validate-input'
    })

    if (!validated.success) {
      return validated  // Error flows through unchanged
    }

    // Process validated input
    return { success: true, result: validated.validated.toUpperCase() }
  }
)
```

### Pattern 2: Error Transformation

```typescript
// Sub-flow has specific errors
const fetchUser = flow(
  async (_ctx, userId: string): Promise<
    | { success: true; user: User }
    | { success: false; reason: 'NOT_FOUND' }
  > => {
    // Implementation
  }
)

// Parent transforms sub-flow errors
const getUserProfile = flow(
  async (ctx, userId: string): Promise<
    | { success: true; profile: Profile }
    | { success: false; reason: 'USER_NOT_FOUND' | 'PROFILE_INCOMPLETE' }
  > => {
    const userResult = await ctx.exec({
      flow: fetchUser,
      input: userId,
      key: 'fetch-user'
    })

    if (!userResult.success) {
      // ✅ Transform sub-flow error to parent error
      return { success: false, reason: 'USER_NOT_FOUND' }
    }

    // Continue processing
    return { success: true, profile: buildProfile(userResult.user) }
  }
)
```

### Pattern 3: Multiple Error Unions

```typescript
const validatePayment = flow(
  async (_ctx, amount: number): Promise<
    | { success: true; validated: number }
    | { success: false; reason: 'INVALID_AMOUNT' }
  > => {
    if (amount <= 0) return { success: false, reason: 'INVALID_AMOUNT' }
    return { success: true, validated: amount }
  }
)

const chargeCard = flow(
  async (_ctx, amount: number): Promise<
    | { success: true; transactionId: string }
    | { success: false; reason: 'DECLINED' | 'INSUFFICIENT_FUNDS' }
  > => {
    // Implementation
  }
)

// Parent aggregates errors from multiple sub-flows
const processPayment = flow(
  async (ctx, amount: number): Promise<
    | { success: true; transactionId: string }
    | { success: false; reason: 'INVALID_AMOUNT' | 'DECLINED' | 'INSUFFICIENT_FUNDS' }
  > => {
    const validated = await ctx.exec({
      flow: validatePayment,
      input: amount,
      key: 'validate'
    })
    if (!validated.success) return validated

    const charged = await ctx.exec({
      flow: chargeCard,
      input: validated.validated,
      key: 'charge'
    })
    if (!charged.success) return charged

    return { success: true, transactionId: charged.transactionId }
  }
)
```

---

## Reusable vs Non-reusable Flows

### Reusable Flows

**Characteristics:**
- Standalone functionality
- No coupling to parent context
- Can be called from multiple parents
- Should be tested independently

```typescript
// ✅ Reusable: Clear purpose, generic input/output
export const validateEmail = flow(
  async (_ctx, email: string): Promise<
    | { success: true; email: string }
    | { success: false; reason: 'INVALID_FORMAT' }
  > => {
    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    if (!isValid) return { success: false, reason: 'INVALID_FORMAT' }
    return { success: true, email }
  }
)

// Used by multiple parent flows
const registerUser = flow(async (ctx, email: string) => {
  const validated = await ctx.exec({
    flow: validateEmail,
    input: email,
    key: 'validate-email'
  })
  // ...
})

const updateEmail = flow(async (ctx, email: string) => {
  const validated = await ctx.exec({
    flow: validateEmail,
    input: email,
    key: 'validate-email'
  })
  // ...
})
```

### Non-reusable Flows

**Characteristics:**
- Tightly coupled to parent flow
- Extracts complexity for readability
- Not intended for reuse
- Test via parent flow

```typescript
// ❌ Non-reusable: Specific to processOrder context
const calculateOrderTotal = flow(
  async (_ctx, items: OrderItem[]): Promise<{ total: number; taxAmount: number }> => {
    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0)
    const taxAmount = subtotal * 0.08
    return { total: subtotal + taxAmount, taxAmount }
  }
)

// Only used by processOrder
const processOrder = flow(async (ctx, items: OrderItem[]) => {
  const { total, taxAmount } = await ctx.exec({
    flow: calculateOrderTotal,
    input: items,
    key: 'calculate-total'
  })
  // ...
})
```

**Guidance:**
- If a flow is only called from one parent, consider inlining with direct helpers or `ctx.exec({ fn })`
- Extract to sub-flow when logic is complex enough to obscure parent flow readability
- Always export and test flows that are called from multiple parents

---

## Nesting Depth Guidelines

**Maximum nesting:** 3 levels of `ctx.exec()`

```typescript
// ✅ Level 1: Top-level flow
const processOrder = flow(async (ctx, input) => {
  // ✅ Level 2: Direct sub-flow
  const validated = await ctx.exec({
    flow: validateOrder,
    input,
    key: 'validate'
  })

  // ✅ Level 3: Nested sub-flow (inside validateOrder)
  // validateOrder can call another sub-flow

  // ❌ Level 4: Too deep - refactor if you need this
})
```

**Why limit depth?**
- Deep nesting indicates complex orchestration - consider refactoring
- Makes testing harder (mocking dependencies at each level)
- Harder to understand flow hierarchy
- Signals that flows might have unclear responsibilities

**Refactoring deep nesting:**
- Extract intermediate orchestration flows
- Use resources/repositories for data access patterns
- Flatten by combining related sub-flows

---

## Anti-patterns

### ❌ Wrapping ctx.exec() inside another ctx.exec fn

```typescript
// ❌ WRONG: Double wrap
const result = await ctx.exec({
  fn: () =>
    ctx.exec({
      flow: validateOrder,
      input,
      key: 'validate-order'
    }),
  key: 'validate-wrapper'
})

// ✅ CORRECT: Call flow directly
const result = await ctx.exec({
  flow: validateOrder,
  input,
  key: 'validate-order'
})
```

**Why wrong?** `ctx.exec()` already creates a journal entry. Wrapping it inside another `ctx.exec({ fn })` hides metadata and complicates retries.

### ❌ Executing flows manually

```typescript
// ❌ WRONG: Direct flow.execute bypasses context
const result = await flow.execute(validateOrder, input)

// ✅ CORRECT: Always use ctx.exec for composition
const result = await ctx.exec({
  flow: validateOrder,
  input,
  key: 'validate'
})
```

### ❌ Mixing Direct Calls with ctx.exec()

```typescript
// ❌ WRONG: Inconsistent - some flows via ctx.exec(), some direct
const validated = await ctx.exec({
  flow: validateOrder,
  input,
  key: 'validate'
})
const processed = await processData(validated)  // Direct call

// ✅ CORRECT: All flows via ctx.exec(), utilities direct
const validated = await ctx.exec({
  flow: validateOrder,
  input,
  key: 'validate'
})
const processed = await ctx.exec({
  flow: processData,
  input: validated,
  key: 'process'
})

// ✅ ALSO CORRECT: Only reusable flows are flows, rest are utilities
const validated = await ctx.exec({
  flow: validateOrder,
  input,
  key: 'validate'
})
const processed = processDataUtil(validated)  // Direct utility call
```

---

## Troubleshooting

### Issue: Type errors with discriminated unions

**Symptom:** TypeScript can't narrow types after checking `success` field

```typescript
const result = await ctx.exec(validate, input)
if (!result.success) {
  return result  // Type error: can't assign Error to Result
}
```

**Solution:** Ensure parent Result type includes all sub-flow errors

```typescript
// ✅ Parent error union includes child errors
export namespace Parent {
  export type Error = Child.Error | { success: false; reason: 'PARENT_ERROR' }
  export type Result = Success | Error
}
```

### Issue: Sub-flow not getting dependencies

**Symptom:** Sub-flow throws error about missing dependencies

```typescript
const subFlow = flow(
  { db: dbPool },
  async ({ db }, _ctx, input) => { /* ... */ }
)

const parentFlow = flow(async (ctx, input) => {
  const result = await ctx.exec({
    flow: subFlow,
    input,
    key: 'sub-flow'
  })  // Error: db not found
})
```

**Solution:** Parent scope must include sub-flow dependencies, or pass through scope

```typescript
// ✅ Parent includes sub-flow dependencies
const parentFlow = flow(
  { db: dbPool },  // Include child deps
  async ({ db }, ctx, input) => {
    const result = await ctx.exec({
      flow: subFlow,
      input,
      key: 'sub-flow'
    })
  }
)
```

### Issue: Void input confusion

**Symptom:** TypeScript error when calling void input sub-flow

```typescript
const getConfig = flow<void, Config>(() => { /* ... */ })

const parent = flow(async (ctx, input) => {
  const config = await ctx.exec({
    flow: getConfig
    // Error: input is required
  })
})
```

**Solution:** Pass `undefined` as input for void flows

```typescript
// ✅ Pass undefined explicitly
const config = await ctx.exec({
  flow: getConfig,
  input: undefined,
  key: 'get-config'
})
```

---

## Related Sub-skills

- **flow-context.md** - Using `ctx.exec()` config, `ctx.parallel()`, reading/writing context
- **resource-derived.md** - Composing resources with dependencies
- **testing-flows.md** - Testing flows with `preset()` for mocking sub-flows
- **coding-standards.md** - Type safety rules for discriminated unions
