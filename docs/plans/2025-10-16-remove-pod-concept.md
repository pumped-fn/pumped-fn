# Remove Pod Concept Implementation Plan

> **For Claude:** Use `${SUPERPOWERS_SKILLS_ROOT}/skills/collaboration/executing-plans/SKILL.md` to implement this plan task-by-task.

**Goal:** Remove the pod abstraction layer entirely, making flows execute directly on scope with flow context providing data isolation.

**Architecture:** Eliminate the scope → pod → flow → context hierarchy, simplifying to scope → flow → context. Extensions hook into flow lifecycle instead of pod lifecycle. All executor resolution happens on scope's cache, flow context handles data sharing.

**Tech Stack:** TypeScript, PNPM, ast-grep for refactoring

---

## Task 1: Update Extension Types to Remove Pod Lifecycle Hooks

**Files:**
- Modify: `packages/core-next/src/types.ts:687-710`
- Modify: `packages/core-next/src/types.ts:639-681`

**Step 1: Remove initPod and disposePod hooks from Extension interface**

In `packages/core-next/src/types.ts`, locate the Extension interface (around line 687) and remove these methods:

```typescript
initPod?(pod: Core.Pod, context: Accessor.DataStore): void | Promise<void> | Promised<void>;
disposePod?(pod: Core.Pod): void | Promise<void> | Promised<void>;
```

**Step 2: Update Operation types to remove pod field**

In the same file (around line 639-681), update Operation union types:

Remove `pod: Core.Pod` from:
- `{ kind: "journal", pod: Core.Pod, ... }` → `{ kind: "journal", context: Accessor.DataStore, ... }`
- `{ kind: "subflow", pod: Core.Pod, ... }` → `{ kind: "subflow", context: Accessor.DataStore, ... }`
- `{ kind: "parallel", pod: Core.Pod, ... }` → `{ kind: "parallel", context: Accessor.DataStore, ... }`

**Step 3: Run typecheck to see what breaks**

```bash
pnpm -F @pumped-fn/core-next typecheck
```

Expected: Compilation errors in flow.ts, extensions.test.ts (these will be fixed in subsequent tasks)

**Step 4: Commit**

```bash
git add packages/core-next/src/types.ts
git commit -m "refactor: remove pod lifecycle hooks from Extension interface"
```

---

## Task 2: Remove Pod Type Definitions

**Files:**
- Modify: `packages/core-next/src/types.ts:355-398`

**Step 1: Remove Pod interface definition**

In `packages/core-next/src/types.ts` (around line 355-360), remove:

```typescript
export interface Pod extends Omit<Core.Scope,
  "update" | "disposePod" | "onChange" | "registeredExecutors"
>, Meta.MetaContainer {}
```

**Step 2: Remove pod-related methods from Scope interface**

In the same file, find the Scope interface and remove:

```typescript
pod(...preset: Core.Preset<unknown>[]): Core.Pod;
pod(options?: {
  initialValues?: Core.Preset<unknown>[];
  extensions?: Extension.Extension[];
  meta?: Meta.Meta<unknown>[]
}): Core.Pod;
disposePod(pod: Core.Pod): Promised<void>;
```

**Step 3: Remove pod field from Flow.Context type**

In `packages/core-next/src/types.ts` (around line 576-621), remove:

```typescript
readonly pod: Core.Pod;
```

From the Flow.Context type (type `C`).

**Step 4: Run typecheck**

```bash
pnpm -F @pumped-fn/core-next typecheck
```

Expected: More compilation errors (will be fixed in flow and scope tasks)

**Step 5: Commit**

```bash
git add packages/core-next/src/types.ts
git commit -m "refactor: remove Pod type definitions from types"
```

---

## Task 3: Refactor FlowContext to Use Scope Directly

**Files:**
- Modify: `packages/core-next/src/flow.ts:181-198`
- Modify: `packages/core-next/src/flow.ts:630-777`

**Step 1: Update FlowContext constructor to accept scope instead of pod**

In `packages/core-next/src/flow.ts` (around line 181-198), change:

```typescript
class FlowContext implements Flow.Context {
  private readonly scope: Core.Scope;
  private readonly extensions: Extension.Extension[];
  private readonly parent?: FlowContext;
  private readonly datastore: Map<string, unknown>;

  constructor(
    scope: Core.Scope,
    extensions: Extension.Extension[],
    parent?: FlowContext
  ) {
    this.scope = scope;
    this.extensions = extensions;
    this.parent = parent;
    this.datastore = new Map();
  }

  // Remove: public readonly pod: Core.Pod;

  // Add scope accessor methods that delegate to this.scope
  resolve<T>(executor: Core.Executor<T>): Promised<T> {
    return this.scope.resolve(executor);
  }

  accessor<T>(executor: Core.Executor<T>): Core.Accessor<T> {
    return this.scope.accessor(executor);
  }
```

