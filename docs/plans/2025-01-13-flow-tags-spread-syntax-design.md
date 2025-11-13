# Flow Tags Spread Syntax Design

## Overview

Add spread tag syntax to `flow()` to match `provide()`/`derive()` API pattern, enabling tags to be passed as rest parameters instead of only via config object.

## Motivation

Current API requires config object for tags:
```typescript
const myFlow = flow({ input: z.number(), output: z.string(), tags: [tag1, tag2] }, handler)
```

Shorthand forms don't support tags:
```typescript
const myFlow = flow(handler) // no way to add tags
const myFlow = flow([deps], handler) // no way to add tags
```

Desired API matches `provide()/derive()`:
```typescript
const myFlow = flow(handler, tag1, tag2)
const myFlow = flow([deps], handler, tag1, tag2)
```

## API Changes

### New Overloads (3 total)

```typescript
// Handler + tags
flow<I, S>(
  handler: (ctx: Flow.Context, input: I) => Promise<S> | S,
  ...tags: Tag.Tagged[]
): Flow.Flow<I, S>

// Void input handler + tags
flow<I extends void, S>(
  handler: (ctx?: Flow.Context) => Promise<S> | S,
  ...tags: Tag.Tagged[]
): Flow.Flow<I, S>

// Dependencies + handler + tags
flow<D extends Core.DependencyLike, I, S>(
  dependencies: D,
  handler: (deps: Core.InferOutput<D>, ctx: Flow.Context, input: I) => Promise<S> | S,
  ...tags: Tag.Tagged[]
): Flow.Flow<I, S>
```

### Config Form (Unchanged)

Config object form keeps tags property, does NOT accept spread tags:
```typescript
flow({ input, output, tags: [tag1, tag2] }, handler)
flow({ input, output, tags: [tag1, tag2] }, deps, handler)
```

## Implementation

### Tag Validation

Add `isTagged()` to `tag-executors.ts`:
```typescript
export function isTagged(input: unknown): input is Tag.Tagged {
  return (
    typeof input === "object" &&
    input !== null &&
    tagSymbol in input &&
    input[tagSymbol] === true &&
    "key" in input &&
    typeof input.key === "symbol" &&
    "value" in input
  );
}
```

### Implementation Flow

1. Modify `flowImpl` signature to accept `...rest: Tag.Tagged[]`
2. Validate rest params using `isTagged()` guard
3. Pass validated tags to `define({ tags })`
4. Existing machinery propagates: `define()` → `FlowDefinition` → `createExecutor()` → `executor.tags`

### Runtime Parsing

```typescript
function flowImpl(...args: any[]): any {
  // Extract rest params (potential tags)
  const rest = extractRestParams(args)

  // Validate tags
  for (const item of rest) {
    if (!isTagged(item)) {
      throw new Error('Invalid tag: all spread parameters must be Tag.Tagged values')
    }
  }

  // Pass to define()
  const def = define({ input: custom<I>(), output: custom<S>(), tags: rest })

  // Existing logic...
}
```

## Tag Propagation Path

```
flow(handler, tag1, tag2)
  ↓
define({ tags: [tag1, tag2] })
  ↓
new FlowDefinition(tags)
  ↓
FlowDefinition.handler() → createExecutor(factory, deps, [...this.tags, flowDefinitionMeta(this)])
  ↓
executor.tags = [tag1, tag2, flowDefinitionMeta]
```

## Testing

Single test confirms tags attached and extractable:
```typescript
test('flow() accepts spread tags', () => {
  const t1 = tag(custom<string>(), { label: 't1' })
  const t2 = tag(custom<number>(), { label: 't2' })

  const f = flow(() => 'x', t1('a'), t2(1))

  expect(t1.readFrom(f)).toBe('a')
  expect(t2.readFrom(f)).toBe(1)
})
```

Existing flow tests verify backward compatibility.

## Backward Compatibility

100% preserved. All existing calls work unchanged:
- `flow(handler)` - empty rest params, works as before
- `flow(deps, handler)` - empty rest params, works as before
- `flow({ input, output, tags }, handler)` - unchanged, config tags only

## Files Affected

- `packages/next/src/flow.ts` - add overloads, modify implementation
- `packages/next/src/tag-executors.ts` - add `isTagged()` validator
- `packages/next/tests/flow-execution.test.ts` - add tag attachment test
- `packages/next/tests/` - verify existing tests pass
- `examples/` - optional: add examples using new syntax
- `docs/guides/` - optional: update flow documentation
- `.claude/skills/pumped-design/references/` - update skill references

## Success Criteria

1. TypeScript compiles without errors
2. All existing tests pass
3. New test confirms tags attached via spread syntax
4. Tags extractable via `myTag.readFrom(executor)`
5. `provide()/derive()/flow()` have consistent tag API
