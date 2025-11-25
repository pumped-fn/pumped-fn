# Core Package Compact Optimization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Consolidate `@pumped-fn/core-next` from 21 files to 9 files while removing unnecessary abstractions, reducing ~850 lines of code.

**Architecture:** File consolidation with API simplification. Error classes get inline codes, Promised loses 9 methods, Tag loses aliases, FlowDefinition builder removed, exec() simplified to single config overload.

**Tech Stack:** TypeScript, Vitest, pnpm monorepo

---

## Task 1: Simplify Error System

**Files:**
- Modify: `packages/next/src/errors.ts`
- Modify: `packages/next/src/types.ts`

**Step 1: Read current error implementation**

```bash
cat packages/next/src/errors.ts
```

Understand current `errorCatalog`, `codes`, `formatMessage()` structure.

**Step 2: Run existing tests to establish baseline**

Run: `pnpm -F @pumped-fn/core-next test`
Expected: All tests PASS

**Step 3: Move error classes from types.ts to errors.ts with inline codes**

In `packages/next/src/errors.ts`, replace the error catalog system with inline codes:

```typescript
import { type StandardSchemaV1 } from "./types"

export class SchemaError extends Error {
  static readonly CODE = "V001"
  readonly code = SchemaError.CODE
  readonly issues: ReadonlyArray<StandardSchemaV1.Issue>

  constructor(issues: ReadonlyArray<StandardSchemaV1.Issue>) {
    super(`Schema validation failed: ${issues[0]?.message ?? "unknown error"}`)
    this.name = "SchemaError"
    this.issues = issues
  }
}

export class ExecutorResolutionError extends Error {
  static readonly CODE = "E001"
  readonly code = ExecutorResolutionError.CODE
  readonly executorName: string
  readonly dependencyChain: string[]

  constructor(message: string, executorName: string, dependencyChain: string[], cause?: unknown) {
    super(message, { cause })
    this.name = "ExecutorResolutionError"
    this.executorName = executorName
    this.dependencyChain = dependencyChain
  }
}

export class FactoryExecutionError extends Error {
  static readonly CODE = "F001"
  readonly code = FactoryExecutionError.CODE
  readonly executorName: string
  readonly dependencyChain: string[]

  constructor(message: string, executorName: string, dependencyChain: string[], cause?: unknown) {
    super(message, { cause })
    this.name = "FactoryExecutionError"
    this.executorName = executorName
    this.dependencyChain = dependencyChain
  }
}

export class DependencyResolutionError extends Error {
  static readonly CODE = "D001"
  readonly code = DependencyResolutionError.CODE
  readonly executorName: string
  readonly dependencyChain: string[]
  readonly missingDependency?: string

  constructor(message: string, executorName: string, dependencyChain: string[], missingDependency?: string, cause?: unknown) {
    super(message, { cause })
    this.name = "DependencyResolutionError"
    this.executorName = executorName
    this.dependencyChain = dependencyChain
    this.missingDependency = missingDependency
  }
}

export class ExecutionContextClosedError extends Error {
  static readonly CODE = "EC001"
  readonly code = ExecutionContextClosedError.CODE
  readonly contextId: string
  readonly state: string

  constructor(contextId: string, state: string) {
    super(`ExecutionContext ${contextId} is ${state}`)
    this.name = "ExecutionContextClosedError"
    this.contextId = contextId
    this.state = state
  }
}
```

**Step 4: Simplify error factory functions**

Replace complex factory functions with simple ones:

