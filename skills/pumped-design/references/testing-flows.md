---
name: testing-flows
tags: testing, flow, integration, branches, preset, mock, subflow, reusable
description: Integration testing flows with preset() for mocking dependencies. Test ALL output branches (Success + each Error). Reusable flows test standalone, non-reusable flows test via parent. Use scope.exec() to invoke flows in tests.
---

# Testing Flows (Integration Tests)

## When to Use This Pattern

**Integration testing flows means:**
- Testing flow orchestration with mocked dependencies
- Testing ALL discriminated union branches (Success + each Error)
- Testing sub-flow composition
- Testing ctx.run() operations
- Mocking resources/repositories via `preset()`

**Use integration tests for:**
- Business logic flows (validation + orchestration)
- Flows calling sub-flows (ctx.exec)
- Multi-step operations with error handling
- Flows with dependencies (resources, repositories)

---

## Critical Rule: Test ALL Branches

**Every flow MUST test:**
1. Success case
2. EVERY error case (each discriminated union variant)

```typescript
export namespace ProcessOrder {
  export type Success = { success: true; orderId: string }
  export type InvalidItems = { success: false; reason: 'INVALID_ITEMS' }
  export type PaymentFailed = { success: false; reason: 'PAYMENT_FAILED' }
  export type InsufficientStock = { success: false; reason: 'INSUFFICIENT_STOCK' }

  export type Result = Success | InvalidItems | PaymentFailed | InsufficientStock
}

// ✅ MUST test all 4 branches:
// 1. Success
// 2. INVALID_ITEMS
// 3. PAYMENT_FAILED
// 4. INSUFFICIENT_STOCK
```

---

## Pattern: Testing Reusable Flows Standalone

**Reusable flows:** Flows designed for composition (called by other flows)

**Test reusable flows standalone** - they're public API

```typescript
import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { flow, createScope, preset, derive, Core } from '@pumped-fn/core-next'

// Reusable validation flow
export namespace ValidateOrder {
  export type Input = {
    items: Array<{ id: string; quantity: number }>
    userId: string
  }

  export type Success = { success: true; totalItems: number }
  export type EmptyCart = { success: false; reason: 'EMPTY_CART' }
  export type InvalidQuantity = { success: false; reason: 'INVALID_QUANTITY' }

  export type Result = Success | EmptyCart | InvalidQuantity
}

export const validateOrder = flow(
  async (_ctx, input: ValidateOrder.Input): Promise<ValidateOrder.Result> => {
    if (input.items.length === 0) {
      return { success: false, reason: 'EMPTY_CART' }
    }

    const hasInvalidQuantity = input.items.some((item) => item.quantity <= 0)
    if (hasInvalidQuantity) {
      return { success: false, reason: 'INVALID_QUANTITY' }
    }

    return { success: true, totalItems: input.items.length }
  }
)

describe('validateOrder flow (reusable)', () => {
  let scope: Core.Scope

  beforeEach(() => {
    scope = createScope()
  })

  afterEach(async () => {
    await scope.dispose()
  })

  test('SUCCESS: accepts valid order', async () => {
    const result = await scope.exec(validateOrder, {
      userId: 'user-1',
      items: [
        { id: 'item-1', quantity: 2 },
        { id: 'item-2', quantity: 1 }
      ]
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.totalItems).toBe(2)
    }
  })

  test('ERROR: EMPTY_CART when no items', async () => {
    const result = await scope.exec(validateOrder, {
      userId: 'user-1',
      items: []
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.reason).toBe('EMPTY_CART')
    }
  })

  test('ERROR: INVALID_QUANTITY when quantity is zero', async () => {
    const result = await scope.exec(validateOrder, {
      userId: 'user-1',
      items: [{ id: 'item-1', quantity: 0 }]
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.reason).toBe('INVALID_QUANTITY')
    }
  })

  test('ERROR: INVALID_QUANTITY when quantity is negative', async () => {
    const result = await scope.exec(validateOrder, {
      userId: 'user-1',
      items: [{ id: 'item-1', quantity: -5 }]
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.reason).toBe('INVALID_QUANTITY')
    }
  })
})
```

**Key principles:**
- Test standalone (not via parent flow)
- Test ALL branches (1 Success + 2 Errors = 3 tests minimum)
- Use scope.exec() to invoke flow
- No dependencies = no presets needed

---

## Pattern: Testing Flows with Dependencies

Use `preset()` to mock dependencies:

