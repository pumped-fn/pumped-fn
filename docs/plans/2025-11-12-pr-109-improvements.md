# PR #109 Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Address 4 optional improvements from PR #109 code review: remove `as any` casts, add error case tests, replace `any` with `unknown` in type signatures.

**Architecture:** Conservative approach - make methods protected to eliminate casts, try `unknown` first (fallback to eslint-disable if TypeScript contravariance prevents it), add comprehensive error tests.

**Tech Stack:** TypeScript, Vitest, pumped-fn core

---

## Task 1: Change Methods from Private to Protected

**Files:**
- Modify: `packages/next/src/scope.ts:683`
- Modify: `packages/next/src/scope.ts:693`

**Step 1: Change resolveTag visibility**

In `packages/next/src/scope.ts:683`, change:
```typescript
private async resolveTag(tag: Tag.Tag<unknown, boolean>): Promise<unknown> {
```

To:
```typescript
protected async resolveTag(tag: Tag.Tag<unknown, boolean>): Promise<unknown> {
```

**Step 2: Change resolveTagExecutor visibility**

In `packages/next/src/scope.ts:693`, change:
```typescript
private async resolveTagExecutor(tagExec: Tag.TagExecutor<unknown>): Promise<unknown> {
```

To:
```typescript
protected async resolveTagExecutor(tagExec: Tag.TagExecutor<unknown>): Promise<unknown> {
```

**Step 3: Verify typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: ✓ No errors

**Step 4: Commit**

```bash
git add packages/next/src/scope.ts
git commit -m "refactor(scope): change resolveTag/resolveTagExecutor to protected"
```

---

## Task 2: Remove `as any` Casts in dependency-utils

**Files:**
- Modify: `packages/next/src/internal/dependency-utils.ts:40`
- Modify: `packages/next/src/internal/dependency-utils.ts:44`

**Step 1: Replace first cast with bracket notation**

In `packages/next/src/internal/dependency-utils.ts:40`, change:
```typescript
if (isTagExecutor(item)) {
  return (scope as any).resolveTagExecutor(item);
}
```

To:
```typescript
if (isTagExecutor(item)) {
  return scope["resolveTagExecutor"](item);
}
```

**Step 2: Replace second cast with bracket notation**

In `packages/next/src/internal/dependency-utils.ts:44`, change:
```typescript
if (isTag(item)) {
  return (scope as any).resolveTag(item);
}
```

To:
```typescript
if (isTag(item)) {
  return scope["resolveTag"](item);
}
```

**Step 3: Verify typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: ✓ No errors

**Step 4: Run existing tests**

Run: `pnpm -F @pumped-fn/core-next test tag-dependency-resolution`
Expected: ✓ All tests pass

**Step 5: Commit**

```bash
git add packages/next/src/internal/dependency-utils.ts
git commit -m "refactor(dependency-utils): remove as any casts using bracket notation"
```

---

## Task 3: Replace `any` with `unknown` in Type Signatures

**Files:**
- Modify: `packages/next/src/internal/dependency-utils.ts:7`
- Modify: `packages/next/src/internal/dependency-utils.ts:9`
- Modify: `packages/next/src/internal/dependency-utils.ts:18`
- Modify: `packages/next/src/internal/dependency-utils.ts:38`

**Step 1: Replace `any` in ResolveFn type (line 7)**

Change:
```typescript
type ResolveFn = (item: Core.UExecutor | Tag.Tag<any, boolean> | Tag.TagExecutor<any, any> | Escapable<unknown>) => Promise<unknown>;
```

To:
```typescript
type ResolveFn = (item: Core.UExecutor | Tag.Tag<unknown, boolean> | Tag.TagExecutor<unknown> | Escapable<unknown>) => Promise<unknown>;
```

**Step 2: Replace `any` in resolveShape generic (line 9)**

Change:
```typescript
export async function resolveShape<T extends Core.UExecutor | Tag.Tag<any, boolean> | Tag.TagExecutor<any, any> | ReadonlyArray<Core.UExecutor | Tag.Tag<any, boolean> | Tag.TagExecutor<any, any> | Escapable<unknown>> | Record<string, Core.UExecutor | Tag.Tag<any, boolean> | Tag.TagExecutor<any, any> | Escapable<unknown>> | undefined>(
```

To:
```typescript
export async function resolveShape<T extends Core.UExecutor | Tag.Tag<unknown, boolean> | Tag.TagExecutor<unknown> | ReadonlyArray<Core.UExecutor | Tag.Tag<unknown, boolean> | Tag.TagExecutor<unknown> | Escapable<unknown>> | Record<string, Core.UExecutor | Tag.Tag<unknown, boolean> | Tag.TagExecutor<unknown> | Escapable<unknown>> | undefined>(
```

**Step 3: Replace `any` in unwrapTarget (line 18)**

Change:
```typescript
const unwrapTarget = (item: Core.UExecutor | Tag.Tag<any, boolean> | Tag.TagExecutor<any, any> | Escapable<unknown>): Core.Executor<unknown> | Tag.Tag<any, boolean> | Tag.TagExecutor<any, any> => {
```