```typescript
export function createFactoryError(
  executorName: string,
  dependencyChain: string[],
  cause: unknown
): FactoryExecutionError {
  const causeMsg = cause instanceof Error ? cause.message : String(cause)
  return new FactoryExecutionError(
    `Factory failed for "${executorName}": ${causeMsg}`,
    executorName,
    dependencyChain,
    cause
  )
}

export function createDependencyError(
  executorName: string,
  dependencyChain: string[],
  missingDependency?: string,
  cause?: unknown
): DependencyResolutionError {
  const msg = missingDependency
    ? `Dependency "${missingDependency}" not found for "${executorName}"`
    : `Dependency resolution failed for "${executorName}"`
  return new DependencyResolutionError(msg, executorName, dependencyChain, missingDependency, cause)
}

export function createSystemError(
  executorName: string,
  dependencyChain: string[],
  cause?: unknown
): ExecutorResolutionError {
  const causeMsg = cause instanceof Error ? cause.message : String(cause)
  return new ExecutorResolutionError(
    `System error for "${executorName}": ${causeMsg}`,
    executorName,
    dependencyChain,
    cause
  )
}
```

**Step 5: Remove errorCatalog, codes, formatMessage, messages**

Delete these exports from errors.ts:
- `errorCatalog`
- `codes`
- `formatMessage()`
- `messages`

**Step 6: Update types.ts to remove error classes**

Remove `SchemaError`, `ExecutorResolutionError`, `FactoryExecutionError`, `DependencyResolutionError` from types.ts (they now live in errors.ts).

**Step 7: Update index.ts exports**

Ensure error classes are exported from errors.ts, not types.ts.

**Step 8: Run typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: PASS with no errors

**Step 9: Run tests**

Run: `pnpm -F @pumped-fn/core-next test`
Expected: All tests PASS

**Step 10: Commit**

```bash
git add packages/next/src/errors.ts packages/next/src/types.ts packages/next/src/index.ts
git commit -m "refactor(errors): inline error codes, remove catalog system"
```

---

## Task 2: Simplify Promised Class

**Files:**
- Modify: `packages/next/src/promises.ts`

**Step 1: Read current Promised implementation**

```bash
cat packages/next/src/promises.ts
```

Identify methods to remove: `switch`, `switchError`, `fulfilled`, `rejected`, `firstFulfilled`, `firstRejected`, `findFulfilled`, `mapFulfilled`, `assertAllFulfilled`.

**Step 2: Remove switch and switchError methods**

Delete these methods from the Promised class:

```typescript
// DELETE these methods:
switch<U>(fn: (value: T) => Promised<U>): Promised<U> { ... }
switchError(fn: (error: unknown) => Promised<T>): Promised<T> { ... }
```

**Step 3: Remove private extractResults helper**

Delete:

```typescript
// DELETE:
private static extractResults<U>(...) { ... }
```

**Step 4: Remove mapResults helper**

Delete:

```typescript
// DELETE:
private mapResults<R>(...) { ... }
```

**Step 5: Remove settled result methods except partition**

Delete these methods:

```typescript
// DELETE all these:
fulfilled<U>(...) { ... }
rejected<U>(...) { ... }
firstFulfilled<U>(...) { ... }
firstRejected<U>(...) { ... }
findFulfilled<U>(...) { ... }
mapFulfilled<U, R>(...) { ... }
assertAllFulfilled<U>(...) { ... }
```

**Step 6: Simplify partition method**

Keep partition but simplify (no mapResults dependency):

```typescript
partition<U>(
  this: Promised<readonly PromiseSettledResult<U>[]> | Promised<{ results: readonly PromiseSettledResult<any>[] }>
): Promised<{ fulfilled: any[]; rejected: unknown[] }> {
  return this.map((value: any) => {
    const results = Array.isArray(value) ? value : value.results
    const fulfilled: any[] = []
    const rejected: unknown[] = []

    for (const result of results) {
      if (result.status === "fulfilled") {
        fulfilled.push(result.value)
      } else {
        rejected.push(result.reason)
      }
    }

    return { fulfilled, rejected }
  })
}
```

**Step 7: Run typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: PASS

**Step 8: Run tests**

Run: `pnpm -F @pumped-fn/core-next test`
Expected: Some tests may fail if they use removed methods - note which ones.

**Step 9: Update any failing tests**

If tests use removed methods, update them to use alternatives per migration guide.

