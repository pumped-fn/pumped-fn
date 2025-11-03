/**
 * Testing Utilities Examples
 *
 * Extracted from testing-utilities.md
 */

// @ts-nocheck
import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { createScope, preset, provide, derive, type Core } from '@pumped-fn/core-next'
import { readFile } from 'node:fs/promises'

// ============================================================================
// PURE FUNCTIONS
// ============================================================================

/**
 * Pure Currency Formatter
 *
 * Pure function with no dependencies - deterministic output.
 *
 * Referenced in: testing-utilities.md
 * Section: Pattern: Testing Pure Functions
 */
export const formatCurrency = (amount: number, currency: string): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency
  }).format(amount)
}

/**
 * Pure Email Parser
 *
 * Pure function returning discriminated union for type-safe results.
 *
 * Referenced in: testing-utilities.md
 * Section: Pattern: Testing Pure Functions
 */
export const parseEmail = (raw: string): { success: true; email: string } | { success: false; reason: 'INVALID_FORMAT' } => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  if (!emailRegex.test(raw)) {
    return { success: false, reason: 'INVALID_FORMAT' }
  }

  return { success: true, email: raw.toLowerCase() }
}

/**
 * Pure Function Tests
 *
 * Test pure functions without scope or preset.
 *
 * Referenced in: testing-utilities.md
 * Section: Pattern: Testing Pure Functions
 */
export const pureFunctionTests = () => {
  describe('formatCurrency', () => {
    test('formats USD correctly', () => {
      const result = formatCurrency(1234.56, 'USD')

      expect(result).toBe('$1,234.56')
    })

    test('formats EUR correctly', () => {
      const result = formatCurrency(9999.99, 'EUR')

      expect(result).toBe('€9,999.99')
    })

    test('handles zero amount', () => {
      const result = formatCurrency(0, 'USD')

      expect(result).toBe('$0.00')
    })

    test('handles negative amounts', () => {
      const result = formatCurrency(-50.25, 'USD')

      expect(result).toBe('-$50.25')
    })
  })

  describe('parseEmail', () => {
    test('accepts valid email', () => {
      const result = parseEmail('user@example.com')

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.email).toBe('user@example.com')
      }
    })

    test('normalizes email to lowercase', () => {
      const result = parseEmail('User@EXAMPLE.COM')

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.email).toBe('user@example.com')
      }
    })

    test('rejects email without @', () => {
      const result = parseEmail('invalid-email.com')

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.reason).toBe('INVALID_FORMAT')
      }
    })

    test('rejects email without domain', () => {
      const result = parseEmail('user@')

      expect(result.success).toBe(false)
    })

    test('rejects empty string', () => {
      const result = parseEmail('')

      expect(result.success).toBe(false)
    })
  })
}

// ============================================================================
// EXECUTOR-WRAPPED BUILT-INS
// ============================================================================

/**
 * Executor-Wrapped File System
 *
 * Executor wrapping Node.js built-in for testing with preset().
 *
 * Referenced in: testing-utilities.md
 * Section: Pattern: Testing Executor-Wrapped Built-ins
 */
export const fsRead = provide(() => ({ read: readFile }))

/**
 * JSON File Loader
 *
 * Derived utility using fs executor.
 *
 * Referenced in: testing-utilities.md
 * Section: Pattern: Testing Executor-Wrapped Built-ins
 */
export const loadJsonFile = derive(
  { fs: fsRead },
  ({ fs }) => async (path: string): Promise<unknown> => {
    const content = await fs.read(path, 'utf-8')
    return JSON.parse(content)
  }
)

/**
 * Executor Tests with Preset
 *
 * Test executor-wrapped built-ins with preset() for mocking.
 *
 * Referenced in: testing-utilities.md
 * Section: Pattern: Testing Executor-Wrapped Built-ins
 */
export const executorTests = () => {
  describe('loadJsonFile', () => {
    let scope: Core.Scope

    beforeEach(() => {
      const mockFs = {
        read: async (path: string, _encoding: string) => {
          if (path === '/valid.json') {
            return '{"name":"test","value":42}'
          }
          if (path === '/empty.json') {
            return '{}'
          }
          if (path === '/invalid.json') {
            return 'not json'
          }
          throw new Error('File not found')
        }
      }

      scope = createScope(preset(fsRead, mockFs))
    })

    afterEach(async () => {
      await scope.dispose()
    })

    test('parses valid JSON file', async () => {
      const loader = await scope.resolve(loadJsonFile)
      const result = await loader('/valid.json')

      expect(result).toEqual({ name: 'test', value: 42 })
    })

    test('handles empty JSON file', async () => {
      const loader = await scope.resolve(loadJsonFile)
      const result = await loader('/empty.json')

      expect(result).toEqual({})
    })

    test('throws on invalid JSON', async () => {
      const loader = await scope.resolve(loadJsonFile)

      await expect(loader('/invalid.json')).rejects.toThrow()
    })

    test('throws on missing file', async () => {
      const loader = await scope.resolve(loadJsonFile)

      await expect(loader('/missing.json')).rejects.toThrow('File not found')
    })
  })
}

