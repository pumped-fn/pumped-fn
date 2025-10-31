# Flow Extension Wrapping Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Fix scope extensions not wrapping flow execution operations by making `flow.execute()` delegate to `scope.exec()` and enforcing scope XOR extensions options via discriminated union.

**Architecture:** Establish `scope.exec()` as single entry point for flow execution. `flow.execute()` becomes pure delegation - creates scope if needed, then calls `scope.exec()`. No extension merging needed.

**Tech Stack:** TypeScript, pumped-fn core library, vitest for testing

---

## Task 1: Update flow.ts execute() signature with discriminated union

**Files:**
- Modify: `packages/next/src/flow.ts:592-721`

**Step 1: Write failing test for new options type**

Create: `packages/next/tests/flow-extension-fix.test.ts`

```typescript
import { describe, test, expect, vi } from "vitest";
import { flow, createScope, extension } from "../src";

describe("Flow Extension Wrapping Fix", () => {
  test("flow.execute with scope uses scope extensions", async () => {
    const operations: string[] = [];

    const trackingExtension = extension({
      name: "tracker",
      wrap: (_scope, next, operation) => {
        operations.push(operation.kind);
        return next();
      },
    });

    const scope = createScope({ extensions: [trackingExtension] });

    const simpleFlow = flow((_ctx, input: number) => input * 2);

    const result = await flow.execute(simpleFlow, 5, { scope });

    expect(result).toBe(10);
    expect(operations).toContain("execute");
  });

  test("flow.execute without scope creates temporary scope with extensions", async () => {
    const operations: string[] = [];

    const trackingExtension = extension({
      name: "tracker",
      wrap: (_scope, next, operation) => {
        operations.push(operation.kind);
        return next();
      },
    });

    const simpleFlow = flow((_ctx, input: number) => input * 2);

    const result = await flow.execute(simpleFlow, 5, { extensions: [trackingExtension] });

    expect(result).toBe(10);
    expect(operations).toContain("execute");
  });

  test("executionTags are passed to flow execution", async () => {
    let capturedTags: unknown;

    const tagCaptureExtension = extension({
      name: "tag-capture",
      wrap: (scope, next, _operation) => {
        capturedTags = scope.tags;
        return next();
      },
    });

    const scope = createScope({ extensions: [tagCaptureExtension] });
    const simpleFlow = flow((_ctx, input: number) => input * 2);

    await flow.execute(simpleFlow, 5, { scope, executionTags: [{ key: Symbol("test"), value: "test-value" }] });

    expect(capturedTags).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @pumped-fn/core-next test flow-extension-fix`
Expected: Type errors on `flow.execute` options and test failures

**Step 3: Update execute() function signature in flow.ts**

Modify: `packages/next/src/flow.ts:592-629`

Replace existing overloads with new discriminated union:

```typescript
function execute<S, I>(
  flow: Core.Executor<Flow.Handler<S, I>> | Flow.Flow<I, S>,
  input: I,
  options: {
    scope: Core.Scope;
    executionTags?: Tag.Tagged[];
    details: true;
  }
): Promised<Flow.ExecutionDetails<S>>;

function execute<S, I>(
  flow: Core.Executor<Flow.Handler<S, I>> | Flow.Flow<I, S>,
  input: I,
  options?: {
    scope: Core.Scope;
    executionTags?: Tag.Tagged[];
    details?: false;
  }
): Promised<S>;

function execute<S, I>(
  flow: Core.Executor<Flow.Handler<S, I>> | Flow.Flow<I, S>,
  input: I,
  options: Omit<ScopeOption, 'tags'> & {
    scopeTags?: Tag.Tagged[];
    executionTags?: Tag.Tagged[];
    details: true;
  }
): Promised<Flow.ExecutionDetails<S>>;

function execute<S, I>(
  flow: Core.Executor<Flow.Handler<S, I>> | Flow.Flow<I, S>,
  input: I,
  options?: Omit<ScopeOption, 'tags'> & {
    scopeTags?: Tag.Tagged[];
    executionTags?: Tag.Tagged[];
    details?: false;
  }
): Promised<S>;

function execute<S, I>(
  flow: Core.Executor<Flow.Handler<S, I>> | Flow.Flow<I, S>,
  input: I,
  options?:
    | {
        scope: Core.Scope;
        executionTags?: Tag.Tagged[];
        details?: boolean;
      }
    | (Omit<ScopeOption, 'tags'> & {
        scopeTags?: Tag.Tagged[];
        executionTags?: Tag.Tagged[];
        details?: boolean;
      })
): Promised<S> | Promised<Flow.ExecutionDetails<S>>
```

