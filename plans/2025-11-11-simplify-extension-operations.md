# Simplify Extension.Operation Types Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Consolidate 5 Extension.Operation kinds ("execute", "journal", "subflow", "parallel", "resolve") into 2 kinds ("execution", "resolve"), using tag-based context instead of explicit nesting metadata.

**Architecture:** Replace operation-specific fields with unified ExecutionOperation containing target discriminator (flow/fn/parallel) and optional key for named operations. Extensions read nesting depth/parent from context tags instead of operation fields. Improves AI explainability and reduces type complexity.

**Tech Stack:** TypeScript, pumped-fn core types, vitest for testing

---

## Task 1: Update Extension.Operation Type Definition

**Files:**
- Modify: `packages/next/src/types.ts:673-717`

**Step 1: Replace Extension.Operation with simplified types**

```typescript
export namespace Extension {
  export type ResolveOperation = {
    kind: "resolve";
    executor: Core.Executor<unknown>;
    scope: Core.Scope;
    operation: "resolve" | "update";
  };

  export type FlowTarget = {
    type: "flow";
    flow: Flow.UFlow;
    definition: Flow.Definition<any, any>;
  };

  export type FnTarget = {
    type: "fn";
    params?: readonly unknown[];
  };

  export type ParallelTarget = {
    type: "parallel";
    mode: "parallel" | "parallelSettled";
    count: number;
  };

  export type ExecutionOperation = {
    kind: "execution";
    target: FlowTarget | FnTarget | ParallelTarget;
    input: unknown;
    key?: string;
    context: Tag.Store;
  };

  export type Operation = ResolveOperation | ExecutionOperation;

  export interface Extension {
    name: string;
    init?(scope: Core.Scope): MaybePromised<void>;
    wrap?<T>(
      scope: Core.Scope,
      next: () => Promised<T>,
      operation: Operation
    ): Promise<T> | Promised<T>;
    onError?(error: ExecutorError, scope: Core.Scope): void;
    dispose?(scope: Core.Scope): MaybePromised<void>;
  }
}
```

**Step 2: Verify types compile**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: Type errors in flow.ts and scope.ts (operations using old kinds)

**Step 3: Commit type definition**

```bash
git add packages/next/src/types.ts
git commit -m "refactor(types): simplify Extension.Operation to 2 kinds"
```

---

## Task 2: Update flow.ts Named Flow Execution (Journaled)

**Files:**
- Modify: `packages/next/src/flow.ts:463-472`

**Step 1: Update wrapWithExtensions call for named flow**

Replace:
```typescript
const executor = this.wrapWithExtensions(executeCore, {
  kind: "subflow",
  flow: config.flow,
  definition,
  input: config.input,
  journalKey,
  parentFlowName,
  depth,
  context: this,
});
```

With:
```typescript
const executor = this.wrapWithExtensions(executeCore, {
  kind: "execution",
  target: {
    type: "flow",
    flow: config.flow,
    definition,
  },
  input: config.input,
  key: journalKey.split(":")[2],
  context: this,
});
```

**Step 2: Verify typecheck passes for this section**

Run: `pnpm -F @pumped-fn/core-next typecheck 2>&1 | grep "flow.ts"`
Expected: Fewer errors in flow.ts

**Step 3: Commit**

```bash
git add packages/next/src/flow.ts
git commit -m "refactor(flow): update named flow execution to use ExecutionOperation"
```

---

## Task 3: Update flow.ts Named Function Execution (Journaled)

**Files:**
- Modify: `packages/next/src/flow.ts:592-602`

**Step 1: Update wrapWithExtensions call for named fn**

Replace:
```typescript
const executor = this.wrapWithExtensions(executeCore, {
  kind: "journal",
  key: journalKey.split(":")[2],
  flowName,
  depth,
  isReplay,
  context: this,
  params: params.length > 0 ? params : undefined,
});
```

With:
```typescript
const executor = this.wrapWithExtensions(executeCore, {
  kind: "execution",
  target: {
    type: "fn",
    params: params.length > 0 ? params : undefined,
  },
  input: undefined,
  key: journalKey.split(":")[2],
  context: this,
});
```

