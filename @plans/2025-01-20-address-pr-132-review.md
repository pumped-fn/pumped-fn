# PR #132 Review Feedback Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Address critical code quality, type safety, testing, and documentation issues identified in PR #132 review

**Architecture:** Fix type safety violations with proper type guards, add error cleanup, improve test coverage, add documentation

**Tech Stack:** TypeScript, Vitest, TSDoc

---

## Task 1: Fix Type Safety Violations in tag.ts

**Files:**
- Modify: `packages/next/src/tag.ts:20-37, 59-71, 91-103`
- Test: `packages/next/tests/tag.test.ts`

**Step 1: Write failing test for tagStore type discrimination**

Add to `packages/next/tests/tag.test.ts`:

```typescript
it("should correctly identify ExecutionContext with tagStore", () => {
  const value = tag(custom<string>());
  const scope = createScope();
  const ctx = scope.createExecution({ tags: [value("test")] });

  // Verify tagStore is accessible
  expect(value.extractFrom(ctx)).toBe("test");
});
```

**Step 2: Run test to verify current behavior**

Run: `pnpm -F @pumped-fn/core-next test tag.test.ts -t "should correctly identify"`
Expected: PASS (already working, but using unsafe any casts)

**Step 3: Add proper type guard for tagStore**

In `packages/next/src/tag.ts`, add after line 17:

```typescript
interface HasTagStore {
  tagStore: Tag.Store;
}

function hasTagStore(source: unknown): source is HasTagStore {
  return (
    typeof source === "object" &&
    source !== null &&
    !Array.isArray(source) &&
    "tagStore" in source &&
    typeof (source as Record<string, unknown>).tagStore === "object" &&
    (source as Record<string, unknown>).tagStore !== null &&
    isStore((source as Record<string, unknown>).tagStore)
  );
}
```

**Step 4: Replace any casts in isStore()**

Replace lines 32-34:

```typescript
if (hasTagStore(source)) {
  return false;
}
```

**Step 5: Replace any casts in extract()**

Replace lines 61-71:

```typescript
if (hasTagStore(source)) {
  const value = source.tagStore.get(key);
  return value === undefined ? undefined : validate(schema, value);
}
```

**Step 6: Replace any casts in collect()**

Replace lines 94-104:

```typescript
if (hasTagStore(source)) {
  const value = source.tagStore.get(key);
  return value === undefined ? [] : [validate(schema, value)];
}
```

**Step 7: Run typecheck to verify no any usage**

Run: `pnpm -F @pumped-fn/core-next typecheck && pnpm -F @pumped-fn/core-next typecheck:full`
Expected: PASS with no type errors

**Step 8: Run full test suite**

Run: `pnpm -F @pumped-fn/core-next test`
Expected: All 47+ tests PASS

**Step 9: Commit**

```bash
git add packages/next/src/tag.ts packages/next/tests/tag.test.ts
git commit -m "refactor(core): replace any casts with proper type guards in tag.ts

Replace unsafe any casts with HasTagStore interface and hasTagStore()
type guard for better type safety per CLAUDE.md coding standards.

Addresses PR #132 review feedback on type safety violations."
```

---

## Task 2: Add Error Cleanup for contextResolvedValue

**Files:**
- Modify: `packages/next/src/scope.ts:147-169`
- Test: `packages/next/tests/execution-context.behavior.test.ts`

**Step 1: Write failing test for error cleanup**

Add to `packages/next/tests/execution-context.behavior.test.ts`:

```typescript
it("should clean up contextResolvedValue on resolution error", async () => {
  const errorTag = tag(custom<string>());
  const scope = createScope();

  const failingFlow = flow([errorTag], () => {
    throw new Error("Resolution failed");
  });

  const ctx = scope.createExecution({ tags: [errorTag("value")] });

  await expect(ctx.exec(failingFlow)).rejects.toThrow("Resolution failed");

  // Verify subsequent resolution works
  const workingFlow = flow([errorTag], ([value]) => value);
  const result = await ctx.exec(workingFlow);
  expect(result).toBe("value");
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @pumped-fn/core-next test execution-context.behavior.test.ts -t "should clean up"`
Expected: FAIL (contextResolvedValue may contain stale data)

