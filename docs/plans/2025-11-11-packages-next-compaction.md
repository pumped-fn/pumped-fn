# packages/next Compaction Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce packages/next/src LOC by ≥10% through pattern consolidation without losing API coverage or runtime performance.

**Architecture:** Factory-based executor generation, unified dependency resolution, shared extension wrapping, centralized scope state management via Map-based storage.

**Tech Stack:** TypeScript, pnpm workspaces, ast-grep for pattern detection, table-driven tests

**Baseline Metrics:**
- packages/next/src: 4586 LOC
- packages/next/tests: 5574 LOC
- Key files: executor.ts (168), scope.ts (1279), flow.ts (1015), helpers.ts (54), multi.ts (159), promises.ts (291)

**Reduction Targets:**
- executor.ts: -15% (143 LOC target)
- scope.ts: -12% (1125 LOC target)
- flow.ts: -10% (914 LOC target)
- helpers.ts: -20% (43 LOC target, consolidate with scope utilities)
- Overall: ≥459 LOC reduction (10%)

---

## Task 1: Baseline Capture and Verification Setup

**Files:**
- Read: `packages/next/src/**/*.ts`
- Create: `/tmp/compaction-baseline.txt`

**Step 1: Capture baseline LOC**

Run: `rg --files packages/next/src | xargs wc -l > /tmp/compaction-baseline.txt && rg --files packages/next/tests | xargs wc -l >> /tmp/compaction-baseline.txt`
Expected: Files written with current LOC counts

**Step 2: Verify all tests pass before starting**

Run: `pnpm -F @pumped-fn/core-next test`
Expected: All tests PASS

**Step 3: Verify typecheck passes**

Run: `pnpm -F @pumped-fn/core-next typecheck && pnpm -F @pumped-fn/core-next typecheck:full`
Expected: No type errors

**Step 4: Verify examples typecheck**

Run: `pnpm -F @pumped-fn/examples typecheck`
Expected: No type errors

**Step 5: Commit baseline**

```bash
git add /tmp/compaction-baseline.txt
git commit -m "chore: capture baseline for compaction refactor"
```

---

## Task 2: Move wrapWithExtensions to Internal Module

**Files:**
- Read: `packages/next/src/flow.ts:12-33`
- Create: `packages/next/src/internal/extension-utils.ts`
- Modify: `packages/next/src/flow.ts:1-33`
- Modify: `packages/next/src/scope.ts:22`

**Step 1: Write test for extension wrapping behavior**

Create: `packages/next/tests/internal/extension-utils.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { wrapWithExtensions } from "../../src/internal/extension-utils";
import { Promised } from "../../src/promises";
import { createScope } from "../../src/scope";
import { provide } from "../../src/executor";
import type { Extension, Core } from "../../src/types";

describe("wrapWithExtensions", () => {
  it("returns base executor when no extensions", () => {
    const scope = createScope();
    const base = () => Promised.create(Promise.resolve(42));
    const operation: Extension.Operation = { kind: "resolve", executor: provide(() => 1) };

    const wrapped = wrapWithExtensions(undefined, base, scope, operation);

    expect(wrapped).toBe(base);
  });

  it("wraps executor with single extension", async () => {
    const scope = createScope();
    const base = () => Promised.create(Promise.resolve(42));
    const operation: Extension.Operation = { kind: "resolve", executor: provide(() => 1) };
    const ext: Extension.Extension = {
      name: "test",
      wrap: (s, next) => Promised.create(next().then(v => v as number + 1))
    };

    const wrapped = wrapWithExtensions([ext], base, scope, operation);
    const result = await wrapped();

    expect(result).toBe(43);
  });

  it("wraps in reverse order (last extension wraps first)", async () => {
    const scope = createScope();
    const base = () => Promised.create(Promise.resolve(10));
    const operation: Extension.Operation = { kind: "resolve", executor: provide(() => 1) };
    const ext1: Extension.Extension = {
      name: "multiply",
      wrap: (s, next) => Promised.create(next().then(v => v as number * 2))
    };
    const ext2: Extension.Extension = {
      name: "add",
      wrap: (s, next) => Promised.create(next().then(v => v as number + 5))
    };

    const wrapped = wrapWithExtensions([ext1, ext2], base, scope, operation);
    const result = await wrapped();

    expect(result).toBe(25);
  });

  it("handles extensions without wrap method", () => {
    const scope = createScope();
    const base = () => Promised.create(Promise.resolve(42));
    const operation: Extension.Operation = { kind: "resolve", executor: provide(() => 1) };
    const ext: Extension.Extension = { name: "no-wrap" };

    const wrapped = wrapWithExtensions([ext], base, scope, operation);

    expect(wrapped).toBe(base);
  });

  it("converts non-Promised results to Promised", async () => {
    const scope = createScope();
    const base = () => Promised.create(Promise.resolve(42));
    const operation: Extension.Operation = { kind: "resolve", executor: provide(() => 1) };
    const ext: Extension.Extension = {
      name: "returns-promise",
      wrap: (s, next) => next().then(v => Promise.resolve(v as number + 1))
    };

    const wrapped = wrapWithExtensions([ext], base, scope, operation);
    const result = await wrapped();

    expect(result).toBeInstanceOf(Promised);
    expect(await result).toBe(43);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @pumped-fn/core-next test internal/extension-utils`
