# Sucrose Runtime Optimization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Maximize runtime performance by leveraging static analysis inference to eliminate conditionals, reduce allocations, and minimize code footprint.

**Architecture:** Restructure Sucrose metadata to always provide a normalized execution function and pre-computed controller factory. Remove redundant fields from executor objects and make variant accessors lazy.

**Tech Stack:** TypeScript, Vitest for testing

---

## Task 1: Remove `async` from Inference

**Files:**
- Modify: `packages/next/src/sucrose.ts`
- Modify: `packages/next/tests/index.test.ts`

**Step 1: Update Inference type**

In `packages/next/src/sucrose.ts`, remove `async` from the interface:

```typescript
export interface Inference {
  usesCleanup: boolean
  usesRelease: boolean
  usesReload: boolean
  usesScope: boolean
  dependencyShape: DependencyShape
  dependencyAccess: (number | string)[]
}
```

**Step 2: Remove async detection from analyze()**

In `packages/next/src/sucrose.ts`, update `analyze()` function to not compute or return `async`:

```typescript
export function analyze(
  fn: Function,
  dependencyShape: Sucrose.DependencyShape
): Sucrose.Inference {
  const [params, body] = separateFunction(fn)

  const ctlParam = dependencyShape === "none" ? params : params.split(",").pop()?.trim() || ""

  const usesCleanup = new RegExp(`${ctlParam}\\.cleanup`).test(body)
  const usesRelease = new RegExp(`${ctlParam}\\.release`).test(body)
  const usesReload = new RegExp(`${ctlParam}\\.reload`).test(body)
  const usesScope = new RegExp(`${ctlParam}\\.scope`).test(body)

  const dependencyAccess: (number | string)[] = []

  if (dependencyShape === "array") {
    const arrayMatch = params.match(/^\[([^\]]+)\]/)
    if (arrayMatch) {
      const destructured = arrayMatch[1].split(",").map((s) => s.trim())
      destructured.forEach((varName, index) => {
        if (varName && new RegExp(`\\b${varName}\\b`).test(body)) {
          dependencyAccess.push(index)
        }
      })
    }
  } else if (dependencyShape === "record") {
    const recordMatch = params.match(/^\{([^}]+)\}/)
    if (recordMatch) {
      const destructured = recordMatch[1].split(",").map((s) => s.trim().split(":")[0].trim())
      destructured.forEach((varName) => {
        if (varName && new RegExp(`\\b${varName}\\b`).test(body)) {
          dependencyAccess.push(varName)
        }
      })
    }
  }

  return {
    usesCleanup,
    usesRelease,
    usesReload,
    usesScope,
    dependencyShape,
    dependencyAccess,
  }
}
```

**Step 3: Run typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: PASS (no errors)

**Step 4: Update tests that reference async**

Search for tests referencing `inference.async` and remove those assertions. If no such tests exist, skip.

Run: `grep -n "inference.async" packages/next/tests/`

**Step 5: Run tests**

Run: `pnpm -F @pumped-fn/core-next test`
Expected: All 216 tests pass

**Step 6: Commit**

```bash
git add packages/next/src/sucrose.ts packages/next/tests/
git commit -m "refactor(sucrose): remove async from Inference

async keyword detection is unreliable - sync functions can return
Promise, and instanceof Promise fails for cross-realm/thenables.
Runtime thenable check is the correct approach."
```

---

## Task 2: Add isThenable Helper

**Files:**
- Modify: `packages/next/src/primitives.ts`

**Step 1: Add isThenable function**

At the end of `packages/next/src/primitives.ts`, add:

```typescript
export function isThenable(val: unknown): val is PromiseLike<unknown> {
  return val !== null && typeof val === "object" && typeof (val as any).then === "function"
}
```

**Step 2: Run typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/next/src/primitives.ts
git commit -m "feat(primitives): add isThenable helper

