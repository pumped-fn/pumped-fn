# Type Optimization Design

**Date:** 2025-10-31
**Status:** Approved
**Scope:** packages/next type system cleanup

## Problem Statement

Three primary issues with current type organization:

1. **Autocomplete pollution**: `export *` from types.ts exposes ~90+ types cluttering IntelliSense
2. **Pattern duplication**: Inconsistent use of type aliases and promise wrapping patterns
3. **Poor discoverability**: 714-line file without clear organization

## Design Goals

- Reduce public API surface to essential types only
- Eliminate pattern duplication through consistent alias usage
- Improve type file navigability through logical grouping
- Maintain backward compatibility (no breaking changes)
- Optimize for AI assistant context understanding

## Key Decisions

### Decision 1: Keep Single File Structure

**Rationale:** Types are highly interconnected (Tag, Scope, Promised used everywhere). Splitting would create artificial boundaries and hurt AI context retrieval.

**Alternative Considered:** Split by namespace (core-types.ts, flow-types.ts, etc.)
**Rejected Because:** Related concepts scattered, more imports needed, harder for AI to load complete context

### Decision 2: Explicit Exports Only

**Current:**
```typescript
export * from "./types";
```

**New:**
```typescript
export type {
  Core,
  Flow,
  Extension,
  Multi,
  StandardSchemaV1,
  Promised,
} from "./types";

export * as errors from "./errors";
```

**Impact:** Autocomplete shows 6 namespaces instead of 90+ individual types

### Decision 3: Consistent Type Aliases

Add and use aliases consistently:

```typescript
namespace Core {
  export type UExecutor = BaseExecutor<unknown>;
  export type AnyExecutor = Executor<unknown>;
}

namespace Flow {
  export type UFlow = Core.Executor<Handler<any, any>>;
  export type UHandler = Handler<any, any>;
}
```

**Replacements:**
- 13 `Executor<unknown>` → `Core.AnyExecutor`
- 6 `BaseExecutor<unknown>` → `Core.UExecutor`
- Multiple `Handler<any, any>` → `Flow.UHandler`

### Decision 4: Standardize Promise Wrapping

Use `Promised<T>` consistently (already defined as `T | Promise<T>`):

**Before:**
```typescript
init?(scope: Core.Scope): void | Promise<void> | Promised<void>;
```

**After:**
```typescript
init?(scope: Core.Scope): Promised<void>;
```

**Impact:** ~9 locations simplified

### Decision 5: Minimal Callback Consolidation

Keep distinct callback types (ChangeCallback, ReleaseCallback, ErrorCallback) for semantic clarity.

Only consolidate error union:

```typescript
type ExecutorError =
  | ExecutorResolutionError
  | FactoryExecutionError
  | DependencyResolutionError;

export type ErrorCallback<T = unknown> = (
  error: ExecutorError,
  executor: Executor<T>,
  scope: Scope
) => Promised<void>;
```

**Alternative Considered:** Generic `Callback<Event, Args>` pattern
**Rejected Because:** Obscures semantic meaning, worse IntelliSense

### Decision 6: Logical Grouping Without Comments

Organize types.ts in logical order:

1. Symbols (executorSymbol)
2. Foundation (StandardSchemaV1, SchemaError)
3. Error infrastructure (ErrorContext, error classes)
4. Core namespace (execution primitives)
5. Flow namespace (short-span execution)
6. Extension namespace (scope extensions)
7. Multi namespace (multi-instance executors)
8. Re-exports (Tag)

No section comments - structure is self-documenting.

## Implementation Changes

### Files Modified

1. `packages/next/src/types.ts`
   - Add type aliases (AnyExecutor, UHandler)
   - Replace all duplicate patterns with aliases
   - Standardize to Promised<T>
   - Reorder into logical groups
   - Create ExecutorError union

2. `packages/next/src/index.ts`
   - Replace `export *` with explicit exports
   - Keep errors export as-is

3. Other implementation files (executor.ts, flow.ts, scope.ts, etc.)
   - Update imports to use new aliases where beneficial

### Verification Steps

1. Typecheck source: `pnpm -F @pumped-fn/core-next typecheck`
2. Typecheck tests: `pnpm -F @pumped-fn/core-next typecheck:full`
3. Run tests: `pnpm -F @pumped-fn/core-next test`
4. Typecheck examples: `pnpm -F @pumped-fn/examples typecheck`
5. Build: `pnpm -F @pumped-fn/core-next build`

## Expected Outcomes

- **Autocomplete**: 6 namespace exports vs 90+ individual types
- **Consistency**: Single pattern for executors, promises, errors
- **Maintainability**: Clear grouping, easier navigation
- **AI-friendly**: All context in one file, predictable patterns
- **No breaking changes**: Namespaces still expose same members

## Metrics

**Before:**
- Public exports: ~90+ types
- `Executor<unknown>`: 13 occurrences
- `BaseExecutor<unknown>`: 6 occurrences
- Mixed promise patterns: 9 locations
- File size: 714 lines

**After:**
- Public exports: 6 namespaces + Promised
- `Core.AnyExecutor`: replaces Executor<unknown>
- `Core.UExecutor`: replaces BaseExecutor<unknown>
- Consistent `Promised<T>`: all locations
- File size: ~720 lines (aliases add minimal overhead)
