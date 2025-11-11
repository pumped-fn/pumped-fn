# Code Consolidation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce file count from 18 to 10 (44%) by merging internal utilities and type files while preserving all 56 public API exports.

**Architecture:** Internal-only consolidation. Merge utilities into parent modules, combine type files. Zero breaking changes - all index.ts exports remain accessible.

**Tech Stack:** TypeScript, pnpm workspaces, vitest

---

## Task 1: Merge Type Files (tag-types.ts + ssch.ts → types.ts)

**Files:**
- Modify: `packages/next/src/types.ts` (append tag-types and ssch content)
- Modify: `packages/next/src/tag.ts` (update imports)
- Modify: `packages/next/src/index.ts` (update imports)
- Delete: `packages/next/src/tag-types.ts`
- Delete: `packages/next/src/ssch.ts`

**Step 1: Read current files to understand structure**

```bash
cat packages/next/src/tag-types.ts
cat packages/next/src/ssch.ts
cat packages/next/src/types.ts | tail -50
```

**Step 2: Append tag-types.ts content to types.ts**

Add after the existing type definitions in types.ts:

```typescript
// Tag types (from tag-types.ts)
export const tagSymbol: unique symbol = Symbol.for("@pumped-fn/core/tag");

export declare namespace Tag {
  export interface Store {
    get(key: unknown): unknown;
    set(key: unknown, value: unknown): unknown | undefined;
  }

  export interface Tagged<T = unknown> {
    readonly [tagSymbol]: true;
    readonly key: symbol;
    readonly schema: StandardSchemaV1<T>;
    readonly value: T;
    toString(): string;
    readonly [Symbol.toStringTag]: string;
  }

  export interface Container {
    tags?: Tagged[];
  }

  export type Source = Store | Container | Tagged[];

  export interface Tag<T, HasDefault extends boolean = false> {
    readonly key: symbol;
    readonly schema: StandardSchemaV1<T>;
    readonly label?: string;
    readonly default: HasDefault extends true ? T : never;

    (value?: HasDefault extends true ? T : never): Tagged<T>;
    (value: T): Tagged<T>;

    extractFrom(source: Source): T;
    readFrom(source: Source): HasDefault extends true ? T : T | undefined;
    collectFrom(source: Source): T[];

    injectTo(target: Store, value: T): void;

    entry(value?: HasDefault extends true ? T : never): [symbol, T];
    entry(value: T): [symbol, T];

    toString(): string;
    readonly [Symbol.toStringTag]: string;
  }
}
```

**Step 3: Append ssch.ts content to types.ts**

Add after the Tag namespace:

```typescript
// Standard schema utilities (from ssch.ts)
export function validate<TSchema extends StandardSchemaV1>(
  schema: TSchema,
  data: unknown
): Awaited<StandardSchemaV1.InferOutput<TSchema>> {
  const result = schema["~standard"].validate(data);

  if ("then" in result) {
    throw new Error("validating async is not supported");
  }

  if (result.issues) {
    throw new SchemaError(result.issues);
  }
  return result.value as Awaited<StandardSchemaV1.InferOutput<TSchema>>;
}

export function custom<T>(): StandardSchemaV1<T, T> {
  return {
    "~standard": {
      vendor: "pumped-fn",
      version: 1,
      validate: (value) => {
        return { value: value as T };
      },
    },
  };
}
```

**Step 4: Update tag.ts imports**

Replace:
```typescript
import { type StandardSchemaV1 } from "./types";
```
And remove:
```typescript
import { type Tag } from "./tag-types";
```

With:
```typescript
import { type StandardSchemaV1, type Tag, tagSymbol } from "./types";
```

Also replace:
```typescript
import { custom } from "./ssch";
```
With:
```typescript
import { custom } from "./types";
```

Remove:
```typescript
import { tagSymbol } from "./tag-types";
```

**Step 5: Update index.ts imports**

Replace:
```typescript
import { tag } from "./tag";
import { type Tag } from "./tag-types";
import { custom } from "./ssch";
```

With:
```typescript
import { tag } from "./tag";
import { type Tag, custom } from "./types";
```

Replace export lines:
```typescript
export { tag } from "./tag";
export type { Tag } from "./tag-types";

export { custom } from "./ssch";
export * as standardSchema from "./ssch";
```