Correct thenable detection for cross-realm promises and custom
thenables. Used instead of instanceof Promise."
```

---

## Task 3: Add Controller Factory Infrastructure

**Files:**
- Modify: `packages/next/src/sucrose.ts`

**Step 1: Add ControllerFactory type and NOOP_CONTROLLER**

In `packages/next/src/sucrose.ts`, add after the namespace declaration:

```typescript
import { type Core } from "./types"
import { type Tag } from "./tag"
import { Promised } from "./primitives"

const NOOP_CLEANUP = () => {}
const RESOLVED_VOID = Promised.resolve()

export const NOOP_CONTROLLER: Core.Controller = Object.freeze({
  cleanup: NOOP_CLEANUP,
  release: () => RESOLVED_VOID,
  reload: () => RESOLVED_VOID,
  scope: null as unknown as Core.Scope,
})

export type ControllerFactory =
  | "none"
  | ((scope: Core.Scope, executor: Core.Executor<unknown>, registerCleanup: (fn: Core.Cleanup) => void) => Core.Controller)
```

**Step 2: Add createControllerFactory function**

```typescript
export function createControllerFactory(inference: Sucrose.Inference): ControllerFactory {
  const { usesCleanup, usesRelease, usesReload, usesScope } = inference

  if (!usesCleanup && !usesRelease && !usesReload && !usesScope) {
    return "none"
  }

  return (scope, executor, registerCleanup) => {
    const ctl: Partial<Core.Controller> = {}

    if (usesCleanup) {
      ctl.cleanup = registerCleanup
    }
    if (usesRelease) {
      ctl.release = () => scope.release(executor)
    }
    if (usesReload) {
      ctl.reload = () => scope.resolve(executor, true).map(() => undefined)
    }
    if (usesScope) {
      ctl.scope = scope
    }

    return ctl as Core.Controller
  }
}
```

**Step 3: Run typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/next/src/sucrose.ts
git commit -m "feat(sucrose): add controller factory infrastructure

Pre-compute controller shape at compile time. NOOP_CONTROLLER singleton
for executors that don't use any controller methods."
```

---

## Task 4: Restructure Metadata with Always-Normalized fn

**Files:**
- Modify: `packages/next/src/sucrose.ts`

**Step 1: Update Metadata interface**

Replace the existing `Metadata` interface:

```typescript
export interface Metadata {
  fn: (deps: unknown, ctl: unknown) => unknown
  inference: Inference
  controllerFactory: ControllerFactory
  callSite: string
  name: string | undefined
  original: Function
  skipReason?: CompilationSkipReason
}
```

**Step 2: Update compile() to always produce normalized fn**

Replace the `compile` function:

```typescript
export function compile(
  fn: Function,
  dependencyShape: Sucrose.DependencyShape,
  executor: Core.Executor<unknown> | undefined,
  tags: Tag.Tagged[] | undefined
): Sucrose.Metadata {
  const nameTagKey = Symbol.for("pumped-fn/name")
  let executorName: string | undefined

  if (tags) {
    const nameTagged = tags.find((t) => t.key === nameTagKey)
    if (nameTagged) {
      executorName = nameTagged.value as string
    }
  }

  const inference = analyze(fn, dependencyShape)
  const result = generate(fn, dependencyShape, executorName || "anonymous")
  const callSite = captureCallSite()
  const controllerFactory = createControllerFactory(inference)

  let normalizedFn: (deps: unknown, ctl: unknown) => unknown

  if (result.compiled) {
    normalizedFn = result.compiled
  } else {
    normalizedFn = dependencyShape === "none"
      ? (_deps: unknown, ctl: unknown) => (fn as (ctl: unknown) => unknown)(ctl)
      : (fn as (deps: unknown, ctl: unknown) => unknown)
  }

  const metadata: Sucrose.Metadata = {
    fn: normalizedFn,
    inference,
    controllerFactory,
    callSite,
    name: executorName,
    original: fn,
    skipReason: result.skipReason,
  }

  if (executor) {
    metadataStore.set(executor, metadata)
  }

  return metadata
}
```

**Step 3: Run typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: PASS

**Step 4: Run tests**