**Step 2: Update all FlowContext.pod usages to FlowContext.scope**

Throughout flow.ts, replace all references to `this.pod` or `context.pod` with `this.scope` or `context.scope`.

**Step 3: Remove pod creation from flow.execute()**

In `packages/core-next/src/flow.ts` (around line 630-777), find the execute function and remove pod creation:

```typescript
// REMOVE:
const pod = scope.pod({
  initialValues: options?.presets,
  meta: options?.meta
});

// CHANGE:
const context = new FlowContext(
  pod,  // OLD
  extensions,
  undefined
);

// TO:
const context = new FlowContext(
  scope,  // NEW
  extensions,
  undefined
);
```

**Step 4: Remove pod disposal logic**

In the same function, remove:

```typescript
// REMOVE:
await scope.disposePod(pod);
```

**Step 5: Update extension calls to remove initPod/disposePod**

Remove these calls:

```typescript
// REMOVE:
for (const ext of extensions) {
  if (ext.initPod) {
    await ext.initPod(pod, context);
  }
}

// REMOVE (from disposal):
for (const ext of extensions) {
  if (ext.disposePod) {
    await ext.disposePod(pod);
  }
}
```

**Step 6: Update Operation objects to pass context instead of pod**

Change:

```typescript
{ kind: "journal", pod, ... }  // OLD
{ kind: "subflow", pod, ... }  // OLD
{ kind: "parallel", pod, ... }  // OLD
```

To:

```typescript
{ kind: "journal", context: datastore, ... }  // NEW
{ kind: "subflow", context: datastore, ... }  // NEW
{ kind: "parallel", context: datastore, ... }  // NEW
```

**Step 7: Run typecheck**

```bash
pnpm -F @pumped-fn/core-next typecheck
```

Expected: Errors in scope.ts (Pod class still exists), tests (using old API)

**Step 8: Commit**

```bash
git add packages/core-next/src/flow.ts
git commit -m "refactor: make FlowContext use scope directly instead of pod"
```

---

## Task 4: Remove Pod Class and Methods from Scope

**Files:**
- Modify: `packages/core-next/src/scope.ts:994-1257`

**Step 1: Remove pod() method from BaseScope class**

In `packages/core-next/src/scope.ts` (around line 996-1015), delete:

```typescript
pod(...preset: Core.Preset<unknown>[]): Core.Pod;
pod(options: PodOption): Core.Pod;
pod(...args: Core.Preset<unknown>[] | [PodOption]): Core.Pod {
  // ... entire implementation
}
```

**Step 2: Remove disposePod() method**

In the same file (around line 1017-1026), delete:

```typescript
disposePod(pod: Core.Pod): Promised<void> {
  // ... entire implementation
}
```

**Step 3: Remove Pod class entirely**

Delete the entire Pod class implementation (lines 1127-1257):

```typescript
// DELETE ENTIRE CLASS:
class Pod extends BaseScope implements Core.Pod {
  // ... everything
}
```

**Step 4: Remove PodOption interface**

Find and remove the PodOption interface definition.

**Step 5: Run typecheck**

```bash
pnpm -F @pumped-fn/core-next typecheck
```

Expected: Only test files should have errors now

**Step 6: Commit**

```bash
git add packages/core-next/src/scope.ts
git commit -m "refactor: remove Pod class and pod creation methods from scope"
```

---

## Task 5: Update Error Codes

**Files:**
- Modify: `packages/core-next/src/errors.ts`

**Step 1: Remove pod-related error codes**

Search for error code S005 or any pod-related error messages and remove them:

```bash
# Search for pod-related errors
grep -n "pod" packages/core-next/src/errors.ts
```

**Step 2: Remove the error definitions**

Delete any error codes or messages related to pod operations.

**Step 3: Commit**

```bash
git add packages/core-next/src/errors.ts
git commit -m "refactor: remove pod-related error codes"
```

---

## Task 6: Update Core Tests - Remove Pod Usage

**Files:**
- Modify: `packages/core-next/tests/core.test.ts:286-496`

**Step 1: Remove or refactor pod-specific tests**

In `packages/core-next/tests/core.test.ts`, identify tests that specifically test pod behavior (lines 286-496). Options:

A) **Delete** if testing pod-specific isolation (no longer relevant)
B) **Refactor** if testing valuable behavior now handled by flow context