With:
```typescript
export { tag } from "./tag";
export type { Tag } from "./types";

export { custom } from "./types";
export * as standardSchema from "./types";
```

**Step 6: Run typecheck to verify src compiles**

```bash
pnpm -F @pumped-fn/core-next typecheck
```

Expected: No errors

**Step 7: Delete old files**

```bash
rm packages/next/src/tag-types.ts
rm packages/next/src/ssch.ts
```

**Step 8: Run full typecheck including tests**

```bash
pnpm -F @pumped-fn/core-next typecheck:full
```

Expected: No errors

**Step 9: Run tests**

```bash
pnpm -F @pumped-fn/core-next test
```

Expected: 322 tests pass

**Step 10: Commit**

```bash
git add packages/next/src/types.ts packages/next/src/tag.ts packages/next/src/index.ts
git add packages/next/src/tag-types.ts packages/next/src/ssch.ts
git commit -m "refactor: merge tag-types and ssch into types.ts

- Consolidate type definitions into single file
- Update imports in tag.ts and index.ts
- Remove tag-types.ts and ssch.ts
- Zero breaking changes to public API

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2: Merge Flow Utilities (internal/journal-utils.ts + internal/abort-utils.ts → flow.ts)

**Files:**
- Modify: `packages/next/src/flow.ts` (append utility functions)
- Modify: `tests/journal-utils.test.ts` (update import)
- Modify: `tests/abort-utils.test.ts` (update import)
- Delete: `packages/next/src/internal/journal-utils.ts`
- Delete: `packages/next/src/internal/abort-utils.ts`

**Step 1: Read utility files**

```bash
cat packages/next/src/internal/journal-utils.ts
cat packages/next/src/internal/abort-utils.ts
```

**Step 2: Append journal-utils.ts content to end of flow.ts**

Add at the end of flow.ts (before or after existing code, as internal utilities):

```typescript
// Journal utilities (from internal/journal-utils.ts)
export namespace JournalEntry {
  export type Success<T> = { type: "success"; value: T };
  export type Error = { type: "error"; error: unknown };
}

export type JournalEntry<T> = JournalEntry.Success<T> | JournalEntry.Error;

export function createJournalKey(userKey: string, systemKey: string): string {
  return `${userKey}:${systemKey}`;
}

export function checkJournalReplay<T>(
  journalKey: string,
  journal: Map<string, JournalEntry<T>>
): JournalEntry<T> | undefined {
  return journal.get(journalKey);
}

