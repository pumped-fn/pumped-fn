---
id: ADR-005-parser-functions
title: Parser Functions for Type-Safe Input/Output Validation
summary: >
  Add parser functions to Flow and Tag for library-agnostic validation with
  full TypeScript type inference. TInput/TOutput inferred from parser return types.
status: proposed
date: 2025-11-28
---

# [ADR-005] Parser Functions for Type-Safe Input/Output Validation

## Status {#adr-005-status}
**Proposed** - 2025-11-28

## Problem/Requirement {#adr-005-problem}

Users want validated, type-safe input/output for flows and tags, but:

1. Lite package must remain library-agnostic (no Zod, Valibot, etc. dependencies)
2. Different projects use different validation libraries with incompatible APIs
3. Currently `ctx.input` is `unknown` requiring manual type assertions
4. No way to validate tag values at creation time

**Goal:** Provide parser functions that:
- Enable any validation library via simple function wrapper
- Infer `TInput`/`TOutput` types from parser return types (DX priority)
- Wrap errors with context about where parsing failed

## Exploration Journey {#adr-005-exploration}

**Initial hypothesis:** Add schema metadata slots for extension-based validation.

**Explored:**

- **tRPC approach:** Supports both parser functions `(val: unknown) => T` and schema objects. Type inference comes from parser return type. Very flexible.

- **Schema slots approach:** Adding `inputSchema?: unknown` requires module augmentation for types - awkward DX, no automatic inference.

- **Parser function approach:** `input: (raw) => schema.parse(raw)` - TypeScript infers `TInput` from return type automatically. Zero coupling to any library.

**Discovered:**

1. Parser functions give automatic type inference - best DX
2. tRPC validates this pattern works at scale with multiple libraries
3. Parsing should be first-class (not extension-only) for proper error context
4. Tags and Flows both benefit from this pattern

**Key decisions made:**

| Topic | Decision | Rationale |
|-------|----------|-----------|
| Tag parse | Sync only | Tags are lightweight, sync keeps them simple |
| Flow parse | Async supported | Flows already async, may need I/O for validation |
| Default + parse | Skip parse on default | Trust defaultValue is valid, avoid redundant work |
| Output validation | Yes for flows | Symmetric API, validates contract |
| Error wrapping | Yes | Know where parsing failed (input vs output, which flow/tag) |

## Solution {#adr-005-solution}

### Type Inference Pattern

The core insight: TypeScript infers generic types from function return types.

```typescript
function flow<TOutput, TInput = unknown>(config: {
  input?: (raw: unknown) => MaybePromise<TInput>,  // TInput inferred here
  output?: (result: TOutput) => MaybePromise<TOutput>,
  factory: (ctx: ExecutionContext<TInput>) => MaybePromise<TOutput>
}): Flow<TOutput, TInput>
```

When user writes:
```typescript
const myFlow = flow({
  input: (raw) => z.object({ name: z.string() }).parse(raw),
  //              ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  //              Returns { name: string } → TInput = { name: string }
  factory: (ctx) => {
    ctx.input.name  // ✓ Typed as string!
  }
})
```

### Flow API

```typescript
interface FlowConfig<TOutput, TInput, D> {
  input?: (raw: unknown) => MaybePromise<TInput>
  output?: (result: TOutput) => MaybePromise<TOutput>
  deps?: D
  factory: FlowFactory<TOutput, TInput, D>
  tags?: Tagged<unknown>[]
}

interface Flow<TOutput, TInput = unknown> {
  readonly [flowSymbol]: true
  readonly input?: (raw: unknown) => MaybePromise<TInput>
  readonly output?: (result: TOutput) => MaybePromise<TOutput>
  readonly factory: FlowFactory<TOutput, TInput, Record<string, Dependency>>
  readonly deps?: Record<string, Dependency>
  readonly tags?: Tagged<unknown>[]
}

interface ExecutionContext<TInput = unknown> {
  readonly input: TInput  // Now typed!
  readonly scope: Scope
  exec<T>(options: ExecFlowOptions<T>): Promise<T>
  exec<T, Args extends unknown[]>(options: ExecFnOptions<T, Args>): Promise<T>
  onClose(fn: () => MaybePromise<void>): void
  close(): Promise<void>
}
```