Run: `pnpm -F @pumped-fn/core-next test`
Expected: All tests pass

**Step 5: Commit**

```bash
git add packages/next/src/sucrose.ts
git commit -m "refactor(sucrose): restructure Metadata with always-normalized fn

- fn is always populated (compiled or normalized wrapper)
- Remove compiled/skipDetail, add controllerFactory
- Signature always (deps, ctl) => T for uniform execution"
```

---

## Task 5: Update Executor to Use Lazy Variant Getters

**Files:**
- Modify: `packages/next/src/executor.ts`

**Step 1: Rewrite createExecutor with lazy getters**

Replace the `createExecutor` function:

```typescript
export function createExecutor<T>(
  factory: Core.NoDependencyFn<T> | Core.DependentFn<T, unknown>,
  dependencies:
    | undefined
    | Core.UExecutor
    | ReadonlyArray<Core.UExecutor>
    | Record<string, Core.UExecutor>,
  tags: Tag.Tagged[] | undefined,
  originalFactory?: Function
): Core.Executor<T> {
  const dependencyShape = getDependencyShape(dependencies)

  let _lazy: Core.Lazy<T> | undefined
  let _reactive: Core.Reactive<T> | undefined
  let _static: Core.Static<T> | undefined

  const executor = {
    [executorSymbol]: "main",
    dependencies,
    tags: tags,
  } as unknown as Core.Executor<T>

  compile(originalFactory || factory, dependencyShape, executor, tags)

  Object.defineProperties(executor, {
    lazy: {
      get() {
        return _lazy ??= {
          [executorSymbol]: "lazy",
          dependencies: undefined,
          executor,
          factory: undefined,
          tags: tags,
        } as Core.Lazy<T>
      },
      enumerable: false,
      configurable: false,
    },
    reactive: {
      get() {
        return _reactive ??= {
          [executorSymbol]: "reactive",
          executor,
          factory: undefined,
          dependencies: undefined,
          tags: tags,
        } as Core.Reactive<T>
      },
      enumerable: false,
      configurable: false,
    },
    static: {
      get() {
        return _static ??= {
          [executorSymbol]: "static",
          dependencies: undefined,
          factory: undefined,
          tags: tags,
          executor,
        } as Core.Static<T>
      },
      enumerable: false,
      configurable: false,
    },
  })

  return executor
}
```

**Step 2: Run typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: May have errors about missing `factory` - we'll fix in next task

**Step 3: Commit (if typecheck passes)**

```bash
git add packages/next/src/executor.ts
git commit -m "refactor(executor): lazy variant getters, remove factory field

- lazy/reactive/static created on-demand via getters
- Remove factory from executor object (use metadata.fn)
- Reduces allocations from 4 objects to 1 per executor"
```

---

## Task 6: Update Types to Make factory Optional on Main Executor

**Files:**
- Modify: `packages/next/src/types.ts`

**Step 1: Update Core.Executor interface**

Change the `factory` field to be optional or remove it:

```typescript
export interface Executor<T> extends BaseExecutor<T> {
  [executorSymbol]: "main";
  readonly lazy: Lazy<T>;
  readonly reactive: Reactive<T>;
  readonly static: Static<T>;
}

export interface BaseExecutor<T> extends Tag.Container {
  [executorSymbol]: Kind;
  factory?: NoDependencyFn<T> | DependentFn<T, unknown> | undefined;
  dependencies:
    | undefined
    | UExecutor
    | Array<UExecutor>
    | Record<string, UExecutor>;
}
```

**Step 2: Run typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/next/src/types.ts
git commit -m "refactor(types): make factory optional on Executor

