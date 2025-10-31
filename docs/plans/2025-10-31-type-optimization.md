# Type Optimization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce public API surface, eliminate pattern duplication, improve type organization

**Architecture:** Keep single-file types.ts (interconnected concepts), explicit exports only, consistent aliases, logical grouping

**Tech Stack:** TypeScript 5.9, ast-grep for search/replace

---

## Task 1: Add Type Aliases to Core Namespace

**Files:**
- Modify: `packages/next/src/types.ts:140-273`

**Step 1: Add AnyExecutor alias after UExecutor**

Location: After line 162 in Core namespace

```typescript
export type UExecutor = BaseExecutor<unknown>;
export type AnyExecutor = Executor<unknown>;
```

**Step 2: Verify typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/next/src/types.ts
git commit -m "feat(types): add Core.AnyExecutor alias"
```

---

## Task 2: Add Type Aliases to Flow Namespace

**Files:**
- Modify: `packages/next/src/types.ts:424-619`

**Step 1: Add UHandler alias after UFlow**

Location: After line 437 in Flow namespace

```typescript
export type UFlow = Core.Executor<Handler<any, any>>;
export type UHandler = Handler<any, any>;
```

**Step 2: Verify typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/next/src/types.ts
git commit -m "feat(types): add Flow.UHandler alias"
```

---

## Task 3: Create ExecutorError Union Type

**Files:**
- Modify: `packages/next/src/types.ts:79-137`

**Step 1: Add ExecutorError union before Core namespace**

Location: After DependencyResolutionError class (line 137), before Core namespace

```typescript
export type ExecutorError =
  | ExecutorResolutionError
  | FactoryExecutionError
  | DependencyResolutionError;
```

**Step 2: Verify typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/next/src/types.ts
git commit -m "feat(types): add ExecutorError union type"
```

---

## Task 4: Replace Executor<unknown> with Core.AnyExecutor

**Files:**
- Modify: `packages/next/src/types.ts:140-388`

**Step 1: Replace in Core namespace using ast-grep**

Run:
```bash
ast-grep --lang typescript --pattern 'Executor<unknown>' packages/next/src/types.ts
```

Expected: Find ~13 occurrences

**Step 2: Replace all occurrences in Core namespace**

For each occurrence in Core namespace (lines 140-388), use ast-grep or manual replacement:

```bash
# Dry run first
ast-grep --lang typescript \
  --pattern 'Executor<unknown>' \
  --rewrite 'AnyExecutor' \
  packages/next/src/types.ts

# Note: ast-grep may need manual refinement for this replacement
# Alternative: Use editor find/replace within Core namespace section only
```

Key replacements:
- Line 177: `factory: NoDependencyFn<T> | DependentFn<T, unknown> | undefined;` (no change)
- Line 187: `factory: NoDependencyFn<T> | DependentFn<T, unknown>;` (no change)
- Line 280: `executor: Executor<unknown>,` → `executor: AnyExecutor,`
- Line 287: `executor: Executor<unknown>,` → `executor: AnyExecutor,`
- Line 305: `executor: Executor<unknown>,` → `executor: AnyExecutor,`
- Line 313: `executor: Executor<unknown>,` → `executor: AnyExecutor,`
- And others in callback signatures

**Step 3: Verify typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck && pnpm -F @pumped-fn/core-next typecheck:full`
Expected: No errors

**Step 4: Commit**

```bash
git add packages/next/src/types.ts
git commit -m "refactor(types): use Core.AnyExecutor instead of Executor<unknown>"
```

---

## Task 5: Replace BaseExecutor<unknown> with Core.UExecutor

**Files:**
- Modify: `packages/next/src/types.ts:315-328`

**Step 1: Find and replace BaseExecutor<unknown> in type definitions**

Search for: `BaseExecutor<unknown>`

Replacements:
- Line 315: `export type SingleDependencyLike = Core.BaseExecutor<unknown>;` → `export type SingleDependencyLike = UExecutor;`
- Line 318: `| ReadonlyArray<Core.BaseExecutor<unknown>>` → `| ReadonlyArray<UExecutor>`
- Line 319: `| Record<string, Core.BaseExecutor<unknown>>;` → `| Record<string, UExecutor>;`