**Step 10: Run tests again**

Run: `pnpm -F @pumped-fn/core-next test`
Expected: All tests PASS

**Step 11: Commit**

```bash
git add packages/next/src/promises.ts packages/next/tests/
git commit -m "refactor(promised): remove 9 methods, keep core + partition"
```

---

## Task 3: Clean Tag API

**Files:**
- Modify: `packages/next/src/tag.ts`

**Step 1: Read current tag implementation**

```bash
cat packages/next/src/tag.ts
```

Identify: `injectTo` alias, `partial()` method, internal naming.

**Step 2: Remove injectTo alias**

Find and delete this line:

```typescript
// DELETE:
fn.injectTo = impl.writeToStore.bind(impl);
```

**Step 3: Remove partial method**

Find and delete:

```typescript
// DELETE:
(fn as any).partial = <D extends Partial<T>>(d: D): D => {
  return Object.assign({}, createTagged(impl.key, impl.schema, {} as T, impl.label), d);
};
```

**Step 4: Update Tag interface in tag-types.ts**

Remove `injectTo` from the interface:

```typescript
// In tag-types.ts, DELETE this line from Tag interface:
injectTo(target: Store, value: T): void;
```

**Step 5: Run typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: May show errors where `injectTo` is used - note locations.

**Step 6: Fix any injectTo usages in codebase**

Use ast-grep to find usages:

```bash
ast-grep --lang typescript --pattern '$TAG.injectTo($STORE, $VALUE)' packages/next/src/
```

Replace with `writeToStore`.

**Step 7: Run typecheck again**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: PASS

**Step 8: Run tests**

Run: `pnpm -F @pumped-fn/core-next test`
Expected: All tests PASS (or fix any using `injectTo`)

**Step 9: Commit**

```bash
git add packages/next/src/tag.ts packages/next/src/tag-types.ts
git commit -m "refactor(tag): remove injectTo alias and partial method"
```

---

## Task 4: Simplify TagExecutor

**Files:**
- Modify: `packages/next/src/tag-types.ts`
- Modify: `packages/next/src/tag-executors.ts`

**Step 1: Read current TagExecutor interface**

```bash
cat packages/next/src/tag-types.ts
```

Note: Has both `[tagSymbol]` and `extractionMode`.

**Step 2: Remove extractionMode from interface**

In `tag-types.ts`, update TagExecutor:

```typescript
export interface TagExecutor<TOutput, TTag = TOutput> extends Container {
  readonly [tagSymbol]: "required" | "optional" | "all"
  readonly tag: Tag<TTag, boolean>
  // DELETE: readonly extractionMode: "extract" | "read" | "collect"
}
```

**Step 3: Update tag-executors.ts creators**

In `tag-executors.ts`, remove extractionMode from return objects:

```typescript
export function required<T>(tag: Tag.Tag<T, boolean>): Tag.TagExecutor<T, T> {
  return {
    [tagSymbol]: "required",
    tag,
    // DELETE: extractionMode: "extract",
  }
}

export function optional<T>(tag: Tag.Tag<T, boolean>): Tag.TagExecutor<T, T> {
  return {
    [tagSymbol]: "optional",
    tag,
    // DELETE: extractionMode: "read",
  }
}

export function all<T>(tag: Tag.Tag<T, boolean>): Tag.TagExecutor<T[], T> {
  return {
    [tagSymbol]: "all",
    tag,
    // DELETE: extractionMode: "collect",
  }
}
```

**Step 4: Update dependency-utils.ts to derive mode from symbol**

In `internal/dependency-utils.ts`, update resolution logic to use `[tagSymbol]` value instead of `extractionMode`:

```typescript
// Find code that checks extractionMode and replace with:
// "required" → extract
// "optional" → read
// "all" → collect
```

**Step 5: Run typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: PASS

**Step 6: Run tests**

Run: `pnpm -F @pumped-fn/core-next test`
Expected: All tests PASS

