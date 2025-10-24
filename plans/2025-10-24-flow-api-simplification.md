# Flow API Simplification

**Date:** 2025-10-24
**Status:** Design

## Problem

Too many ways to create flows creates maintenance burden and user confusion. Current API has ~10+ overload signatures with overlapping patterns that make the library impractical to use and extend.

## Solution

Reduce to 2 clear patterns based on use case:

1. **Schema-based** (RPC/isomorphic) - explicit input/output schemas
2. **Inference-based** (simple cases) - infer types from handler

## Final API

### Schema-based (explicit schemas for RPC)

```typescript
// Two-step: reusable definition
const def = flow({ name?, input, output, tags? })
const handler1 = def.handler((ctx, input) => {})
const handler2 = def.handler(deps, (deps, ctx, input) => {})

// One-step: direct use
const handler = flow({ name?, input, output, tags? }, (ctx, input) => {})
const handler = flow({ name?, input, output, tags? }, deps, (deps, ctx, input) => {})
```

### Inference-based (no schemas)

```typescript
const handler = flow((ctx, input) => {})
const handler = flow(deps, (deps, ctx, input) => {})
```

## Type Signatures

```typescript
// Schema-based
function flow<S, I>(
  config: DefineConfig<S, I>
): FlowDefinition<S, I>

function flow<S, I>(
  config: DefineConfig<S, I>,
  handler: (ctx: Flow.Context, input: I) => Promise<S> | S
): Flow.Flow<I, S>

function flow<S, I, D extends Core.DependencyLike>(
  config: DefineConfig<S, I>,
  dependencies: D,
  handler: (deps: Core.InferOutput<D>, ctx: Flow.Context, input: I) => Promise<S> | S
): Flow.Flow<I, S>

// Inference-based
function flow<I, S>(
  handler: (ctx: Flow.Context, input: I) => Promise<S> | S
): Flow.Flow<I, S>

function flow<D extends Core.DependencyLike, I, S>(
  dependencies: D,
  handler: (deps: Core.InferOutput<D>, ctx: Flow.Context, input: I) => Promise<S> | S
): Flow.Flow<I, S>
```

Where:
```typescript
type DefineConfig<S, I> = {
  name?: string
  version?: string
  input: StandardSchemaV1<I>
  output: StandardSchemaV1<S>
  tags?: Tag.Tagged[]
}
```

## Discrimination Logic

Use `isExecutor()` and type checks for precise pattern detection:

```typescript
if (typeof first === 'function') {
  // flow(handler) - inference-based, no deps
} else if (isExecutor(first)) {
  // flow(deps, handler) - inference-based, with deps
} else if (typeof first === 'object') {
  // Config object - schema-based
  if (!second) {
    // flow(config) -> Definition
  } else if (typeof second === 'function') {
    // flow(config, handler)
  } else if (isExecutor(second)) {
    // flow(config, deps, handler)
  }
}
```

## Removals

1. **`flow.define()` method** - replaced by `flow(config)` returning Definition
2. **Config-with-handler objects** - `flow({ name, handler })` pattern removed
3. **Partial/mixed patterns** - all inference variants on schema configs removed
4. **~8-10 overload signatures** - reduced to 5 clear overloads

## Migration Guide

### Before → After

```typescript
// flow.define() pattern
const def = flow.define({ name: 'getUser', input: z.string(), output: userSchema })
const handler = def.handler((ctx, id) => { ... })

// ✅ After: same semantics, different syntax
const def = flow({ name: 'getUser', input: z.string(), output: userSchema })
const handler = def.handler((ctx, id) => { ... })
```

```typescript
// Config object with handler property
const handler = flow({
  name: 'getUser',
  input: z.string(),
  output: userSchema,
  handler: (ctx, id) => { ... }
})

// ✅ After: split into separate arguments
const handler = flow(
  { name: 'getUser', input: z.string(), output: userSchema },
  (ctx, id) => { ... }
)
```

```typescript
// Config object with inference
const handler = flow({
  name: 'getUser',
  handler: (ctx, id: string) => { ... }
})

// ✅ After: use inference-based pattern (drop name if not needed for debugging)
const handler = flow((ctx, id: string) => { ... })

// Or if name is important, use schema-based with custom<T>()
const handler = flow(
  { name: 'getUser', input: custom<string>(), output: custom<User>() },
  (ctx, id) => { ... }
)
```

## Deprecation Timeline

**v0.6.0** (this release):
- New API available
- Old patterns still work (backward compatible where possible)
- Console warnings for flow.define() usage

**v0.7.0** (next minor):
- Remove flow.define() method
- Remove config-with-handler patterns
- Breaking change release

## Implementation Tasks

1. Update `flow()` implementation in `packages/next/src/flow.ts`
   - Remove all config-with-handler overloads
   - Remove partial inference patterns
   - Implement discrimination logic using `isExecutor()`
   - Keep FlowDefinition class, adjust integration

2. Update tests in `packages/next/tests/`
   - `flow-expected.test.ts` - update all patterns
   - `flow-type-inference.test.ts` - verify type inference still works
   - Add new tests for discrimination edge cases

3. Update examples in `examples/`
   - Most examples use inference pattern - minimal changes
   - Update `basic-handler.ts` if using config patterns

4. Update docs in `docs/guides/`
   - `05-flow.md` - update all examples
   - Remove references to `flow.define()`
   - Add migration guide section

5. Update skill in `claude-skill/skills/pumped-fn-typescript/SKILL.md`
   - Update all flow creation examples
   - Document the 2 clear patterns
   - Add anti-pattern warnings for old patterns

## Benefits

1. **Clarity:** Only 2 patterns - schema-based or inference-based
2. **Maintainability:** Fewer overloads, clearer implementation
3. **Practicality:** Obvious which pattern to use based on use case
4. **RPC-ready:** Schema-based pattern naturally supports isomorphic types
5. **Simple cases simple:** Inference pattern for quick flows without ceremony

## Risks

1. **Breaking change:** Removes `flow.define()` and config-with-handler patterns
2. **Migration effort:** All existing code using removed patterns must migrate
3. **Type inference complexity:** Must ensure inference still works correctly

**Mitigation:** Provide clear migration guide, deprecation warnings if possible
