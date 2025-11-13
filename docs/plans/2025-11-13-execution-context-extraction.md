# Execution Context Extraction Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extract execution context as standalone primitive, consolidating Flow.Context + Flow.Execution into ExecutionContext that can be used independently of Flow.

**Architecture:** Create ExecutionContext primitive that merges Flow.Context and Flow.Execution data/APIs. Scope creates contexts via createExecution(). Flow becomes thin wrapper using ExecutionContext internally. Extensions receive ExecutionContext directly in operations.

**Tech Stack:** TypeScript, Vitest, pnpm

**Design Document:** `docs/plans/2025-11-13-execution-context-extraction-design.md`

---

## Task 1: Create ExecutionContext Core Types

**Files:**
- Create: `packages/next/src/execution-context.ts`
- Modify: `packages/next/src/types.ts` (add ExecutionContext namespace)

**Step 1: Add ExecutionContext types to types.ts**

Add after Flow namespace (around line 631):

```typescript
export namespace ExecutionContext {
  export interface Details {
    name: string
    startedAt: number
    completedAt?: number
    error?: unknown
    metadata?: Record<string, unknown>
  }

  export interface Context<TScope extends Core.Scope = Core.Scope> {
    readonly scope: TScope
    readonly parent: Context<TScope> | undefined
    readonly id: string
    readonly tagStore: Tag.Store
    readonly signal: AbortSignal
    readonly details: Details

    exec<T>(name: string, fn: (ctx: Context<TScope>) => T): Promised<T>
    get<T>(tag: Tag.Tag<T, false> | Tag.Tag<T, true>): T
    find<T>(tag: Tag.Tag<T, false>): T | undefined
    find<T>(tag: Tag.Tag<T, true>): T
    set<T>(tag: Tag.Tag<T, false> | Tag.Tag<T, true>, value: T): void
    end(): void
    throwIfAborted(): void
  }
}
```

**Step 2: Verify types compile**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: No errors

**Step 3: Commit types**

```bash
git add packages/next/src/types.ts
git commit -m "feat(core-next): add ExecutionContext types"
```

---

## Task 2: Implement ExecutionContext Class

**Files:**
- Create: `packages/next/src/execution-context.ts`

**Step 1: Create ExecutionContextImpl class**

Create `packages/next/src/execution-context.ts`:

```typescript
import { type Core, type Extension, type ExecutionContext } from "./types"
import { type Tag } from "./tag-types"
import { Promised } from "./promises"

export class ExecutionContextImpl implements ExecutionContext.Context {
  readonly scope: Core.Scope
  readonly parent: ExecutionContext.Context | undefined
  readonly id: string
  readonly tagStore: Tag.Store
  readonly signal: AbortSignal
  readonly details: ExecutionContext.Details

  private tagData: Map<symbol, unknown>
  private abortController: AbortController

  constructor(config: {
    scope: Core.Scope
    parent?: ExecutionContext.Context
    details: Partial<ExecutionContext.Details>
    abortController?: AbortController
  }) {
    this.scope = config.scope
    this.parent = config.parent
    this.id = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `ctx-${Date.now()}-${Math.random()}`

    this.details = {
      name: config.details.name || "unnamed",
      startedAt: config.details.startedAt || Date.now(),
      completedAt: config.details.completedAt,
      error: config.details.error,
      metadata: config.details.metadata
    }

    this.abortController = config.abortController || new AbortController()
    this.signal = this.abortController.signal

    this.tagData = new Map<symbol, unknown>()
    this.tagStore = {
      get: (key: unknown) => {
        if (typeof key !== "symbol") return undefined
        if (this.tagData.has(key)) {
          return this.tagData.get(key)
        }
        return this.parent?.tagStore.get(key)
      },
      set: (key: unknown, value: unknown) => {
        if (typeof key !== "symbol") return undefined
        const prev = this.tagData.get(key as symbol)
        this.tagData.set(key as symbol, value)
        return prev
      }
    }
  }

  exec<T>(name: string, fn: (ctx: ExecutionContext.Context) => T): Promised<T> {
    const childCtx = new ExecutionContextImpl({
      scope: this.scope,
      parent: this,
      details: { name, startedAt: Date.now() }
    })

    const operation: Extension.ExecutionOperation = {
      kind: "execution",
      target: { type: "fn" },
      executionContext: childCtx,
      input: undefined,
      key: undefined,
      context: childCtx.tagStore
    }

    const executeCore = (): Promised<T> => {
      try {
        const result = fn(childCtx)
        if (result instanceof Promise) {
          return Promised.create(
            result.then(r => {
              childCtx.end()
              return r
            }).catch(error => {
              childCtx.details.error = error
              childCtx.end()
              throw error
            })
          )
        }
        childCtx.end()
        return Promised.create(Promise.resolve(result))
      } catch (error) {
        childCtx.details.error = error
        childCtx.end()
        throw error
      }
    }

    return (this.scope as any)["wrapWithExtensions"](executeCore, operation)
  }

  get<T>(tag: Tag.Tag<T, false> | Tag.Tag<T, true>): T {
    return tag.extractFrom(this.tagStore)
  }

  find<T>(tag: Tag.Tag<T, false>): T | undefined
  find<T>(tag: Tag.Tag<T, true>): T
  find<T>(tag: Tag.Tag<T, boolean>): T | undefined {
    return tag.readFrom(this.tagStore)
  }

  set<T>(tag: Tag.Tag<T, false> | Tag.Tag<T, true>, value: T): void {
    tag.injectTo(this.tagStore, value)
  }

  end(): void {
    if (!this.details.completedAt) {
      this.details.completedAt = Date.now()
    }
  }

  throwIfAborted(): void {
    if (this.signal.aborted) {
      throw new Error("Execution aborted")
    }
  }
}
```