**Step 2: Verify typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck 2>&1 | grep "flow.ts"`
Expected: Continue to fewer errors

**Step 3: Commit**

```bash
git add packages/next/src/flow.ts
git commit -m "refactor(flow): update named fn execution to use ExecutionOperation"
```

---

## Task 4: Update flow.ts Unnamed Flow Execution

**Files:**
- Modify: `packages/next/src/flow.ts:644-656`

**Step 1: Update wrapWithExtensions call for unnamed flow**

Replace:
```typescript
const executor = this.wrapWithExtensions(executeCore, {
  kind: "subflow",
  flow,
  definition,
  input,
  journalKey: undefined,
  parentFlowName,
  depth,
  context: this,
});
```

With:
```typescript
const executor = this.wrapWithExtensions(executeCore, {
  kind: "execution",
  target: {
    type: "flow",
    flow,
    definition,
  },
  input,
  key: undefined,
  context: this,
});
```

**Step 2: Verify typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck 2>&1 | grep "flow.ts"`

**Step 3: Commit**

```bash
git add packages/next/src/flow.ts
git commit -m "refactor(flow): update unnamed flow execution to use ExecutionOperation"
```

---

## Task 5: Update flow.ts Parallel Execution

**Files:**
- Modify: `packages/next/src/flow.ts:689-702` (parallel)
- Modify: `packages/next/src/flow.ts:740-756` (parallelSettled)

**Step 1: Update parallel wrapWithExtensions**

Replace:
```typescript
const executor = this.wrapWithExtensions(executeCore, {
  kind: "parallel",
  mode: "parallel",
  promiseCount: promises.length,
  depth,
  parentFlowName,
  context: this,
});
```

With:
```typescript
const executor = this.wrapWithExtensions(executeCore, {
  kind: "execution",
  target: {
    type: "parallel",
    mode: "parallel",
    count: promises.length,
  },
  input: promises,
  key: undefined,
  context: this,
});
```

**Step 2: Update parallelSettled wrapWithExtensions**

Replace:
```typescript
const executor = this.wrapWithExtensions(executeCore, {
  kind: "parallel",
  mode: "parallelSettled",
  promiseCount: promises.length,
  depth,
  parentFlowName,
  context: this,
});
```

With:
```typescript
const executor = this.wrapWithExtensions(executeCore, {
  kind: "execution",
  target: {
    type: "parallel",
    mode: "parallelSettled",
    count: promises.length,
  },
  input: promises,
  key: undefined,
  context: this,
});
```