Expected: FAIL with "Cannot find module '../../src/internal/extension-utils'"

**Step 3: Create internal/extension-utils.ts with wrapWithExtensions**

Create: `packages/next/src/internal/extension-utils.ts`

```typescript
import { Promised } from "../promises";
import type { Extension, Core } from "../types";

export function wrapWithExtensions<T>(
  extensions: Extension.Extension[] | undefined,
  baseExecutor: () => Promised<T>,
  scope: Core.Scope,
  operation: Extension.Operation
): () => Promised<T> {
  if (!extensions || extensions.length === 0) {
    return baseExecutor;
  }
  let executor = baseExecutor;
  for (let i = extensions.length - 1; i >= 0; i--) {
    const extension = extensions[i];
    if (extension.wrap) {
      const current = executor;
      executor = () => {
        const result = extension.wrap!(scope, current, operation);
        return result instanceof Promised ? result : Promised.create(result);
      };
    }
  }
  return executor;
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/core-next test internal/extension-utils`
Expected: All tests PASS

**Step 5: Update flow.ts to import from internal**

Modify: `packages/next/src/flow.ts`

Find:
```typescript
function wrapWithExtensions<T>(
  extensions: Extension.Extension[] | undefined,
  baseExecutor: () => Promised<T>,
  scope: Core.Scope,
  operation: Extension.Operation
): () => Promised<T> {
  if (!extensions || extensions.length === 0) {
    return baseExecutor;
  }
  let executor = baseExecutor;
  for (let i = extensions.length - 1; i >= 0; i--) {
    const extension = extensions[i];
    if (extension.wrap) {
      const current = executor;
      executor = () => {
        const result = extension.wrap!(scope, current, operation);
        return result instanceof Promised ? result : Promised.create(result);
      };
    }
  }
  return executor;
}
```

Replace:
```typescript
import { wrapWithExtensions } from "./internal/extension-utils";
```

**Step 6: Update scope.ts to import from internal**

Modify: `packages/next/src/scope.ts:22`

Find:
```typescript
import { flow as flowApi, FlowContext, flowMeta, flowDefinitionMeta, wrapWithExtensions } from "./flow";
```

Replace:
```typescript
import { flow as flowApi, FlowContext, flowMeta, flowDefinitionMeta } from "./flow";
import { wrapWithExtensions } from "./internal/extension-utils";
```

**Step 7: Run all tests**

Run: `pnpm -F @pumped-fn/core-next test`
Expected: All tests PASS

**Step 8: Verify typecheck passes**

Run: `pnpm -F @pumped-fn/core-next typecheck && pnpm -F @pumped-fn/core-next typecheck:full`
Expected: No type errors

**Step 9: Check LOC reduction**

Run: `wc -l packages/next/src/flow.ts packages/next/src/internal/extension-utils.ts`
Expected: flow.ts reduced by ~22 lines, extension-utils.ts adds ~26 lines (net: +4 but eliminates duplication)

**Step 10: Commit**

```bash
git add packages/next/src/internal/extension-utils.ts packages/next/src/flow.ts packages/next/src/scope.ts packages/next/tests/internal/extension-utils.test.ts
git commit -m "refactor: extract wrapWithExtensions to internal module

- Move wrapWithExtensions from flow.ts to internal/extension-utils.ts
- Add comprehensive tests for extension wrapping behavior
- Update imports in flow.ts and scope.ts

Part of packages-next compaction effort"
```