**Usage examples:**

```typescript
// With Zod
const createUser = flow({
  input: (raw) => z.object({
    name: z.string(),
    email: z.string().email()
  }).parse(raw),
  output: (result) => z.object({
    id: z.string().uuid()
  }).parse(result),
  factory: async (ctx) => {
    // ctx.input is { name: string; email: string }
    return { id: crypto.randomUUID() }
  }
})

// With Valibot
const getUser = flow({
  input: (raw) => v.parse(v.string(), raw),
  factory: async (ctx) => {
    // ctx.input is string
    return db.users.find(ctx.input)
  }
})

// With manual validation
const processOrder = flow({
  input: (raw) => {
    if (typeof raw !== 'object' || raw === null) {
      throw new Error('Expected object')
    }
    const obj = raw as Record<string, unknown>
    if (typeof obj.orderId !== 'string') {
      throw new Error('orderId must be string')
    }
    return { orderId: obj.orderId }
  },
  factory: (ctx) => {
    // ctx.input is { orderId: string }
    return processOrder(ctx.input.orderId)
  }
})

// Async validation (e.g., check exists in DB)
const updateUser = flow({
  input: async (raw) => {
    const data = userSchema.parse(raw)
    const exists = await db.users.exists(data.id)
    if (!exists) throw new Error('User not found')
    return data
  },
  factory: async (ctx) => {
    return db.users.update(ctx.input)
  }
})
```

### Tag API

```typescript
interface TagConfig<T, HasDefault extends boolean = false> {
  label: string
  parse?: (raw: unknown) => T  // Sync only
  defaultValue?: T
}

interface Tag<T, HasDefault extends boolean = false> {
  readonly [tagSymbol]: true
  readonly key: symbol
  readonly label: string
  readonly parse?: (raw: unknown) => T
  readonly defaultValue: HasDefault extends true ? T : undefined
  readonly hasDefault: HasDefault
  (value: T): Tagged<T>  // When parse exists, validates here
  // ... existing methods
}
```

**Usage examples:**

```typescript
// With Zod
const userIdTag = tag({
  label: 'userId',
  parse: (raw) => z.string().uuid().parse(raw)
})

userIdTag('123e4567-e89b-12d3-a456-426614174000')  // ✓ Valid UUID
userIdTag('not-a-uuid')  // Throws ParseError

// With default (not parsed)
const configTag = tag({
  label: 'config',
  parse: (raw) => configSchema.parse(raw),
  defaultValue: { timeout: 5000 }  // Trusted, not parsed
})

// Manual validation
const countTag = tag({
  label: 'count',
  parse: (raw) => {
    const n = Number(raw)
    if (isNaN(n) || n < 0) throw new Error('Must be non-negative number')
    return n
  }
})
```

### Error Wrapping

Wrap parsing errors with context:

```typescript
class ParseError extends Error {
  constructor(
    message: string,
    readonly context: {
      phase: 'input' | 'output' | 'tag'
      label?: string  // Flow name or tag label
      cause: unknown  // Original error
    }
  ) {
    super(message)
    this.name = 'ParseError'
  }
}
```

**Error messages:**

```
ParseError: Failed to parse input for flow
  Phase: input
  Cause: Expected string, received number

ParseError: Failed to parse output for flow
  Phase: output
  Cause: Missing required field: id

ParseError: Failed to parse value for tag "userId"
  Phase: tag
  Label: userId
  Cause: Invalid UUID format
```

### Execution Flow

**For flows (in `ctx.exec`):**

```
1. Receive raw input
2. If flow.input exists:
   a. Call flow.input(rawInput)
   b. On error: throw ParseError { phase: 'input', cause: error }
   c. Set ctx._input = parsed result
3. Else: ctx._input = rawInput (unknown)
4. Run extensions (wrapExec)
5. Call factory(ctx, deps)
6. If flow.output exists:
   a. Call flow.output(result)
   b. On error: throw ParseError { phase: 'output', cause: error }
   c. Return parsed result
7. Else: return result as-is
```