```typescript
import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { flow, derive, createScope, preset, Core } from '@pumped-fn/core-next'

// Mock repository interface
export type UserRepository = {
  findById: (id: string) => Promise<{ id: string; name: string } | null>
  create: (input: { name: string; email: string }) => Promise<{ id: string }>
}

export const userRepository = derive(
  { /* db dependency */ },
  () => ({
    findById: async (id: string) => null,
    create: async (input: { name: string; email: string }) => ({ id: 'new-id' })
  })
)

export namespace CreateUser {
  export type Input = { name: string; email: string }

  export type Success = { success: true; userId: string }
  export type NameTooShort = { success: false; reason: 'NAME_TOO_SHORT' }
  export type InvalidEmail = { success: false; reason: 'INVALID_EMAIL' }

  export type Result = Success | NameTooShort | InvalidEmail
}

export const createUser = flow(
  { userRepo: userRepository },
  ({ userRepo }) =>
    async (ctx, input: CreateUser.Input): Promise<CreateUser.Result> => {
      const validation = await ctx.run('validate', () => {
        if (input.name.length < 2) {
          return { ok: false as const, reason: 'NAME_TOO_SHORT' as const }
        }
        if (!input.email.includes('@')) {
          return { ok: false as const, reason: 'INVALID_EMAIL' as const }
        }
        return { ok: true as const }
      })

      if (!validation.ok) {
        return { success: false, reason: validation.reason }
      }

      const created = await ctx.run('create', () =>
        userRepo.create({ name: input.name, email: input.email })
      )

      return { success: true, userId: created.id }
    }
)

describe('createUser flow', () => {
  let scope: Core.Scope

  beforeEach(() => {
    const mockUserRepo: UserRepository = {
      findById: async (id: string) => null,
      create: async (input: { name: string; email: string }) => ({
        id: `user-${input.name}`
      })
    }

    scope = createScope({
      presets: [preset(userRepository, mockUserRepo)]
    })
  })

  afterEach(async () => {
    await scope.dispose()
  })

  test('SUCCESS: creates user with valid input', async () => {
    const result = await scope.exec(createUser, {
      name: 'Alice',
      email: 'alice@example.com'
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.userId).toBe('user-Alice')
    }
  })

  test('ERROR: NAME_TOO_SHORT when name is 1 character', async () => {
    const result = await scope.exec(createUser, {
      name: 'A',
      email: 'alice@example.com'
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.reason).toBe('NAME_TOO_SHORT')
    }
  })

  test('ERROR: INVALID_EMAIL when email missing @', async () => {
    const result = await scope.exec(createUser, {
      name: 'Alice',
      email: 'invalid-email.com'
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.reason).toBe('INVALID_EMAIL')
    }
  })
})
```

**Key principles:**
- Mock dependencies in beforeEach with preset()
- Fresh scope per test suite
- Dispose scope in afterEach
- Mock returns deterministic values

---

## Pattern: Testing Flows with Sub-flows

Test parent flow, sub-flow tested separately:

```typescript
import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { flow, createScope, Core } from '@pumped-fn/core-next'

// Sub-flow (tested separately)
export namespace ValidateEmail {
  export type Success = { success: true; email: string }
  export type Invalid = { success: false; reason: 'INVALID_EMAIL' }
  export type Result = Success | Invalid
}

export const validateEmail = flow(
  async (_ctx, email: string): Promise<ValidateEmail.Result> => {
    if (!email.includes('@')) {
      return { success: false, reason: 'INVALID_EMAIL' }
    }
    return { success: true, email: email.toLowerCase() }
  }
)

// Parent flow (composes sub-flow)
export namespace RegisterUser {
  export type Input = { name: string; email: string }

  export type Success = { success: true; userId: string }
  export type NameTooShort = { success: false; reason: 'NAME_TOO_SHORT' }
  export type InvalidEmail = ValidateEmail.Invalid

  export type Result = Success | NameTooShort | InvalidEmail
}

export const registerUser = flow(
  async (ctx, input: RegisterUser.Input): Promise<RegisterUser.Result> => {
    if (input.name.length < 2) {
      return { success: false, reason: 'NAME_TOO_SHORT' }
    }

    const emailResult = await ctx.exec(validateEmail, input.email)

    if (!emailResult.success) {
      return emailResult
    }

    return {
      success: true,
      userId: `user-${emailResult.email}`
    }
  }
)

describe('validateEmail sub-flow (reusable)', () => {
  let scope: Core.Scope

  beforeEach(() => {
    scope = createScope()
  })

  afterEach(async () => {
    await scope.dispose()
  })

  test('SUCCESS: validates and normalizes email', async () => {
    const result = await scope.exec(validateEmail, 'User@EXAMPLE.COM')

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.email).toBe('user@example.com')
    }
  })

  test('ERROR: INVALID_EMAIL when missing @', async () => {
    const result = await scope.exec(validateEmail, 'not-an-email')

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.reason).toBe('INVALID_EMAIL')
    }
  })
})

describe('registerUser flow (parent)', () => {
  let scope: Core.Scope

  beforeEach(() => {
    scope = createScope()
  })

  afterEach(async () => {
    await scope.dispose()
  })

  test('SUCCESS: registers user with valid input', async () => {
    const result = await scope.exec(registerUser, {
      name: 'Alice',
      email: 'alice@example.com'
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.userId).toBe('user-alice@example.com')
    }
  })

  test('ERROR: NAME_TOO_SHORT when name invalid', async () => {
    const result = await scope.exec(registerUser, {
      name: 'A',
      email: 'alice@example.com'
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.reason).toBe('NAME_TOO_SHORT')
    }
  })

  test('ERROR: INVALID_EMAIL propagated from sub-flow', async () => {
    const result = await scope.exec(registerUser, {
      name: 'Alice',
      email: 'invalid-email'
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.reason).toBe('INVALID_EMAIL')
    }
  })
})
```