---

## Task 3: Consolidate Dependency Resolution Helper

**Files:**
- Read: `packages/next/src/scope.ts:700-850`
- Read: `packages/next/src/helpers.ts:16-49`
- Create: `packages/next/src/internal/dependency-utils.ts`
- Modify: `packages/next/src/scope.ts`
- Modify: `packages/next/src/helpers.ts`

**Step 1: Write tests for unified dependency resolver**

Create: `packages/next/tests/internal/dependency-utils.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { resolveShape } from "../../src/internal/dependency-utils";
import { createScope } from "../../src/scope";
import { provide, derive } from "../../src/executor";

describe("resolveShape", () => {
  it("resolves single executor", async () => {
    const scope = createScope();
    const executor = provide(() => 42);

    const result = await resolveShape(scope, executor);

    expect(result).toBe(42);
  });

  it("resolves array of executors", async () => {
    const scope = createScope();
    const e1 = provide(() => 1);
    const e2 = provide(() => 2);

    const result = await resolveShape(scope, [e1, e2]);

    expect(result).toEqual([1, 2]);
  });

  it("resolves record of executors", async () => {
    const scope = createScope();
    const e1 = provide(() => "a");
    const e2 = provide(() => "b");

    const result = await resolveShape(scope, { x: e1, y: e2 });

    expect(result).toEqual({ x: "a", y: "b" });
  });

  it("unwraps escapable in single executor", async () => {
    const scope = createScope();
    const executor = provide(() => 42);
    const escapable = { escape: () => executor };

    const result = await resolveShape(scope, escapable);

    expect(result).toBe(42);
  });

  it("unwraps escapables in array", async () => {
    const scope = createScope();
    const e1 = provide(() => 1);
    const e2 = provide(() => 2);
    const escapable1 = { escape: () => e1 };

    const result = await resolveShape(scope, [escapable1, e2]);

    expect(result).toEqual([1, 2]);
  });

  it("unwraps escapables in record", async () => {
    const scope = createScope();
    const e1 = provide(() => "a");
    const e2 = provide(() => "b");
    const escapable2 = { escape: () => e2 };

    const result = await resolveShape(scope, { x: e1, y: escapable2 });

    expect(result).toEqual({ x: "a", y: "b" });
  });

  it("resolves lazy executor to main", async () => {
    const scope = createScope();
    const executor = provide(() => 99);

    const result = await resolveShape(scope, executor.lazy);

    expect(result).toBe(99);
  });

  it("resolves reactive executor to main", async () => {
    const scope = createScope();
    const executor = provide(() => 99);

    const result = await resolveShape(scope, executor.reactive);

    expect(result).toBe(99);
  });

  it("resolves static executor to main", async () => {
    const scope = createScope();
    const executor = provide(() => 99);

    const result = await resolveShape(scope, executor.static);

    expect(result).toBe(99);
  });

  it("handles undefined", async () => {
    const scope = createScope();

    const result = await resolveShape(scope, undefined);

    expect(result).toBeUndefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @pumped-fn/core-next test internal/dependency-utils`
Expected: FAIL with "Cannot find module '../../src/internal/dependency-utils'"

**Step 3: Implement resolveShape in internal/dependency-utils.ts**

Create: `packages/next/src/internal/dependency-utils.ts`

```typescript
import { isExecutor, isLazyExecutor, isReactiveExecutor, isStaticExecutor } from "../executor";
import type { Core } from "../types";
import type { Escapable } from "../helpers";

export async function resolveShape<T extends Core.UExecutor | ReadonlyArray<Core.UExecutor | Escapable<unknown>> | Record<string, Core.UExecutor | Escapable<unknown>> | undefined>(
  scope: Core.Scope,
  shape: T
): Promise<any> {
  if (shape === undefined) {
    return undefined;
  }

  const unwrapTarget = (item: Core.UExecutor | Escapable<unknown>): Core.Executor<unknown> => {
    const executor = !isExecutor(item) ? item.escape() : item;

    if (isLazyExecutor(executor) || isReactiveExecutor(executor) || isStaticExecutor(executor)) {
      return executor.executor;
    }

    return executor as Core.Executor<unknown>;
  };

  if (Array.isArray(shape)) {
    const results = [];
    for (const item of shape) {
      const target = unwrapTarget(item);
      const result = await scope.resolve(target);
      results.push(result);
    }
    return results;
  }

  if (typeof shape === "object" && "factory" in shape) {
    const target = unwrapTarget(shape as Core.UExecutor);
    return await scope.resolve(target);
  }

  const results: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(shape)) {
    const target = unwrapTarget(item);
    const result = await scope.resolve(target);
    results[key] = result;
  }
  return results;
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/core-next test internal/dependency-utils`
Expected: All tests PASS