**Step 2: Verify typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck && pnpm -F @pumped-fn/core-next typecheck:full`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/next/src/types.ts
git commit -m "refactor(types): use Core.UExecutor instead of BaseExecutor<unknown>"
```

---

## Task 6: Standardize Promise Wrapping to Promised<T>

**Files:**
- Modify: `packages/next/src/types.ts`

**Step 1: Replace void | Promise<void> | Promised<void> patterns**

Locations to update:

Extension namespace (lines 670-687):
```typescript
init?(scope: Core.Scope): Promised<void>;

wrap?<T>(
  scope: Core.Scope,
  next: () => Promised<T>,
  operation: Operation
): Promised<T>;

dispose?(scope: Core.Scope): Promised<void>;
```

**Step 2: Replace Promise<T> | Promised<T> patterns**

Check Extension.wrap and similar - ensure consistent use of Promised<T>

**Step 3: Verify typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck && pnpm -F @pumped-fn/core-next typecheck:full`
Expected: No errors

**Step 4: Commit**

```bash
git add packages/next/src/types.ts
git commit -m "refactor(types): standardize to Promised<T> wrapper"
```

---

## Task 7: Use ExecutorError Union in Callbacks

**Files:**
- Modify: `packages/next/src/types.ts:291-308`

**Step 1: Replace error union in ErrorCallback**

Before (lines 291-298):
```typescript
export type ErrorCallback<T = unknown> = (
  error:
    | ExecutorResolutionError
    | FactoryExecutionError
    | DependencyResolutionError,
  executor: Executor<T>,
  scope: Scope
) => void | Promised<void>;
```

After:
```typescript
export type ErrorCallback<T = unknown> = (
  error: ExecutorError,
  executor: Executor<T>,
  scope: Scope
) => Promised<void>;
```

**Step 2: Replace error union in GlobalErrorCallback**

Before (lines 300-307):
```typescript
export type GlobalErrorCallback = (
  error:
    | ExecutorResolutionError
    | FactoryExecutionError
    | DependencyResolutionError,
  executor: Executor<unknown>,
  scope: Scope
) => void | Promised<void>;
```

After:
```typescript
export type GlobalErrorCallback = (
  error: ExecutorError,
  executor: AnyExecutor,
  scope: Scope
) => Promised<void>;
```

**Step 3: Update Extension.onError**

Location: Extension namespace (around line 678-684)

Before:
```typescript
onError?(
  error:
    | ExecutorResolutionError
    | FactoryExecutionError
    | DependencyResolutionError,
  scope: Core.Scope
): void;
```

After:
```typescript
onError?(
  error: ExecutorError,
  scope: Core.Scope
): void;
```

**Step 4: Verify typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck && pnpm -F @pumped-fn/core-next typecheck:full`
Expected: No errors

**Step 5: Commit**

```bash
git add packages/next/src/types.ts
git commit -m "refactor(types): use ExecutorError union in callbacks"
```

---

## Task 8: Reorder types.ts into Logical Groups

**Files:**
- Modify: `packages/next/src/types.ts` (entire file)

**Step 1: Read current file structure**

Run: `head -50 packages/next/src/types.ts`

**Step 2: Reorder to logical grouping**

New order:
1. Imports
2. Symbols (executorSymbol)
3. StandardSchemaV1 + SchemaError
4. ErrorContext + ExecutorError + error classes
5. Core namespace
6. FlowError + FlowValidationError + Flow namespace
7. Extension namespace
8. Multi namespace
9. Re-exports (Tag)

Move blocks carefully, maintaining all content:
- Lines 1-7: Imports (keep as-is)
- Lines 4-6: executorSymbol (move to top after imports)
- Lines 8-64: StandardSchemaV1 (keep early)
- Lines 66-137 + ExecutorError: Error types (group together)
- Lines 140-388: Core namespace (keep)
- Lines 390-422: FlowError classes (move before Flow namespace)
- Lines 424-619: Flow namespace (keep)
- Lines 621-688: Extension namespace (keep)
- Lines 690-712: Multi namespace (keep)
- Line 714: Re-export Tag (keep at end)

**Step 3: Verify no content lost**

Run: `wc -l packages/next/src/types.ts`
Expected: ~715 lines (similar to before)