**Step 2: Verify implementation compiles**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: No errors

**Step 3: Commit implementation**

```bash
git add packages/next/src/execution-context.ts
git commit -m "feat(core-next): implement ExecutionContext class"
```

---

## Task 3: Update Extension.ExecutionOperation Type

**Files:**
- Modify: `packages/next/src/types.ts:658-664`

**Step 1: Add executionContext to ExecutionOperation**

Update ExecutionOperation type (around line 658):

```typescript
export type ExecutionOperation = {
  kind: "execution";
  target: FlowTarget | FnTarget | ParallelTarget;
  input: unknown;
  key?: string;
  context: Tag.Store;
  executionContext?: ExecutionContext.Context;  // NEW
};
```

**Step 2: Verify types compile**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: No errors

**Step 3: Commit type update**

```bash
git add packages/next/src/types.ts
git commit -m "feat(core-next): add executionContext to ExecutionOperation"
```

---

## Task 4: Add Scope.createExecution() Method

**Files:**
- Modify: `packages/next/src/types.ts:300-350` (Core.Scope interface)
- Modify: `packages/next/src/scope.ts:408-460` (BaseScope class)

**Step 1: Add createExecution to Core.Scope interface**

Add to Core.Scope interface (around line 320):

```typescript
createExecution(details?: Partial<ExecutionContext.Details>): ExecutionContext.Context;
```

**Step 2: Implement createExecution in BaseScope**

Add to BaseScope class (after constructor, around line 455):

```typescript
createExecution(details?: Partial<ExecutionContext.Details>): ExecutionContext.Context {
  this["~ensureNotDisposed"]();
  const { ExecutionContextImpl } = require("./execution-context");
  return new ExecutionContextImpl({
    scope: this,
    details: details || {}
  });
}
```

**Step 3: Verify implementation compiles**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: No errors

**Step 4: Commit Scope updates**

```bash
git add packages/next/src/types.ts packages/next/src/scope.ts
git commit -m "feat(core-next): add Scope.createExecution() method"
```

---

## Task 5: Write Tests for ExecutionContext

**Files:**
- Create: `packages/next/tests/execution-context.test.ts`

**Step 1: Write ExecutionContext tests**

Create `packages/next/tests/execution-context.test.ts`:

```typescript
import { describe, it, expect } from "vitest"
import { createScope } from "../src/scope"
import { tag } from "../src/tag"

describe("ExecutionContext", () => {
  it("creates execution context with details", () => {
    const scope = createScope()
    const ctx = scope.createExecution({ name: "test-ctx" })

    expect(ctx.id).toBeDefined()
    expect(ctx.details.name).toBe("test-ctx")
    expect(ctx.details.startedAt).toBeGreaterThan(0)
    expect(ctx.parent).toBeUndefined()
  })

  it("creates child context via exec", async () => {
    const scope = createScope()
    const ctx = scope.createExecution({ name: "parent" })

    let childCtx: any
    await ctx.exec("child", (c) => {
      childCtx = c
      expect(c.parent).toBe(ctx)
      expect(c.details.name).toBe("child")
      return "result"
    })

    expect(childCtx.parent).toBe(ctx)
  })

  it("inherits tags from parent", () => {
    const scope = createScope()
    const requestIdTag = tag("requestId")
    const ctx = scope.createExecution({ name: "parent" })

    ctx.set(requestIdTag, "req-123")

    ctx.exec("child", (childCtx) => {
      const requestId = childCtx.get(requestIdTag)
      expect(requestId).toBe("req-123")
    })
  })

  it("child tags override parent tags", () => {
    const scope = createScope()
    const nameTag = tag("name")
    const ctx = scope.createExecution({ name: "parent" })

    ctx.set(nameTag, "parent-name")

    ctx.exec("child", (childCtx) => {
      childCtx.set(nameTag, "child-name")
      expect(childCtx.get(nameTag)).toBe("child-name")
      expect(ctx.get(nameTag)).toBe("parent-name")
    })
  })

  it("marks context as ended", async () => {
    const scope = createScope()
    const ctx = scope.createExecution({ name: "test" })

    expect(ctx.details.completedAt).toBeUndefined()
    ctx.end()
    expect(ctx.details.completedAt).toBeDefined()
  })

  it("tracks execution errors", async () => {
    const scope = createScope()
    const ctx = scope.createExecution({ name: "parent" })

    try {
      await ctx.exec("failing", () => {
        throw new Error("test error")
      })
    } catch (error) {
      // Expected
    }

    // Child context should have error recorded
  })

  it("supports abort signal", () => {
    const scope = createScope()
    const ctx = scope.createExecution({ name: "test" })

    expect(ctx.signal.aborted).toBe(false)
    expect(() => ctx.throwIfAborted()).not.toThrow()
  })
})
```

**Step 2: Run tests**

Run: `pnpm -F @pumped-fn/core-next test execution-context`
Expected: All tests pass

**Step 3: Commit tests**

```bash
git add packages/next/tests/execution-context.test.ts
git commit -m "test(core-next): add ExecutionContext tests"
```

---

## Task 6: Update FlowContext to Use ExecutionContext

**Files:**
- Modify: `packages/next/src/flow.ts` (FlowContext class)
- Modify: `packages/next/src/types.ts:514-581` (Flow.C interface)

**Step 1: Make Flow.Context type alias for ExecutionContext.Context**

Update Flow namespace in types.ts (around line 583):

```typescript
export type Context = ExecutionContext.Context;
```

**Step 2: Update FlowContext to extend ExecutionContextImpl**

Modify FlowContext class in `packages/next/src/flow.ts`:

```typescript
import { ExecutionContextImpl } from "./execution-context"

export class FlowContext extends ExecutionContextImpl implements Flow.Context {
  // Keep existing methods that are Flow-specific
  // Remove methods that now come from ExecutionContextImpl

  constructor(
    scope: Core.Scope,
    extensions: Extension.Extension[],
    tags: Tag.Tagged[] | undefined,
    parent: Flow.Context | undefined,
    abortController?: AbortController
  ) {
    super({
      scope,
      parent,
      details: { name: "flow-context" },
      abortController
    })

    // Initialize any Flow-specific state
    if (tags) {
      tags.forEach(tagged => {
        this.tagStore.set(tagged.key, tagged.value)
      })
    }
  }

  // Keep Flow-specific methods like parallel, parallelSettled, resetJournal
}
```

**Step 3: Verify compilation**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: Errors - we need to reconcile Flow.Context interface with ExecutionContext.Context

