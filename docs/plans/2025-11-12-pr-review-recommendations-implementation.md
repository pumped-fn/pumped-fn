# PR Review Recommendations Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Address PR #109 code review recommendations by eliminating `as any` in type guards and extracting type aliases for better maintainability.

**Architecture:** Two focused refactorings - type guard improvements using `in` operator, and type alias extraction to types.ts for DRY compliance.

**Tech Stack:** TypeScript, Vitest

---

## Task 1: Add ResolvableItem Type Alias

**Files:**
- Modify: `packages/next/src/types.ts` (after imports, before executorSymbol)

**Step 1: Add ResolvableItem type export**

In `packages/next/src/types.ts`, add after line 2 (after Tag import):

```typescript
import { type Promised } from "./promises";
import { type Tag } from "./tag-types";
import { type Escapable } from "./helpers";

export type ResolvableItem =
  | Core.UExecutor
  | Tag.Tag<unknown, boolean>
  | Tag.TagExecutor<unknown>
  | Escapable<unknown>;

export const executorSymbol: unique symbol = Symbol.for(
  "@pumped-fn/core/executor"
);
```

**Note:** Need to add `Escapable` import and ensure `Core` namespace is available at this point.

**Step 2: Verify typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: ✓ No new errors (pre-existing FlowExecution errors may exist)

**Step 3: Commit**

```bash
git add packages/next/src/types.ts
git commit -m "refactor(types): add ResolvableItem type alias"
```

---

## Task 2: Use ResolvableItem in dependency-utils

**Files:**
- Modify: `packages/next/src/internal/dependency-utils.ts:1-81`

**Step 1: Update imports**

Change line 2:
```typescript
import type { Core } from "../types";
```

To:
```typescript
import type { Core, ResolvableItem } from "../types";
```

**Step 2: Update ResolveFn type (line 7)**

Change:
```typescript
type ResolveFn = (item: Core.UExecutor | Tag.Tag<unknown, boolean> | Tag.TagExecutor<unknown> | Escapable<unknown>) => Promise<unknown>;
```

To:
```typescript
type ResolveFn = (item: ResolvableItem) => Promise<unknown>;
```

**Step 3: Update resolveShape generic (line 9)**

Change:
```typescript
export async function resolveShape<T extends Core.UExecutor | Tag.Tag<unknown, boolean> | Tag.TagExecutor<unknown> | ReadonlyArray<Core.UExecutor | Tag.Tag<unknown, boolean> | Tag.TagExecutor<unknown> | Escapable<unknown>> | Record<string, Core.UExecutor | Tag.Tag<unknown, boolean> | Tag.TagExecutor<unknown> | Escapable<unknown>> | undefined>(
```

To:
```typescript
export async function resolveShape<T extends ResolvableItem | ReadonlyArray<ResolvableItem> | Record<string, ResolvableItem> | undefined>(
```

**Step 4: Update unwrapTarget parameter (line 18)**

Change:
```typescript
const unwrapTarget = (item: Core.UExecutor | Tag.Tag<unknown, boolean> | Tag.TagExecutor<unknown> | Escapable<unknown>): Core.Executor<unknown> | Tag.Tag<unknown, boolean> | Tag.TagExecutor<unknown> => {
```

To:
```typescript
const unwrapTarget = (item: ResolvableItem): Core.Executor<unknown> | Tag.Tag<unknown, boolean> | Tag.TagExecutor<unknown> => {
```

**Step 5: Update resolveItem parameter (line 43)**

Change:
```typescript
: async (item: Core.UExecutor | Tag.Tag<unknown, boolean> | Tag.TagExecutor<unknown> | Escapable<unknown>) => {
```

To:
```typescript
: async (item: ResolvableItem) => {
```

**Step 6: Verify typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: ✓ No new errors

**Step 7: Run tests**

Run: `pnpm -F @pumped-fn/core-next test tag-dependency-resolution`
Expected: ✓ All 8 tests pass

**Step 8: Commit**

```bash
git add packages/next/src/internal/dependency-utils.ts
git commit -m "refactor(dependency-utils): use ResolvableItem type alias"
```

---

## Task 3: Fix Type Guards in tag-executors

**Files:**
- Modify: `packages/next/src/tag-executors.ts:37-54`

**Step 1: Update isTag type guard (lines 37-44)**

Change:
```typescript
export function isTag<T>(input: unknown): input is Tag.Tag<T, boolean> {
  return (
    typeof input === "function" &&
    typeof (input as any).extractFrom === "function" &&
    typeof (input as any).readFrom === "function" &&
    typeof (input as any).collectFrom === "function"
  );
}
```

To:
```typescript
export function isTag<T>(input: unknown): input is Tag.Tag<T, boolean> {
  return (
    typeof input === "function" &&
    "extractFrom" in input &&
    typeof input.extractFrom === "function" &&
    "readFrom" in input &&
    typeof input.readFrom === "function" &&
    "collectFrom" in input &&
    typeof input.collectFrom === "function"
  );
}
```

**Step 2: Update isTagExecutor type guard (lines 46-54)**

Change:
```typescript
export function isTagExecutor<TOutput, TTag = TOutput>(input: unknown): input is Tag.TagExecutor<TOutput, TTag> {
  return (
    typeof input === "object" &&
    input !== null &&
    tagSymbol in input &&
    typeof (input as any)[tagSymbol] === "string" &&
    ["required", "optional", "all"].includes((input as any)[tagSymbol])
  );
}
```

To:
```typescript
export function isTagExecutor<TOutput, TTag = TOutput>(input: unknown): input is Tag.TagExecutor<TOutput, TTag> {
  return (
    typeof input === "object" &&
    input !== null &&
    tagSymbol in input &&
    typeof input[tagSymbol] === "string" &&
    ["required", "optional", "all"].includes(input[tagSymbol])
  );
}
```

**Step 3: Verify typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: ✓ No new errors

**Step 4: Run type guard tests**

Run: `pnpm -F @pumped-fn/core-next test tag-executors`
Expected: ✓ All 5 tests pass

**Step 5: Run full tag test suite**

Run: `pnpm -F @pumped-fn/core-next test tag`
Expected: ✓ All tag-related tests pass

**Step 6: Commit**

```bash
git add packages/next/src/tag-executors.ts
git commit -m "refactor(tag-executors): eliminate as any in type guards using in operator"
```

---

## Final Verification

**Step 1: Run full typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck && pnpm -F @pumped-fn/core-next typecheck:full`
Expected: ✓ No new errors (pre-existing FlowExecution errors may exist)

**Step 2: Run all tests**

Run: `pnpm -F @pumped-fn/core-next test`
Expected: ✓ All 294 tests pass

**Step 3: Verify git status**

Run: `git status`
Expected: Clean working tree, 3 commits ahead of base

**Step 4: Review changes**

Run: `git log --oneline -3`
Expected: 3 commits matching the commit messages from tasks 1-3

---

## Notes

- **Task 1 dependency:** Need to ensure `Core` namespace and `Escapable` are available when `ResolvableItem` is defined. May need to adjust import order or use forward reference.
- **Type narrowing:** The `in` operator approach properly narrows `unknown` to object type, enabling type-safe property access without casting.
- **No test changes needed:** These are pure refactorings with no behavioral changes.
