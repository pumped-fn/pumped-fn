# Extension Test Comprehensive Coverage Design

## Problem

### Test Issues

Current extension tests in `flow-extension-fix.test.ts` have issues:
- **Not compact**: Repetitive test setup, separate tests for each operation type
- **Incomplete coverage**: Only tests 3 operation kinds (execute, subflow, journal), missing resolve and parallel operations
- **Insufficient detail**: Only captures `operation.kind` as strings, doesn't verify full operation metadata
- **Missing wrapping order tests**: Doesn't demonstrate how multiple extensions nest and execute in order

### Implementation Issues

The `exec` implementation in both `FlowContext` and `Scope` has severe duplication and clarity problems:

**FlowContext.exec (flow.ts:295-547):**
- Duplicated timeout/AbortController setup across all branches
- Duplicated journal key creation and replay logic
- Deep nested branching: config object → flow vs fn → with key vs without key
- Duplicated child context creation in multiple paths
- Hard to follow which code path executes for which overload

**Scope.exec (scope.ts:1087-1178) and ~executeFlow (scope.ts:1180-1240):**
- Similar timeout/abort duplication
- Extension wrapping logic duplicated
- Flow execution logic split across methods

**Impact on code review:**
- Hard to verify extension wrapping applies correctly
- Difficult to trace execution paths
- Easy to miss edge cases during review

## Solution Architecture

### Table-Driven Testing with Snapshots

Use vitest's `test.each()` to run multiple scenarios with full operation capture and snapshot assertions:

**Core components:**
1. **OperationTracker extension** - Captures complete operation objects (not just kind)
2. **Test scenarios array** - Each scenario exercises different operation types
3. **Snapshot assertions** - Verify exact operation structure and order

**Benefits:**
- Compact: All scenarios in one test.each() block
- Comprehensive: Easy to add new scenarios for missing operations
- Clear: Snapshots show exact structure without manual maintenance
- Catches regressions: Any operation structure change fails tests

## Test Scenarios

### Operation Coverage

Test all operation kinds that go through extensions:

```typescript
test.each([
  {
    name: "flow execution",
    operations: ["execute"],
    flow: (ctx, input: number) => input * 2
  },
  {
    name: "subflow execution",
    operations: ["execute", "subflow"],
    flow: async (ctx, input: number) => {
      const child = flow((_, x: number) => x + 1);
      return await ctx.exec(child, input);
    }
  },
  {
    name: "journaled fn execution",
    operations: ["execute", "journal"],
    flow: async (ctx, input: number) => {
      return await ctx.exec({fn: () => input * 2, key: "double"});
    }
  },
  {
    name: "non-journaled fn execution (no extension)",
    operations: ["execute"], // fn without key doesn't trigger extensions
    flow: async (ctx, input: number) => {
      return await ctx.exec({fn: () => input * 2}); // no key = no journal operation
    }
  },
  {
    name: "parallel execution",
    operations: ["execute", "parallel"],
    flow: async (ctx, input: number) => {
      return await ctx.parallel([Promise.resolve(1), Promise.resolve(2)]);
    }
  }
])
```

**Critical distinction - ctx.exec behavior:**
- `ctx.exec(flow, input)` → triggers subflow operation (goes through extensions)
- `ctx.exec({flow, input, key})` → triggers journal operation (goes through extensions)
- `ctx.exec({fn, key})` → triggers journal operation (goes through extensions)
- `ctx.exec({fn})` → **NO operation** (does NOT go through extensions when key is missing)

### Extension Wrapping Order

Test with multiple extensions to verify nesting order:

```typescript
const ext1 = extension({
  name: "outer",
  wrap: (scope, next, operation) => {
    operations.push({...operation, wrapper: "outer-before"});
    const result = next();
    operations.push({...operation, wrapper: "outer-after"});
    return result;
  }
});

const ext2 = extension({
  name: "inner",
  wrap: (scope, next, operation) => {
    operations.push({...operation, wrapper: "inner-before"});
    const result = next();
    operations.push({...operation, wrapper: "inner-after"});
    return result;
  }
});

const scope = createScope({extensions: [ext1, ext2]});
```

**Expected operation trace:**
```javascript
[
  {kind: "execute", wrapper: "outer-before", /* ...metadata */},
  {kind: "execute", wrapper: "inner-before", /* ...metadata */},
  // actual execution happens here
  {kind: "execute", wrapper: "inner-after", /* ...metadata */},
  {kind: "execute", wrapper: "outer-after", /* ...metadata */}
]
```

**Demonstrates:**
- Extensions wrap in array order (first extension wraps second)
- Execution flows: outer-before → inner-before → core → inner-after → outer-after
- Full operation metadata captured at each wrapping layer

## Implementation Details

### OperationTracker Extension

```typescript
const createOperationTracker = () => {
  const operations: Extension.Operation[] = [];

  const extension = extension({
    name: "operation-tracker",
    wrap: (scope, next, operation) => {
      operations.push({...operation}); // capture full operation object
      return next();
    }
  });

  return { extension, operations };
};
```

### Snapshot Testing Strategy

- Capture operation objects with all metadata fields
- Use vitest's `toMatchInlineSnapshot()` for inline visibility
- Snapshots show: kind, flow names, depth, context, params, etc.
- Any change to operation structure requires explicit snapshot update

## File Changes

### 1. Refactor FlowContext.exec (packages/next/src/flow.ts)

**Extract helper functions:**
- `createAbortWithTimeout()` - Centralize timeout/abort setup
- `createJournalKey()` - Generate journal keys consistently
- `checkJournalReplay()` - Check journal for replay, throw if error entry
- `executeJournaledFn()` - Execute fn with journal recording
- `executeSubflow()` - Execute flow as subflow with extensions

**Simplify main exec logic:**
- Parse overloads into normalized config
- Setup abort/timeout once
- Route to appropriate helper based on config
- Each helper handles one scenario clearly

**Benefits:**
- Reduce ~250 lines to ~150 lines
- Clear separation of concerns
- Easy to verify extension wrapping in helpers
- Testable in isolation

### 2. Refactor Scope.exec and ~executeFlow (packages/next/src/scope.ts)

**Extract helpers:**
- `createAbortWithTimeout()` - Shared with FlowContext
- `wrapFlowExecution()` - Wrap executeCore with extensions (extract from ~executeFlow)

**Simplify:**
- Move extension wrapping logic to helper
- Reduce duplication between flow and fn paths

### 3. Replace Extension Tests (packages/next/tests/flow-extension-fix.test.ts)

- Action: Replace with table-driven tests
- Old: 7 separate tests, ~170 lines
- New: 2 test.each() blocks, ~100 lines (estimated)

### No Other Changes
- No changes to examples
- No changes to docs/guides
- No changes to skill references

## Success Criteria

### Code Quality
✓ FlowContext.exec reduced from ~250 lines to ~150 lines
✓ Clear helper functions with single responsibilities
✓ No duplicated timeout/abort/journal logic
✓ Easy to trace execution path for each overload
✓ Extension wrapping clearly visible in helpers

### Test Coverage
✓ All 5 operation kinds tested (execute, subflow, journal, parallel, resolve if applicable)
✓ Extension wrapping order verified with multiple extensions
✓ Full operation metadata captured in snapshots
✓ Tests more compact than current implementation
✓ fn execution behavior clearly tested (with key vs without key)

### Verification
✓ All typechecks pass: `pnpm -F @pumped-fn/core-next typecheck && pnpm -F @pumped-fn/core-next typecheck:full`
✓ All tests pass: `pnpm -F @pumped-fn/core-next test`
✓ Code review easier due to clearer structure
