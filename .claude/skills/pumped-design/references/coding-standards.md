---
name: coding-standards
tags: coding, types, naming, organization, style, readability, economy, narrowing
description: Type safety rules, file organization, variable naming, code economy principles. Type narrowing with discriminated unions mandatory - never use any/casting, prefer unknown and inference. Flat file structure with component-type prefixes. Functional naming without suffixes. Lines of code are expensive - maximize TypeScript features without reducing readability. Destructuring to reduce verbosity.
---

# Coding Standards for Pumped-fn Applications

## Type Safety Rules

### Never `any` Unless Type Inference Requires It

```typescript
// ✅ Prefer unknown
const parseInput = (raw: unknown) => {
  if (typeof raw === 'string') {
    return JSON.parse(raw)
  }
  throw new Error('Invalid input')
}

// ❌ Avoid any
const parseInput = (raw: any) => {  // Lost type safety
  return JSON.parse(raw)
}
```

### Think Twice Before Type Casting

```typescript
// ✅ Let types flow naturally
const result = await ctx.exec(validateOrder, input)
if (!result.success) {
  // TypeScript knows result has 'reason' property
  return result
}

// ❌ Don't cast when narrowing works
const result = await ctx.exec(validateOrder, input)
if (!result.success) {
  return result as ValidationError  // Unnecessary
}
```

### Internal Code Uses Type Inference

```typescript
// ✅ Let TypeScript infer flow types
export const processOrder = flow(
  { validateOrder, chargePayment },
  ({ validateOrder, chargePayment }) =>
    async (ctx, input) => {  // Types inferred from usage
      const validated = await ctx.exec(validateOrder, input)
      return validated
    }
)

// ❌ Don't explicitly type internals
export const processOrder = flow(
  { validateOrder, chargePayment },
  ({ validateOrder, chargePayment }) =>
    async (ctx: FlowContext, input: OrderInput): Promise<OrderResult> => {
      // Verbose, types already known
    }
)
```

### Library Exports Use Explicit Interfaces

```typescript
// ✅ Export clean interface for reusable components
export type Logger = {
  info: (msg: string, meta?: Record<string, unknown>) => void
  error: (msg: string, meta?: Record<string, unknown>) => void
}

export const logger = provide((controller): Logger => {
  const pino = createPino({ ... })

  controller.cleanup(() => pino.flush())

  return {
    info: (msg, meta) => pino.info(meta, msg),
    error: (msg, meta) => pino.error(meta, msg)
  }
})

// ❌ Don't expose library types directly
export const logger = provide((controller): pino.Logger => {
  // Exposes pino's complex interface
})
```

---

## Type Narrowing is Fundamental

**Principle:** Design discriminated unions, use TypeScript's type narrowing. Never cast when narrowing works.

### Discriminated Unions with Type Narrowing

```typescript
export namespace ProcessOrder {
  export type Success = { success: true; orderId: string; total: number }
  export type ValidationError = { success: false; reason: 'INVALID_ITEMS' }
  export type PaymentError = { success: false; reason: 'PAYMENT_DECLINED'; message: string }

  export type Result = Success | ValidationError | PaymentError
}

export const processOrder = flow(
  { validateOrder, chargePayment },
  ({ validateOrder, chargePayment }) =>
    async (ctx, input): Promise<ProcessOrder.Result> => {
      const validated = await ctx.exec(validateOrder, input)

      // ✅ Type narrowing via discriminator
      if (!validated.success) {
        // TypeScript knows: validated is ValidationError here
        // validated.reason exists
        return validated
      }

      // ✅ After check, TypeScript knows validated.success is true
      // TypeScript knows: validated.orderId, validated.total exist
      const charged = await ctx.exec(chargePayment, {
        amount: validated.total
      })

      if (!charged.success) {
        // TypeScript knows: charged has 'reason' property
        return charged
      }

      // TypeScript knows: charged.transactionId exists
      return { success: true, orderId: charged.transactionId, total: charged.amount }
    }
)
```

### Trust Narrowing - No Optional Chaining After Checks

```typescript
// ✅ After narrowing, don't use optional chaining
if (validated.success) {
  const id = validated.orderId.toString()  // Correct - narrowing proves it exists
}

// ❌ Don't use optional when narrowing guarantees
if (validated.success) {
  const id = validated.orderId?.toString()  // Wrong - ? is redundant
}
```

### Key Type Narrowing Patterns

1. **Always use discriminated unions** - `success: true/false`, `type: 'A' | 'B'`
2. **Let TypeScript narrow** - `if (!result.success)` eliminates error branches
3. **Avoid type assertions** - If you need `as`, your types are wrong
4. **Trust narrowing** - After check, TypeScript knows the exact type

---

## File Organization

**Principle:** Flat structure with component-type prefixes for sorting and shorter imports.

### Flat Structure with Prefixes

```
src/
  entrypoint.cli.ts
  entrypoint.web.ts
  entrypoint.test.ts
  flow.order.ts
  flow.payment.ts
  flow.user.ts
  resource.db.ts
  resource.logger.ts
  resource.cache.ts
  state.session.ts
  state.tokens.ts
  util.datetime.ts
  util.validation.ts
  util.crypto.ts
```