// ============================================================================
// BOUNDARY CONDITIONS
// ============================================================================

/**
 * Calculate Discount with Validation
 *
 * Function with boundary conditions for testing.
 *
 * Referenced in: testing-utilities.md
 * Section: Pattern: Testing Boundary Conditions
 */
export const calculateDiscount = (
  price: number,
  discountPercent: number
): { success: true; finalPrice: number } | { success: false; reason: 'INVALID_PRICE' | 'INVALID_DISCOUNT' } => {
  if (price < 0) {
    return { success: false, reason: 'INVALID_PRICE' }
  }

  if (discountPercent < 0 || discountPercent > 100) {
    return { success: false, reason: 'INVALID_DISCOUNT' }
  }

  const finalPrice = price * (1 - discountPercent / 100)

  return { success: true, finalPrice }
}

/**
 * Boundary Condition Tests
 *
 * Test edge cases: zero, negative, max values, floating point.
 *
 * Referenced in: testing-utilities.md
 * Section: Pattern: Testing Boundary Conditions
 */
export const boundaryTests = () => {
  describe('calculateDiscount boundary conditions', () => {
    test('handles zero price', () => {
      const result = calculateDiscount(0, 10)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.finalPrice).toBe(0)
      }
    })

    test('handles zero discount', () => {
      const result = calculateDiscount(100, 0)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.finalPrice).toBe(100)
      }
    })

    test('handles 100% discount', () => {
      const result = calculateDiscount(100, 100)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.finalPrice).toBe(0)
      }
    })

    test('rejects negative price', () => {
      const result = calculateDiscount(-1, 10)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.reason).toBe('INVALID_PRICE')
      }
    })

    test('rejects negative discount', () => {
      const result = calculateDiscount(100, -1)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.reason).toBe('INVALID_DISCOUNT')
      }
    })

    test('rejects discount over 100', () => {
      const result = calculateDiscount(100, 101)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.reason).toBe('INVALID_DISCOUNT')
      }
    })

    test('handles floating point prices', () => {
      const result = calculateDiscount(99.99, 15)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.finalPrice).toBeCloseTo(84.99, 2)
      }
    })
  })
}

// ============================================================================
// TYPE NARROWING
// ============================================================================

/**
 * Age Validator with Discriminated Union
 *
 * Function with multiple error types for type narrowing.
 *
 * Referenced in: testing-utilities.md
 * Section: Pattern: Testing Type Narrowing
 */
export namespace ValidateAge {
  export type Success = { success: true; age: number; category: 'child' | 'adult' | 'senior' }
  export type TooYoung = { success: false; reason: 'TOO_YOUNG' }
  export type TooOld = { success: false; reason: 'TOO_OLD' }
  export type Invalid = { success: false; reason: 'INVALID_AGE' }

  export type Result = Success | TooYoung | TooOld | Invalid
}

export const validateAge = (age: number): ValidateAge.Result => {
  if (!Number.isInteger(age) || age < 0) {
    return { success: false, reason: 'INVALID_AGE' }
  }

  if (age < 13) {
    return { success: false, reason: 'TOO_YOUNG' }
  }

  if (age > 120) {
    return { success: false, reason: 'TOO_OLD' }
  }

  const category = age < 18 ? 'child' : age >= 65 ? 'senior' : 'adult'

  return { success: true, age, category }
}

/**
 * Type Narrowing Tests
 *
 * Test all branches with type narrowing for type safety.
 *
 * Referenced in: testing-utilities.md
 * Section: Pattern: Testing Type Narrowing
 */
export const typeNarrowingTests = () => {
  describe('validateAge type narrowing', () => {
    test('child category (13-17)', () => {
      const result = validateAge(15)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.age).toBe(15)
        expect(result.category).toBe('child')
      }
    })

    test('adult category (18-64)', () => {
      const result = validateAge(30)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.category).toBe('adult')
      }
    })

    test('senior category (65+)', () => {
      const result = validateAge(70)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.category).toBe('senior')
      }
    })

    test('TOO_YOUNG error', () => {
      const result = validateAge(10)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.reason).toBe('TOO_YOUNG')
      }
    })

    test('TOO_OLD error', () => {
      const result = validateAge(150)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.reason).toBe('TOO_OLD')
      }
    })

    test('INVALID_AGE error (negative)', () => {
      const result = validateAge(-5)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.reason).toBe('INVALID_AGE')
      }
    })

    test('INVALID_AGE error (float)', () => {
      const result = validateAge(25.5)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.reason).toBe('INVALID_AGE')
      }
    })
  })
}