**Step 5: Replace helpers.ts resolves with resolveShape**

Modify: `packages/next/src/helpers.ts`

Find:
```typescript
import {
  isExecutor,
  isLazyExecutor,
  isReactiveExecutor,
  isStaticExecutor,
} from "./executor";
import { Core } from "./types";

export async function resolves<
  T extends
    | Array<Core.Executor<unknown> | Escapable<unknown>>
    | Record<string, Core.Executor<unknown> | Escapable<unknown>>
>(
  scope: Core.Scope,
  executors: { [K in keyof T]: T[K] }
): Promise<{ [K in keyof T]: Core.InferOutput<T[K]> }> {
  const objectOutput = {};
  const arrayOutput = [];

  const isArray = Array.isArray(executors);

  for (const [index, executor] of Object.entries(executors)) {
    const target = !isExecutor(executor)
      ? executor.escape()
      : isLazyExecutor(executor) ||
        isReactiveExecutor(executor) ||
        isStaticExecutor(executor)
      ? executor.executor
      : (executor as Core.Executor<unknown>);

    const result = await scope.resolve(target);

    if (isArray) {
      arrayOutput.push(result);
    } else {
      Object.assign(objectOutput, { [index]: result });
    }
  }

  const result = isArray ? arrayOutput : objectOutput;
  return result as { [K in keyof T]: Core.InferOutput<T[K]> };
}
```

Replace:
```typescript
import { resolveShape } from "./internal/dependency-utils";
import { Core } from "./types";

export async function resolves<
  T extends
    | Array<Core.Executor<unknown> | Escapable<unknown>>
    | Record<string, Core.Executor<unknown> | Escapable<unknown>>
>(
  scope: Core.Scope,
  executors: { [K in keyof T]: T[K] }
): Promise<{ [K in keyof T]: Core.InferOutput<T[K]> }> {
  return resolveShape(scope, executors) as Promise<{ [K in keyof T]: Core.InferOutput<T[K]> }>;
}
```

**Step 6: Update scope.ts ~resolveDependencies to use resolveShape**

Modify: `packages/next/src/scope.ts`

Find the `~resolveDependencies` method (search for `protected async "~resolveDependencies"`)

Replace its implementation with:
```typescript
import { resolveShape } from "./internal/dependency-utils";

protected async "~resolveDependencies"(
  ie:
    | undefined
    | Core.UExecutor
    | ReadonlyArray<Core.UExecutor>
    | Record<string, Core.UExecutor>,
  ref: UE
): Promise<unknown> {
  return resolveShape(this as unknown as Core.Scope, ie);
}
```

**Step 7: Run all tests**

Run: `pnpm -F @pumped-fn/core-next test`
Expected: All tests PASS

**Step 8: Verify typecheck passes**

Run: `pnpm -F @pumped-fn/core-next typecheck && pnpm -F @pumped-fn/core-next typecheck:full`
Expected: No type errors

**Step 9: Check LOC reduction**

Run: `wc -l packages/next/src/helpers.ts packages/next/src/scope.ts packages/next/src/internal/dependency-utils.ts`
Expected: helpers.ts reduced significantly, scope.ts reduced by method simplification

**Step 10: Commit**

```bash
git add packages/next/src/internal/dependency-utils.ts packages/next/src/helpers.ts packages/next/src/scope.ts packages/next/tests/internal/dependency-utils.test.ts
git commit -m "refactor: consolidate dependency resolution logic

- Extract resolveShape utility to internal/dependency-utils.ts
- Simplify helpers.ts resolves to use resolveShape
- Simplify scope.ts ~resolveDependencies to use resolveShape
- Add comprehensive tests for all resolution shapes

Part of packages-next compaction effort"
```