factory is no longer used at runtime - execution uses metadata.fn"
```

---

## Task 7: Update Scope Execution Path

**Files:**
- Modify: `packages/next/src/scope.ts`

**Step 1: Import new dependencies**

At the top of `packages/next/src/scope.ts`, update imports:

```typescript
import { getMetadata, NOOP_CONTROLLER, type ControllerFactory } from "./sucrose";
import { Promised, validate, isThenable } from "./primitives";
```

**Step 2: Update AccessorImpl.executeFactory**

Replace the `executeFactory` method in `AccessorImpl`:

```typescript
private async executeFactory(
  resolvedDependencies: unknown,
  effectiveExecutor: Core.Executor<unknown>
): Promise<unknown> {
  const meta = getMetadata(effectiveExecutor)!
  const callSite = meta.callSite

  const controller = meta.controllerFactory === "none"
    ? NOOP_CONTROLLER
    : meta.controllerFactory(
        this.scope,
        this.requestor,
        (fn: Core.Cleanup) => {
          const state = this.scope["getOrCreateState"](this.requestor)
          const cleanups = this.scope["ensureCleanups"](state)
          cleanups.add(fn)
        }
      )

  try {
    const factoryResult = meta.fn(resolvedDependencies, controller)

    if (isThenable(factoryResult)) {
      try {
        return await factoryResult
      } catch (asyncError) {
        const executorName = errors.getExecutorName(this.requestor)
        const dependencyChain = [executorName]

        throw errors.createFactoryError(
          executorName,
          dependencyChain,
          asyncError,
          callSite
        )
      }
    }

    return factoryResult
  } catch (syncError) {
    const executorName = errors.getExecutorName(this.requestor)
    const dependencyChain = [executorName]

    throw errors.createFactoryError(
      executorName,
      dependencyChain,
      syncError,
      callSite
    )
  }
}
```

**Step 3: Update executeFactory call site in resolveCore**

In `resolveCore`, update the call to `executeFactory` to remove the factory and controller parameters (they're now handled inside):

```typescript
const result = await this.executeFactory(
  resolvedDependencies,
  effectiveExecutor
);
```

Remove these lines from `resolveCore`:
```typescript
const controller = this.createController();
```

And update the call from:
```typescript
const result = await this.executeFactory(
  factory,
  resolvedDependencies,
  controller,
  effectiveExecutor
);
```

To:
```typescript
const result = await this.executeFactory(
  resolvedDependencies,
  effectiveExecutor
);
```

**Step 4: Remove createController method**

Delete the entire `createController` method from `AccessorImpl` as it's no longer needed.

**Step 5: Add dependency short-circuit**

In `resolveCore`, add short-circuit for `dependencyShape === 'none'`:

```typescript
private async resolveCore(): Promise<unknown> {
  const { factory, dependencies, immediateValue, effectiveExecutor } = this.processReplacer();

  if (immediateValue !== undefined) {
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    if (!this.executionContext) {
      const state = this.scope["getOrCreateState"](this.requestor);
      state.accessor = this;
      state.value = {
        kind: "resolved",
        value: immediateValue,
        promised: Promised.create(Promise.resolve(immediateValue)),
      };
    } else {
      this.contextResolvedValue = immediateValue;
    }

    return immediateValue;
  }

  const meta = getMetadata(effectiveExecutor)!

  const resolvedDependencies = meta.inference.dependencyShape === "none"
    ? undefined
    : await this.scope["~resolveDependencies"](
        dependencies,
        this.requestor,
        this.executionContext
      );

  const result = await this.executeFactory(
    resolvedDependencies,
    effectiveExecutor
  );

  const processedResult = await this.processChangeEvents(result);

  if (!this.executionContext) {
    const state = this.scope["getOrCreateState"](this.requestor);
    state.accessor = this;
    state.value = {
      kind: "resolved",
      value: processedResult,
      promised: Promised.create(Promise.resolve(processedResult)),
    };
  } else {
    this.contextResolvedValue = processedResult;
  }

  this.scope["~removeFromResolutionChain"](this.requestor);
  this.currentPromise = null;
  this.currentPromised = null;

  return processedResult;
}
```

**Step 6: Run typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: PASS

**Step 7: Run tests**

Run: `pnpm -F @pumped-fn/core-next test`
Expected: All 216 tests pass

**Step 8: Commit**

```bash
git add packages/next/src/scope.ts packages/next/src/primitives.ts
git commit -m "refactor(scope): use metadata.fn and controllerFactory