**Step 3: Add cleanup in error handler**

In `packages/next/src/scope.ts`, modify `resolveWithErrorHandling()` around line 149:

```typescript
private async resolveWithErrorHandling(): Promise<unknown> {
  try {
    return await this.resolveCore();
  } catch (error) {
    if (this.executionContext) {
      this.contextResolvedValue = NOT_SET;
    }

    const { enhancedError, errorContext, originalError } =
      this.enhanceResolutionError(error);

    const state = this.scope["getOrCreateState"](this.requestor);
    state.accessor = this;
    state.value = { kind: "rejected", error: originalError, enhancedError };

    this.scope["~removeFromResolutionChain"](this.requestor);

    throw enhancedError;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/core-next test execution-context.behavior.test.ts -t "should clean up"`
Expected: PASS

**Step 5: Run full test suite**

Run: `pnpm -F @pumped-fn/core-next test`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add packages/next/src/scope.ts packages/next/tests/execution-context.behavior.test.ts
git commit -m "fix(core): clean up contextResolvedValue on resolution error

Prevent stale data in contextResolvedValue when resolution fails.
Ensures subsequent resolutions start with clean state.

Addresses PR #132 review feedback on error handling."
```

---

## Task 3: Add Comprehensive Test Coverage

**Files:**
- Modify: `packages/next/tests/tag.test.ts`
- Modify: `packages/next/tests/execution-context.behavior.test.ts`

**Step 1: Add test for multiple resolutions in same context**

Add to `packages/next/tests/tag.test.ts`:

```typescript
it("should resolve same tag multiple times in same context", async () => {
  const value = tag(custom<string>());
  const scope = createScope({ tags: [value("scope")] });

  const flow1 = flow([value], ([v]) => v);
  const flow2 = flow([value], ([v]) => `${v}-2`);

  const ctx = scope.createExecution({ tags: [value("context")] });

  const result1 = await ctx.exec(flow1);
  const result2 = await ctx.exec(flow2);

  expect(result1).toBe("context");
  expect(result2).toBe("context-2");
});
```

**Step 2: Run test**

Run: `pnpm -F @pumped-fn/core-next test tag.test.ts -t "should resolve same tag multiple times"`
Expected: PASS

**Step 3: Add test for concurrent resolutions**

Add to `packages/next/tests/tag.test.ts`:

```typescript
it("should handle concurrent resolutions in different contexts", async () => {
  const value = tag(custom<string>());
  const scope = createScope({ tags: [value("scope")] });

  const myFlow = flow([value], ([v]) => v);

  const ctx1 = scope.createExecution({ tags: [value("ctx1")] });
  const ctx2 = scope.createExecution({ tags: [value("ctx2")] });
  const ctx3 = scope.createExecution({ tags: [value("ctx3")] });

  const [r1, r2, r3] = await Promise.all([
    ctx1.exec(myFlow),
    ctx2.exec(myFlow),
    ctx3.exec(myFlow),
  ]);

  expect(r1).toBe("ctx1");
  expect(r2).toBe("ctx2");
  expect(r3).toBe("ctx3");
});
```

**Step 4: Run test**

Run: `pnpm -F @pumped-fn/core-next test tag.test.ts -t "should handle concurrent"`
Expected: PASS

**Step 5: Add test for child context tag inheritance**

Add to `packages/next/tests/execution-context.behavior.test.ts`:

```typescript
it("should not re-apply scope tags to child contexts", async () => {
  const value = tag(custom<string>());
  const scope = createScope({ tags: [value("scope")] });

  const parentCtx = scope.createExecution({ tags: [value("parent")] });

  const nestedFlow = flow([], async (ctx) => {
    const childCtx = ctx.createExecution({ tags: [value("child")] });
    const innerFlow = flow([value], ([v]) => v);
    return await childCtx.exec(innerFlow);
  });

  const result = await parentCtx.exec(nestedFlow);
  expect(result).toBe("child");
});
```

**Step 6: Run test**

Run: `pnpm -F @pumped-fn/core-next test execution-context.behavior.test.ts -t "should not re-apply"`
Expected: PASS

**Step 7: Run full test suite**

Run: `pnpm -F @pumped-fn/core-next test`
Expected: All tests PASS

**Step 8: Commit**

```bash
git add packages/next/tests/tag.test.ts packages/next/tests/execution-context.behavior.test.ts
git commit -m "test(core): add comprehensive coverage for execution context tag isolation