**Step 7: Commit**

```bash
git add packages/next/src/tag-types.ts packages/next/src/tag-executors.ts packages/next/src/internal/
git commit -m "refactor(tag-executor): remove redundant extractionMode field"
```

---

## Task 5: Remove FlowDefinition Builder

**Files:**
- Modify: `packages/next/src/execution-context.ts`

**Step 1: Understand FlowDefinition usage**

```bash
ast-grep --lang typescript --pattern 'flow($CONFIG).handler' packages/next/
```

Check if builder pattern is used anywhere.

**Step 2: Update flowImpl to not return FlowDefinition**

In `execution-context.ts`, the overload `flow(config): FlowDefinition` must be removed. Update `flowImpl` to always require a handler:

Remove this overload signature:
```typescript
// DELETE:
function flowImpl<S, I>(config: DefineConfig<S, I>): FlowDefinition<S, I>
```

**Step 3: Update flowImpl implementation**

In the implementation, remove the branch that returns `FlowDefinition`:

```typescript
// In flowImpl, DELETE this branch:
if (isDefineConfig(first)) {
  const def = define(config)
  if (!second) {
    return def  // DELETE this return
  }
  // ... rest
}
```

Change to require handler:

```typescript
if (isDefineConfig(first)) {
  if (!second || typeof second !== "function") {
    throw new Error("flow(config) requires handler as second argument")
  }
  // ... continue with handler
}
```

**Step 4: Remove FlowDefinition class**

Delete the entire `FlowDefinition` class from execution-context.ts.

**Step 5: Remove define and attachDependencies helpers**

Delete:
```typescript
// DELETE:
const define = <S, I>(...) => { ... }
const attachDependencies = <S, I, D2>(...) => { ... }
```

**Step 6: Run typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: May show errors - fix call sites.

**Step 7: Update any failing tests/examples**

If tests use `.handler()` pattern, update to direct syntax.

**Step 8: Run tests**

Run: `pnpm -F @pumped-fn/core-next test`
Expected: All tests PASS

**Step 9: Commit**

```bash
git add packages/next/src/execution-context.ts packages/next/tests/
git commit -m "refactor(flow): remove FlowDefinition builder pattern"
```

---

## Task 6: Simplify exec() to Single Config

**Files:**
- Modify: `packages/next/src/execution-context.ts`
- Modify: `packages/next/src/types.ts`

**Step 1: Find all exec() overloads**

```bash
ast-grep --lang typescript --pattern 'exec($$$)' packages/next/src/execution-context.ts
```

**Step 2: Define single ExecConfig type**

Add to types.ts or execution-context.ts:

```typescript
type FlowExecConfig<F extends Flow.UFlow> = {
  flow: F
  key?: string
  timeout?: number
  retry?: number
  tags?: Tag.Tagged[]
} & (Flow.InferInput<F> extends void | undefined
  ? { input?: never }
  : { input: Flow.InferInput<F> })

type FnExecConfig<T, Params extends readonly unknown[]> = {
  fn: (...args: Params) => T | Promise<T>
  params?: Params
  key?: string
  timeout?: number
  retry?: number
  tags?: Tag.Tagged[]
}

type ExecConfig = FlowExecConfig<any> | FnExecConfig<any, any>
```

**Step 3: Remove positional overloads**

In ExecutionContextImpl, remove these overload signatures:

```typescript
// DELETE these signatures:
exec<F extends Flow.UFlow>(flow: F, input: Flow.InferInput<F>): Promised<...>
exec<F extends Flow.UFlow>(key: string, flow: F, input: Flow.InferInput<F>): Promised<...>
```

Keep only config-based:

```typescript
exec<F extends Flow.UFlow>(config: FlowExecConfig<F>): Promised<Flow.InferOutput<F>>
exec<T>(config: FnExecConfig<T, any>): Promised<T>
```

**Step 4: Simplify parseExecOverloads**

Remove branches for positional arguments:

```typescript
private parseExecOverloads<F extends Flow.UFlow>(
  config: ExecConfig
): ExecConfig.Normalized {
  if ('flow' in config) {
    return {
      type: "flow",
      flow: config.flow,
      input: config.input,
      key: config.key,
      timeout: config.timeout,
      retry: config.retry,
      tags: config.tags
    }
  }
  if ('fn' in config) {
    return {
      type: "fn",
      fn: config.fn,
      params: config.params ?? [],
      key: config.key,
      timeout: config.timeout,
      retry: config.retry,
      tags: config.tags
    }
  }
  throw new Error("Invalid exec config")
}
```

**Step 5: Run typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck:full`
Expected: Errors in tests using positional syntax - note them.

**Step 6: Update tests to use config syntax**

Find and replace:
```typescript
// Before:
ctx.exec(myFlow, input)

// After:
ctx.exec({ flow: myFlow, input })
```

**Step 7: Run typecheck again**

Run: `pnpm -F @pumped-fn/core-next typecheck:full`
Expected: PASS

**Step 8: Run tests**

Run: `pnpm -F @pumped-fn/core-next test`
Expected: All tests PASS

**Step 9: Commit**

```bash
git add packages/next/src/execution-context.ts packages/next/src/types.ts packages/next/tests/
git commit -m "refactor(exec): simplify to single config overload"
```

---

## Task 7: Rename onChange to onResolve

**Files:**
- Modify: `packages/next/src/scope.ts`
- Modify: `packages/next/src/types.ts`

**Step 1: Find onChange in scope.ts**

```bash
ast-grep --lang typescript --pattern 'onChange($CALLBACK)' packages/next/src/scope.ts
```

**Step 2: Rename method in BaseScope**

In scope.ts, rename:
```typescript
// Before:
onChange(callback: Core.ChangeCallback): Core.Cleanup

// After:
onResolve(callback: Core.ResolveCallback): Core.Cleanup
```

**Step 3: Rename in types.ts**

Rename callback type:
```typescript
// Before:
type ChangeCallback = ...

// After:
type ResolveCallback = ...
```

**Step 4: Update onEvents property**

```typescript
// Before:
protected onEvents: {
  readonly change: Set<Core.ChangeCallback>
  ...
}

// After:
protected onEvents: {
  readonly resolve: Set<Core.ResolveCallback>
  ...
}
```

**Step 5: Update all internal references**

Replace `this.onEvents.change` with `this.onEvents.resolve`.

**Step 6: Run typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: PASS

**Step 7: Run tests**

Run: `pnpm -F @pumped-fn/core-next test`
Expected: All tests PASS

**Step 8: Commit**

```bash
git add packages/next/src/scope.ts packages/next/src/types.ts
git commit -m "refactor(scope): rename onChange to onResolve"
```

---

## Task 8: Update Extension Operation Types

**Files:**
- Modify: `packages/next/src/types.ts`
- Modify: `packages/next/src/execution-context.ts`

**Step 1: Add ExecutionMode type**

In types.ts, add:

```typescript
export type ExecutionMode = "sequential" | "parallel" | "parallel-settled"
```

**Step 2: Update ExecutionOperation type**

Replace current target-based structure with mode-based:

```typescript
export interface ExecutionOperation {
  kind: "execution"
  name: string
  mode: ExecutionMode
  input?: unknown
  key?: string
  context: Tag.Store
  flow?: Flow.UFlow
  definition?: Flow.Definition<any, any>
}
```

**Step 3: Remove FlowTarget, FnTarget, ParallelTarget types**

Delete these types from types.ts.

**Step 4: Update execution-context.ts to create new operation structure**

Update `createFlowExecutionDescriptor`, `createFnExecutionDescriptor`, and parallel methods to use new structure:

```typescript
// For flow:
operation: {
  kind: "execution",
  name: definition.name,
  mode: "sequential",
  input: config.input,
  key: config.key,
  context: childCtx,
  flow: config.flow,
  definition
}