**Step 4: Run typecheck to verify signature compiles**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: Type errors in implementation body (expected at this stage)

**Step 5: Commit signature changes**

```bash
git add packages/next/src/flow.ts packages/next/tests/flow-extension-fix.test.ts
git commit -m "feat(flow): add discriminated union options to execute()"
```

---

## Task 2: Update scope.exec() to accept executionTags

**Files:**
- Modify: `packages/next/src/scope.ts:1068-1128`
- Modify: `packages/next/src/types.ts` (Core.Scope interface)

**Step 1: Update Core.Scope interface in types.ts**

Modify: `packages/next/src/types.ts:370-387`

Replace existing `exec` signature with:

```typescript
exec<S, I = undefined>(
  flow: Core.Executor<Flow.Handler<S, I>>,
  input?: I,
  options?: {
    tags?: Tag.Tagged[];
    details?: false;
  }
): Promised<S>;

exec<S, I = undefined>(
  flow: Core.Executor<Flow.Handler<S, I>>,
  input: I | undefined,
  options: {
    tags?: Tag.Tagged[];
    details: true;
  }
): Promised<Flow.ExecutionDetails<S>>;
```

**Step 2: Update BaseScope.exec() implementation signature**

Modify: `packages/next/src/scope.ts:1068-1108`

Replace overloads with:

```typescript
exec<S, I = undefined>(
  flow: Core.Executor<Flow.Handler<S, I>>,
  input?: I,
  options?: {
    tags?: Tag.Tagged[];
    details?: false;
  }
): Promised<S>;

exec<S, I = undefined>(
  flow: Core.Executor<Flow.Handler<S, I>>,
  input: I | undefined,
  options: {
    tags?: Tag.Tagged[];
    details: true;
  }
): Promised<Flow.ExecutionDetails<S>>;

exec<S, I = undefined>(
  flow: Core.Executor<Flow.Handler<S, I>>,
  input?: I,
  options?: {
    tags?: Tag.Tagged[];
    details?: boolean;
  }
): Promised<S> | Promised<Flow.ExecutionDetails<S>> {
  this["~ensureNotDisposed"]();

  // Keep existing implementation for now
  if (options?.details === true) {
    return flowApi.execute(flow, input as I, {
      scope: this,
      extensions: undefined,
      initialContext: undefined,
      tags: options.tags,
      details: true,
    });
  }

  return flowApi.execute(flow, input as I, {
    scope: this,
    extensions: undefined,
    initialContext: undefined,
    tags: options?.tags,
    details: false,
  });
}
```

**Step 3: Run typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: Type errors in flow.ts execute() (will fix in next task)

**Step 4: Commit scope interface changes**

```bash
git add packages/next/src/scope.ts packages/next/src/types.ts
git commit -m "feat(scope): update exec() to accept executionTags"
```

---

## Task 3: Implement flow.execute() delegation logic

**Files:**
- Modify: `packages/next/src/flow.ts:630-721`

**Step 1: Replace execute() implementation body**

Modify: `packages/next/src/flow.ts:630-721`

Replace entire function body with delegation logic:

```typescript
function execute<S, I>(
  flow: Core.Executor<Flow.Handler<S, I>> | Flow.Flow<I, S>,
  input: I,
  options?:
    | {
        scope: Core.Scope;
        executionTags?: Tag.Tagged[];
        details?: boolean;
      }
    | (Omit<ScopeOption, 'tags'> & {
        scopeTags?: Tag.Tagged[];
        executionTags?: Tag.Tagged[];
        details?: boolean;
      })
): Promised<S> | Promised<Flow.ExecutionDetails<S>> {
  if (options && 'scope' in options) {
    return options.scope.exec(flow, input, {
      tags: options.executionTags,
      details: options.details,
    });
  }

  const scope = options
    ? createScope({
        initialValues: options.initialValues,
        registry: options.registry,
        extensions: options.extensions,
        tags: options.scopeTags,
      })
    : createScope();

  const shouldDisposeScope = true;

  const execOptions: { tags?: Tag.Tagged[]; details?: boolean } = {
    tags: options?.executionTags,
    details: options?.details,
  };

  if (options?.details === true) {
    const result = scope.exec(flow, input, { ...execOptions, details: true });
    if (shouldDisposeScope) {
      return Promised.create(
        result.then((r) => scope.dispose().then(() => r))
      );
    }
    return result;
  }

  const result = scope.exec(flow, input, execOptions);
  if (shouldDisposeScope) {
    return Promised.create(
      result.then((r) => scope.dispose().then(() => r))
    );
  }
  return result;
}
```