**For tags (in tag call):**

```
1. User calls tag(value)
2. If tag.parse exists:
   a. Call tag.parse(value)
   b. On error: throw ParseError { phase: 'tag', label: tag.label, cause: error }
   c. Return Tagged with parsed value
3. Else: return Tagged with raw value
```

## Changes Across Layers {#adr-005-changes}

### Context Level
- No changes (internal to lite package)

### Container Level (c3-2)
- [c3-2](../c3-2-lite/README.md): Update comparison table - "Parser functions | Yes"
- [c3-2](../c3-2-lite/README.md#c3-2-api): Document `ParseError` class

### Component Level

#### c3-203 Flow
- [c3-203 Concepts](../c3-2-lite/c3-203-flow.md#c3-203-concepts): Add `input`/`output` parser properties
- [c3-203 Creating](../c3-2-lite/c3-203-flow.md#c3-203-creating): Add parser examples
- [c3-203 Types](../c3-2-lite/c3-203-flow.md#c3-203-types): Document type inference from parsers
- [c3-203 Executing](../c3-2-lite/c3-203-flow.md#c3-203-executing): Document parse execution order

#### c3-204 Tag
- [c3-204 Concepts](../c3-2-lite/c3-204-tag.md#c3-204-concepts): Add `parse` property
- [c3-204 Creating](../c3-2-lite/c3-204-tag.md#c3-204-creating): Add parse examples
- [c3-204 Types](../c3-2-lite/c3-204-tag.md#c3-204-types): Document type inference

### Source Files

| File | Changes |
|------|---------|
| `src/types.ts` | Add `input`/`output` to `Flow`, update `ExecutionContext<TInput>`, add `ParseError` |
| `src/flow.ts` | Add parser properties to `FlowConfig`, update overloads for type inference |
| `src/tag.ts` | Add `parse` to `TagConfig`, call parser in tag invocation |
| `src/scope.ts` | Call flow parsers in `execFlow`, wrap errors in `ParseError` |
| `src/errors.ts` | New file: `ParseError` class |
| `tests/flow.test.ts` | Parser tests, type inference tests, error wrapping tests |
| `tests/tag.test.ts` | Parser tests, error wrapping tests |

## Verification {#adr-005-verification}

### Type Inference
- [ ] `TInput` inferred from `input` parser return type
- [ ] `TOutput` inferred from `output` parser return type (or factory return)
- [ ] `ctx.input` typed as `TInput` in factory
- [ ] Tag value type inferred from `parse` return type
- [ ] No type errors in examples with Zod/Valibot patterns

### Runtime Behavior
- [ ] Flow `input` parser called before factory
- [ ] Flow `output` parser called after factory
- [ ] Tag `parse` called when creating tagged value
- [ ] Tag `defaultValue` NOT parsed
- [ ] Flow parsers support async (`MaybePromise`)
- [ ] Tag parsers sync only

### Error Handling
- [ ] `ParseError` thrown with phase context
- [ ] Original error preserved as `cause`
- [ ] Tag label included in tag parse errors
- [ ] Errors distinguishable (input vs output vs tag)

### Existing Behavior
- [ ] Flows without parsers work as before (`ctx.input` is `unknown`)
- [ ] Tags without parsers work as before
- [ ] All existing tests pass
- [ ] Typecheck passes: `pnpm -F @pumped-fn/lite typecheck`

## Related {#adr-005-related}

- [c3-203](../c3-2-lite/c3-203-flow.md) - Flow component (primary change)
- [c3-204](../c3-2-lite/c3-204-tag.md) - Tag component (parse addition)
- [c3-2](../c3-2-lite/README.md) - Lite container
- [c3-106](../c3-1-core/c3-106-schema.md) - Core's StandardSchema (contrast - we use simpler pattern)
- [ADR-002](./adr-002-lightweight-lite-package.md) - Lite package design principles
- [tRPC validators](https://trpc.io/docs/server/validators) - Inspiration for parser function pattern
