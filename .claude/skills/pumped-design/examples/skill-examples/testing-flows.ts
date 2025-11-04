/**
 * Testing Flows Examples
 *
 * Extracted from testing-flows.md
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { flow, createScope, preset, derive, type Core } from '@pumped-fn/core-next'

// ============================================================================
// REUSABLE FLOWS
// ============================================================================

/**
 * Validate Order Flow (Reusable)
 *
 * Reusable validation flow designed for composition.
 *
 * Referenced in: testing-flows.md
 * Section: Pattern: Testing Reusable Flows Standalone
 */
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

/**
 * Reusable Flow Tests
 *
 * Test reusable flows standalone - they are public API.
 *
 * Referenced in: testing-flows.md
 * Section: Pattern: Testing Reusable Flows Standalone
 */
export const reusableFlowTests = () => {
  describe('validateOrder flow (reusable)', () => {
    let scope: Core.Scope

    beforeEach(() => {
      scope = createScope()
    })

    afterEach(async () => {
      await scope.dispose()
    })

    test('SUCCESS: accepts valid order', async () => {
      const result = await scope.exec({ flow: validateOrder, input: {
        userId: 'user-1',
        items: [
          { id: 'item-1', quantity: 2 },
          { id: 'item-2', quantity: 1 }
        ]
      } })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.totalItems).toBe(2)
      }
    })

    test('ERROR: EMPTY_CART when no items', async () => {
      const result = await scope.exec({ flow: validateOrder, input: {
        userId: 'user-1',
        items: []
      } })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.reason).toBe('EMPTY_CART')
      }
    })

    test('ERROR: INVALID_QUANTITY when quantity is zero', async () => {
      const result = await scope.exec({ flow: validateOrder, input: {
        userId: 'user-1',
        items: [{ id: 'item-1', quantity: 0 }]
      } })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.reason).toBe('INVALID_QUANTITY')
      }
    })

    test('ERROR: INVALID_QUANTITY when quantity is negative', async () => {
      const result = await scope.exec({ flow: validateOrder, input: {
        userId: 'user-1',
        items: [{ id: 'item-1', quantity: -5 }]
      } })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.reason).toBe('INVALID_QUANTITY')
      }
    })
  })
}

// ============================================================================
// FLOWS WITH DEPENDENCIES
// ============================================================================

/**
 * User Repository Type
 *
 * Mock repository interface for testing flows with dependencies.
 *
 * Referenced in: testing-flows.md
 * Section: Pattern: Testing Flows with Dependencies
 */
export type UserRepository = {
  findById: (id: string) => Promise<{ id: string; name: string } | null>
  create: (input: { name: string; email: string }) => Promise<{ id: string }>
}

export const userRepository = derive(
  {},
  () => ({
    findById: async (id: string) => null,
    create: async (input: { name: string; email: string }) => ({ id: 'new-id' })
  })
)

/**
 * Create User Flow with Dependencies
 *
 * Flow with repository dependency for testing with preset().
 *
 * Referenced in: testing-flows.md
 * Section: Pattern: Testing Flows with Dependencies
 */
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
    async (ctx: any, input: CreateUser.Input): Promise<CreateUser.Result> => {
      const validation = await ctx.exec({ key: 'validate', fn: () => {
        if (input.name.length < 2) {
          return { ok: false as const, reason: 'NAME_TOO_SHORT' as const }
        }
        if (!input.email.includes('@')) {
          return { ok: false as const, reason: 'INVALID_EMAIL' as const }
        }
        return { ok: true as const }
      } })

      if (!validation.ok) {
        return { success: false, reason: validation.reason }
      }

      const created = await ctx.exec({ key: 'create', fn: () =>
        userRepo.create({ name: input.name, email: input.email }) })

      return { success: true, userId: created.id }
    }
)

/**
 * Flow with Dependencies Tests
 *
 * Test flows with dependencies using preset() for mocking.
 *
 * Referenced in: testing-flows.md
 * Section: Pattern: Testing Flows with Dependencies
 */
export const flowWithDependenciesTests = () => {
  describe('createUser flow', () => {
    let scope: Core.Scope

    beforeEach(() => {
      const mockUserRepo: UserRepository = {
        findById: async (id: string) => null,
        create: async (input: { name: string; email: string }) => ({
          id: `user-${input.name}`
        })
      }

      scope = createScope(preset(userRepository, mockUserRepo))
    })

    afterEach(async () => {
      await scope.dispose()
    })

    test('SUCCESS: creates user with valid input', async () => {
      const result = await scope.exec({ flow: createUser, input: {
        name: 'Alice',
        email: 'alice@example.com'
      } }) as any

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.userId).toBe('user-Alice')
      }
    })

    test('ERROR: NAME_TOO_SHORT when name is 1 character', async () => {
      const result = await scope.exec({ flow: createUser, input: {
        name: 'A',
        email: 'alice@example.com'
      } }) as any

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.reason).toBe('NAME_TOO_SHORT')
      }
    })

    test('ERROR: INVALID_EMAIL when email missing @', async () => {
      const result = await scope.exec({ flow: createUser, input: {
        name: 'Alice',
        email: 'invalid-email.com'
      } }) as any

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.reason).toBe('INVALID_EMAIL')
      }
    })
  })
}

// ============================================================================
// SUB-FLOWS
// ============================================================================

/**
 * Validate Email Sub-flow
 *
 * Sub-flow for testing flow composition.
 *
 * Referenced in: testing-flows.md
 * Section: Pattern: Testing Flows with Sub-flows
 */
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

/**
 * Register User Parent Flow
 *
 * Parent flow composing sub-flow via ctx.exec.
 *
 * Referenced in: testing-flows.md
 * Section: Pattern: Testing Flows with Sub-flows
 */
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

/**
 * Sub-flow Tests
 *
 * Test sub-flow separately and parent flow with real sub-flow.
 *
 * Referenced in: testing-flows.md
 * Section: Pattern: Testing Flows with Sub-flows
 */
export const subflowTests = () => {
  describe('validateEmail sub-flow (reusable)', () => {
    let scope: Core.Scope

    beforeEach(() => {
      scope = createScope()
    })

    afterEach(async () => {
      await scope.dispose()
    })

    test('SUCCESS: validates and normalizes email', async () => {
      const result = await scope.exec({ flow: validateEmail, input: 'User@EXAMPLE.COM' })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.email).toBe('user@example.com')
      }
    })

    test('ERROR: INVALID_EMAIL when missing @', async () => {
      const result = await scope.exec({ flow: validateEmail, input: 'not-an-email' })

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
      const result = await scope.exec({ flow: registerUser, input: {
        name: 'Alice',
        email: 'alice@example.com'
      } })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.userId).toBe('user-alice@example.com')
      }
    })

    test('ERROR: NAME_TOO_SHORT when name invalid', async () => {
      const result = await scope.exec({ flow: registerUser, input: {
        name: 'A',
        email: 'alice@example.com'
      } })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.reason).toBe('NAME_TOO_SHORT')
      }
    })

    test('ERROR: INVALID_EMAIL propagated from sub-flow', async () => {
      const result = await scope.exec({ flow: registerUser, input: {
        name: 'Alice',
        email: 'invalid-email'
      } })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.reason).toBe('INVALID_EMAIL')
      }
    })
  })
}
