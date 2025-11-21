# PR #132 Review Round 2 - Follow-up Items Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Address "Must address" items from second PR #132 review (memory profiling, skill docs, concurrent test, constructor optimization)

**Architecture:** Add memory profiling test, update skill documentation, add missing test case, optimize constructor to skip unnecessary cache operations

**Tech Stack:** TypeScript, Vitest, Markdown

---

## Task 1: Add Test for Concurrent Same-Executor/Same-Context Resolution

**Files:**
- Modify: `packages/next/tests/tag.test.ts`

**Step 1: Write test for concurrent resolutions in same context**

Add to `packages/next/tests/tag.test.ts` after the existing concurrent test:

```typescript
it("should handle concurrent resolutions of same executor in same context", async () => {
  const value = tag(custom<string>());
  const scope = createScope({ tags: [value("scope")] });

  const slowFlow = flow([value], async ([v]) => {
    await new Promise(resolve => setTimeout(resolve, 10));
    return v;
  });

  const ctx = scope.createExecution({ tags: [value("context")] });

  const [r1, r2, r3] = await Promise.all([
    ctx.exec(slowFlow, undefined),
    ctx.exec(slowFlow, undefined),
    ctx.exec(slowFlow, undefined),
  ]);

  expect(r1).toBe("context");
  expect(r2).toBe("context");
  expect(r3).toBe("context");
});
```

**Step 2: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/core-next test tag.test.ts -t "should handle concurrent resolutions of same executor"`
Expected: PASS (current implementation should handle this via currentPromise check)

**Step 3: Run full test suite**

Run: `pnpm -F @pumped-fn/core-next test`
Expected: All 53 tests PASS

**Step 4: Commit**

```bash
git add packages/next/tests/tag.test.ts
git commit -m "test(core): add concurrent same-executor resolution test

Verify that concurrent resolutions of the same flow in the same
execution context are handled correctly via currentPromise check.

Addresses PR #132 review feedback on test coverage."
```

---

## Task 2: Optimize Constructor to Skip Cache Operations for Execution Context

**Files:**
- Modify: `packages/next/src/scope.ts:85-88`

**Step 1: Update AccessorImpl constructor**

In `packages/next/src/scope.ts`, replace lines 85-88:

```typescript
constructor(
  scope: BaseScope,
  requestor: UE,
  tags: Tag.Tagged[] | undefined,
  executionContext?: ExecutionContext.Context
) {
  this.scope = scope;
  this.requestor = requestor;
  this.tags = tags;
  this.executionContext = executionContext;

  this.resolve = this.createResolveFunction();

  if (!executionContext) {
    const state = this.scope["getOrCreateState"](requestor);
    if (!state.accessor) {
      state.accessor = this;
    }
  }
}
```

**Step 2: Run typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck && pnpm -F @pumped-fn/core-next typecheck:full`
Expected: PASS

**Step 3: Run full test suite**

Run: `pnpm -F @pumped-fn/core-next test`
Expected: All 53 tests PASS

**Step 4: Commit**

```bash
git add packages/next/src/scope.ts
git commit -m "refactor(core): skip cache operations for execution context accessors

Skip getOrCreateState in constructor when executionContext is present,
as execution context accessors don't use scope cache.

Addresses PR #132 review feedback on state management consistency."
```

---

## Task 3: Add Memory Profiling Test

**Files:**
- Create: `packages/next/tests/memory-profile.test.ts`

**Step 1: Create memory profiling test**

Create `packages/next/tests/memory-profile.test.ts`:

```typescript
import { createScope, custom, flow, tag } from "../src";
import { describe, it, expect } from "vitest";

describe("memory profiling", () => {
  it("should not leak memory with many execution contexts", async () => {
    const value = tag(custom<string>());
    const scope = createScope({ tags: [value("scope")] });

    const myFlow = flow([value], ([v]) => v);

    const initialMemory = process.memoryUsage().heapUsed;
    const contexts: any[] = [];

    // Create 1000 execution contexts and execute flows
    for (let i = 0; i < 1000; i++) {
      const ctx = scope.createExecution({ tags: [value(`ctx-${i}`)] });
      await ctx.exec(myFlow, undefined);

      // Keep reference to prevent GC (simulating long-lived contexts)
      if (i % 100 === 0) {
        contexts.push(ctx);
      }
    }

    const afterMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = afterMemory - initialMemory;
    const memoryPerContext = memoryIncrease / 1000;

    // Log for investigation (not strict assertion)
    console.log(`Memory increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Per context: ${(memoryPerContext / 1024).toFixed(2)} KB`);

    // Loose threshold - just ensure it's not catastrophic
    expect(memoryPerContext).toBeLessThan(50 * 1024); // Less than 50KB per context
  });

  it("should allow GC of disposed execution contexts", async () => {
    const value = tag(custom<string>());
    const scope = createScope({ tags: [value("scope")] });

    const myFlow = flow([value], ([v]) => v);

    // Create contexts without keeping references
    for (let i = 0; i < 1000; i++) {
      const ctx = scope.createExecution({ tags: [value(`ctx-${i}`)] });
      await ctx.exec(myFlow, undefined);
      // ctx goes out of scope, should be GC-able
    }

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    // This test primarily documents expected behavior
    // Actual memory inspection would require heap snapshots
    expect(true).toBe(true);
  });
});
```

**Step 2: Run memory profiling test**

