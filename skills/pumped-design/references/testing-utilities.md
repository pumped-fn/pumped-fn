---
name: testing-utilities
tags: testing, util, unit, preset, pure, executor, mock, boundary
description: Unit testing pure functions and executor-wrapped utilities with preset(). Test edge cases, boundary conditions, and input validation. Mock dependencies via preset() for isolated testing. Test discriminated union branches with type narrowing.
---

# Testing Utilities (Unit Tests)

## When to Use This Pattern

**Unit testing utilities means:**
- Testing pure functions (no side effects)
- Testing executor-wrapped built-ins with `preset()`
- Testing edge cases and boundary conditions
- Testing input validation logic
- Isolated testing (no real resources)

**Use unit tests for:**
- Pure utility functions (formatters, parsers, validators)
- Executor-wrapped Node.js built-ins (fs, crypto, etc.)
- Boundary conditions (empty arrays, null, undefined)
- Error cases (invalid input, out of range)
- Type narrowing with discriminated unions

---

## Pattern: Testing Pure Functions

Pure functions have no dependencies and produce deterministic output.

```typescript
import { describe, test, expect } from 'vitest'

// Pure utility function
export const formatCurrency = (amount: number, currency: string): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency
  }).format(amount)
}

export const parseEmail = (raw: string): { success: true; email: string } | { success: false; reason: 'INVALID_FORMAT' } => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  if (!emailRegex.test(raw)) {
    return { success: false, reason: 'INVALID_FORMAT' }
  }

  return { success: true, email: raw.toLowerCase() }
}

// Tests for pure functions
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
```

**Key principles:**
- Test happy path first
- Test edge cases (empty, zero, negative)
- Test all discriminated union branches
- Use type narrowing (if result.success)
- No scope needed (pure functions)

---

## Pattern: Testing Executor-Wrapped Built-ins

Executor-wrapped built-ins need `preset()` for mocking.

```typescript
import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { provide, derive, preset, createScope, type Scope } from '@pumped-fn/core-next'
import { readFile } from 'node:fs/promises'

// Executor wrapping Node.js built-in
export const fsRead = provide(() => ({ read: readFile }))

// Derived utility using fs
export const loadJsonFile = derive(
  { fs: fsRead },
  ({ fs }) => async (path: string): Promise<unknown> => {
    const content = await fs.read(path, 'utf-8')
    return JSON.parse(content)
  }
)

describe('loadJsonFile', () => {
  let scope: Scope

  beforeEach(() => {
    // Mock fsRead with preset()
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

    scope = createScope({
      presets: [preset(fsRead, mockFs)]
    })
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
```

**Key principles:**
- Use `preset()` to mock executor dependencies
- Create fresh scope in `beforeEach`
- Dispose scope in `afterEach`
- Mock returns deterministic values (no randomness)
- Test error cases (throw/reject)

---

## Real Example: Tag Tests from pumped-fn

From `packages/next/tests/core.test.ts`:

```typescript
describe("Tag functionality", () => {
  test("tag provides default value when created with initial value", () => {
    const numberTag = tag(custom<number>(), { label: "test.number", default: 42 });
    const store = new Map();

    const result = numberTag.find(store);

    expect(result).toBe(42);
  });

  test("tag stores and retrieves values from store", () => {
    const stringTag = tag(custom<string>(), { label: "test.string" });
    const store = new Map();

    stringTag.set(store, "hello");
    const result = stringTag.find(store);

    expect(result).toBe("hello");
  });

  test("tag returns undefined when no value set and no default provided", () => {
    const optionalTag = tag(custom<string>(), { label: "test.optional" });
    const store = new Map();

    const result = optionalTag.find(store);

    expect(result).toBeUndefined();
  });
});
```

**What makes this good:**
- Tests default value behavior
- Tests set/get operations
- Tests undefined case (no default)
- No external dependencies
- Fast execution

---

## Pattern: Testing Boundary Conditions

Always test edge cases:

```typescript
import { describe, test, expect } from 'vitest'

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
```

**Boundary cases to test:**
- Zero values
- Negative values
- Maximum values
- Empty collections ([], {}, '')
- Null/undefined (if allowed)
- Floating point precision

---

## Pattern: Testing Type Narrowing

Discriminated unions enable type-safe testing:

```typescript
import { describe, test, expect } from 'vitest'

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

describe('validateAge type narrowing', () => {
  test('child category (13-17)', () => {
    const result = validateAge(15)

    expect(result.success).toBe(true)
    if (result.success) {
      // TypeScript knows: result has age, category
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
      // TypeScript knows: result has reason property
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
```

**Key principles:**
- Test ALL branches (Success + each Error type)
- Use `if (result.success)` for type narrowing
- TypeScript proves completeness
- No optional chaining after narrowing

---

## Troubleshooting

### Problem: Tests fail with "Cannot resolve executor"

**Cause:** Forgot to create scope or use preset()

**Solution:**
```typescript
// ❌ Wrong - no scope
const loader = await loadJsonFile('/test.json')

// ✅ Correct - use scope.resolve()
const scope = createScope({ presets: [preset(fsRead, mockFs)] })
const loader = await scope.resolve(loadJsonFile)
await scope.dispose()
```

### Problem: Mock not working

**Cause:** Preset applied to wrong executor or missing dependency

**Solution:**
```typescript
// ❌ Wrong - preset doesn't match dependency
const mockRepo = { find: async () => null }
scope = createScope({ presets: [preset(dbPool, mockRepo)] })

// ✅ Correct - preset matches actual dependency
const mockRepo = { find: async () => null }
scope = createScope({ presets: [preset(userRepository, mockRepo)] })
```

### Problem: Type narrowing doesn't work

**Cause:** Forgot to check discriminator or used wrong check

**Solution:**
```typescript
// ❌ Wrong - no discriminator check
const result = validateAge(30)
expect(result.age).toBe(30)  // TypeScript error: age might not exist

// ✅ Correct - check discriminator first
const result = validateAge(30)
expect(result.success).toBe(true)
if (result.success) {
  expect(result.age).toBe(30)  // TypeScript knows age exists
}
```

### Problem: Floating point assertion fails

**Cause:** Precision issues with floating point arithmetic

**Solution:**
```typescript
// ❌ Wrong - exact equality
expect(result.finalPrice).toBe(84.9915)

// ✅ Correct - use toBeCloseTo()
expect(result.finalPrice).toBeCloseTo(84.99, 2)
```

---

## Summary

**Unit testing utilities:**
- Pure functions need no scope/preset
- Executor-wrapped built-ins need preset()
- Always test boundary conditions
- Test ALL discriminated union branches
- Use type narrowing for type safety
- Dispose scope in afterEach

**Related sub-skills:**
- `testing-flows.md` - Integration testing flows
- `testing-integration.md` - End-to-end testing
- `coding-standards.md` - Type safety rules