**Step 4: Verify typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck && pnpm -F @pumped-fn/core-next typecheck:full`
Expected: No errors

**Step 5: Commit**

```bash
git add packages/next/src/types.ts
git commit -m "refactor(types): reorder into logical groups"
```

---

## Task 9: Update index.ts to Explicit Exports

**Files:**
- Modify: `packages/next/src/index.ts:1-39`

**Step 1: Replace wildcard export with explicit exports**

Before (line 5):
```typescript
export * from "./types";
```

After:
```typescript
export type {
  Core,
  Flow,
  Extension,
  Multi,
  StandardSchemaV1,
  Promised,
} from "./types";
```

**Step 2: Keep other exports unchanged**

Lines 7-39 remain the same (provide, derive, createScope, tag, flow, etc.)

**Step 3: Verify typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: No errors

**Step 4: Verify examples still compile**

Run: `pnpm -F @pumped-fn/examples typecheck`
Expected: No errors (examples should only use public API)

**Step 5: Commit**

```bash
git add packages/next/src/index.ts
git commit -m "feat(types): use explicit exports to reduce API surface"
```

---

## Task 10: Update Implementation Files to Use New Aliases

**Files:**
- Modify: `packages/next/src/scope.ts`
- Modify: `packages/next/src/executor.ts`
- Modify: `packages/next/src/flow.ts`
- Modify: `packages/next/src/extension.ts`

**Step 1: Search for Executor<unknown> usage in implementation**

Run: `ast-grep --lang typescript --pattern 'Executor<unknown>' packages/next/src/*.ts`

**Step 2: Replace with Core.AnyExecutor where beneficial**

Note: Only replace where it improves readability. Internal implementation may keep explicit types if clearer.

Check these files:
- `packages/next/src/scope.ts` - likely several occurrences
- `packages/next/src/executor.ts` - likely some
- `packages/next/src/flow.ts` - check Flow.UHandler usage

**Step 3: Verify typecheck after each file**

Run: `pnpm -F @pumped-fn/core-next typecheck && pnpm -F @pumped-fn/core-next typecheck:full`
Expected: No errors

**Step 4: Commit**

```bash
git add packages/next/src/scope.ts packages/next/src/executor.ts packages/next/src/flow.ts
git commit -m "refactor: use type aliases in implementation files"
```

---

## Task 11: Full Verification Suite

**Files:**
- All modified files

**Step 1: Typecheck source**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: ✓ No errors

**Step 2: Typecheck tests**

Run: `pnpm -F @pumped-fn/core-next typecheck:full`
Expected: ✓ No errors

**Step 3: Run all tests**

Run: `pnpm -F @pumped-fn/core-next test`
Expected: ✓ 258 tests passing

**Step 4: Typecheck examples**

Run: `pnpm -F @pumped-fn/examples typecheck`
Expected: ✓ No errors

**Step 5: Build**

Run: `pnpm -F @pumped-fn/core-next build`
Expected: ✓ Build successful

**Step 6: Document verification**

Record results - all checks should pass with no changes to behavior.

---

## Task 12: Update Skill References (if needed)

**Files:**
- Check: `.claude/skills/pumped-design/references/*.md`

**Step 1: Check if skill references mention specific type exports**

Run: `grep -r "export.*from.*types" .claude/skills/pumped-design/references/ 2>/dev/null || echo "no references found"`

**Step 2: Update references if they import individual types**

If references show old import patterns, update to:
```typescript
import { Core, Flow, Extension } from '@pumped-fn/core-next';
```

**Step 3: Commit if changed**

```bash
git add .claude/skills/pumped-design/references/
git commit -m "docs(skill): update type import references"
```

---

## Success Criteria

- ✓ Public API reduced from ~90 exports to 6 namespaces + Promised
- ✓ Zero occurrences of `Executor<unknown>` in types.ts (replaced with `AnyExecutor`)
- ✓ Zero occurrences of `BaseExecutor<unknown>` in types.ts (replaced with `UExecutor`)
- ✓ Consistent `Promised<T>` usage (no `void | Promise<void> | Promised<void>`)
- ✓ ExecutorError union used in all error callbacks
- ✓ types.ts logically grouped without comments
- ✓ All typechecks pass (source, tests, examples)
- ✓ All 258 tests passing
- ✓ Build successful
- ✓ No breaking changes to public API
