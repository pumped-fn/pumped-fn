# Remove Duplicate ExecutionContext Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix bug where Scope.~executeFlow creates two ExecutionContext instances for single Flow execution

**Architecture:** Remove standalone ExecutionContext creation from Scope.~executeFlow, use FlowContext (which already extends ExecutionContextImpl) as single source of truth for execution tracking

**Tech Stack:** TypeScript, Vitest

**Design Doc:** docs/plans/2025-11-13-remove-duplicate-execution-context.md

---

## Task 1: Remove executionContext field from Extension.ExecutionOperation type

**Files:**
- Modify: `packages/next/src/types.ts:687-694`

**Step 1: Remove executionContext field**

Remove line 693 from ExecutionOperation type:

```typescript
export type ExecutionOperation = {
  kind: "execution";
  target: FlowTarget | FnTarget | ParallelTarget;
  input: unknown;
  key?: string;
  context: Tag.Store;
  // executionContext?: ExecutionContext.Context;  ← REMOVE THIS LINE
};
```

**Step 2: Verify typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: Type errors in scope.ts and execution-context.ts (expected - will fix next)

**Step 3: Commit**

```bash
git add packages/next/src/types.ts
git commit -m "refactor(types): remove executionContext from ExecutionOperation"
```

---

## Task 2: Remove executionContext field from Flow.Execution type

**Files:**
- Modify: `packages/next/src/types.ts:608-614`

**Step 1: Remove executionContext field**

Remove line 611:

```typescript
export interface Execution<T> {
  readonly id: string;
  readonly flowName: string | undefined;
  readonly status: ExecutionStatus;
  readonly ctx: ExecutionData | undefined;
  // readonly executionContext: ExecutionContext.Context | undefined;  ← REMOVE
  readonly abort: AbortController;
  readonly statusCallbackErrors: readonly Error[];
  // ...rest
}
```

**Step 2: Verify typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: Type errors in flow-execution.ts (expected - will fix next)

**Step 3: Commit**

```bash
git add packages/next/src/types.ts
git commit -m "refactor(types): remove executionContext from Flow.Execution"
```

---

## Task 3: Remove executionContext from FlowExecutionImpl

**Files:**
- Modify: `packages/next/src/flow-execution.ts:20,35,42`

**Step 1: Remove executionContext property**

Remove line 20:

```typescript
export class FlowExecutionImpl<T> implements Flow.Execution<T> {
  readonly result: Promised<T>;
  readonly id: string;
  readonly flowName: string | undefined;
  readonly abort: AbortController;
  // readonly executionContext: ExecutionContext.Context | undefined;  ← REMOVE

  private _status: Flow.ExecutionStatus = "pending";
  // ...
}
```

**Step 2: Remove from constructor config parameter (line 35)**

Remove `executionContext?: ExecutionContext.Context;` from constructor parameter type.

**Step 3: Remove assignment (line 42)**

Remove `this.executionContext = config.executionContext;`

**Step 4: Verify typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: Type error in scope.ts (passing executionContext to constructor)

**Step 5: Commit**

```bash
git add packages/next/src/flow-execution.ts
git commit -m "refactor(flow-execution): remove executionContext property"
```

---

## Task 4: Remove executionContext from ExecutionContextImpl operation

**Files:**
- Modify: `packages/next/src/execution-context.ts:64-71`

**Step 1: Remove executionContext from operation**

Update operation construction (line 64-71):

```typescript
const operation: Extension.ExecutionOperation = {
  kind: "execution",
  target: { type: "fn" },
  input: undefined,
  key: undefined,
  context: childCtx.tagStore
  // executionContext: childCtx  ← REMOVE THIS LINE
}
```

**Step 2: Verify typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: Still type error in scope.ts (will fix next)

**Step 3: Commit**

```bash
git add packages/next/src/execution-context.ts
git commit -m "refactor(execution-context): remove executionContext from operation"
```

---

## Task 5: Fix Scope.~executeFlow - Remove duplicate ExecutionContext creation

**Files:**
- Modify: `packages/next/src/scope.ts:1224-1277`

**Step 1: Remove executionContext variable and creation**

Remove lines 1224-1227:

```typescript
// DELETE THESE LINES:
const executionContext = this.createExecution({
  name: definition.name,
  startedAt: Date.now()
});
```

