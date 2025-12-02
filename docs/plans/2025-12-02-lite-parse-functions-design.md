# Parser Functions for @pumped-fn/lite

**Date:** 2025-12-02
**Status:** Design Complete
**Package:** `@pumped-fn/lite`

## Problem

Currently in `@pumped-fn/lite`:

- **Tag**: No validation - `Tag<T>` requires explicit type parameter
- **Flow**: `ctx.input` is `unknown` - requires manual type assertions

Users want type-safe, validated input without coupling to a specific validation library.

## Solution

Add optional `parse` functions to Tag and Flow that:

1. Validate input at runtime
2. Infer types from parser return type
3. Work with any validation library (Zod, Valibot, manual, etc.)

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Parser timing (Tag) | On creation | Fail fast when `tag(value)` called |
| Parser timing (Flow) | Before factory | Validate input before execution |
| Default value parsing | Skip | Trust developer-provided defaults |
| Sync/async | Tag sync, Flow async allowed | Tags lightweight, flows already async |
| Property name | `parse` for both | Consistent, matches Zod convention |
| Type inference | From parser return | Automatic, no explicit generics needed |
| Error handling | Wrap in ParseError | Adds context (phase, label, cause) |

## API Changes

### Tag with Parse

```typescript
// Without parse - works as before
const userId = tag<string>({ label: 'userId' })

// With parse - T inferred from return type
const userId = tag({
  label: 'userId',
  parse: (raw) => z.string().uuid().parse(raw)
})

// With parse + default - default bypasses parsing
const count = tag({
  label: 'count',
  parse: (raw) => {
    const n = Number(raw)
    if (isNaN(n) || n < 0) throw new Error('Must be non-negative')
    return n
  },
  default: 0
})
```

**Behavior:**
- Parser runs on `tag(value)` call
- Parser is sync only: `(raw: unknown) => T`
- Throws `ParseError` on failure

### Flow with Parse

```typescript
// Without parse - ctx.input is unknown
const myFlow = flow({
  factory: (ctx) => {
    const input = ctx.input as InputType
    return process(input)
  }
})

// With parse - ctx.input typed from parser
const createUser = flow({
  name: 'createUser',
  parse: (raw) => z.object({
    name: z.string(),
    email: z.string().email()
  }).parse(raw),
  factory: (ctx) => {
    ctx.input.name   // string
    ctx.input.email  // string
    return { id: crypto.randomUUID(), ...ctx.input }
  }
})

// With parse + deps
const createUser = flow({
  parse: (raw) => userSchema.parse(raw),
  deps: { db: dbAtom },
  factory: (ctx, { db }) => {
    return db.users.create(ctx.input)
  }
})

// Async parse
const updateUser = flow({
  parse: async (raw) => {
    const data = userSchema.parse(raw)
    if (!await checkUserExists(data.id)) {
      throw new Error('User not found')
    }
    return data
  },
  factory: async (ctx) => { ... }
})
```

**Behavior:**
- Parser runs in `ctx.exec()` before factory
- Parser can be sync or async
- Throws `ParseError` on failure

### Flow Naming

```typescript
// Name on flow definition
const myFlow = flow({
  name: 'createUser',
  parse: (raw) => schema.parse(raw),
  factory: (ctx) => { ... }
})

// Name on execution (higher priority)
await ctx.exec({
  flow: myFlow,
  input: data,
  name: 'adminCreateUser'
})
```

**Label resolution priority:**
1. `exec({ name })` - execution-time
2. `flow({ name })` - definition-time
3. `'anonymous'` - fallback

### ParseError

```typescript
class ParseError extends Error {
  readonly name = 'ParseError'

  constructor(
    message: string,
    readonly phase: 'tag' | 'flow-input',
    readonly label: string,
    readonly cause: unknown
  ) {
    super(message)
  }
}
```

**Example errors:**