// For fn:
operation: {
  kind: "execution",
  name: "fn",
  mode: "sequential",
  input: undefined,
  key: config.key,
  context: parentCtx
}

// For parallel:
operation: {
  kind: "execution",
  name: "parallel",
  mode: "parallel",  // or "parallel-settled"
  input: undefined,
  key: undefined,
  context: this
}
```

**Step 5: Run typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: PASS

**Step 6: Run tests**

Run: `pnpm -F @pumped-fn/core-next test`
Expected: All tests PASS

**Step 7: Commit**

```bash
git add packages/next/src/types.ts packages/next/src/execution-context.ts
git commit -m "refactor(extension): add ExecutionMode for OTel support"
```

---

## Task 9: File Consolidation - Create primitives.ts

**Files:**
- Create: `packages/next/src/primitives.ts`
- Modify: `packages/next/src/promises.ts` (to be deleted)
- Modify: `packages/next/src/ssch.ts` (to be deleted)

**Step 1: Create primitives.ts**

Create new file combining Promised and schema validation:

```typescript
// packages/next/src/primitives.ts
import { type StandardSchemaV1 } from "./types"
import { SchemaError } from "./errors"

// Schema validation
export function validate<TSchema extends StandardSchemaV1>(
  schema: TSchema,
  data: unknown
): Awaited<StandardSchemaV1.InferOutput<TSchema>> {
  const result = schema["~standard"].validate(data)
  if ("then" in result) {
    throw new Error("Async validation not supported")
  }
  if (result.issues) {
    throw new SchemaError(result.issues)
  }
  return result.value as Awaited<StandardSchemaV1.InferOutput<TSchema>>
}

type ValidationError = { success: false; issues: StandardSchemaV1.Issue[] }

export function custom<T>(
  validator?: (value: unknown) => T | ValidationError
): StandardSchemaV1<T, T> {
  return {
    "~standard": {
      vendor: "pumped-fn",
      version: 1,
      validate: (value): StandardSchemaV1.Result<T> => {
        if (!validator) {
          return { value: value as T }
        }
        const result = validator(value)
        if (typeof result === "object" && result !== null && "success" in result && result.success === false) {
          return { issues: result.issues }
        }
        return { value: result as T }
      },
    },
  }
}

// Copy simplified Promised class here
export class Promised<T> implements PromiseLike<T> {
  // ... (copy from promises.ts with removed methods)
}
```

**Step 2: Update imports across codebase**

Find all imports from promises.ts and ssch.ts:

```bash
ast-grep --lang typescript --pattern 'from "./promises"' packages/next/src/
ast-grep --lang typescript --pattern 'from "./ssch"' packages/next/src/
```

Update to import from "./primitives".

**Step 3: Run typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: PASS

**Step 4: Delete old files**

```bash
rm packages/next/src/promises.ts
rm packages/next/src/ssch.ts
```

**Step 5: Run typecheck again**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/next/src/primitives.ts
git rm packages/next/src/promises.ts packages/next/src/ssch.ts
git commit -m "refactor: consolidate promises.ts + ssch.ts into primitives.ts"
```

---

## Task 10: File Consolidation - Merge Tag Files

**Files:**
- Modify: `packages/next/src/tag.ts`
- Delete: `packages/next/src/tag-types.ts`
- Delete: `packages/next/src/tag-executors.ts`
- Delete: `packages/next/src/tags/merge.ts`

**Step 1: Copy tag-types.ts content into tag.ts**

Move `tagSymbol` and `Tag` namespace to top of tag.ts.

**Step 2: Copy tag-executors.ts content into tag.ts**

Move `required`, `optional`, `all`, `tags`, `isTag`, `isTagExecutor`, `isTagged` into tag.ts.

**Step 3: Copy tags/merge.ts content into tag.ts**

Move `mergeFlowTags` into tag.ts.

**Step 4: Update all imports**