**Benefits:**
- Prefix-based alphabetical sorting (all `flow.*` together)
- Shorter import paths: `./flow.order` vs `./flows/order`
- Clear layer membership at a glance
- Easy globbing: `flow.*.ts`, `resource.*.ts`, `state.*.ts`

### Test Files Adjacent to Source

```
src/
  flow.order.ts
  flow.order.test.ts
  util.datetime.ts
  util.datetime.test.ts
```

---

## Variable Naming

**Principle:** Functional naming - no prefixes or suffixes.

```typescript
// ✅ Clean functional names
const user = await findUser(id)
const validated = validate(input)
const dbPool = provide(...)
const logger = provide(...)

// ❌ Avoid redundant prefixes/suffixes
const validatedUser = validate(input)     // "validated" is redundant
const dbPoolResource = provide(...)        // "Resource" suffix is noise
const loggerService = provide(...)         // "Service" suffix adds nothing
```

---

## Code Economy

**Principle:** Lines of code are expensive. Think once on meaning, think twice before adding a line. Maximize TypeScript language features without reducing readability.

### Use Language Features

```typescript
// ✅ Ternary for simple branches
const status = validated.success ? 'ok' : 'error'

// ✅ Optional chaining
const email = user?.contact?.email

// ✅ Nullish coalescing
const port = config.port ?? 3000

// ✅ Combine operations when meaningful
return validated.success
  ? ctx.exec(chargePayment, { amount: validated.total })
  : validated

// ✅ Inline when clear
return ctx.exec(charge, { userId: input.userId })
```

### Avoid Unnecessary Variables

```typescript
// ❌ Don't create redundant variables
const isSuccess = validated.success
if (isSuccess) { ... }

// ✅ Use the value directly
if (validated.success) { ... }

// ❌ Don't split unnecessarily
const userId = input.userId
return ctx.exec(charge, { userId })

// ✅ Inline when meaningful
return ctx.exec(charge, { userId: input.userId })
```

**Balance:** Reduce lines, preserve clarity. If removing a line makes code harder to understand, keep it.

---

## Destructuring for Conciseness

```typescript
// ✅ Destructure dependencies
const userRepo = derive(
  { db: dbPool, logger },
  ({ db, logger }) => ({
    findById: async (id: string) => {
      logger.info('Finding user', { id })
      return db.query('SELECT * FROM users WHERE id = $1', [id])
    }
  })
)

// ✅ Destructure in flows
const processOrder = flow(
  { validateOrder, chargePayment },
  ({ validateOrder, chargePayment }) =>
    async (ctx, input) => {
      const validated = await ctx.exec(validateOrder, input)
      if (!validated.success) return validated

      return ctx.exec(chargePayment, { amount: validated.total })
    }
)
```

---

## Blank Lines for Readability

**Principle:** Separate logical blocks with blank lines.

```typescript
// ✅ Blank lines separate logical operations
export const processOrder = flow(
  { validateOrder, chargePayment },
  ({ validateOrder, chargePayment }) =>
    async (ctx, input) => {
      const validated = await ctx.exec(validateOrder, input)

      if (!validated.success) {
        return validated
      }

      const charged = await ctx.exec(chargePayment, {
        userId: input.userId,
        amount: validated.total
      })

      if (!charged.success) {
        return charged
      }

      return ctx.run('finalize', () => ({
        success: true,
        orderId: charged.id
      }))
    }
)
```

---

## Promised Chaining Rules

**Principle:** Chain `.map()`/`.mapError()` to complete logical operations, not as default style.

### Chain When Completing Logical Operation

```typescript
// ✅ Chain to transform and handle errors
const validated = await ctx.exec(validateOrder, input)
  .map((result) => {
    if (!result.success) throw new Error(result.reason)
    return result
  })
  .mapError((err) => ({
    success: false,
    reason: 'VALIDATION_FAILED'
  }))

// ✅ Also OK: Separate when clearer
const validated = await ctx.exec(validateOrder, input)

if (!validated.success) {
  return { success: false, reason: 'VALIDATION_FAILED' }
}
```

### Don't Chain Just Because You Can

```typescript
// ❌ Meaningless chain
const result = await ctx.exec(validate, input)
  .map((r) => r)  // Does nothing

// ✅ Only chain when transforming
const result = await ctx.exec(validate, input)
```

**Guideline:** Use `.map()`/`.mapError()` when you need to transform or complete error handling, not by default.

---

## Summary

**Type Safety:**
- Never `any`, prefer `unknown`
- No casting - use type narrowing
- Inference for internals, explicit for exports
- Discriminated unions mandatory

**Organization:**
- Flat files with prefixes
- Functional naming
- Adjacent tests

**Code Quality:**
- Lines are expensive
- Maximize language features
- Preserve readability
- Blank lines separate logic
- Destructure for conciseness
- Chain when meaningful
