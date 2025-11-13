# Remove Duplicate ExecutionContext Creation

**Date:** 2025-11-13
**Status:** Design Phase
**Goal:** Fix bug where Scope.~executeFlow creates two ExecutionContext instances for single Flow execution

## Problem Statement

Current implementation creates TWO ExecutionContext instances for every Flow execution:

1. `executionContext = scope.createExecution()` - standalone ExecutionContext
2. `context = new FlowContext()` - FlowContext extends ExecutionContextImpl

Both are passed to extensions via operation, causing:
- Different `id` values for same execution
- Separate `tagStore` instances (tags stored in two places)
- Separate `details` objects (lifecycle tracked twice)
- Confusing API - which context should extensions use?

## Root Cause

In PR #112 (ExecutionContext extraction), we added `executionContext` field to operations but didn't realize FlowContext ALREADY IS an ExecutionContext (extends ExecutionContextImpl).

**Current code (scope.ts:1224-1264):**
```typescript
// Creates FIRST ExecutionContext
const executionContext = this.createExecution({
  name: definition.name,
  startedAt: Date.now()
});

// Populates tags
if (executionTags) {
  executionTags.forEach(tagged => {
    executionContext.tagStore.set(tagged.key, tagged.value);
  });
}

// Creates SECOND ExecutionContext
const context = new FlowContext(this, this.extensions, executionTags, undefined, abortController);

// Passes BOTH (redundant!)
operation: {
  kind: "execution",
  context: context,              // FlowContext (IS ExecutionContext)
  executionContext: executionContext  // Separate instance
}

// Uses separate instance for lifecycle
executionContext.end();
executionContext.details.error = error;
```

## Solution

Use FlowContext as the single ExecutionContext instance.

### Changes

**1. Remove duplicate creation in scope.ts:**

```typescript
// Before
const executionContext = this.createExecution({...})
if (executionTags) {
  executionTags.forEach(tagged => {
    executionContext.tagStore.set(tagged.key, tagged.value);
  });
}
const context = new FlowContext(...)

// After
const context = new FlowContext(this, this.extensions, executionTags, undefined, abortController);
context.initializeExecutionContext(definition.name, false);
```

**2. Remove executionContext from operation:**

```typescript
// Before
operation: {
  kind: "execution",
  context: context,
  executionContext: executionContext
}

// After
operation: {
  kind: "execution",
  context: context
}
```

**3. Use context for lifecycle management:**

```typescript
// Before
executionContext.end();
executionContext.details.error = error;

// After
context.end();
context.details.error = error;
```

**4. Remove from types (types.ts):**

```typescript
// Extension.ExecutionOperation
export type ExecutionOperation = {
  kind: "execution";
  target: FlowTarget | FnTarget | ParallelTarget;
  input: unknown;
  key?: string;
  context: Tag.Store;
  // executionContext?: ExecutionContext.Context;  ← REMOVE
};

// Flow.Execution
export interface Execution<T> {
  readonly id: string;
  readonly flowName: string | undefined;
  readonly status: ExecutionStatus;
  readonly ctx: ExecutionData | undefined;
  // readonly executionContext: ExecutionContext.Context | undefined;  ← REMOVE
  readonly abort: AbortController;
  // ...
}
```

**5. Remove from FlowExecutionImpl (flow-execution.ts):**

```typescript
// Remove property, constructor parameter, assignment
// readonly executionContext: ExecutionContext.Context | undefined;
```

**6. Remove from ExecutionContextImpl (execution-context.ts:70):**

```typescript
// Before
const operation: Extension.ExecutionOperation = {
  kind: "execution",
  target: { type: "fn" },
  input: undefined,
  key: undefined,
  context: childCtx.tagStore,
  executionContext: childCtx  // ← REMOVE
}

// After
const operation: Extension.ExecutionOperation = {
  kind: "execution",
  target: { type: "fn" },
  input: undefined,
  key: undefined,
  context: childCtx.tagStore
}
```

## Files to Modify

1. `packages/next/src/types.ts` - Remove executionContext from types
2. `packages/next/src/scope.ts` - Remove duplicate creation and usage
3. `packages/next/src/flow-execution.ts` - Remove executionContext property
4. `packages/next/src/execution-context.ts` - Remove executionContext from operation
5. Tests - Verify all 301 tests pass
6. Documentation - Update any references

## Verification

- [ ] All 301 tests passing
- [ ] Typecheck clean (src + tests)
- [ ] Examples typecheck
- [ ] Build successful
- [ ] Single ExecutionContext instance per Flow execution
- [ ] Extensions access context via operation.context only

## Design Validation

**Removes redundancy?** ✓
Single ExecutionContext instance, no duplicate tracking

**Maintains functionality?** ✓
FlowContext provides same ExecutionContext API

**Clear API?** ✓
Extensions use operation.context (Tag.Store interface)

**Backward compatible?** ✓
executionContext field was optional, recently added in PR #112