Replace:
- `from "./tag-types"` → `from "./tag"`
- `from "./tag-executors"` → `from "./tag"`
- `from "./tags/merge"` → `from "./tag"`

**Step 5: Delete old files**

```bash
rm packages/next/src/tag-types.ts
rm packages/next/src/tag-executors.ts
rm -rf packages/next/src/tags/
```

**Step 6: Run typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: PASS

**Step 7: Commit**

```bash
git add packages/next/src/tag.ts
git rm packages/next/src/tag-types.ts packages/next/src/tag-executors.ts
git rm -rf packages/next/src/tags/
git commit -m "refactor: consolidate tag files into single tag.ts"
```

---

## Task 11: File Consolidation - Merge Internal Utils

**Files:**
- Modify: `packages/next/src/executor.ts`
- Modify: `packages/next/src/scope.ts`
- Modify: `packages/next/src/execution-context.ts`
- Delete: `packages/next/src/internal/` directory

**Step 1: Move resolveShape to executor.ts**

Copy `resolveShape` from `internal/dependency-utils.ts` to `executor.ts`.

**Step 2: Move applyExtensions to scope.ts**

Copy `applyExtensions` from `internal/extension-utils.ts` to `scope.ts`.

**Step 3: Inline abort/journal utils in execution-context.ts**

Copy:
- `createAbortWithTimeout` from `internal/abort-utils.ts`
- `createJournalKey`, `checkJournalReplay`, `JournalEntry` from `internal/journal-utils.ts`

Into `execution-context.ts`.

**Step 4: Update imports**

Replace all `from "./internal/..."` imports with local references.

**Step 5: Delete internal directory**

```bash
rm -rf packages/next/src/internal/
```

**Step 6: Run typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: PASS

**Step 7: Commit**

```bash
git add packages/next/src/executor.ts packages/next/src/scope.ts packages/next/src/execution-context.ts
git rm -rf packages/next/src/internal/
git commit -m "refactor: inline internal utilities into main modules"
```

---

## Task 12: File Consolidation - Merge Flow Files

**Files:**
- Modify: `packages/next/src/execution-context.ts` → rename to `execution.ts`
- Delete: `packages/next/src/flow.ts`
- Delete: `packages/next/src/flow-execution.ts`

**Step 1: Move FlowExecutionImpl to execution-context.ts**

Copy `FlowExecutionImpl` from `flow-execution.ts` into `execution-context.ts`.

**Step 2: Move flow.execute to execution-context.ts**

Copy `execute` function and `normalizeExecuteOptions`, `createExecutionDetailsResult` from `flow.ts`.

**Step 3: Export flow with execute attached**

Ensure `flow` export includes `.execute` method.

**Step 4: Rename file**

```bash
mv packages/next/src/execution-context.ts packages/next/src/execution.ts
```

**Step 5: Update all imports**

Replace `from "./execution-context"` → `from "./execution"`.

**Step 6: Delete old files**

```bash
rm packages/next/src/flow.ts
rm packages/next/src/flow-execution.ts
```

**Step 7: Run typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: PASS

**Step 8: Commit**

```bash
git add packages/next/src/execution.ts
git rm packages/next/src/execution-context.ts packages/next/src/flow.ts packages/next/src/flow-execution.ts
git commit -m "refactor: consolidate flow files into execution.ts"
```

---

## Task 13: File Consolidation - Merge Helpers

**Files:**
- Modify: `packages/next/src/executor.ts`
- Modify: `packages/next/src/types.ts`
- Delete: `packages/next/src/helpers.ts`

**Step 1: Move Escapable type to types.ts**

Copy `Escapable` type from helpers.ts to types.ts.

**Step 2: Move resolves function to executor.ts**

Copy `resolves` from helpers.ts to executor.ts.

**Step 3: Update imports**

Replace `from "./helpers"` with appropriate imports.

**Step 4: Delete helpers.ts**

```bash
rm packages/next/src/helpers.ts
```