**Step 3: Verify typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck 2>&1 | grep "flow.ts"`
Expected: No more flow.ts errors

**Step 4: Commit**

```bash
git add packages/next/src/flow.ts
git commit -m "refactor(flow): update parallel operations to use ExecutionOperation"
```

---

## Task 6: Update flow.ts Handler Execution (executeWithExtensions)

**Files:**
- Modify: `packages/next/src/flow.ts:793-815`

**Step 1: Update executeWithExtensions wrapWithExtensions call**

Replace:
```typescript
const executor = context.wrapWithExtensions(executeCore, {
  kind: "execute",
  flow,
  definition,
  input,
  flowName: context.find(flowMeta.flowName),
  depth: context.get(flowMeta.depth),
  isParallel: context.get(flowMeta.isParallel),
  parentFlowName: context.find(flowMeta.parentFlowName),
});
```

With:
```typescript
const executor = context.wrapWithExtensions(executeCore, {
  kind: "execution",
  target: {
    type: "flow",
    flow,
    definition,
  },
  input,
  key: undefined,
  context,
});
```

**Step 2: Verify typecheck passes for flow.ts**

Run: `pnpm -F @pumped-fn/core-next typecheck 2>&1 | grep "flow.ts"`
Expected: No flow.ts errors

**Step 3: Commit**

```bash
git add packages/next/src/flow.ts
git commit -m "refactor(flow): update handler execution to use ExecutionOperation"
```

---

## Task 7: Update scope.ts exec() Method

**Files:**
- Modify: `packages/next/src/scope.ts:1203-1217`

**Step 1: Update wrapWithExtensions call in scope.exec()**

Find the wrapWithExtensions call around line 1203-1217 and replace:
```typescript
const executor = wrapWithExtensions(
  this.extensions,
  executeCore,
  this,
  {
    kind: "execute",
    flow,
    definition,
    input,
    flowName: definition.name || context.find(flowMeta.flowName),
    depth: context.get(flowMeta.depth),
    isParallel: context.get(flowMeta.isParallel),
    parentFlowName: context.find(flowMeta.parentFlowName),
  }
);
```

With:
```typescript
const executor = wrapWithExtensions(
  this.extensions,
  executeCore,
  this,
  {
    kind: "execution",
    target: {
      type: "flow",
      flow,
      definition,
    },
    input,
    key: undefined,
    context,
  }
);
```

**Step 2: Verify typecheck passes**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: SUCCESS (all type errors resolved)

**Step 3: Commit**

```bash
git add packages/next/src/scope.ts
git commit -m "refactor(scope): update exec() to use ExecutionOperation"
```

---

## Task 8: Update Test Helper createTrackingExtension

**Files:**
- Modify: `packages/next/tests/utils/index.ts:96-154`

**Step 1: Update OperationRecord type**

Replace:
```typescript
export type OperationRecord = {
  kind: string;
  flowName?: string;
  journalKey?: string;
  input?: unknown;
  output?: unknown;
  error?: unknown;
  params?: readonly unknown[];
  parallelMode?: string;
  promiseCount?: number;
};
```

With:
```typescript
export type OperationRecord = {
  kind: string;
  targetType?: "flow" | "fn" | "parallel";
  flowName?: string;
  key?: string;
  input?: unknown;
  output?: unknown;
  error?: unknown;
  params?: readonly unknown[];
  parallelMode?: string;
  count?: number;
};
```

**Step 2: Update createTrackingExtension wrap logic**

Replace the operation kind checks:
```typescript
wrap: (_scope, next, operation) => {
  if (filter && !filter(operation.kind)) {
    return next();
  }

  const record: OperationRecord = { kind: operation.kind };

  if (operation.kind === "execute") {
    record.flowName = operation.definition.name;
    record.input = operation.input;
  } else if (operation.kind === "journal") {
    record.journalKey = operation.key;
    record.params = operation.params;
  } else if (operation.kind === "subflow") {
    record.flowName = operation.definition.name;
    record.input = operation.input;
  } else if (operation.kind === "parallel") {
    record.parallelMode = operation.mode;
    record.promiseCount = operation.promiseCount;
  }

  return next()
    .then((result) => {
      record.output = result;
      records.push(record);
      return result;
    })
    .catch((error) => {
      record.error = error;
      records.push(record);
      throw error;
    });
},
```

With:
```typescript
wrap: (_scope, next, operation) => {
  if (filter && !filter(operation.kind)) {
    return next();
  }

  const record: OperationRecord = { kind: operation.kind };

  if (operation.kind === "execution") {
    record.targetType = operation.target.type;
    record.input = operation.input;
    record.key = operation.key;

    if (operation.target.type === "flow") {
      record.flowName = operation.target.definition.name;
    } else if (operation.target.type === "fn") {
      record.params = operation.target.params;
    } else if (operation.target.type === "parallel") {
      record.parallelMode = operation.target.mode;
      record.count = operation.target.count;
    }
  }

  return next()
    .then((result) => {
      record.output = result;
      records.push(record);
      return result;
    })
    .catch((error) => {
      record.error = error;
      records.push(record);
      throw error;
    });
},
```

**Step 3: Verify typecheck for tests**

Run: `pnpm -F @pumped-fn/core-next typecheck:full`
Expected: Test files may have errors (will fix next)

**Step 4: Commit**

```bash
git add packages/next/tests/utils/index.ts
git commit -m "refactor(tests): update tracking extension for new operation types"
```

---

## Task 9: Update extensions.test.ts Filters and Assertions

**Files:**
- Modify: `packages/next/tests/extensions.test.ts`

**Step 1: Update test filters from old operation kinds to "execution"**

Line 7: Replace `kind === "journal"` with:
```typescript
kind === "execution" && op.target.type === "fn" && op.key !== undefined
```

Line 31: Replace `kind === "execute" || kind === "subflow"` with:
```typescript
kind === "execution" && op.target.type === "flow"
```

**Step 2: Update assertions using old kind names**

Line 88: Replace `r.kind === "execute"` with:
```typescript
r.kind === "execution" && r.targetType === "flow"
```

Line 92: Replace `r.kind === "parallel"` with:
```typescript
r.kind === "execution" && r.targetType === "parallel"
```

Line 94: Replace `r.promiseCount` with `r.count`

Line 97: Replace `r.kind === "journal"` with:
```typescript
r.kind === "execution" && r.targetType === "fn" && r.key
```

Line 98: Replace `r.journalKey` with `r.key` (3 occurrences)

Line 112: Replace `r.kind === "journal"` with:
```typescript
r.kind === "execution" && r.targetType === "fn"
```

**Step 3: Fix filter functions to receive operation object**

Line 7: Change signature:
```typescript
const { ext, records } = createTrackingExtension((kind, op) =>
  kind === "execution" && op.kind === "execution" && op.target.type === "fn" && op.key !== undefined
);
```

Line 31: Change signature:
```typescript
const { ext, records } = createTrackingExtension((kind, op) =>
  kind === "execution" && op.kind === "execution" && op.target.type === "flow"
);
```

**Step 4: Update createTrackingExtension to pass operation to filter**

In `packages/next/tests/utils/index.ts`, change filter signature:
```typescript
export function createTrackingExtension(
  filter?: (kind: string, operation: Extension.Operation) => boolean
): {
  ext: Extension.Extension;
  records: OperationRecord[];
} {
  const records: OperationRecord[] = [];

  const ext: Extension.Extension = {
    name: "tracker",
    wrap: (_scope, next, operation) => {
      if (filter && !filter(operation.kind, operation)) {
        return next();
      }
      // ... rest unchanged
    },
  };

  return { ext, records };
}
```

**Step 5: Run tests**

Run: `pnpm -F @pumped-fn/core-next test extensions.test.ts`
Expected: All tests pass

**Step 6: Commit**

```bash
git add packages/next/tests/extensions.test.ts packages/next/tests/utils/index.ts
git commit -m "refactor(tests): update extensions.test.ts for new operation types"
```

---

## Task 10: Update flow-extension-fix.test.ts

**Files:**
- Modify: `packages/next/tests/flow-extension-fix.test.ts`

**Step 1: Search for old operation kind references**

Run: `grep -n "execute\|journal\|subflow\|parallel" packages/next/tests/flow-extension-fix.test.ts`

**Step 2: Update any operation kind checks**

Replace old kind checks with new pattern:
- `operation.kind === "execute"` → `operation.kind === "execution" && operation.target.type === "flow"`
- `operation.kind === "journal"` → `operation.kind === "execution" && operation.target.type === "fn" && operation.key`
- `operation.kind === "subflow"` → `operation.kind === "execution" && operation.target.type === "flow"`
- `operation.kind === "parallel"` → `operation.kind === "execution" && operation.target.type === "parallel"`

**Step 3: Run test**

Run: `pnpm -F @pumped-fn/core-next test flow-extension-fix.test.ts`
Expected: Pass

**Step 4: Commit**

```bash
git add packages/next/tests/flow-extension-fix.test.ts
git commit -m "refactor(tests): update flow-extension-fix.test.ts for new operations"
```

---

## Task 11: Update internal/extension-utils.test.ts

**Files:**
- Modify: `packages/next/tests/internal/extension-utils.test.ts`

**Step 1: Find operation references**

Run: `grep -n "kind:" packages/next/tests/internal/extension-utils.test.ts`

**Step 2: Update test mock operations to use new types**

Replace any mock operations like:
```typescript
{ kind: "execute", flow, definition, input, ... }
```

With:
```typescript
{ kind: "execution", target: { type: "flow", flow, definition }, input, key: undefined, context }
```

**Step 3: Run test**

Run: `pnpm -F @pumped-fn/core-next test internal/extension-utils.test.ts`
Expected: Pass

**Step 4: Commit**

```bash
git add packages/next/tests/internal/extension-utils.test.ts
git commit -m "refactor(tests): update extension-utils.test.ts for new operations"
```

---

## Task 12: Run Full Test Suite

**Step 1: Run all tests**

Run: `pnpm -F @pumped-fn/core-next test`
Expected: All tests pass

**Step 2: If failures, identify failing tests**

Run: `pnpm -F @pumped-fn/core-next test 2>&1 | grep -A 5 "FAIL"`

**Step 3: Fix remaining test failures**

For each failing test:
1. Read test file
2. Find operation kind references
3. Update to new pattern
4. Rerun test
5. Commit fix

**Step 4: Verify all tests pass**

Run: `pnpm -F @pumped-fn/core-next test`
Expected: All green

**Step 5: Commit any remaining fixes**

```bash
git add packages/next/tests/
git commit -m "refactor(tests): fix remaining tests for new operation types"
```

---

## Task 13: Update Extension Documentation in SKILL

**Files:**
- Modify: `.claude/skills/pumped-design/references/extension-basics.md`
- Modify: `.claude/skills/pumped-design/references/extension-authoring.md`

**Step 1: Update extension-basics.md operation type examples**

Replace old operation kind examples with new pattern:
```markdown
## Operation Types