To:
```typescript
const unwrapTarget = (item: Core.UExecutor | Tag.Tag<unknown, boolean> | Tag.TagExecutor<unknown> | Escapable<unknown>): Core.Executor<unknown> | Tag.Tag<unknown, boolean> | Tag.TagExecutor<unknown> => {
```

**Step 4: Replace `any` in resolveItem parameter (line 38)**

Change:
```typescript
: async (item: Core.UExecutor | Tag.Tag<any, boolean> | Tag.TagExecutor<any, any> | Escapable<unknown>) => {
```

To:
```typescript
: async (item: Core.UExecutor | Tag.Tag<unknown, boolean> | Tag.TagExecutor<unknown> | Escapable<unknown>) => {
```

**Step 5: Verify typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck`

**Expected:** Either:
- ✓ No errors (success, proceed to Step 7)
- ✗ Type errors about Tag contravariance (proceed to Step 6)

**Step 6: Add eslint-disable if typecheck fails**

If Step 5 fails with contravariance errors, revert changes and add directive:

At line 7, change to:
```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ResolveFn = (item: Core.UExecutor | Tag.Tag<any, boolean> | Tag.TagExecutor<any, any> | Escapable<unknown>) => Promise<unknown>;
```

At line 9, add above the function:
```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function resolveShape<T extends Core.UExecutor | Tag.Tag<any, boolean> | Tag.TagExecutor<any, any> | ...>(
```

Apply similar directives to lines 18 and 38.

**Step 7: Run tests**

Run: `pnpm -F @pumped-fn/core-next test tag-dependency-resolution`
Expected: ✓ All tests pass

**Step 8: Commit**

```bash
git add packages/next/src/internal/dependency-utils.ts
git commit -m "refactor(dependency-utils): replace any with unknown in type signatures"
```

Or if eslint-disable was needed:
```bash
git commit -m "refactor(dependency-utils): add eslint-disable for justified any usage"
```

---

## Task 4: Add Error Case Tests

**Files:**
- Modify: `packages/next/tests/tag-dependency-resolution.test.ts`

**Step 1: Write test for missing required tag**

Add at end of file (after line 78):

```typescript
test("throws when tag has no default and value is missing", async () => {
  const requiredTag = tag(custom<string>(), { label: "required" });
  const scope = createScope({ tags: [] });

  const executor = derive([requiredTag], ([val]) => val);

  await expect(scope.resolve(executor)).rejects.toThrow();
});
```

**Step 2: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/core-next test tag-dependency-resolution -t "throws when tag has no default"`
Expected: ✓ Test passes

**Step 3: Write test for tags.required() with missing value**

Add after previous test:

```typescript
test("throws when tags.required() used and value is missing", async () => {
  const optionalTag = tag(custom<string>(), { label: "opt", default: "default" });
  const scope = createScope({ tags: [] });

  const executor = derive([tags.required(optionalTag)], ([val]) => val);

  await expect(scope.resolve(executor)).rejects.toThrow();
});
```

**Step 4: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/core-next test tag-dependency-resolution -t "throws when tags.required"`
Expected: ✓ Test passes

**Step 5: Write test for tags.all() with no matches**

Add after previous test:

```typescript
test("returns empty array when tags.all() has no matches", async () => {
  const myTag = tag(custom<string>(), { label: "myTag" });
  const scope = createScope({ tags: [] });

  const executor = derive([tags.all(myTag)], ([values]) => values);

  const result = await scope.resolve(executor);
  expect(result).toEqual([]);
});
```

**Step 6: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/core-next test tag-dependency-resolution -t "returns empty array when tags.all"`
Expected: ✓ Test passes

**Step 7: Run full test suite**

Run: `pnpm -F @pumped-fn/core-next test tag-dependency-resolution`
Expected: ✓ All tests pass (including 3 new tests)

**Step 8: Verify typecheck on test file**

Run: `pnpm -F @pumped-fn/core-next typecheck:full`
Expected: ✓ No errors

**Step 9: Commit**

```bash
git add packages/next/tests/tag-dependency-resolution.test.ts
git commit -m "test(tags): add error case tests for missing tag values"
```

---

## Final Verification

**Step 1: Run full typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck && pnpm -F @pumped-fn/core-next typecheck:full`
Expected: ✓ No errors

**Step 2: Run all tests**

Run: `pnpm -F @pumped-fn/core-next test`
Expected: ✓ All tests pass

**Step 3: Verify git status**

Run: `git status`
Expected: Clean working tree, 4 commits ahead of base branch

**Step 4: Review changes**

Run: `git log --oneline -4`
Expected: 4 commits matching the commit messages from tasks 1-4

---

## Notes

- **Type guard duplication:** Decided not to address - duplication is justified by different contexts (scope.ts entry point vs dependency-utils.ts generic resolution)
- **`unknown` vs `any`:** Task 3 attempts `unknown` first, falls back to eslint-disable if TypeScript contravariance prevents it
- **Protected methods:** Using bracket notation to access protected methods is safe within the same package