**Key principles:**
- Sub-flow tested separately (validateEmail)
- Parent flow tested with real sub-flow (no mocking)
- Test error propagation from sub-flow
- Test parent-specific errors (NAME_TOO_SHORT)

---

## Real Example: Flow Tests from pumped-fn

From `packages/next/tests/flow-expected.test.ts`:

```typescript
describe("Nameless flows", () => {
  test("flow composes dependencies, nested flows, and operations", async () => {
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve({ data: `fetched from ${url}` })
    );
    const apiService = provide(() => ({ fetch: fetchMock }));

    const fetchUserById = flow(apiService, async (api, ctx, userId: number) => {
      const response = await ctx.run("fetch-user", () =>
        api.fetch(`/users/${userId}`)
      );
      return { userId, username: `user${userId}`, raw: response.data };
    });

    const fetchPostsByUserId = flow(
      { api: apiService },
      async ({ api }, ctx, userId: number) => {
        const response = await ctx.run("fetch-posts", () =>
          api.fetch(`/posts?userId=${userId}`)
        );
        return { posts: [{ id: 1, title: "Post 1" }], raw: response.data };
      }
    );

    const getUserWithPosts = flow(
      { api: apiService },
      async ({ api: _api }, ctx, userId: number) => {
        const user = await ctx.exec(fetchUserById, userId);
        const posts = await ctx.exec(fetchPostsByUserId, userId);
        const enriched = await ctx.run("enrich", () => ({
          ...user,
          postCount: posts.posts.length,
        }));
        return enriched;
      }
    );

    const result = await flow.execute(getUserWithPosts, 42);

    expect(result.userId).toBe(42);
    expect(result.username).toBe("user42");
    expect(result.postCount).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
```

**What makes this good:**
- Tests complete flow orchestration
- Mocks external dependency (apiService)
- Tests ctx.run() and ctx.exec() together
- Verifies sub-flow composition
- Checks mock invocation count

---

## Pattern: Testing Non-Reusable Flows

**Non-reusable flows:** Implementation details, not public API

**Test non-reusable flows via parent** - they're not meant to be called directly

```typescript
// ❌ Non-reusable flow (internal implementation detail)
const checkInventory = flow(
  { inventory: inventoryRepo },
  ({ inventory }) =>
    async (_ctx, itemId: string): Promise<boolean> => {
      const stock = await inventory.getStock(itemId)
      return stock > 0
    }
)

// ✅ Public flow (uses checkInventory internally)
export const processOrder = flow(
  { inventory: inventoryRepo, payment: paymentService },
  ({ inventory, payment }) =>
    async (ctx, input: { itemId: string; userId: string }): Promise<ProcessOrder.Result> => {
      const hasStock = await ctx.exec(checkInventory, input.itemId)

      if (!hasStock) {
        return { success: false, reason: 'OUT_OF_STOCK' }
      }

      // ... rest of flow
    }
)

// ✅ Test processOrder (public), which exercises checkInventory (internal)
describe('processOrder flow', () => {
  test('ERROR: OUT_OF_STOCK when inventory check fails', async () => {
    const mockInventory = {
      getStock: async (itemId: string) => 0  // No stock
    }

    const scope = createScope({
      presets: [preset(inventoryRepo, mockInventory)]
    })

    const result = await scope.exec(processOrder, {
      itemId: 'item-1',
      userId: 'user-1'
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.reason).toBe('OUT_OF_STOCK')
    }

    await scope.dispose()
  })
})
```