Extensions can intercept two kinds of operations:

### 1. Resolve Operations
- `kind: "resolve"` - Executor resolution at scope level
- Fields: `executor`, `scope`, `operation: "resolve" | "update"`

### 2. Execution Operations
- `kind: "execution"` - Flow/function/parallel execution
- Fields: `target`, `input`, `key?`, `context`

Target types:
- `{ type: "flow", flow, definition }` - Flow execution
- `{ type: "fn", params? }` - Function execution
- `{ type: "parallel", mode, count }` - Parallel coordination

**Named operations** have `key` defined (for journaling/replay).
**Nesting context** available via `operation.context.get(flowMeta.depth)`.
```

**Step 2: Update extension-authoring.md with new operation patterns**

Update code examples to use new operation types:
```typescript
wrap(scope, next, operation) {
  if (operation.kind === "execution") {
    if (operation.target.type === "flow") {
      console.log(`Flow: ${operation.target.definition.name}`);
    } else if (operation.target.type === "fn" && operation.key) {
      console.log(`Named fn: ${operation.key}`);
    }
  }
  return next();
}
```

**Step 3: Commit documentation**

```bash
git add .claude/skills/pumped-design/references/
git commit -m "docs(skill): update extension docs for simplified operations"
```

---

## Task 14: Update Main Package Documentation

**Files:**
- Modify: `docs/guides/extensions.md` (if exists)
- Modify: `packages/next/README.md` (if has extension examples)

**Step 1: Search for extension documentation**

Run: `find docs -name "*.md" -exec grep -l "Extension" {} \;`

**Step 2: Update operation type references**

Replace old operation kind documentation with new 2-kind model.

**Step 3: Update code examples**

Ensure examples use:
- `operation.kind === "execution"`
- `operation.target.type` checks
- `operation.key` for named operations
- `operation.context.get(flowMeta.depth)` for nesting

**Step 4: Commit docs**

```bash
git add docs/ packages/next/README.md
git commit -m "docs: update extension documentation for simplified operations"
```

---

## Task 15: Final Verification and Cleanup

**Step 1: Run full typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck && pnpm -F @pumped-fn/core-next typecheck:full`
Expected: No errors