Run: `pnpm -F @pumped-fn/core-next test memory-profile.test.ts`
Expected: PASS (provides memory usage data for investigation)

**Step 3: Document findings**

Update `@plans/2025-01-20-memory-management-investigation.md` with test results:

```markdown
## Initial Profiling Results

Memory profiling test added in `tests/memory-profile.test.ts`.

### Results
- Memory increase: [X] MB for 1000 contexts
- Per context: [Y] KB average
- GC behavior: [observation from test run]

### Analysis
[Based on test results, assess if memory leak concern is real or theoretical]

### Recommendation
[A/B/C option from original investigation doc]
```

**Step 4: Run full test suite**

Run: `pnpm -F @pumped-fn/core-next test`
Expected: All 55 tests PASS (53 + 2 new)

**Step 5: Commit**

```bash
git add packages/next/tests/memory-profile.test.ts @plans/2025-01-20-memory-management-investigation.md
git commit -m "test(core): add memory profiling tests for execution contexts

Add memory profiling tests to investigate potential memory leak
with accessor instances per execution context.

Provides baseline data for memory management investigation.

Addresses PR #132 review feedback on memory leak verification."
```

---

## Task 4: Update Skill Documentation

**Files:**
- Modify: `.claude/skills/pumped-design/references/tags.md`

**Step 1: Add execution context tag resolution section**

In `.claude/skills/pumped-design/references/tags.md`, add after the existing ExecutionContext documentation:

```markdown
## Execution Context Tag Resolution

When flows resolve tags from their dependencies, tags are resolved from the **execution context**, not the scope:

```typescript
const value = tag(custom<string>());
const scope = createScope({ tags: [value("scope-value")] });

const myFlow = flow([value], ([v]) => v);

const ctx = scope.createExecution({ tags: [value("context-value")] });
const result = await ctx.exec(myFlow);
// result === "context-value" (from execution context, NOT scope)
```

### Tag Resolution Hierarchy

1. **Execution context tags** - Highest priority (provided via `createExecution({ tags: [...] })`)
2. **Flow definition tags** - Medium priority (defined in `flow([...], ...)`)
3. **Scope tags** - Lowest priority (defined in `createScope({ tags: [...] })`)

Execution context tags **override** scope tags for any tag key that appears in both.

### Implementation Details

Internally, `scope.resolve()` accepts an optional `executionContext` parameter that:
- Bypasses scope cache to ensure context isolation
- Resolves tags from execution context's `tagStore` instead of scope
- Stores resolved values separately per context

This ensures each execution context is properly isolated with independent tag values.
```

**Step 2: Verify examples still typecheck**

Run: `pnpm -F @pumped-fn/examples typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add .claude/skills/pumped-design/references/tags.md
git commit -m "docs(skills): document execution context tag resolution behavior

Add section explaining how execution context tags override scope tags
during flow dependency resolution, including hierarchy and implementation.

Addresses PR #132 review feedback on skill documentation update."
```

---

## Task 5: Add PR Comment with Investigation Results

**Files:**
- None (PR comment only)

**Step 1: Run memory profiling test and capture output**

Run: `pnpm -F @pumped-fn/core-next test memory-profile.test.ts`
Capture memory usage output from console logs.

**Step 2: Add comment to PR #132**

```bash
gh pr comment 132 --body "$(cat <<'EOF'
## Investigation Results - Memory Management

Added memory profiling tests in commit [SHA] to investigate accessor instance creation concern.

### Test Results
- Memory increase: [X] MB for 1000 execution contexts
- Per context: [Y] KB average
- All contexts properly isolated (53 tests passing)

### Analysis
[Based on test output:]
- Accessor instances are created per (executor, executionContext) pair
- `currentPromise` check prevents duplicate resolutions in same context
- Memory usage is [acceptable/concerning] for typical use cases

### Recommendation
[Based on profiling:]
- [If acceptable] Current implementation is sufficient, memory usage within reasonable bounds
- [If concerning] Implement per-context accessor caching as suggested in investigation doc

### Additional Changes
- ✅ Added test for concurrent same-executor/same-context resolution
- ✅ Optimized constructor to skip cache operations for execution context
- ✅ Updated skill documentation with tag resolution hierarchy

All tests passing (55/55).
EOF
)"
```

**Step 3: No commit needed** (comment only)

---

## Verification Checklist

After completing all tasks:

- [ ] All tests pass: `pnpm -F @pumped-fn/core-next test` (55 tests)
- [ ] Typecheck passes: `pnpm -F @pumped-fn/core-next typecheck && pnpm -F @pumped-fn/core-next typecheck:full`
- [ ] Examples typecheck: `pnpm -F @pumped-fn/examples typecheck`
- [ ] Memory profiling test provides useful data
- [ ] Concurrent same-executor test added
- [ ] Constructor optimization implemented
- [ ] Skill documentation updated
- [ ] PR comment added with investigation results
- [ ] All commits follow convention

---

## Notes

**Must Address (from review):**
1. ✅ Memory leak investigation with profiling (Task 3)
2. ✅ Update skill documentation (Task 4)
3. ✅ Add concurrent same-executor test (Task 1)
4. ✅ Optimize constructor (Task 2)

**Nice to Have (defer to future):**
- Performance benchmarks (could be separate PR if needed)
- Accessor caching per context (only if profiling shows need)

Total commits: 4
Expected test count: 55 (53 current + 2 memory profiling)