export function isErrorEntry<T>(
  entry: JournalEntry<T>
): entry is JournalEntry.Error {
  return entry.type === "error";
}
```

**Step 3: Append abort-utils.ts content to end of flow.ts**

Add after journal utilities:

```typescript
// Abort utilities (from internal/abort-utils.ts)
export namespace AbortUtils {
  export function createAbortWithTimeout(
    timeoutMs: number,
    signal?: AbortSignal
  ): { signal: AbortSignal; cleanup: () => void } {
    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort(new Error(`Timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    const onParentAbort = () => {
      controller.abort(signal?.reason);
    };

    signal?.addEventListener("abort", onParentAbort);

    return {
      signal: controller.signal,
      cleanup: () => {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", onParentAbort);
      },
    };
  }
}

export const createAbortWithTimeout = AbortUtils.createAbortWithTimeout;
```

**Step 4: Remove internal imports from flow.ts**

Remove these lines from flow.ts:
```typescript
import { createJournalKey, checkJournalReplay, isErrorEntry, type JournalEntry } from "./internal/journal-utils";
import { createAbortWithTimeout } from "./internal/abort-utils";
```

**Step 5: Update test imports**

In `tests/journal-utils.test.ts`, replace:
```typescript
import { createJournalKey, isErrorEntry, checkJournalReplay } from "../src/internal/journal-utils";
```
With:
```typescript
import { createJournalKey, isErrorEntry, checkJournalReplay } from "../src/flow";
```

In `tests/abort-utils.test.ts`, replace:
```typescript
import { createAbortWithTimeout } from "../src/internal/abort-utils";
```
With:
```typescript
import { createAbortWithTimeout } from "../src/flow";
```

**Step 6: Run typecheck**

```bash
pnpm -F @pumped-fn/core-next typecheck
```

Expected: No errors

**Step 7: Delete old files**

```bash
rm packages/next/src/internal/journal-utils.ts
rm packages/next/src/internal/abort-utils.ts
```

**Step 8: Run tests**

```bash
pnpm -F @pumped-fn/core-next test
```

Expected: 322 tests pass

**Step 9: Commit**

```bash
git add packages/next/src/flow.ts tests/journal-utils.test.ts tests/abort-utils.test.ts
git add packages/next/src/internal/journal-utils.ts packages/next/src/internal/abort-utils.ts
git commit -m "refactor: merge flow utilities into flow.ts

- Move journal-utils and abort-utils to flow.ts
- Update test imports
- Remove internal/journal-utils.ts and internal/abort-utils.ts
- Co-locate flow-specific utilities with flow implementation

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: Merge Scope Utilities (internal/extension-utils.ts + internal/dependency-utils.ts → scope.ts)

**Files:**
- Modify: `packages/next/src/scope.ts` (append utilities)
- Modify: `packages/next/src/helpers.ts` (update import)
- Modify: `tests/internal/dependency-utils.test.ts` (update import)
- Modify: `tests/internal/extension-utils.test.ts` (update import)
- Delete: `packages/next/src/internal/extension-utils.ts`
- Delete: `packages/next/src/internal/dependency-utils.ts`

**Step 1: Read utility files**

```bash
cat packages/next/src/internal/extension-utils.ts
cat packages/next/src/internal/dependency-utils.ts
```

**Step 2: Append extension-utils.ts to scope.ts**

Add near the top of scope.ts (after imports, before class definitions):

```typescript
// Extension utilities (from internal/extension-utils.ts)
function wrapWithExtensions<T extends (...args: any[]) => any>(
  fn: T,
  extensions: Extension.Extension[]
): T {
  if (extensions.length === 0) return fn;

  return ((...args: Parameters<T>): ReturnType<T> => {
    let result = fn(...args);
    for (const ext of extensions) {
      if (ext.wrap) {
        result = ext.wrap(result);
      }
    }
    return result;
  }) as T;
}
```

**Step 3: Append dependency-utils.ts to scope.ts**

Add after wrapWithExtensions:

```typescript
// Dependency resolution utilities (from internal/dependency-utils.ts)
export type ResolveFn = <T>(
  executor: Core.Executor<T> | Core.LazyExecutor<T>
) => T;

export function resolveShape<T extends Record<string, any>>(
  shape: T,
  resolve: ResolveFn
): { [K in keyof T]: T[K] extends Core.Executor<infer U> ? U : T[K] } {
  const result: any = {};

  for (const key in shape) {
    const value = shape[key];
    if (
      typeof value === "object" &&
      value !== null &&
      executorSymbol in value
    ) {
      result[key] = resolve(value as any);
    } else {
      result[key] = value;
    }
  }

  return result;
}
```

**Step 4: Remove internal imports from scope.ts**

Remove:
```typescript
import { wrapWithExtensions } from "./internal/extension-utils";
import { resolveShape } from "./internal/dependency-utils";
```

**Step 5: Update helpers.ts import**

In `helpers.ts`, replace:
```typescript
import { resolveShape, type ResolveFn } from "./internal/dependency-utils";
```
With:
```typescript
import { resolveShape, type ResolveFn } from "./scope";
```

**Step 6: Update test imports**

In `tests/internal/dependency-utils.test.ts`, replace:
```typescript
import { resolveShape } from "../../src/internal/dependency-utils";
```
With:
```typescript
import { resolveShape } from "../../src/scope";
```

In `tests/internal/extension-utils.test.ts`, update if it imports wrapWithExtensions (check first, might only test via scope).

**Step 7: Run typecheck**

```bash
pnpm -F @pumped-fn/core-next typecheck
```

Expected: No errors

**Step 8: Delete old files**

```bash
rm packages/next/src/internal/extension-utils.ts
rm packages/next/src/internal/dependency-utils.ts
```

**Step 9: Remove empty internal directory**

```bash
rmdir packages/next/src/internal
```

**Step 10: Run tests**

```bash
pnpm -F @pumped-fn/core-next test
```

Expected: 322 tests pass

**Step 11: Commit**

```bash
git add packages/next/src/scope.ts packages/next/src/helpers.ts
git add tests/internal/dependency-utils.test.ts tests/internal/extension-utils.test.ts
git add packages/next/src/internal/
git commit -m "refactor: merge scope utilities into scope.ts

- Move extension-utils and dependency-utils to scope.ts
- Update helpers.ts import
- Update test imports
- Remove internal/ directory
- Co-locate scope-specific utilities with implementation

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4: Merge Executor Utilities (helpers.ts + extension.ts → executor.ts)

**Files:**
- Modify: `packages/next/src/executor.ts` (append helpers and extension)
- Modify: `packages/next/src/index.ts` (update imports)
- Delete: `packages/next/src/helpers.ts`
- Delete: `packages/next/src/extension.ts`

**Step 1: Read files to merge**

```bash
cat packages/next/src/helpers.ts
cat packages/next/src/extension.ts
```

**Step 2: Append helpers.ts to executor.ts**

Add at end of executor.ts:

```typescript
// Helper functions (from helpers.ts)
import { resolveShape, type ResolveFn } from "./scope";

export type Escapable<T> = T & {
  escape(): T;
};

export function resolves<T extends Record<string, any>>(
  shape: T
): Core.Executor<{
  [K in keyof T]: T[K] extends Core.Executor<infer U> ? U : T[K];
}> {
  return derive((resolve) => {
    return resolveShape(shape, resolve) as any;
  });
}
```

**Step 3: Append extension.ts to executor.ts**

Add after resolves:

```typescript
// Extension helper (from extension.ts)
export function extension(
  ext: Extension.Extension
): Extension.Extension {
  return ext;
}
```

**Step 4: Update index.ts imports**

Replace:
```typescript
export { extension } from "./extension";
export { resolves } from "./helpers";
```

With:
```typescript
export { extension, resolves } from "./executor";
```

**Step 5: Run typecheck**

```bash
pnpm -F @pumped-fn/core-next typecheck
```

Expected: No errors

**Step 6: Delete old files**

```bash
rm packages/next/src/helpers.ts
rm packages/next/src/extension.ts
```

**Step 7: Run full typecheck**

```bash
pnpm -F @pumped-fn/core-next typecheck:full
```

Expected: No errors

**Step 8: Run tests**

```bash
pnpm -F @pumped-fn/core-next test
```

Expected: 322 tests pass

**Step 9: Commit**

```bash
git add packages/next/src/executor.ts packages/next/src/index.ts
git add packages/next/src/helpers.ts packages/next/src/extension.ts
git commit -m "refactor: merge helpers and extension into executor.ts

- Move resolves() and extension() to executor.ts
- Update index.ts exports
- Remove helpers.ts and extension.ts
- Group executor-related utilities together

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 5: Final Verification

**Step 1: Verify file count**

```bash
ls packages/next/src/*.ts | wc -l
```

Expected: 10 files

**Step 2: List final structure**

```bash
ls -1 packages/next/src/
```

Expected:
```
errors.ts
executor.ts
flow-execution.ts
flow.ts
index.ts
multi.ts
promises.ts
scope.ts
tag.ts
types.ts
```

**Step 3: Run all typechecks**

```bash
pnpm -F @pumped-fn/core-next typecheck
pnpm -F @pumped-fn/core-next typecheck:full
```

Expected: No errors

**Step 4: Run all tests**

```bash
pnpm -F @pumped-fn/core-next test
```

Expected: 322 tests pass

**Step 5: Verify examples typecheck**

```bash
pnpm -F @pumped-fn/examples typecheck
```

Expected: No errors

**Step 6: Run build**

```bash
pnpm -F @pumped-fn/core-next build
```

Expected: Build succeeds

**Step 7: Create summary commit if needed**

If no additional changes, skip. Otherwise:

```bash
git add .
git commit -m "chore: verify code consolidation complete

- 10 files (was 18) - 44% reduction
- All 322 tests passing
- Examples typecheck
- Build succeeds
- Zero breaking changes to public API

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Success Criteria

- [ ] File count: 18 → 10 (44% reduction)
- [ ] All 322 tests pass
- [ ] Examples typecheck successfully
- [ ] Build succeeds
- [ ] All 56 public API exports accessible via index.ts
- [ ] 4 atomic commits created
- [ ] No breaking changes

## Notes

- Work in `.worktrees/code-consolidation` directory
- Each task is independently committable
- If any step fails, stop and investigate before proceeding
- Use `git status` frequently to verify changes
- Reference design doc: `docs/plans/2025-11-11-code-consolidation-design.md`
