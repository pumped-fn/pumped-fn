/**
 * Flow Sub-flows Examples
 *
 * Extracted from flow-subflows.md
 * Contains examples of ctx.exec() for sub-flow composition, error mapping,
 * discriminated unions, and reusable vs non-reusable flow patterns.
 */

import { flow } from '@pumped-fn/core-next'

/**
 * Validate Order Sub-flow
 *
 * Reusable validation logic with discriminated union output.
 *
 * Referenced in: flow-subflows.md
 * Section: Core Pattern: ctx.exec(subFlow, input) > Basic Sub-flow Execution
 */
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

/**
 * Process Order Parent Flow
 *
 * Orchestrates sub-flows using ctx.exec() - NOT wrapped in ctx.run().
 *
 * Referenced in: flow-subflows.md
 * Section: Core Pattern: ctx.exec(subFlow, input) > Basic Sub-flow Execution
 */
export namespace ProcessOrder {
  export type Input = { items: string[]; userId: string }
  export type Success = { success: true; orderId: string; total: number }
  export type Error = ValidateOrder.Error | { success: false; reason: 'PAYMENT_DECLINED' }
  export type Result = Success | Error
}

export const processOrder = flow(
  async (ctx, input: ProcessOrder.Input): Promise<ProcessOrder.Result> => {
    const validated = await ctx.exec(validateOrder, {
      items: input.items,
      userId: input.userId
    })

    if (!validated.success) {
      return validated
    }

    const orderId = await ctx.run('generate-id', () => `order-${Date.now()}`)

    return { success: true, orderId, total: validated.total }
  }
)

/**
 * Double Number Sub-flow
 *
 * Simple sub-flow composition from tests.
 *
 * Referenced in: flow-subflows.md
 * Section: Real Examples > Example 1: Simple Sub-flow Composition
 */
export const doubleNumber = flow<{ n: number }, { doubled: number }>(
  (_ctx, input) => {
    return { doubled: input.n * 2 }
  }
)

export const processValue = flow<{ value: number }, { result: number }>(
  async (ctx, input) => {
    const doubled = await ctx.exec(doubleNumber, { n: input.value })
    return { result: doubled.doubled }
  }
)

/**
 * Get Base Value with Void Input
 *
 * Demonstrates void input sub-flow pattern.
 *
 * Referenced in: flow-subflows.md
 * Section: Real Examples > Example 3: Void Input Sub-flow
 */
export const getBaseValue = flow<void, number>(() => {
  return 100
})

export const incrementValueVoid = flow<void, number>(async (ctx) => {
  const base = await ctx.exec(getBaseValue, undefined)
  return base + 1
})

/**
 * Create User with Repository
 *
 * Sub-flow with discriminated union errors.
 *
 * Referenced in: flow-subflows.md
 * Section: Real Examples > Example 4: Sub-flow with Error Union
 */
const userRepository = {
  findByEmail: async (email: string) => null as any,
  create: async (data: { email: string; name: string }) => ({ id: 1, ...data })
}

export namespace CreateUserWithRepo {
  export type Input = { email: string; name: string }
  export type Success = { success: true; user: { id: number; email: string; name: string } }
  export type Error =
    | { success: false; reason: 'INVALID_EMAIL' }
    | { success: false; reason: 'EMAIL_EXISTS' }
  export type Result = Success | Error
}

export const createUserWithRepo = flow(
  async (ctx, input: CreateUserWithRepo.Input): Promise<CreateUserWithRepo.Result> => {
    const validation = await ctx.run('validate-input', () => {
      if (!input.email.includes('@')) {
        return { ok: false as const, reason: 'INVALID_EMAIL' as const }
      }
      return { ok: true as const }
    })

    if (!validation.ok) {
      return { success: false, reason: validation.reason }
    }

    const existing = await ctx.run('check-existing', async () => {
      return userRepository.findByEmail(input.email)
    })

    if (existing !== null) {
      return { success: false, reason: 'EMAIL_EXISTS' }
    }

    const user = await ctx.run('create-user', async () => {
      return userRepository.create(input)
    })

    return { success: true, user }
  }
)

/**
 * Register User with Error Union
 *
 * Parent flow aggregating sub-flow errors in discriminated union.
 *
 * Referenced in: flow-subflows.md
 * Section: Real Examples > Example 4: Sub-flow with Error Union
 */
export namespace RegisterUser {
  export type Input = { email: string; name: string; sendWelcomeEmail: boolean }
  export type Success = { success: true; user: { id: number; email: string; name: string }; emailSent: boolean }
  export type Error = CreateUserWithRepo.Error | { success: false; reason: 'EMAIL_SEND_FAILED' }
  export type Result = Success | Error
}