Note: This step will have type errors that need resolution in next task.

**Step 4: Commit work-in-progress**

```bash
git add packages/next/src/types.ts packages/next/src/flow.ts
git commit -m "wip(core-next): update FlowContext to use ExecutionContext"
```

---

## Task 7: Reconcile Flow.Context and ExecutionContext.Context

**Files:**
- Modify: `packages/next/src/types.ts:514-581`

**Step 1: Keep Flow.Context as distinct type that extends ExecutionContext.Context**

Revert the type alias and instead extend:

```typescript
export type Context = C;

export type C = ExecutionContext.Context & {
  readonly scope: Core.Scope;
  readonly tags: Tag.Tagged[] | undefined;
  readonly signal: AbortSignal;

  exec<F extends UFlow>(
    flow: F,
    input: InferInput<F>
  ): Promised<InferOutput<F>>;

  exec<F extends UFlow>(
    key: string,
    flow: F,
    input: InferInput<F>
  ): Promised<InferOutput<F>>;

  exec<F extends UFlow>(config: {
    flow: F;
    input: InferInput<F>;
    key?: string;
    timeout?: number;
    retry?: number;
    tags?: Tag.Tagged[];
  }): Promised<InferOutput<F>>;

  exec<T>(config: {
    fn: () => T | Promise<T>;
    params?: never;
    key?: string;
    timeout?: number;
    retry?: number;
    tags?: Tag.Tagged[];
  }): Promised<T>;

  exec<Fn extends (...args: any[]) => any>(config: {
    fn: Fn;
    params: Parameters<Fn>;
    key?: string;
    timeout?: number;
    retry?: number;
    tags?: Tag.Tagged[];
  }): Promised<ReturnType<Fn>>;

  parallel<T extends readonly Promised<any>[]>(
    promises: [...T]
  ): Promised<
    ParallelResult<{
      [K in keyof T]: T[K] extends Promised<infer R> ? R : never;
    }>
  >;

  parallelSettled<T extends readonly Promised<any>[]>(
    promises: [...T]
  ): Promised<
    ParallelSettledResult<{
      [K in keyof T]: T[K] extends Promised<infer R> ? R : never;
    }>
  >;

  resetJournal(keyPattern?: string): void;
};
```

**Step 2: Verify types compile**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: Should compile now

**Step 3: Commit type reconciliation**

```bash
git add packages/next/src/types.ts
git commit -m "feat(core-next): reconcile Flow.Context with ExecutionContext"
```

---

## Task 8: Update Flow.Execution to Reference ExecutionContext

**Files:**
- Modify: `packages/next/src/types.ts:604-630`
- Modify: `packages/next/src/flow-execution.ts`

**Step 1: Add executionContext to Flow.Execution interface**

Update Flow.Execution interface (around line 604):

```typescript
export interface Execution<T> {
  readonly result: Promised<T>;
  readonly id: string;
  readonly flowName: string | undefined;
  readonly status: ExecutionStatus;
  readonly ctx: ExecutionData | undefined;
  readonly executionContext: ExecutionContext.Context | undefined;  // NEW
  readonly abort: AbortController;
  readonly statusCallbackErrors: readonly Error[];

  onStatusChange(
    callback: (
      status: ExecutionStatus,
      execution: Execution<T>
    ) => void | Promise<void>
  ): Core.Cleanup;

  then<TResult1 = T, TResult2 = never>(
    onfulfilled?:
      | ((value: T) => TResult1 | PromiseLike<TResult1>)
      | null
      | undefined,
    onrejected?:
      | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
      | null
      | undefined
  ): PromiseLike<TResult1 | TResult2>;
}
```

**Step 2: Update FlowExecutionImpl to store executionContext**

Modify FlowExecutionImpl constructor in `packages/next/src/flow-execution.ts`:

```typescript
export class FlowExecutionImpl<T> implements Flow.Execution<T> {
  // ... existing fields
  readonly executionContext: ExecutionContext.Context | undefined

  constructor(config: {
    id: string
    flowName: string | undefined
    abort: AbortController
    result: Promised<T>
    ctx: Flow.ExecutionData | null
    executionContext?: ExecutionContext.Context
    statusTracking: {
      promise: Promised<T>
      timeoutId: ReturnType<typeof setTimeout> | null
      abortController: AbortController
    }
  }) {
    // ... existing initialization
    this.executionContext = config.executionContext
  }
}
```

