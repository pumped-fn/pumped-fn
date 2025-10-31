# Flow Extension Wrapping Fix Design

## Problem

Extensions registered on a scope via `scope.useExtension()` are not wrapping flow execution operations when calling `flow.execute(flow, input, { scope })`.

Current behavior shows only `options.extensions` are used, completely ignoring scope's registered extensions. This breaks the expected behavior where scope extensions should automatically apply to all operations within that scope, including flow execution.

## Root Cause

`flow.execute()` in `flow.ts:592-721` bypasses the scope delegation pattern:
- Creates `FlowContext` directly with only `options?.extensions || []` (line 641)
- Uses standalone `wrapWithExtensions()` function with only `options?.extensions` (lines 673-687)
- Never reads or uses `scope.extensions` even when scope is provided

The architecture principle is violated: scope is the low-level primitive managing extensions, but flow execution doesn't respect scope's extensions.

## Solution Architecture

### Single Entry Point Pattern

Establish `scope.exec()` as the authoritative entry point for all flow execution:
- `scope.exec()` executes flows using scope's extensions
- `flow.execute()` becomes pure convenience - delegates to scope
- No extension merging needed - use scope's extensions OR provide explicit extensions, not both

### Options Design

Enforce mutually exclusive options via discriminated union:

```typescript
// Option 1: Use existing scope
{
  scope: Core.Scope;
  executionTags?: Tag.Tagged[];  // per-execution tags
  details?: boolean;
}

// Option 2: Create temporary scope
Omit<ScopeOption, 'tags'> & {
  scopeTags?: Tag.Tagged[];      // scope creation tags
  executionTags?: Tag.Tagged[];  // per-execution tags
  details?: boolean;
}
```

**Tag semantics:**
- `scopeTags`: Tags attached to created scope (only when creating scope)
- `executionTags`: Tags attached to this flow execution (always available)

### Implementation Strategy

1. **When scope provided**: Delegate to `scope.exec(flow, input, { tags: executionTags, details })`
2. **When no scope**: Create scope with `createScope({ ...options, tags: scopeTags })`, then call `scope.exec(flow, input, { tags: executionTags, details })`

Result: Extensions from scope automatically wrap all flow operations without any merging logic.

## Changes Required

### 1. `flow.ts` - Update `execute()` signature

Remove current mixed options, replace with discriminated union:

```typescript
function execute<S, I>(
  flow: Core.Executor<Flow.Handler<S, I>> | Flow.Flow<I, S>,
  input: I,
  options?:
    | {
        scope: Core.Scope;
        executionTags?: Tag.Tagged[];
        details?: boolean;
      }
    | (Omit<ScopeOption, 'tags'> & {
        scopeTags?: Tag.Tagged[];
        executionTags?: Tag.Tagged[];
        details?: boolean;
      })
): Promised<S> | Promised<Flow.ExecutionDetails<S>>
```

### 2. `flow.ts` - Update `execute()` implementation

Replace direct flow execution with delegation:

```typescript
function execute<S, I>(...) {
  if (options && 'scope' in options) {
    return options.scope.exec(flow, input, {
      tags: options.executionTags,
      details: options.details
    });
  }

  const scope = options
    ? createScope({
        initialValues: options.initialValues,
        registry: options.registry,
        extensions: options.extensions,
        tags: options.scopeTags
      })
    : createScope();

  const shouldDisposeScope = true;

  const result = scope.exec(flow, input, {
    tags: options?.executionTags,
    details: options?.details
  });

  if (shouldDisposeScope) {
    return result.finally(() => scope.dispose());
  }

  return result;
}
```

### 3. `scope.ts` - Update `exec()` signature

Accept `executionTags` instead of overloading `tags`:

```typescript
exec<S, I = undefined>(
  flow: Core.Executor<Flow.Handler<S, I>>,
  input?: I,
  options?: {
    tags?: Tag.Tagged[];  // execution tags
    details?: boolean;
  }
): Promised<S>;

exec<S, I = undefined>(
  flow: Core.Executor<Flow.Handler<S, I>>,
  input: I | undefined,
  options: {
    tags?: Tag.Tagged[];  // execution tags
    details: true;
  }
): Promised<Flow.ExecutionDetails<S>>;
```

### 4. `scope.ts` - Update `exec()` implementation

Remove current delegation to `flowApi.execute()`, implement direct execution using scope's extensions:

```typescript
exec<S, I = undefined>(...) {
  this["~ensureNotDisposed"]();

  // Direct implementation using this.extensions
  // Will use existing FlowContext and wrapWithExtensions logic
  // but with this.extensions instead of options.extensions
}
```

### 5. Remove deprecated parameters

Remove `initialContext` and `scopeTags` from `flow.execute()` current options (they were carrying over unused baggage).

## Testing Strategy

Add tests to verify:
1. Scope extensions wrap flow execution (kind: 'execute')
2. Scope extensions wrap ctx.exec operations (kind: 'subflow')
3. Scope extensions wrap ctx.run operations (kind: 'journal')
4. executionTags are available in extension operations
5. scopeTags are attached to created scope
6. Temporary scope is properly disposed after execution

## Benefits

1. **Correct behavior**: Scope extensions now properly wrap flow operations
2. **Simpler mental model**: One entry point (scope.exec), clear delegation
3. **No merging logic**: Use scope's extensions OR provide explicit extensions
4. **Clear tag semantics**: scopeTags vs executionTags distinction
5. **Type safety**: Discriminated union prevents invalid option combinations

## Migration Impact

Breaking change for callers mixing `{ scope, extensions }`:
- Before: `flow.execute(f, input, { scope, extensions })` (extensions ignored)
- After: Type error - must choose scope OR extensions

This is correct behavior - if providing scope, use its extensions. If need different extensions, create new scope with those extensions.