```
ParseError: Failed to parse tag "userId"
  phase: 'tag'
  label: 'userId'
  cause: ZodError: Invalid uuid

ParseError: Failed to parse flow input "createUser"
  phase: 'flow-input'
  label: 'createUser'
  cause: ZodError: Expected string, received number
```

## Type Overloads

### Tag

```typescript
// No parse, no default
function tag<T>(options: { label: string }): Tag<T, false>

// No parse, with default
function tag<T>(options: { label: string; default: T }): Tag<T, true>

// With parse, no default
function tag<T>(options: {
  label: string
  parse: (raw: unknown) => T
}): Tag<T, false>

// With parse, with default
function tag<T>(options: {
  label: string
  parse: (raw: unknown) => T
  default: T
}): Tag<T, true>
```

### Flow

```typescript
// No parse, no deps
function flow<TOutput>(config: {
  name?: string
  factory: (ctx: ExecutionContext) => MaybePromise<TOutput>
  tags?: Tagged<unknown>[]
}): Flow<TOutput, unknown>

// With parse, no deps
function flow<TOutput, TInput>(config: {
  name?: string
  parse: (raw: unknown) => MaybePromise<TInput>
  factory: (ctx: ExecutionContext<TInput>) => MaybePromise<TOutput>
  tags?: Tagged<unknown>[]
}): Flow<TOutput, TInput>

// No parse, with deps
function flow<TOutput, D extends Record<string, Dependency>>(config: {
  name?: string
  deps: D
  factory: (ctx: ExecutionContext, deps: InferDeps<D>) => MaybePromise<TOutput>
  tags?: Tagged<unknown>[]
}): Flow<TOutput, unknown>

// With parse, with deps
function flow<TOutput, TInput, D extends Record<string, Dependency>>(config: {
  name?: string
  parse: (raw: unknown) => MaybePromise<TInput>
  deps: D
  factory: (ctx: ExecutionContext<TInput>, deps: InferDeps<D>) => MaybePromise<TOutput>
  tags?: Tagged<unknown>[]
}): Flow<TOutput, TInput>
```

### ExecutionContext

```typescript
interface ExecutionContext<TInput = unknown> {
  readonly input: TInput
  readonly scope: Scope
  exec<T>(options: ExecFlowOptions<T>): Promise<T>
  exec<T, Args extends unknown[]>(options: ExecFnOptions<T, Args>): Promise<T>
  onClose(fn: () => MaybePromise<void>): void
  close(): Promise<void>
}
```

## Implementation Changes

### New Files

| File | Contents |
|------|----------|
| `src/errors.ts` | `ParseError` class |

### Modified Files

| File | Changes |
|------|---------|
| `src/types.ts` | `ExecutionContext<TInput>` generic, `Flow.name?`, `Flow.parse?`, `ExecFlowOptions.name?` |
| `src/tag.ts` | Add `parse` option, call parser in `createTagged()`, throw `ParseError` |
| `src/flow.ts` | Add `name` and `parse` to config, update overloads |
| `src/scope.ts` | Call `flow.parse` before factory, wrap errors in `ParseError` |
| `src/index.ts` | Export `ParseError` |

### C3 Docs to Update

| Doc | Changes |
|-----|---------|
| `.c3/c3-2-lite/c3-203-flow.md` | Add `parse`, `name`, type inference |
| `.c3/c3-2-lite/c3-204-tag.md` | Add `parse`, type inference |
| `.c3/c3-2-lite/README.md` | Update feature table |

### Tests

- Tag with parse: validation on creation, error wrapping
- Tag with parse + default: default bypasses parsing
- Flow with parse: validation before factory, typed ctx.input
- Flow with async parse
- Flow naming priority (exec > flow > anonymous)
- ParseError structure

## Backward Compatibility

Fully backward compatible:

- Existing tags without `parse` work unchanged
- Existing flows without `parse` work unchanged
- `ctx.input` defaults to `unknown` when no parser