**Tests to DELETE** (pod-specific isolation):
- "pod resolves .static dependencies as accessors" (line 423-446) - behavior now always true on scope
- "pod resolves dependencies through parent scope cache" (line 448-496) - no pod to test
- Any test with `scope.pod()` that tests isolation

**Tests to KEEP/REFACTOR** (move to flow tests if testing data sharing):
- Tests about context isolation → move to flow context tests

**Step 2: Remove the tests**

Delete the entire test blocks for pod-specific tests:

```typescript
// DELETE THESE TESTS:
test("pod resolves .static dependencies as accessors", async () => {
  // ...
});

test("pod resolves dependencies through parent scope cache", async () => {
  // ...
});

// Any other tests using scope.pod()
```

**Step 3: Run tests**

```bash
pnpm -F @pumped-fn/core-next test tests/core.test.ts
```

Expected: All tests pass

**Step 4: Commit**

```bash
git add packages/core-next/tests/core.test.ts
git commit -m "test: remove pod-specific tests from core.test.ts"
```

---

## Task 7: Update Meta Tests - Remove Pod Usage

**Files:**
- Modify: `packages/core-next/tests/meta.test.ts:49-146`

**Step 1: Review pod tests in meta.test.ts**

Open `packages/core-next/tests/meta.test.ts` and review lines 49-146 for pod usage.

**Step 2: Refactor tests to use flow context for meta testing**

If tests are checking meta propagation through pod, refactor to test meta propagation through flow context instead:

```typescript
// OLD:
const pod = scope.pod({ meta: [someMeta(value)] });
const result = await pod.resolve(executor);

// NEW (if testing meta in flow):
const result = await scope.exec(
  flow((c) => c.resolve(executor)),
  undefined,
  { meta: [someMeta(value)] }
);
```

**Step 3: Run tests**

```bash
pnpm -F @pumped-fn/core-next test tests/meta.test.ts
```

Expected: All tests pass

**Step 4: Commit**

```bash
git add packages/core-next/tests/meta.test.ts
git commit -m "test: refactor meta tests to use flow context instead of pod"
```

---

## Task 8: Update Extension Tests - Remove Pod Hooks

**Files:**
- Modify: `packages/core-next/tests/extensions.test.ts:290-328`

**Step 1: Review extension tests using pod lifecycle**

Open `packages/core-next/tests/extensions.test.ts` and review lines 290-328 for initPod/disposePod usage.

**Step 2: Remove tests for pod lifecycle hooks**

Delete tests that specifically test initPod/disposePod:

```typescript
// DELETE:
test("extension initPod hook called on pod creation", async () => {
  // ...
});

test("extension disposePod hook called on pod disposal", async () => {
  // ...
});
```

**Step 3: If testing extension state management, refactor to flow lifecycle**

If tests verify extensions can maintain per-execution state, keep the test but refactor to use flow:

```typescript
// Verify extensions can use flow context for per-execution state
test("extension can maintain per-flow state via context", async () => {
  let executions = 0;

  const ext: Extension.Extension = {
    wrap: async (context, next, operation) => {
      context.set("execution", ++executions);
      return await next();
    }
  };

  const scope = createScope();
  scope.useExtension(ext);

  await scope.exec(flow((c) => c.get("execution")), undefined);
  // Verify execution count
});
```

**Step 4: Run tests**

```bash
pnpm -F @pumped-fn/core-next test tests/extensions.test.ts
```

Expected: All tests pass

**Step 5: Commit**

```bash
git add packages/core-next/tests/extensions.test.ts
git commit -m "test: remove pod lifecycle tests from extensions.test.ts"
```

---

## Task 9: Run Full Test Suite and Typecheck

**Files:**
- Verify: All files in `packages/core-next`

**Step 1: Run full typecheck**

```bash
pnpm -F @pumped-fn/core-next typecheck
```

Expected: No errors

**Step 2: Run full test suite**

```bash
pnpm -F @pumped-fn/core-next test
```

Expected: All tests pass

**Step 3: If any errors, fix them**

Review any remaining errors and fix:
- Missing imports
- Incorrect type references
- Test assertions that need updating

**Step 4: Run final verification**

```bash
pnpm -F @pumped-fn/core-next typecheck && pnpm -F @pumped-fn/core-next test
```

Expected: Everything passes

**Step 5: Commit any fixes**

```bash
git add .
git commit -m "fix: resolve remaining typecheck and test issues"
```

---

## Task 10: Update Documentation

**Files:**
- Modify: `packages/core-next/CLAUDE.md`
- Modify: `packages/core-next/CHANGELOG.md`

**Step 1: Update CLAUDE.md to remove pod concept**

