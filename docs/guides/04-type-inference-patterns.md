---
title: Type Inference Patterns
description: How to structure code for complete type inference without annotations
keywords: [type inference, destructuring, TypeScript, type safety]
related:
  - guides/02-tags-the-type-system
  - guides/01-executors-and-dependencies
  - reference/type-verification
---

# Type Inference Patterns

## The Philosophy

**Write code that TypeScript can infer, don't annotate your way out.**

All examples in this documentation compile with zero errors and:
- No explicit return types
- No type assertions (`as`, `<T>`)
- No type casts
- No generic parameters on functions

The only exceptions:
1. Tag definitions (`custom<T>()` requires the generic)
2. Extension hooks (type narrowing in specific cases)

## Verification First

Every example type-checks:

```bash
pnpm -F @pumped-fn/core-next typecheck:full
```

Zero errors required.

## Patterns That Enable Inference

### 1. Destructure Parameters for Type Inference

<<< @/../examples/http-server/type-inference.ts#destructure-for-inference{ts}

**Why destructuring works:**

TypeScript infers types from object shape when you destructure parameters. Without destructuring, the parameter becomes `any`.

```typescript
// ❌ BREAKS inference
const bad = derive({ db, config }, (deps) => {
  deps.db  // Type: any - inference failed
})

// ✅ ENABLES inference
const good = derive({ db, config }, ({ db, config }) => {
  db  // Type inferred from dbExecutor
  config  // Type inferred from configExecutor
})
```

### 2. Single Dependency - Direct Parameter

```typescript
// Single dependency gets direct parameter (no destructuring needed)
const service = derive(dbExecutor, (db) => ({
  // db type inferred directly
  getUser: (id: string) => db.query('SELECT * FROM users WHERE id = ?', [id])
}))
```

### 3. Let Return Types Infer

<<< @/../examples/http-server/type-inference.ts#return-inference{ts}

**Don't add explicit return types:**

```typescript
// ❌ Wrong - explicit type masks issues
const bad = derive({ db }, ({ db }): ServiceType => ({
  method: () => {}
}))

// ✅ Right - let implementation dictate type
const good = derive({ db }, ({ db }) => ({
  method: () => db.query(...)  // Return type inferred
}))
```

### 4. Complex Types - Structure for Inference

<<< @/../examples/http-server/type-inference.ts#inference-with-complex-types{ts}

For complex return types, extract functions to help inference:

```typescript
const complexService = derive({ db }, ({ db }) => {
  // Extract to named functions
  const getUser = (id: string) => db.query('SELECT * FROM users WHERE id = ?', [id])
  const createUser = (name: string) => db.query('INSERT INTO users (name) VALUES (?)', [name])

  return { getUser, createUser }  // Type inferred correctly
})
```

## When Inference Fails - Fix The Code

### Problem: Deps Parameter Loses Type

```typescript
// ❌ Inference fails
const broken = derive({ db, logger }, (deps) => {
  deps.db  // any - no type safety
})

// ✅ Fix: destructure
const fixed = derive({ db, logger }, ({ db, logger }) => {
  db  // DB (inferred)
  logger  // Logger (inferred)
})
```

**Why:** TypeScript cannot infer complex object types from non-destructured parameters.

### Problem: Need Explicit Type for External API

Sometimes external libraries need explicit types:

```typescript
// If createConnection needs explicit type
const dbConnection = derive(config, (cfg) => {
  // External API might need type hint
  const connection: DB = createConnection(cfg)
  return connection
})
```

**Note:** This is the exception, not the rule. Most code won't need this.

## Tags Provide Type Safety Everywhere

Tags complement factory type inference:

```typescript
import { tag, custom } from '@pumped-fn/core-next'

// Tag carries type
const userId = tag(custom<string>(), { label: 'user.id' })

// All access points infer from tag
const value1 = userId.get(scope)      // string
const value2 = userId.find(executor)  // string | undefined
const value3 = ctx.get(userId)        // string

// Setting enforces type from tag
ctx.set(userId, "123")   // ✓
ctx.set(userId, 123)     // ✗ Compile error
```

See [Tags: The Type System](./02-tags-the-type-system.md) for details.

## Common Anti-Patterns

### ❌ Don't add explicit return types

```typescript
const bad = derive({ db }, ({ db }): ServiceType => ({
  // Explicit return type masks inference failures
}))
```

### ❌ Don't use type assertions

```typescript
const bad = derive({ db }, ({ db }) => {
  return createService(db) as ServiceType  // Lies to compiler
})
```

### ❌ Don't use generic parameters

```typescript
const bad = derive<ServiceType>({ db }, ({ db }) => {
  // Generic parameter bypasses inference
})
```

### ✅ Do structure code for inference

```typescript
const good = derive({ db }, ({ db }) => {
  return createService(db)  // Let TypeScript figure it out
})
```

## Verification Workflow

Every example includes verification:

```typescript
/**
 * @file type-inference.ts
 *
 * Verify: pnpm -F @pumped-fn/core-next typecheck:full
 */
```

Before committing:
```bash
# Check examples
pnpm -F @pumped-fn/core-next typecheck:full

# Run tests
pnpm -F @pumped-fn/core-next test
```

## Decision Tree

```
Need to create executor?
├─ Single dependency?
│  └─ Use: derive(dep, (d) => ...)
│
├─ Multiple dependencies?
│  └─ Use: derive({ a, b }, ({ a, b }) => ...)
│     ⚠️ MUST destructure for type inference
│
└─ No dependencies?
   └─ Use: provide(() => ...)
```

## Summary

**The library is designed for complete type inference.**

If you need explicit types, the code structure is wrong. Restructure instead of annotating.

Key patterns:
1. **Destructure multi-dependency parameters** - Enables type inference
2. **Let return types infer** - Don't add explicit return types
3. **Use tags for context** - Type-safe runtime access
4. **Verify with tsc** - Run typecheck before committing

## See Also
- [Tags: The Type System](./02-tags-the-type-system.md) - Type-safe runtime access
- [Executors and Dependencies](./01-executors-and-dependencies.md) - Basic patterns
- [Type Verification](../reference/type-verification.md) - How to verify types