**Step 2: Run typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: PASS (no type errors)

**Step 3: Run tests to verify delegation works**

Run: `pnpm -F @pumped-fn/core-next test flow-extension-fix`
Expected: Tests still fail (scope.exec doesn't use scope extensions yet)

**Step 4: Commit delegation implementation**

```bash
git add packages/next/src/flow.ts
git commit -m "feat(flow): implement execute() delegation to scope.exec()"
```

---

## Task 4: Make scope.exec() use scope extensions

**Files:**
- Modify: `packages/next/src/scope.ts:1068-1128`
- Modify: `packages/next/src/flow.ts` (move execute logic to scope)

**Step 1: Extract core execution logic to private method in scope.ts**

Add new private method to BaseScope class (around line 1130):

```typescript
private "~executeFlow"<S, I>(
  flow: Core.Executor<Flow.Handler<S, I>>,
  input: I,
  executionTags?: Tag.Tagged[]
): Promised<S> {
  let resolveSnapshot!: (snapshot: Flow.ExecutionData | undefined) => void;
  const snapshotPromise = new Promise<Flow.ExecutionData | undefined>(
    (resolve) => {
      resolveSnapshot = resolve;
    }
  );

  const promise = (async () => {
    const context = new FlowContext(this, this.extensions, executionTags);

    try {
      const executeCore = (): Promised<S> => {
        return this.resolve(flow).map(async (handler) => {
          const definition = flowDefinitionMeta.find(flow);
          if (!definition) {
            throw new Error("Flow definition not found in executor metadata");
          }
          const validated = validate(definition.input, input);

          context.initializeExecutionContext(definition.name, false);

          const result = await handler(context, validated);

          validate(definition.output, result);

          return result;
        });
      };

      const definition = flowDefinitionMeta.find(flow);
      if (!definition) {
        throw new Error("Flow definition not found in executor metadata");
      }

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

      const result = await executor();
      resolveSnapshot(context.createSnapshot());
      return result;
    } catch (error) {
      resolveSnapshot(context.createSnapshot());
      throw error;
    }
  })();

  return Promised.create(promise, snapshotPromise);
}
```

**Step 2: Update scope.exec() to use new private method**

Modify: `packages/next/src/scope.ts:1068-1128`

```typescript
exec<S, I = undefined>(
  flow: Core.Executor<Flow.Handler<S, I>>,
  input?: I,
  options?: {
    tags?: Tag.Tagged[];
    details?: boolean;
  }
): Promised<S> | Promised<Flow.ExecutionDetails<S>> {
  this["~ensureNotDisposed"]();

  if (options?.details === true) {
    const result = this["~executeFlow"](flow, input as I, options.tags);
    return Promised.create(
      result.then(async (r) => {
        const ctx = await result["snapshotPromise"];
        if (!ctx) {
          throw new Error("Execution context not available");
        }
        return { success: true as const, result: r, ctx };
      }).catch(async (error) => {
        const ctx = await result["snapshotPromise"];
        if (!ctx) {
          throw new Error("Execution context not available");
        }
        return { success: false as const, error, ctx };
      })
    );
  }

  return this["~executeFlow"](flow, input as I, options?.tags);
}
```

**Step 3: Import required dependencies at top of scope.ts**

Add after existing imports in `packages/next/src/scope.ts`:

```typescript
import { flow as flowApi, FlowContext, flowMeta, flowDefinitionMeta } from "./flow";
import { validate } from "./ssch";
```

**Step 4: Run typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: Type errors (FlowContext and other internals not exported)

**Step 5: Export required types from flow.ts**

Modify: `packages/next/src/flow.ts` - add exports at bottom:

```typescript
export { FlowContext, flowMeta, flowDefinitionMeta, wrapWithExtensions };
```

**Step 6: Run typecheck again**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: PASS

**Step 7: Run tests**

Run: `pnpm -F @pumped-fn/core-next test flow-extension-fix`
Expected: PASS (scope extensions now wrap flow execution)

**Step 8: Commit scope execution implementation**

```bash
git add packages/next/src/scope.ts packages/next/src/flow.ts
git commit -m "feat(scope): implement flow execution using scope extensions"
```

---

## Task 5: Update existing tests for breaking changes

**Files:**
- Modify: `packages/next/tests/core.test.ts`
- Modify: `packages/next/tests/extensions.test.ts`

**Step 1: Run full test suite to identify failures**

Run: `pnpm -F @pumped-fn/core-next test`
Expected: Some tests fail due to changed options structure

**Step 2: Update core.test.ts tests using old options**

Check if any tests in `packages/next/tests/core.test.ts` pass both `scope` and `extensions` (should be none, but verify).

Run: `pnpm -F @pumped-fn/core-next test core.test`
Expected: PASS (no changes needed)

**Step 3: Update extensions.test.ts if needed**

Run: `pnpm -F @pumped-fn/core-next test extensions.test`
Expected: PASS (tests already use correct pattern)

**Step 4: Run full test suite**

Run: `pnpm -F @pumped-fn/core-next test`
Expected: All tests PASS

**Step 5: Commit any test fixes**

```bash
git add packages/next/tests/
git commit -m "test: update tests for new flow.execute() options"
```

---

## Task 6: Remove unused code from flow.ts

**Files:**
- Modify: `packages/next/src/flow.ts`

**Step 1: Identify unused execute implementation code**

The old `execute()` implementation body (lines 640-720) is now unused since we delegate to `scope.exec()`.

However, the internal execution logic was moved to `scope.ts`, so we can clean up:
- Remove `wrapWithExtensions` function export (keep internal use)
- Remove old execute implementation comments

**Step 2: Clean up exports**

Modify: `packages/next/src/flow.ts` exports:

Keep only necessary exports for scope.ts:

```typescript
export { FlowContext, flowMeta, flowDefinitionMeta };
```

Remove `wrapWithExtensions` from exports if it was added.

**Step 3: Run typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: Type error if scope.ts uses wrapWithExtensions

**Step 4: Make wrapWithExtensions accessible to scope.ts**

Keep `wrapWithExtensions` at module level but don't export externally. Scope.ts imports from same module.

**Step 5: Run typecheck again**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: PASS

**Step 6: Run full test suite**

Run: `pnpm -F @pumped-fn/core-next test`
Expected: All tests PASS

**Step 7: Commit cleanup**

```bash
git add packages/next/src/flow.ts packages/next/src/scope.ts
git commit -m "refactor(flow): remove unused code after delegation refactor"
```

---

## Task 7: Add comprehensive test coverage

**Files:**
- Modify: `packages/next/tests/flow-extension-fix.test.ts`

**Step 1: Add test for ctx.exec extension wrapping**

Add to `packages/next/tests/flow-extension-fix.test.ts`:

```typescript
test("scope extensions wrap ctx.exec subflow operations", async () => {
  const operations: string[] = [];

  const trackingExtension = extension({
    name: "tracker",
    wrap: (_scope, next, operation) => {
      operations.push(operation.kind);
      return next();
    },
  });

  const scope = createScope({ extensions: [trackingExtension] });

  const childFlow = flow((_ctx, input: number) => input + 1);
  const parentFlow = flow(async (ctx, input: number) => {
    const result = await ctx.exec(childFlow, input);
    return result * 2;
  });

  const result = await flow.execute(parentFlow, 5, { scope });

  expect(result).toBe(12);
  expect(operations).toContain("execute");
  expect(operations).toContain("subflow");
});
```

**Step 2: Add test for ctx.run extension wrapping**

Add to same file:

```typescript
test("scope extensions wrap ctx.run journal operations", async () => {
  const operations: string[] = [];

  const trackingExtension = extension({
    name: "tracker",
    wrap: (_scope, next, operation) => {
      operations.push(operation.kind);
      return next();
    },
  });

  const scope = createScope({ extensions: [trackingExtension] });

  const journaledFlow = flow(async (ctx, input: number) => {
    const doubled = await ctx.run("double", () => input * 2);
    return doubled + 1;
  });

  const result = await flow.execute(journaledFlow, 5, { scope });

  expect(result).toBe(11);
  expect(operations).toContain("execute");
  expect(operations).toContain("journal");
});
```

**Step 3: Add test for scopeTags vs executionTags distinction**

```typescript
test("scopeTags attach to scope, executionTags to execution", async () => {
  let capturedScopeTags: unknown;
  let capturedExecutionTags: unknown;

  const scopeTagSymbol = Symbol("scope-tag");
  const executionTagSymbol = Symbol("execution-tag");

  const tagCaptureExtension = extension({
    name: "tag-capture",
    wrap: (scope, next, _operation) => {
      capturedScopeTags = scope.tags;
      return next();
    },
  });

  const simpleFlow = flow((ctx, input: number) => {
    capturedExecutionTags = ctx.tags;
    return input * 2;
  });

  await flow.execute(simpleFlow, 5, {
    extensions: [tagCaptureExtension],
    scopeTags: [{ key: scopeTagSymbol, value: "scope-value" }],
    executionTags: [{ key: executionTagSymbol, value: "execution-value" }],
  });

  expect(capturedScopeTags).toBeDefined();
  expect(capturedExecutionTags).toBeDefined();
});
```

**Step 4: Add test for temporary scope disposal**

```typescript
test("temporary scope is disposed after execution", async () => {
  const disposeEvents: string[] = [];

  const lifecycleExtension = extension({
    name: "lifecycle",
    init: () => {
      disposeEvents.push("init");
    },
    dispose: async () => {
      disposeEvents.push("dispose");
    },
  });

  const simpleFlow = flow((_ctx, input: number) => input * 2);

  await flow.execute(simpleFlow, 5, { extensions: [lifecycleExtension] });

  expect(disposeEvents).toEqual(["init", "dispose"]);
});
```

**Step 5: Run new tests**

Run: `pnpm -F @pumped-fn/core-next test flow-extension-fix`
Expected: All new tests PASS

**Step 6: Commit test additions**

```bash
git add packages/next/tests/flow-extension-fix.test.ts
git commit -m "test: add comprehensive coverage for flow extension wrapping"
```

---

## Task 8: Update documentation and examples

**Files:**
- Check: `docs/guides/` for flow usage
- Check: `examples/` for flow.execute usage

**Step 1: Search for flow.execute usage in docs**

Run: `grep -r "flow.execute" docs/`
Expected: List of files using flow.execute

**Step 2: Update any docs showing old options pattern**

If any docs show `{ scope, extensions }`, update to show correct usage:
- Use scope OR extensions, not both
- Show executionTags usage

**Step 3: Search for flow.execute usage in examples**

Run: `grep -r "flow.execute" examples/`
Expected: List of example files

**Step 4: Update examples if needed**

Review and update any examples showing old patterns.

**Step 5: Run example typechecks**

Run: `pnpm -F @pumped-fn/examples typecheck`
Expected: PASS

**Step 6: Commit documentation updates**

```bash
git add docs/ examples/
git commit -m "docs: update flow.execute usage for new options API"
```

---

## Task 9: Update SKILL.md with new API

**Files:**
- Modify: `.claude/skills/pumped-fn/SKILL.md`

**Step 1: Find flow.execute documentation in SKILL.md**

Search for sections documenting flow.execute options.

**Step 2: Update options documentation**

Update to reflect new discriminated union:
- Document scope + executionTags option
- Document extensions + scopeTags + executionTags option
- Note breaking change: can't mix scope and extensions

**Step 3: Add migration guidance**

Add section explaining:
- Old: `flow.execute(f, input, { scope, extensions })` (extensions ignored)
- New: Type error - choose scope OR extensions
- If need different extensions, create new scope

**Step 4: Commit SKILL.md updates**

```bash
git add .claude/skills/pumped-fn/SKILL.md
git commit -m "docs(skill): update flow.execute API documentation"
```

---

## Task 10: Final verification and cleanup

**Files:**
- All modified files

**Step 1: Run full typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck && pnpm -F @pumped-fn/core-next typecheck:full`
Expected: PASS (no type errors in src or tests)

**Step 2: Run full test suite**

Run: `pnpm -F @pumped-fn/core-next test`
Expected: All tests PASS (244+ tests)

**Step 3: Run example typechecks**

Run: `pnpm -F @pumped-fn/examples typecheck`
Expected: PASS

**Step 4: Review all commits**

Run: `git log --oneline main..HEAD`
Expected: ~10 commits with clear messages

**Step 5: Run build**

Run: `pnpm -F @pumped-fn/core-next build`
Expected: PASS

**Step 6: Final commit if any cleanup needed**

```bash
git add .
git commit -m "chore: final cleanup for flow extension wrapping fix"
```

---

## Verification Checklist

After completing all tasks:

- [ ] All tests pass (244+ tests)
- [ ] Typecheck passes for src and tests
- [ ] Examples typecheck passes
- [ ] Build succeeds
- [ ] Scope extensions wrap flow execution (kind: 'execute')
- [ ] Scope extensions wrap ctx.exec (kind: 'subflow')
- [ ] Scope extensions wrap ctx.run (kind: 'journal')
- [ ] executionTags are available in extension operations
- [ ] scopeTags attach to created scope
- [ ] Temporary scope is disposed after execution
- [ ] Documentation updated
- [ ] SKILL.md updated
- [ ] Clean commit history

## Notes for Implementation

- Use @test-driven-development for each task
- Use @systematic-debugging if tests fail unexpectedly
- Use @verification-before-completion before claiming completion
- Commit frequently (after each task completion)
- If TypeScript errors are confusing, read the error message carefully and check exact types
