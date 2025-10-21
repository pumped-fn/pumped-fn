---
title: Type Verification
description: How to verify all code type-checks without errors
keywords: [typecheck, TypeScript, verification, tsc]
---

# Type Verification

## Requirement

**All examples must pass TypeScript type checking.**

## How to Verify

Run the project's typecheck scripts:

```bash
# Check source code
pnpm -F @pumped-fn/core-next typecheck

# Check source + tests
pnpm -F @pumped-fn/core-next typecheck:full
```

Both commands should complete with zero errors.

## Script Configuration

If typecheck scripts are not configured in your project's `package.json`:

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit",
    "typecheck:full": "tsc --noEmit --project tsconfig.test.json"
  }
}
```

## Standards

All code must satisfy:

- **99% type inference** - No explicit type annotations
- **No type assertions** - No `as`, no `<T>` casts
- **Zero errors** - Both source and tests must pass
- **Strict mode** - `strict: true` in tsconfig.json

## Example Verification

Every example file is verified:

```typescript
/**
 * @file 01-basic-handler.ts
 *
 * Verify: pnpm -F @pumped-fn/core-next typecheck:full
 */
```

## Local Development

Before committing:

```bash
# Quick check (source only)
pnpm -F @pumped-fn/core-next typecheck

# Full check (with tests)
pnpm -F @pumped-fn/core-next typecheck:full

# Run tests
pnpm -F @pumped-fn/core-next test
```

## CI Verification

```yaml
# .github/workflows/ci.yml
- name: Type check source
  run: pnpm -F @pumped-fn/core-next typecheck

- name: Type check tests
  run: pnpm -F @pumped-fn/core-next typecheck:full

- name: Run tests
  run: pnpm -F @pumped-fn/core-next test
```

## Common Type Errors

### Error: Parameter implicitly has 'any' type

**Cause:** Not destructuring multi-dependency parameters

```typescript
// ❌ Wrong
derive({ db, config }, (deps) => {
  deps.db  // any
})

// ✅ Right
derive({ db, config }, ({ db, config }) => {
  db  // typed
})
```

### Error: Type 'X' is not assignable to 'Y'

**Cause:** Tag value doesn't match tag schema

```typescript
// ❌ Wrong
const port = tag(custom<number>(), { label: 'port' })
ctx.set(port, "3000")  // string instead of number

// ✅ Right
ctx.set(port, 3000)  // number
```

## For AI Agents

When generating code examples:

1. Structure code for type inference (destructure parameters)
2. Avoid explicit type annotations
3. Verify with: `pnpm -F @pumped-fn/core-next typecheck:full`
4. All generated code must pass verification

## See Also

- [Type Inference Patterns](../guides/04-type-inference-patterns.md)
- [Tags: The Type System](../guides/02-tags-the-type-system.md)
- [Common Mistakes](./common-mistakes.md)