**Key principles:**
- Non-reusable flows are private (not exported or used by name)
- Test via parent flow
- Mock parent's dependencies (not sub-flow itself)

---

## Pattern: Testing ctx.parallel()

Test concurrent execution:

```typescript
import { describe, test, expect } from 'vitest'
import { flow } from '@pumped-fn/core-next'

describe("ctx.parallel()", () => {
  test("executes multiple flows concurrently", async () => {
    const doubleAsync = flow<{ x: number }, { r: number }>(async (_ctx, input) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { r: input.x * 2 };
    });

    const tripleAsync = flow<{ x: number }, { r: number }>(async (_ctx, input) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { r: input.x * 3 };
    });

    const combineResults = flow<{ val: number }, { sum: number }>(
      async (ctx, input) => {
        const doublePromise = ctx.exec(doubleAsync, { x: input.val });
        const triplePromise = ctx.exec(tripleAsync, { x: input.val });
        const parallel = await ctx.parallel([doublePromise, triplePromise]);

        const sum = parallel.results[0].r + parallel.results[1].r;
        return { sum };
      }
    );

    const result = await flow.execute(combineResults, { val: 5 });

    expect(result.sum).toBe(25);
  });
});
```

---

## Pattern: Testing ctx.parallelSettled()

Test partial failures:

```typescript
import { describe, test, expect } from 'vitest'
import { flow, FlowError } from '@pumped-fn/core-next'

describe("ctx.parallelSettled()", () => {
  test("collects successes and failures", async () => {
    const successFlow = flow<Record<string, never>, { ok: boolean }>(() => ({
      ok: true,
    }));

    const failureFlow = flow(() => {
      throw new FlowError("Failed", "ERR");
    });

    const gatherResults = flow<
      Record<string, never>,
      { succeeded: number; failed: number }
    >(async (ctx, _input) => {
      const first = ctx.exec(successFlow, {});
      const second = ctx.exec(failureFlow, {});
      const third = ctx.exec(successFlow, {});
      const settled = await ctx.parallelSettled([first, second, third]);

      return {
        succeeded: settled.stats.succeeded,
        failed: settled.stats.failed,
      };
    });

    const result = await flow.execute(gatherResults, {});

    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(1);
  });
});
```

---

## Troubleshooting

### Problem: Forgot to test an error branch

**Symptom:** Flow has 3 error types, only 2 tested

**Solution:** List all discriminated union variants, create one test per variant

```typescript
export type Result = Success | ErrorA | ErrorB | ErrorC

// ✅ 4 tests minimum:
test('SUCCESS: ...')
test('ERROR: ErrorA when ...')
test('ERROR: ErrorB when ...')
test('ERROR: ErrorC when ...')
```

### Problem: Mock not working in sub-flow

**Cause:** Trying to mock sub-flow instead of its dependencies

**Solution:**
```typescript
// ❌ Wrong - mocking sub-flow itself
scope = createScope({
  presets: [preset(validateEmail, mockValidateEmail)]
})

// ✅ Correct - mock sub-flow's dependencies (if any)
// Or use real sub-flow (preferred)
const result = await scope.exec(registerUser, input)
```

### Problem: Test depends on other tests

**Cause:** Shared scope or mutable state

**Solution:**
```typescript
// ❌ Wrong - shared scope
const scope = createScope()

test('test 1', async () => { /* ... */ })
test('test 2', async () => { /* ... */ })

// ✅ Correct - fresh scope per test
beforeEach(() => {
  scope = createScope()
})

afterEach(async () => {
  await scope.dispose()
})
```

### Problem: Preset doesn't match dependency type

**Cause:** Mock interface doesn't match actual dependency

**Solution:**
```typescript
// ❌ Wrong - missing methods
const mockRepo = {
  findById: async (id: string) => null
  // Missing create, update, delete
}

// ✅ Correct - complete interface
const mockRepo: UserRepository = {
  findById: async (id: string) => null,
  create: async (input) => ({ id: 'new-id' }),
  update: async (id, input) => null,
  delete: async (id) => false
}
```

---

## Summary

**Integration testing flows:**
- Test ALL branches (Success + each Error)
- Reusable flows: test standalone
- Non-reusable flows: test via parent
- Use preset() to mock dependencies
- Fresh scope per test suite
- Dispose scope in afterEach
- Test error propagation from sub-flows

**Related sub-skills:**
- `testing-utilities.md` - Unit testing pure functions
- `testing-integration.md` - End-to-end testing
- `flow-subflows.md` - Flow composition patterns
- `coding-standards.md` - Type safety rules