In `/home/lagz0ne/dev/pumped-fn/CLAUDE.md`, find the principles section and update:

```markdown
<!-- REMOVE: -->
- a scope is used for a long running operation, like a server, a cron. It should be there to hold the
reference of long-running resources like database connection, service connections, configs, server
references etc. However, system normally has short-span and long-span operation. Short-span context is
called "pod". A pod is a fork version of scope. Actualization against a pod will copy value already resolved
from the scope into the computation, and keep everything local at the pod, that'll make the pod isolated
from each others while still be able to reuse resources from the scope. Disposing the pod will not cause any
side effect to the scope

<!-- REPLACE WITH: -->
- a scope is used for a long running operation, like a server, a cron. It should be there to hold the
reference of long-running resources like database connection, service connections, configs, server
references etc. System normally has short-span and long-span operation. Short-span operations are handled
by flows executing directly on the scope, with flow context providing data isolation between executions.
Disposing the flow cleans up flow-specific resources without affecting the scope.
```

**Step 2: Add CHANGELOG entry**

In `packages/core-next/CHANGELOG.md`, add a new version entry:

```markdown
## [Unreleased]

### Breaking Changes

- **REMOVED: Pod concept entirely**
  - Removed `Scope.pod()` and `Scope.disposePod()` methods
  - Removed `Core.Pod` type
  - Flows now execute directly on scope instead of creating intermediate pod layer
  - Extensions: Removed `initPod` and `disposePod` lifecycle hooks
  - Flow context provides data isolation (no need for pod layer)

### Migration Guide

**Before:**
```typescript
const pod = scope.pod({ initialValues: [...], meta: [...] });
const result = await pod.resolve(executor);
await scope.disposePod(pod);
```

**After:**
```typescript
// Flows execute directly on scope
const result = await scope.exec(
  flow((c) => c.resolve(executor)),
  undefined,
  { presets: [...], meta: [...] }
);
// Flow cleanup is automatic
```

**Extension Authors:**
```typescript
// Before: initPod/disposePod hooks
const extension: Extension = {
  initPod: async (pod, context) => { /* setup */ },
  disposePod: async (pod) => { /* cleanup */ }
};

// After: Use flow context and wrap operations
const extension: Extension = {
  wrap: async (context, next, operation) => {
    // Setup per-execution state in context
    context.set("state", initState());
    const result = await next();
    // Cleanup if needed
    return result;
  }
};
```

### Rationale

Removing pods simplifies the architecture:
- **Simpler mental model**: `scope → flow → context` instead of `scope → pod → flow → context`
- **Fewer footguns**: No more `.static` linkage bugs or cache delegation issues
- **Less cognitive overhead**: Two places for data (scope resources, flow context) instead of three (scope, pod, context)
- **Flow context sufficient**: Already provides data isolation and sharing between executions
```

**Step 3: Commit**

```bash
git add CLAUDE.md packages/core-next/CHANGELOG.md
git commit -m "docs: update documentation to reflect pod removal"
```

---

## Task 11: Final Cleanup - Search for Remaining Pod References

**Files:**
- Verify: Entire codebase

**Step 1: Search for any remaining "pod" references**

```bash
grep -r "pod" packages/core-next/src --include="*.ts" --exclude-dir=node_modules
grep -r "Pod" packages/core-next/src --include="*.ts" --exclude-dir=node_modules
```

**Step 2: Review results and clean up**

Check each result:
- Remove if it's a leftover pod reference
- Keep if it's unrelated (e.g., "iPod", "podcast", comment about "podman")

**Step 3: Search tests**

```bash
grep -r "pod" packages/core-next/tests --include="*.ts"
grep -r "Pod" packages/core-next/tests --include="*.ts"
```

**Step 4: Clean up any remaining test references**

**Step 5: Final verification**

```bash
pnpm -F @pumped-fn/core-next typecheck
pnpm -F @pumped-fn/core-next test
```

Expected: All pass, no pod references remain

**Step 6: Commit**

```bash
git add .
git commit -m "chore: remove all remaining pod references"
```

---

## Execution Complete

After completing all tasks:

1. Review the git log: `git log --oneline -15`
2. Verify clean typecheck: `pnpm -F @pumped-fn/core-next typecheck`
3. Verify all tests pass: `pnpm -F @pumped-fn/core-next test`
4. Create a final commit if needed: `git add . && git commit -m "refactor: complete pod removal"`

The codebase should now have:
- ✅ No pod class or interfaces
- ✅ Flows execute directly on scope
- ✅ Extensions use flow lifecycle instead of pod lifecycle
- ✅ All tests passing
- ✅ Documentation updated
