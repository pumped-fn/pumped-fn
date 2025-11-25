---
id: c3-106
c3-version: 3
title: StandardSchema Validation
summary: >
  Library-agnostic validation contract for flows and tags.
---

# StandardSchema Validation

## Overview {#c3-106-overview}
<!-- Validation abstraction -->

StandardSchema provides a library-agnostic validation contract:

- **StandardSchemaV1** - Interface any schema library can implement
- **custom()** - Create schemas without external library
- **validate()** - Validate data against any StandardSchema

This allows pumped-fn to work with Zod, Valibot, ArkType, or any compliant library.

## Concepts {#c3-106-concepts}

### StandardSchemaV1 Interface

The contract requires a `~standard` property with:

```typescript
{
  "~standard": {
    vendor: string,       // Library identifier
    version: 1,           // Contract version
    validate: (data: unknown) => Result<T>
  }
}
```

**Result type:**

```typescript
type Result<T> =
  | { value: T }                    // Success
  | { issues: Issue[] }             // Failure
```

**Issue type:**

```typescript
type Issue = {
  message: string;
  path?: PropertyKey[];
}
```

### custom() Function

Create schemas without external library:

```typescript
const positiveNumber = custom<number>((value) => {
  if (typeof value !== 'number') {
    return { success: false, issues: [{ message: 'Not a number' }] }
  }
  if (value <= 0) {
    return { success: false, issues: [{ message: 'Must be positive' }] }
  }
  return value  // Success: return the value
})
```

**No-validation schema:**
```typescript
const anyType = custom<MyType>()  // No validation, just type assertion
```

### validate() Function

Synchronous validation that throws on failure:

```typescript
const validated = validate(schema, data)
// Returns validated data or throws SchemaError
```

**Async not supported:**
```typescript
validate(asyncSchema, data)  // Throws: "validating async is not supported"
```

## Usage Patterns {#c3-106-patterns}

### Flow Input/Output

```typescript
import { z } from 'zod'

const createUser = flow({
  name: 'createUser',
  input: z.object({
    email: z.string().email(),
    name: z.string().min(1)
  }),
  output: z.object({
    id: z.string(),
    email: z.string(),
    name: z.string()
  })
}, async (ctx, input) => {
  // input is validated and typed
  return { id: '123', ...input }
})
```

### Tag Schemas

```typescript
const userId = tag(z.string().uuid(), { label: 'userId' })
const config = tag(custom<AppConfig>(), { label: 'config' })
```

### Custom Validators

```typescript
const email = custom<string>((value) => {
  if (typeof value !== 'string') {
    return { success: false, issues: [{ message: 'Must be string' }] }
  }
  if (!value.includes('@')) {
    return { success: false, issues: [{ message: 'Invalid email' }] }
  }
  return value
})
```

## Compatible Libraries {#c3-106-compat}

Any library implementing StandardSchemaV1 works:

| Library | Support |
|---------|---------|
| Zod | Native support (v3.23+) |
| Valibot | Native support |
| ArkType | Native support |
| Yup | Adapter available |
| io-ts | Adapter needed |

**Check compatibility:**
```typescript
const isStandardSchema = (s: unknown): s is StandardSchemaV1 =>
  typeof s === 'object' && s !== null && '~standard' in s
```

## Error Handling {#c3-106-errors}

`validate()` throws `SchemaError` on failure:

```typescript
try {
  validate(schema, invalidData)
} catch (error) {
  if (error instanceof SchemaError) {
    console.log(error.issues)  // Array of Issue objects
  }
}
```

**SchemaError properties:**

| Property | Type | Description |
|----------|------|-------------|
| `issues` | Issue[] | Validation issues array |
| `message` | string | Concatenated issue messages |

## Type Inference {#c3-106-inference}

StandardSchemaV1 supports type inference:

| Type | Usage |
|------|-------|
| `StandardSchemaV1.InferInput<S>` | Input type before validation |
| `StandardSchemaV1.InferOutput<S>` | Output type after validation |

```typescript
type UserInput = StandardSchemaV1.InferInput<typeof userSchema>
type User = StandardSchemaV1.InferOutput<typeof userSchema>
```

## Source Files {#c3-106-source}

| File | Contents |
|------|----------|
| `primitives.ts` | validate(), custom() functions, Promised class |
| `types.ts` | StandardSchemaV1 interface and namespace |

## Testing {#c3-106-testing}

Primary tests: `index.test.ts` - integrated throughout Tag and Flow tests

Key test scenarios:
- Tag value validation with custom schemas
- Flow input/output validation
- custom() schema factory
- StandardSchemaV1 compliance