**Step 5: Run typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/next/src/executor.ts packages/next/src/types.ts
git rm packages/next/src/helpers.ts
git commit -m "refactor: move helpers into executor.ts and types.ts"
```

---

## Task 14: Update index.ts

**Files:**
- Modify: `packages/next/src/index.ts`

**Step 1: Update all imports to new file structure**

Replace old imports with new consolidated modules:
- `./primitives` for Promised, validate, custom
- `./tag` for all tag exports
- `./executor` for executor exports + resolves
- `./execution` for flow, flowMeta, ExecutionContextImpl
- `./errors` for error classes

**Step 2: Remove deprecated exports**

Remove exports for:
- `codes` (replaced by static class properties)
- `formatMessage` (removed)

**Step 3: Run typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: PASS

**Step 4: Run tests**

Run: `pnpm -F @pumped-fn/core-next test`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add packages/next/src/index.ts
git commit -m "refactor(index): update exports for consolidated structure"
```

---

## Task 15: Update Tests

**Files:**
- Modify: `packages/next/tests/*.ts`

**Step 1: Run all tests to identify failures**

Run: `pnpm -F @pumped-fn/core-next test`
Note all failing tests.

**Step 2: Update test imports**

Fix any broken imports due to file moves.

**Step 3: Update tests using removed APIs**

Per migration guide:
- `injectTo` → `writeToStore`
- `onChange` → `onResolve`
- Positional `exec()` → config-based
- Builder pattern → direct syntax

**Step 4: Run tests again**

Run: `pnpm -F @pumped-fn/core-next test`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add packages/next/tests/
git commit -m "test: update tests for consolidated API"
```

---

## Task 16: Update Examples

**Files:**
- Modify: `examples/**/*.ts`

**Step 1: Run examples typecheck**

Run: `pnpm -F @pumped-fn/examples typecheck`
Note any errors.

**Step 2: Fix any broken examples**

Update per migration guide.

**Step 3: Run typecheck again**

Run: `pnpm -F @pumped-fn/examples typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add examples/
git commit -m "chore(examples): update for consolidated API"
```

---

## Task 17: Final Verification

**Step 1: Run full typecheck**

```bash
pnpm -F @pumped-fn/core-next typecheck
pnpm -F @pumped-fn/core-next typecheck:full
```

Expected: PASS

**Step 2: Run all tests**

```bash
pnpm -F @pumped-fn/core-next test
```

Expected: All tests PASS

**Step 3: Run examples typecheck**

```bash
pnpm -F @pumped-fn/examples typecheck
```

Expected: PASS

**Step 4: Build package**

```bash
pnpm -F @pumped-fn/core-next build
```

Expected: Build successful

**Step 5: Verify file count**

```bash
ls packages/next/src/*.ts | wc -l
```

Expected: 9 files

**Step 6: Final commit**

```bash
git add .
git commit -m "feat!: consolidate core package to 9 files

BREAKING CHANGES:
- Promised: removed switch, switchError, fulfilled, rejected, firstFulfilled, firstRejected, findFulfilled, mapFulfilled, assertAllFulfilled
- Tag: removed injectTo alias, use writeToStore
- Flow: removed builder pattern, use flow(config, handler)
- exec(): removed positional overloads, use config object
- scope.onChange renamed to scope.onResolve
- Extension operation.target replaced with operation.mode
- Error codes moved to static class properties

See migration guide in docs/plans/2025-11-25-core-compact-optimization.md"
```

---

## Verification Checklist

After completing all tasks:

- [ ] File count: 9 source files in `packages/next/src/`
- [ ] Typecheck passes: `pnpm -F @pumped-fn/core-next typecheck`
- [ ] Tests pass: `pnpm -F @pumped-fn/core-next test`
- [ ] Examples pass: `pnpm -F @pumped-fn/examples typecheck`
- [ ] Build succeeds: `pnpm -F @pumped-fn/core-next build`
- [ ] Migration guide complete in this file