Add tests for:
- Multiple resolutions in same context
- Concurrent resolutions across contexts
- Child context tag inheritance behavior

Addresses PR #132 review feedback on test coverage."
```

---

## Task 4: Add TSDoc Documentation

**Files:**
- Modify: `packages/next/src/types.ts:346`
- Modify: `packages/next/src/scope.ts:826-830`

**Step 1: Add TSDoc to Scope.resolve() interface**

In `packages/next/src/types.ts`, replace line 346:

```typescript
/**
 * Resolves an executor and returns its value.
 *
 * @param executor - The executor to resolve
 * @param force - If true, forces re-resolution even if cached
 * @param executionContext - Optional execution context for context-specific resolution.
 *   When provided, bypasses scope cache and resolves tags from the execution context
 *   instead of the scope, ensuring proper isolation between execution contexts.
 * @returns Promised value of the resolved executor
 */
resolve<T>(executor: Core.Executor<T>, force?: boolean, executionContext?: ExecutionContext.Context): Promised<T>;
```

**Step 2: Add TSDoc to implementation**

In `packages/next/src/scope.ts`, add before line 826:

```typescript
/**
 * Resolves an executor and returns its value.
 *
 * When executionContext is provided:
 * - Tag resolution uses execution context instead of scope
 * - Scope cache is bypassed to ensure context isolation
 * - Resolved values are stored separately per context
 *
 * @internal
 */
```

**Step 3: Verify public API docs script**

Run: `pnpm -F @pumped-fn/core-next verify:public-docs`
Expected: PASS (if script exists) or command not found (acceptable)

**Step 4: Run typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck && pnpm -F @pumped-fn/core-next typecheck:full`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/next/src/types.ts packages/next/src/scope.ts
git commit -m "docs(core): add TSDoc for executionContext parameter

Document executionContext parameter behavior in resolve() method,
explaining cache bypass and context isolation mechanics.

Addresses PR #132 review feedback on missing documentation."
```

---

## Task 5: Update Skill References

**Files:**
- Check: `.claude/skills/pumped-design/references/`
- Modify: Any files referencing scope.resolve() or tag resolution

**Step 1: Search for scope.resolve references**

Run: `grep -r "scope.resolve" .claude/skills/pumped-design/references/ || echo "No matches found"`
Expected: List of files or "No matches found"

**Step 2: Search for tag resolution references**

Run: `grep -r "tag.*resolve\|resolve.*tag" .claude/skills/pumped-design/references/ || echo "No matches found"`
Expected: List of files or "No matches found"

**Step 3: Update references if found**

If files found in steps 1-2, update them to mention:
- `scope.resolve()` now accepts optional `executionContext` parameter
- Tags in flows are resolved from execution context, not scope
- Execution contexts are properly isolated

**Step 4: Verify no broken examples**

Run: `pnpm -F @pumped-fn/examples typecheck`
Expected: PASS

**Step 5: Commit if changes made**

```bash
git add .claude/skills/pumped-design/references/
git commit -m "docs(skills): update references for execution context tag resolution

Update skill documentation to reflect executionContext parameter
in scope.resolve() and tag resolution behavior.