- Remove createController method
- Use NOOP_CONTROLLER for simple executors
- Use meta.fn instead of factory parameter
- Add dependency resolution short-circuit for provide()
- Use isThenable instead of instanceof Promise"
```

---

## Task 8: Update processReplacer for New Structure

**Files:**
- Modify: `packages/next/src/scope.ts`

**Step 1: Update ReplacerResult type**

The `factory` field is no longer needed since we use `meta.fn`:

```typescript
interface ReplacerResult {
  dependencies:
    | undefined
    | Core.UExecutor
    | Core.UExecutor[]
    | Record<string, Core.UExecutor>;
  immediateValue?: unknown;
  effectiveExecutor: Core.Executor<unknown>;
}
```

**Step 2: Update processReplacer method**

```typescript
private processReplacer(): ReplacerResult {
  const replacer = this.scope["initialValues"].find(
    (item) => item.executor === this.requestor
  );

  if (!replacer) {
    return {
      dependencies: this.requestor.dependencies,
      effectiveExecutor: this.requestor,
    };
  }

  const value = replacer.value;

  if (!isExecutor(value)) {
    return {
      dependencies: this.requestor.dependencies,
      immediateValue: value,
      effectiveExecutor: this.requestor,
    };
  }

  return {
    dependencies: value.dependencies,
    effectiveExecutor: value as Core.Executor<unknown>,
  };
}
```

**Step 3: Run typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: PASS

**Step 4: Run tests**

Run: `pnpm -F @pumped-fn/core-next test`
Expected: All tests pass

**Step 5: Commit**

```bash
git add packages/next/src/scope.ts
git commit -m "refactor(scope): remove factory from ReplacerResult

factory is accessed via metadata.fn, not passed through"
```

---

## Task 9: Export isThenable from Index

**Files:**
- Modify: `packages/next/src/index.ts`

**Step 1: Add isThenable to exports**

Find the primitives export and add `isThenable`:

```typescript
export { Promised, validate, isThenable } from "./primitives";
```

**Step 2: Run typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/next/src/index.ts
git commit -m "feat: export isThenable from primitives"
```

---

## Task 10: Final Verification and Cleanup

**Files:**
- All modified files

**Step 1: Run full typecheck including tests**

Run: `pnpm -F @pumped-fn/core-next typecheck:full`
Expected: PASS

**Step 2: Run all tests**

Run: `pnpm -F @pumped-fn/core-next test`
Expected: All 216 tests pass

**Step 3: Run examples typecheck**

Run: `pnpm -F @pumped-fn/examples typecheck`
Expected: PASS

**Step 4: Add changeset**

Create `.changeset/sucrose-optimization.md`:

```markdown
---
"@pumped-fn/core-next": minor
---

Sucrose runtime optimization: leverage static analysis for performance

- Remove `async` from Inference (unreliable, use thenable check instead)
- Always-normalized `fn` in Metadata (no runtime provide/derive check)
- Pre-computed controllerFactory (NOOP_CONTROLLER for simple executors)
- Lazy variant getters (lazy/reactive/static created on-demand)
- Dependency resolution short-circuit for provide()
- Use isThenable instead of instanceof Promise
```

**Step 5: Commit changeset**

```bash
git add .changeset/sucrose-optimization.md
git commit -m "chore: add changeset for sucrose optimization"
```

---

## Summary

| Task | Description | Risk |
|------|-------------|------|
| 1 | Remove async from Inference | Low |
| 2 | Add isThenable helper | Low |
| 3 | Add controller factory infrastructure | Low |
| 4 | Restructure Metadata with always-normalized fn | Medium |
| 5 | Lazy variant getters in executor | Low |
| 6 | Update types for optional factory | Low |
| 7 | Update scope execution path | High |
| 8 | Update processReplacer | Low |
| 9 | Export isThenable | Low |
| 10 | Final verification | N/A |

**Total estimated tasks:** 10
**High-risk tasks:** 1 (Task 7 - core execution path changes)