**Step 2: Remove tag population using executionContext**

Remove lines 1229-1233:

```typescript
// DELETE THESE LINES:
if (executionTags) {
  executionTags.forEach(tagged => {
    executionContext.tagStore.set(tagged.key, tagged.value);
  });
}
```

**Step 3: Initialize context execution details**

After line 1235 (`const context = new FlowContext(...)`), add:

```typescript
context.initializeExecutionContext(definition.name, false);
```

**Step 4: Remove executionContext from operation (line 1264)**

Remove `executionContext,` from operation object.

**Step 5: Replace executionContext lifecycle calls with context**

Replace line 1269:
```typescript
// Before: executionContext.end();
context.end();
```

Replace lines 1273-1274:
```typescript
// Before:
// executionContext.details.error = error;
// executionContext.end();

// After:
context.details.error = error;
context.end();
```

**Step 6: Remove executionContext from FlowExecution constructor call**

Remove line 1190:
```typescript
// Remove: executionContext: undefined,
```

**Step 7: Verify typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: PASS (no errors)

**Step 8: Commit**

```bash
git add packages/next/src/scope.ts
git commit -m "fix(scope): remove duplicate ExecutionContext creation in ~executeFlow"
```

---

## Task 6: Run tests and verify

**Step 1: Run all tests**

Run: `pnpm -F @pumped-fn/core-next test`
Expected: 301 tests passing (may have 1 flaky timing test)

**Step 2: If multi.test.ts fails, re-run**

Run: `pnpm -F @pumped-fn/core-next test tests/multi.test.ts`
Expected: PASS (timing test is flaky)

**Step 3: Run typecheck on examples**

Run: `pnpm -F @pumped-fn/examples typecheck`
Expected: PASS

**Step 4: Verify build**

Run: `pnpm -F @pumped-fn/core-next build`
Expected: SUCCESS

---

## Task 7: Update documentation references

**Files:**
- Check: `docs/guides/execution-tracking.md`
- Check: `docs/reference/api-cheatsheet.md`
- Check: `.claude/skills/pumped-design/references/extension-authoring.md`

**Step 1: Search for executionContext references**

Run: `grep -r "executionContext" docs/ .claude/skills/`
Expected: May find references to the removed field

**Step 2: Update or verify documentation**

- If docs reference `operation.executionContext`, update to use `operation.context`
- If docs reference `execution.executionContext`, remove those references
- Verify extension examples show using `operation.context` only

**Step 3: Commit if changes made**

```bash
git add docs/ .claude/skills/
git commit -m "docs: update references after removing executionContext field"
```

**If no changes:** Skip commit.

---

## Task 8: Final verification

**Step 1: Run full test suite**

Run: `pnpm -F @pumped-fn/core-next test && pnpm -F @pumped-fn/core-next typecheck && pnpm -F @pumped-fn/core-next typecheck:full`
Expected: All pass

**Step 2: Verify single ExecutionContext per Flow**

Check that:
- FlowContext extends ExecutionContextImpl ✓
- Scope.~executeFlow creates only FlowContext ✓
- No separate createExecution() call ✓
- Extensions receive context via operation.context ✓

**Step 3: Create final commit if needed**

If any cleanup needed, commit with:
```bash
git commit -m "chore: final cleanup for duplicate ExecutionContext removal"
```

---

## Testing Strategy

- **No new tests needed** - existing tests verify behavior
- **Key tests:**
  - `tests/execution-context.test.ts` - ExecutionContext primitive works
  - `tests/flow-execution.test.ts` - Flow execution tracking works
  - `tests/flow-extensions.test.ts` - Extensions receive correct context

**Regression Prevention:**
- All 301 existing tests must pass
- Typecheck must be clean
- Examples must typecheck

---

## Success Criteria

- [ ] executionContext field removed from Extension.ExecutionOperation
- [ ] executionContext field removed from Flow.Execution
- [ ] FlowExecutionImpl no longer has executionContext property
- [ ] ExecutionContextImpl doesn't pass executionContext in operations
- [ ] Scope.~executeFlow creates only one ExecutionContext (FlowContext)
- [ ] All 301 tests passing
- [ ] Typecheck clean (src + tests)
- [ ] Examples typecheck
- [ ] Build successful
- [ ] Documentation updated