export const registerUser = flow(
  async (ctx, input: RegisterUser.Input): Promise<RegisterUser.Result> => {
    const userResult = await ctx.exec(createUserWithRepo, {
      email: input.email,
      name: input.name
    })

    if (!userResult.success) {
      return userResult
    }

    let emailSent = false
    if (input.sendWelcomeEmail) {
      const emailResult = await ctx.run('send-welcome-email', async () => {
        return { success: true as const }
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

/**
 * Direct Error Propagation Pattern
 *
 * Sub-flow errors flow through unchanged to parent.
 *
 * Referenced in: flow-subflows.md
 * Section: Error Mapping > Pattern 1: Direct Error Propagation
 */
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

export const processInput = flow(
  async (ctx, input: string): Promise<
    | { success: true; result: string }
    | { success: false; reason: 'EMPTY' | 'INVALID' | 'PROCESSING_FAILED' }
  > => {
    const validated = await ctx.exec(validateInput, input)

    if (!validated.success) {
      return validated
    }

    return { success: true, result: validated.validated.toUpperCase() }
  }
)

/**
 * Error Transformation Pattern
 *
 * Parent transforms sub-flow errors to different error types.
 *
 * Referenced in: flow-subflows.md
 * Section: Error Mapping > Pattern 2: Error Transformation
 */
type User = { id: number; email: string }
type Profile = { userId: number; email: string }

const fetchUser = flow(
  async (_ctx, userId: string): Promise<
    | { success: true; user: User }
    | { success: false; reason: 'NOT_FOUND' }
  > => {
    return { success: true, user: { id: 1, email: 'test@example.com' } }
  }
)

const buildProfile = (user: User): Profile => ({ userId: user.id, email: user.email })

export const getUserProfile = flow(
  async (ctx, userId: string): Promise<
    | { success: true; profile: Profile }
    | { success: false; reason: 'USER_NOT_FOUND' | 'PROFILE_INCOMPLETE' }
  > => {
    const userResult = await ctx.exec(fetchUser, userId)

    if (!userResult.success) {
      return { success: false, reason: 'USER_NOT_FOUND' }
    }

    return { success: true, profile: buildProfile(userResult.user) }
  }
)

/**
 * Multiple Error Unions Pattern
 *
 * Parent aggregates errors from multiple sub-flows.
 *
 * Referenced in: flow-subflows.md
 * Section: Error Mapping > Pattern 3: Multiple Error Unions
 */
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
    return { success: true, transactionId: `txn-${Date.now()}` }
  }
)

export const processPayment = flow(
  async (ctx, amount: number): Promise<
    | { success: true; transactionId: string }
    | { success: false; reason: 'INVALID_AMOUNT' | 'DECLINED' | 'INSUFFICIENT_FUNDS' }
  > => {
    const validated = await ctx.exec(validatePayment, amount)
    if (!validated.success) return validated

    const charged = await ctx.exec(chargeCard, validated.validated)
    if (!charged.success) return charged

    return { success: true, transactionId: charged.transactionId }
  }
)

/**
 * Reusable Email Validation Flow
 *
 * Generic, standalone validation logic callable from multiple parents.
 *
 * Referenced in: flow-subflows.md
 * Section: Reusable vs Non-reusable Flows > Reusable Flows
 */
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

export const registerUserEmail = flow(async (ctx, email: string) => {
  const validated = await ctx.exec(validateEmail, email)
  if (!validated.success) return validated
  return { success: true as const, registered: true }
})

export const updateEmail = flow(async (ctx, email: string) => {
  const validated = await ctx.exec(validateEmail, email)
  if (!validated.success) return validated
  return { success: true as const, updated: true }
})

/**
 * Non-reusable Order Total Calculation
 *
 * Tightly coupled to parent flow, extracts complexity for readability.
 *
 * Referenced in: flow-subflows.md
 * Section: Reusable vs Non-reusable Flows > Non-reusable Flows
 */
type OrderItem = { price: number; quantity: number }

const calculateOrderTotal = flow(
  async (_ctx, items: OrderItem[]): Promise<{ total: number; taxAmount: number }> => {
    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0)
    const taxAmount = subtotal * 0.08
    return { total: subtotal + taxAmount, taxAmount }
  }
)

export const processOrderWithTotal = flow(async (ctx, items: OrderItem[]) => {
  const { total, taxAmount } = await ctx.exec(calculateOrderTotal, items)
  return { orderId: `order-${Date.now()}`, total, taxAmount }
})