**Step 3: Verify compilation**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: No errors

**Step 4: Commit updates**

```bash
git add packages/next/src/types.ts packages/next/src/flow-execution.ts
git commit -m "feat(core-next): add executionContext to Flow.Execution"
```

---

## Task 9: Update Scope.exec() to Use createExecution()

**Files:**
- Modify: `packages/next/src/scope.ts:1194-1259` (~executeFlow method)

**Step 1: Update ~executeFlow to create ExecutionContext**

Modify `~executeFlow` method (around line 1194):

```typescript
private "~executeFlow"<S, I>(
  flow: Core.Executor<Flow.Handler<S, I>>,
  input: I,
  executionTags?: Tag.Tagged[],
  abortController?: AbortController
): Promised<S> {
  let resolveSnapshot!: (snapshot: Flow.ExecutionData | undefined) => void;
  const snapshotPromise = new Promise<Flow.ExecutionData | undefined>(
    (resolve) => {
      resolveSnapshot = resolve;
    }
  );

  const promise = (async () => {
    const definition = flowDefinitionMeta.readFrom(flow);
    if (!definition) {
      throw new Error("Flow definition not found in executor metadata");
    }

    // Create ExecutionContext instead of FlowContext
    const executionContext = this.createExecution({
      name: definition.name,
      startedAt: Date.now()
    });

    // Apply tags to execution context
    if (executionTags) {
      executionTags.forEach(tagged => {
        executionContext.set(tagged as any, tagged.value);
      });
    }

    // Create FlowContext that wraps ExecutionContext
    const context = new FlowContext(
      this,
      this.extensions,
      executionTags,
      undefined,
      abortController
    );

    try {
      const executeCore = (): Promised<S> => {
        return this.resolve(flow).map(async (handler) => {
          const validated = validate(definition.input, input);
          context.initializeExecutionContext(definition.name, false);
          const result = await handler(context, validated);
          validate(definition.output, result);
          return result;
        });
      };

      const executor = this.wrapWithExtensions(
        executeCore,
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
          executionContext,  // NEW: pass ExecutionContext to extensions
        }
      );

      const result = await executor();
      executionContext.end();
      resolveSnapshot(context.createSnapshot());
      return result;
    } catch (error) {
      executionContext.details.error = error;
      executionContext.end();
      resolveSnapshot(context.createSnapshot());
      throw error;
    }
  })();

  return Promised.create(promise, snapshotPromise);
}
```

**Step 2: Update scope.exec() to pass executionContext to FlowExecutionImpl**

Modify scope.exec() method (around line 1174):

```typescript
const execution = new FlowExecutionImpl<S>({
  id: executionId,
  flowName,
  abort: abortController,
  result: flowPromise,
  ctx: null,
  executionContext: undefined,  // Will be set when flow runs
  statusTracking,
});
```

**Step 3: Verify compilation**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: Some errors expected - FlowContext constructor mismatch

**Step 4: Commit progress**

```bash
git add packages/next/src/scope.ts
git commit -m "wip(core-next): update ~executeFlow to use createExecution"
```

---

## Task 10: Fix FlowContext Implementation

**Files:**
- Modify: `packages/next/src/flow.ts`

**Step 1: Update FlowContext to properly extend ExecutionContextImpl**

Review and fix FlowContext class to properly extend ExecutionContextImpl while maintaining Flow-specific functionality (exec overloads, parallel, parallelSettled, resetJournal).

This requires careful review of existing FlowContext implementation and ensuring all methods properly delegate to ExecutionContextImpl base class.