**Step 2: Run full test suite**

Run: `pnpm -F @pumped-fn/core-next test`
Expected: All pass

**Step 3: Run build**

Run: `pnpm -F @pumped-fn/core-next build`
Expected: Success

**Step 4: Verify examples typecheck**

Run: `pnpm -F @pumped-fn/examples typecheck`
Expected: Success (examples shouldn't reference Extension.Operation directly)

**Step 5: Search for any remaining old operation kind strings**

Run: `grep -r "\"execute\"" packages/next/src packages/next/tests --include="*.ts" | grep -v node_modules | grep kind`
Expected: No matches (or only in comments)

**Step 6: Final commit**

```bash
git add .
git commit -m "refactor: complete Extension.Operation simplification to 2 kinds"
```

---

## Summary

**Files Modified:**
- `packages/next/src/types.ts` - Type definitions
- `packages/next/src/flow.ts` - 6 wrapWithExtensions calls
- `packages/next/src/scope.ts` - 1 wrapWithExtensions call
- `packages/next/tests/utils/index.ts` - Test helper
- `packages/next/tests/extensions.test.ts` - Main extension tests
- `packages/next/tests/flow-extension-fix.test.ts` - Extension fix tests
- `packages/next/tests/internal/extension-utils.test.ts` - Internal tests
- `.claude/skills/pumped-design/references/extension-*.md` - Skill docs
- `docs/` - User-facing docs

**Migration Pattern:**
- Old: 5 kinds with explicit nesting fields
- New: 2 kinds (resolve/execution) with target discriminator and tag-based context

**Benefits:**
- Simpler mental model (2 vs 5 kinds)
- Easier AI explanation
- Tag-based nesting more flexible
- Named vs unnamed unified via `key?: string`