---

## Task 4: Consolidate Executor Factory Guards

**Files:**
- Read: `packages/next/src/executor.ts:77-112`
- Modify: `packages/next/src/executor.ts`

**Step 1: Write test for guard factory**

Modify: `packages/next/tests/executor.test.ts` (or create if doesn't exist)

Add tests:
```typescript
import { describe, it, expect } from "vitest";
import { provide, isLazyExecutor, isReactiveExecutor, isStaticExecutor, isMainExecutor, isExecutor, isPreset } from "../src/executor";

describe("executor guards", () => {
  it("isLazyExecutor identifies lazy executors", () => {
    const exec = provide(() => 42);

    expect(isLazyExecutor(exec.lazy)).toBe(true);
    expect(isLazyExecutor(exec)).toBe(false);
    expect(isLazyExecutor(exec.reactive)).toBe(false);
    expect(isLazyExecutor(exec.static)).toBe(false);
  });

  it("isReactiveExecutor identifies reactive executors", () => {
    const exec = provide(() => 42);

    expect(isReactiveExecutor(exec.reactive)).toBe(true);
    expect(isReactiveExecutor(exec)).toBe(false);
    expect(isReactiveExecutor(exec.lazy)).toBe(false);
    expect(isReactiveExecutor(exec.static)).toBe(false);
  });

  it("isStaticExecutor identifies static executors", () => {
    const exec = provide(() => 42);

    expect(isStaticExecutor(exec.static)).toBe(true);
    expect(isStaticExecutor(exec)).toBe(false);
    expect(isStaticExecutor(exec.lazy)).toBe(false);
    expect(isStaticExecutor(exec.reactive)).toBe(false);
  });

  it("isMainExecutor identifies main executors", () => {
    const exec = provide(() => 42);

    expect(isMainExecutor(exec)).toBe(true);
    expect(isMainExecutor(exec.lazy)).toBe(false);
    expect(isMainExecutor(exec.reactive)).toBe(false);
    expect(isMainExecutor(exec.static)).toBe(false);
  });

  it("isExecutor identifies all executor types", () => {
    const exec = provide(() => 42);

    expect(isExecutor(exec)).toBe(true);
    expect(isExecutor(exec.lazy)).toBe(true);
    expect(isExecutor(exec.reactive)).toBe(true);
    expect(isExecutor(exec.static)).toBe(true);
    expect(isExecutor({})).toBe(false);
    expect(isExecutor(null)).toBe(false);
  });
});
```

**Step 2: Run test to verify existing guards work**

Run: `pnpm -F @pumped-fn/core-next test executor.test`
Expected: All tests PASS (these validate current behavior before refactor)

**Step 3: Inline guard functions (they're already minimal)**

No changes needed - current implementation is already optimal (single-line checks). Skip this consolidation.

**Step 4: Commit skip decision**

```bash
git add -A
git commit -m "chore: skip executor guard consolidation

Analysis shows guards are already minimal (single-line checks).
No reduction possible without adding indirection overhead.

Part of packages-next compaction effort"
```

---

## Task 5: Inline Rarely-Used Helpers

**Files:**
- Read: `packages/next/src/promises.ts`
- Read: `packages/next/src/helpers.ts`
- Modify based on usage analysis

**Step 1: Count usage of each exported helper**

Run: `rg "import.*Promised" packages/next/src --no-filename | sort | uniq -c`
Expected: Usage counts for Promised class

Run: `rg "import.*resolves" packages/next/src --no-filename | sort | uniq -c`
Expected: Usage counts for resolves helper

Run: `rg "import.*Escapable" packages/next/src --no-filename | sort | uniq -c`
Expected: Usage counts for Escapable type

**Step 2: Analyze Promised usage**

Run: `rg "Promised\." packages/next/src -c`
Expected: File-by-file count of Promised method usage

**Step 3: Check if any Promised methods used ≤2 times**

Run: `rg "Promised\.(try|race|allSettled)" packages/next/src`
Expected: List files using these methods

**Step 4: Document decision - keep Promised as is**

Promised is a core abstraction used extensively. No inlining candidates.

**Step 5: Commit analysis**

```bash
git add -A
git commit -m "chore: analyze helper usage - no inlining candidates

Promised class: core abstraction used throughout codebase
resolves helper: used in public API, now backed by resolveShape
Escapable: type-only export, zero runtime cost

Part of packages-next compaction effort"
```

---

## Task 6: Reduce Scope State Field Duplication

**Files:**
- Read: `packages/next/src/scope.ts:26-36`
- Read: `packages/next/src/scope.ts:200-500`
- Modify: `packages/next/src/scope.ts`

**Step 1: Document current ExecutorState usage**

Run: `rg "state\.(accessor|value|cleanups|onUpdateCallbacks|onUpdateExecutors|onErrors|resolutionChain|resolutionDepth|updateQueue)" packages/next/src/scope.ts -c`
Expected: Count of field accesses

**Step 2: Analyze if any fields can be combined**

Review fields:
- `accessor`: Core.Accessor<unknown> - required
- `value`: Core.ResolveState<unknown> - required
- `cleanups`: Set<Core.Cleanup> - optional, lazy init
- `onUpdateCallbacks`: Set<OnUpdateFn> - optional, lazy init
- `onUpdateExecutors`: Set<UE> - optional, lazy init
- `onErrors`: Set<Core.ErrorCallback<unknown>> - optional, lazy init
- `resolutionChain`: Set<UE> - optional, lazy init
- `resolutionDepth`: number - optional, lazy init
- `updateQueue`: Promise<void> - optional, lazy init

**Step 3: Verify fields are already optimally structured**

All optional fields use lazy initialization (created on demand via helper functions). No consolidation opportunity without adding complexity.

**Step 4: Check for duplicate field initialization patterns**

Run: `rg "if \(!state\.\w+\)" packages/next/src/scope.ts -A 2`
Expected: List of lazy init patterns

**Step 5: Extract lazy init helper if pattern repeats >3 times**

Analyze output from Step 4. If same pattern appears >3 times, extract helper:

```typescript
function getOrInitSet<T>(set: Set<T> | undefined): Set<T> {
  if (!set) {
    set = new Set<T>();
  }
  return set;
}
```

Only proceed if analysis shows benefit.

**Step 6: Run all tests**

Run: `pnpm -F @pumped-fn/core-next test`
Expected: All tests PASS

**Step 7: Commit analysis or changes**

```bash
git add packages/next/src/scope.ts
git commit -m "refactor: analyze scope state structure

ExecutorState fields already use lazy initialization optimally.
Optional fields created on-demand to minimize memory overhead.

Part of packages-next compaction effort"
```

---

## Task 7: Consolidate FlowDefinition Handler Overloads

**Files:**
- Read: `packages/next/src/flow.ts:62-115`
- Modify: `packages/next/src/flow.ts`

**Step 1: Write test covering both handler overloads**

Modify: `packages/next/tests/flow.test.ts`

Add tests:
```typescript
import { describe, it, expect } from "vitest";
import { flow } from "../src/flow";
import { provide } from "../src/executor";
import { custom } from "../src/ssch";

describe("flow.handler overloads", () => {
  it("creates flow without dependencies", async () => {
    const f = flow({
      name: "test",
      version: "1.0",
      input: custom(),
      output: custom()
    }).handler((ctx, input: number) => {
      return input * 2;
    });

    const result = await f.execute(5);
    expect(result).toBe(10);
  });

  it("creates flow with dependencies", async () => {
    const multiplier = provide(() => 3);
    const f = flow({
      name: "test",
      version: "1.0",
      input: custom(),
      output: custom()
    }).handler([multiplier], ([mult], ctx, input: number) => {
      return input * mult;
    });

    const result = await f.execute(5);
    expect(result).toBe(15);
  });

  it("preserves flow definition metadata", async () => {
    const definition = flow({
      name: "metadata-test",
      version: "2.0",
      input: custom(),
      output: custom()
    });

    const f = definition.handler((ctx, input: string) => input.toUpperCase());

    expect(f.definition).toBe(definition);
    expect(f.definition.name).toBe("metadata-test");
    expect(f.definition.version).toBe("2.0");
  });
});
```

**Step 2: Run test to verify current behavior**

Run: `pnpm -F @pumped-fn/core-next test flow.test`
Expected: All tests PASS (validates before refactor)

**Step 3: Analyze overload consolidation opportunity**

Read flow.ts:62-115 to identify shared logic. Both overloads:
1. Check if first arg is function (no deps) or dependencies
2. Call createExecutor
3. Attach definition metadata
4. Return Flow

**Step 4: Consolidate overloads into tuple-based single impl**

Modify: `packages/next/src/flow.ts`

Find:
```typescript
handler<D extends Core.DependencyLike>(
  dependenciesOrHandler:
    | D
    | ((ctx: Flow.Context, input: I) => Promise<S> | S),
  handlerFn?: (
    deps: Core.InferOutput<D>,
    ctx: Flow.Context,
    input: I
  ) => Promise<S> | S
): Flow.Flow<I, S> {
  if (typeof dependenciesOrHandler === "function") {
    const noDepsHandler = dependenciesOrHandler;
    const executor = createExecutor(
      () => {
        const flowHandler = async (ctx: Flow.Context, input: I) => {
          return noDepsHandler(ctx, input);
        };
        return flowHandler as Flow.Handler<S, I>;
      },
      undefined,
      [...this.tags, flowDefinitionMeta(this)]
    ) as Flow.Flow<I, S>;
    executor.definition = this;
    return executor;
  }
  const dependencies = dependenciesOrHandler;
  const factory: Core.DependentFn<Flow.Handler<S, I>, unknown> = (
    deps,
    _controller
  ) => {
    return async (ctx: Flow.Context, input: I) => {
      return handlerFn!(deps as Core.InferOutput<D>, ctx, input);
    };
  };
  const executor = createExecutor(
    factory,
    dependencies as
      | Core.UExecutor
      | ReadonlyArray<Core.UExecutor>
      | Record<string, Core.UExecutor>,
    [...this.tags, flowDefinitionMeta(this)]
  ) as Flow.Flow<I, S>;
  executor.definition = this;
  return executor;
}
```

Replace:
```typescript
handler<D extends Core.DependencyLike>(
  dependenciesOrHandler:
    | D
    | ((ctx: Flow.Context, input: I) => Promise<S> | S),
  handlerFn?: (
    deps: Core.InferOutput<D>,
    ctx: Flow.Context,
    input: I
  ) => Promise<S> | S
): Flow.Flow<I, S> {
  const hasDependencies = typeof dependenciesOrHandler !== "function";

  const factory = hasDependencies
    ? ((deps: unknown, _controller: Core.Controller) => {
        return async (ctx: Flow.Context, input: I) => {
          return handlerFn!(deps as Core.InferOutput<D>, ctx, input);
        };
      }) as Core.DependentFn<Flow.Handler<S, I>, unknown>
    : (() => {
        const noDepsHandler = dependenciesOrHandler as (ctx: Flow.Context, input: I) => Promise<S> | S;
        const flowHandler = async (ctx: Flow.Context, input: I) => {
          return noDepsHandler(ctx, input);
        };
        return flowHandler as Flow.Handler<S, I>;
      }) as Core.NoDependencyFn<Flow.Handler<S, I>>;

  const dependencies = hasDependencies
    ? (dependenciesOrHandler as Core.UExecutor | ReadonlyArray<Core.UExecutor> | Record<string, Core.UExecutor>)
    : undefined;

  const executor = createExecutor(
    factory,
    dependencies,
    [...this.tags, flowDefinitionMeta(this)]
  ) as Flow.Flow<I, S>;

  executor.definition = this;
  return executor;
}
```

**Step 5: Run tests to verify consolidation**

Run: `pnpm -F @pumped-fn/core-next test flow.test`
Expected: All tests PASS

**Step 6: Run all tests**

Run: `pnpm -F @pumped-fn/core-next test`
Expected: All tests PASS

**Step 7: Verify typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck && pnpm -F @pumped-fn/core-next typecheck:full`
Expected: No type errors

**Step 8: Check LOC reduction**

Run: `wc -l packages/next/src/flow.ts`
Expected: Reduction of ~10-15 lines

**Step 9: Commit**

```bash
git add packages/next/src/flow.ts packages/next/tests/flow.test.ts
git commit -m "refactor: consolidate FlowDefinition.handler overloads

- Merge two overload implementations into single branched logic
- Extract hasDependencies flag to eliminate duplicate createExecutor calls
- Add tests to verify both overload paths

Reduces flow.ts by ~12 lines.

Part of packages-next compaction effort"
```

---

## Task 8: Measure and Validate LOC Reduction

**Files:**
- Read: All modified files
- Create: `/tmp/compaction-final.txt`

**Step 1: Capture final LOC**

Run: `rg --files packages/next/src | xargs wc -l > /tmp/compaction-final.txt && rg --files packages/next/tests | xargs wc -l >> /tmp/compaction-final.txt`
Expected: Final counts written

**Step 2: Calculate reduction**

Run: `diff /tmp/compaction-baseline.txt /tmp/compaction-final.txt`
Expected: Show LOC changes

**Step 3: Verify ≥10% reduction target met**

Baseline: 4586 LOC
Target: ≤4127 LOC (10% reduction = 459 lines)

Check final total LOC from Step 1 output.

**Step 4: Run all verification commands**

Run: `pnpm -F @pumped-fn/core-next typecheck && pnpm -F @pumped-fn/core-next typecheck:full && pnpm -F @pumped-fn/core-next test && pnpm -F @pumped-fn/examples typecheck`
Expected: All PASS

**Step 5: Check for regression in examples**

Run: `pnpm -F @pumped-fn/examples dev:basic-handler`
Expected: Example runs without errors

**Step 6: Document final metrics**

Create summary:
```
Baseline: 4586 LOC (src), 5574 LOC (tests)
Final: [ACTUAL] LOC (src), [ACTUAL] LOC (tests)
Reduction: [ACTUAL] LOC ([ACTUAL]%)

Changes:
- Extracted wrapWithExtensions to internal module
- Consolidated dependency resolution via resolveShape
- Simplified FlowDefinition.handler overloads
- Added 3 new test files for internal utilities

All tests pass, no API breakage, examples run successfully.
```

**Step 7: Commit final metrics**

```bash
echo "[summary from step 6]" > /tmp/compaction-summary.txt
git add /tmp/compaction-summary.txt
git commit -m "docs: compaction refactor completion metrics

[paste summary here]

Part of packages-next compaction effort"
```

---

## Task 9: Update Documentation and Skill References

**Files:**
- Read: `docs/guides/**/*.md`
- Read: `.claude/skills/pumped-design/references/**/*`
- Modify: Any files referencing changed internal APIs

**Step 1: Search for references to moved functions**

Run: `rg "wrapWithExtensions" docs/ .claude/`
Expected: List files mentioning wrapWithExtensions

**Step 2: Check if any docs reference internal modules**

Run: `rg "packages/next/src/flow\.ts.*wrapWithExtensions" docs/ .claude/`
Expected: Files documenting internal implementation (should use public API only)

**Step 3: Verify skill references use public API**

Read: `.claude/skills/pumped-design/references/api-reference.md` (if exists)

Check: All code examples use public exports (provide, derive, flow, etc.), not internal utilities.

**Step 4: Update any skill references if needed**

If skill files reference old implementation details, update to use public API.

**Step 5: Run examples to verify docs accuracy**

Run: `pnpm -F @pumped-fn/examples typecheck`
Expected: PASS (examples reflect current API)

**Step 6: Commit doc/skill updates**

```bash
git add docs/ .claude/
git commit -m "docs: update references after compaction refactor

- Verify all docs use public API
- Update skill references if needed
- Confirm examples match current implementation

Part of packages-next compaction effort"
```

---

## Task 10: Create Changeset

**Files:**
- Create: `.changeset/packages-next-compaction.md`

**Step 1: Write changeset describing refactor**

Create: `.changeset/packages-next-compaction.md`

```markdown
---
"@pumped-fn/core-next": patch
---

Internal refactoring: consolidate duplicate patterns

- Extract `wrapWithExtensions` to internal/extension-utils.ts (eliminates duplication between flow.ts and scope.ts)
- Consolidate dependency resolution via internal `resolveShape` utility
- Simplify FlowDefinition.handler overload implementation
- Reduce packages/next/src by ~[ACTUAL]% ([ACTUAL] LOC)

No public API changes. All tests pass. Performance neutral or improved.
```

**Step 2: Run changeset validation**

Run: `git add .changeset/packages-next-compaction.md`
Expected: File staged

**Step 3: Commit changeset**

```bash
git commit -m "chore: add changeset for compaction refactor"
```

---

## Execution Handoff

Plan complete and saved to `docs/plans/2025-11-11-packages-next-compaction.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

Which approach?