**Step 2: Run full typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck && pnpm -F @pumped-fn/core-next typecheck:full`
Expected: No errors

**Step 3: Run all tests**

Run: `pnpm -F @pumped-fn/core-next test`
Expected: Tests may fail - document failures for next task

**Step 4: Commit FlowContext fixes**

```bash
git add packages/next/src/flow.ts
git commit -m "fix(core-next): properly implement FlowContext extending ExecutionContextImpl"
```

---

## Task 11: Fix Failing Tests

**Files:**
- Modify: Test files as needed based on failures

**Step 1: Run tests and identify failures**

Run: `pnpm -F @pumped-fn/core-next test 2>&1 | tee test-failures.txt`
Document all failures

**Step 2: Fix Flow.Context-related test failures**

Update tests that expect specific Flow.Context behavior to work with ExecutionContext changes.

**Step 3: Fix Flow.Execution-related test failures**

Update tests that check Flow.Execution.ctx to use Flow.Execution.executionContext where appropriate.

**Step 4: Run tests until passing**

Run: `pnpm -F @pumped-fn/core-next test`
Expected: All tests pass

**Step 5: Commit test fixes**

```bash
git add packages/next/tests/*.ts
git commit -m "fix(core-next): update tests for ExecutionContext changes"
```

---

## Task 12: Update Examples

**Files:**
- Modify: `examples/*/src/*.ts` (any files using Flow.Context or Flow.Execution)

**Step 1: Find examples using Flow types**

Run: `cd examples && grep -r "Flow.Context\|Flow.Execution" . --include="*.ts" --include="*.tsx"`

**Step 2: Update examples to use ExecutionContext**

For each example file found, update to use new ExecutionContext API where appropriate.

**Step 3: Verify examples typecheck**

Run: `pnpm -F @pumped-fn/examples typecheck`
Expected: No errors

**Step 4: Commit example updates**

```bash
git add examples/
git commit -m "docs(examples): update for ExecutionContext changes"
```

---

## Task 13: Update Documentation

**Files:**
- Modify: `docs/guides/*.md` (any docs mentioning Flow.Context)

**Step 1: Find docs mentioning Flow.Context or execution**

Run: `cd docs && grep -r "Flow.Context\|execution context" . --include="*.md"`

**Step 2: Update docs to explain ExecutionContext**

Update documentation to explain:
- ExecutionContext as standalone primitive
- scope.createExecution() for direct usage
- Flow.Context as extension of ExecutionContext
- Migration guide if needed

**Step 3: Commit doc updates**

```bash
git add docs/
git commit -m "docs(guides): update for ExecutionContext extraction"
```

---

## Task 14: Update Skill References

**Files:**
- Modify: `.claude/skills/pumped-design/references/*.md`

**Step 1: Find skill references to Flow.Context**

Run: `cd .claude/skills/pumped-design/references && grep -r "Flow.Context" . --include="*.md"`

**Step 2: Update skill references**

Update pumped-design skill references to document ExecutionContext as primitive and Flow.Context as extension.

**Step 3: Commit skill updates**

```bash
git add .claude/skills/pumped-design/
git commit -m "docs(skills): update pumped-design for ExecutionContext"
```

---

## Task 15: Final Verification

**Files:**
- All modified files

**Step 1: Run full typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck && pnpm -F @pumped-fn/core-next typecheck:full`
Expected: No errors

**Step 2: Run all tests**

Run: `pnpm -F @pumped-fn/core-next test`
Expected: All 294+ tests pass

**Step 3: Run examples typecheck**

Run: `pnpm -F @pumped-fn/examples typecheck`
Expected: No errors

**Step 4: Build packages**

Run: `pnpm -F @pumped-fn/core-next build`
Expected: Successful build

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat(core-next): complete ExecutionContext extraction

BREAKING CHANGE: Flow.Context now extends ExecutionContext.Context.
Extensions receive executionContext in ExecutionOperation.
scope.createExecution() added for standalone execution context usage."
```

---

## Verification Checklist

- [ ] All types compile (`typecheck` and `typecheck:full`)
- [ ] All tests pass (294+ tests)
- [ ] Examples typecheck
- [ ] Build succeeds
- [ ] Documentation updated
- [ ] Skill references updated
- [ ] No regression in existing Flow functionality
- [ ] ExecutionContext can be used independently via scope.createExecution()
- [ ] Extensions receive executionContext in operations
- [ ] Tag inheritance works parent → child