Addresses PR #132 review feedback on skill reference updates."
```

---

## Task 6: Investigation - Memory Management Strategy

**Files:**
- Create: `@plans/2025-01-20-memory-management-investigation.md`

**Step 1: Document current memory behavior**

Create investigation document:

```markdown
# Memory Management Investigation

## Current Behavior

1. Each execution context creates new AccessorImpl instances
2. contextResolvedValue stored in accessor, not cleaned on context disposal
3. No accessor disposal mechanism exists
4. Accessors may persist after context disposal

## Questions to Investigate

1. Are accessors garbage collected when execution contexts are disposed?
2. Does contextResolvedValue prevent garbage collection?
3. What is typical accessor count in production scenarios?
4. Is there observable memory growth?

## Investigation Tasks

- [ ] Add memory profiling test
- [ ] Track accessor creation/disposal
- [ ] Measure memory with long-running contexts
- [ ] Compare memory usage before/after PR

## Decision Needed

Should we:
A. Add explicit accessor disposal (immediate fix)
B. Use WeakMap for context values (architectural change)
C. Accept current behavior if no measurable impact (defer)

**Status:** Investigation needed before implementation
```

**Step 2: Save investigation document**

Save to: `@plans/2025-01-20-memory-management-investigation.md`

**Step 3: Add comment to PR**

Comment on PR #132:
"Memory management investigation documented in `@plans/2025-01-20-memory-management-investigation.md`. Recommend profiling before implementing disposal mechanism to confirm impact."

---

## Task 7: Investigation - Per-Context Caching Strategy

**Files:**
- Create: `@plans/2025-01-20-per-context-caching-investigation.md`

**Step 1: Document current caching behavior**

Create investigation document:

```markdown
# Per-Context Caching Investigation

## Current Behavior

1. Execution contexts bypass scope cache completely
2. Each resolution in same context re-executes
3. No memoization for expensive executors within context
4. Multiple flows using same tag = multiple resolutions

## Questions to Investigate

1. What is typical executor re-resolution frequency within same context?
2. Are there expensive executors commonly used in flows?
3. What is performance impact of cache bypass?
4. Is WeakMap-based per-context cache feasible?

## Investigation Tasks

- [ ] Add performance profiling test
- [ ] Measure resolution time for expensive executors
- [ ] Profile with/without per-context cache
- [ ] Design WeakMap cache strategy

## Options

A. WeakMap<ExecutionContext, Map<Executor, Value>> cache
B. Cache only specific executor types (lazy, static)
C. Add opt-in caching flag to resolve()
D. Accept current behavior (simplicity over performance)

**Status:** Investigation needed before implementation
```

**Step 2: Save investigation document**

Save to: `@plans/2025-01-20-per-context-caching-investigation.md`

**Step 3: Add comment to PR**

Comment on PR #132:
"Per-context caching strategy documented in `@plans/2025-01-20-per-context-caching-investigation.md`. Recommend profiling to determine if optimization needed."

---

## Verification Checklist

After completing all tasks:

- [ ] All tests pass: `pnpm -F @pumped-fn/core-next test`
- [ ] Typecheck passes: `pnpm -F @pumped-fn/core-next typecheck && pnpm -F @pumped-fn/core-next typecheck:full`
- [ ] Examples typecheck: `pnpm -F @pumped-fn/examples typecheck`
- [ ] No `any` casts in tag.ts
- [ ] Error cleanup implemented
- [ ] Comprehensive tests added
- [ ] TSDoc added for public API
- [ ] Skill references updated (if applicable)
- [ ] Investigation plans documented
- [ ] All commits follow convention

---

## Notes

**MUST FIX before merge:**
- ✅ Type safety violations (Task 1)
- ✅ Error cleanup (Task 2)
- ✅ Test coverage (Task 3)
- ✅ TSDoc documentation (Task 4)
- ✅ Skill references (Task 5)

**INVESTIGATE before deciding:**
- 📋 Memory management (Task 6)
- 📋 Per-context caching (Task 7)

These investigations should be separate tasks after PR merge to avoid scope creep.
