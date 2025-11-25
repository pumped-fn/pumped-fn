# Core Package Compact Optimization Plan

## Overview

Consolidate `@pumped-fn/core-next` from 21 files to 9 files while removing unnecessary abstractions.

**Target:** `packages/next/src/`

## Final Structure (9 Files)

```
src/
├── types.ts          (~700 lines)  - Pure type declarations
├── errors.ts         (~250 lines)  - Error classes with inline codes
├── primitives.ts     (~200 lines)  - Promised + Schema
├── tag.ts            (~400 lines)  - Complete tag system
├── executor.ts       (~350 lines)  - Executor creation + helpers
├── multi.ts          (~150 lines)  - Multi-executor pools
├── scope.ts          (~1300 lines) - Core DI scope
├── execution.ts      (~1400 lines) - Flow execution system
└── index.ts          (~300 lines)  - Public API exports
```

**Estimated total:** ~5,050 lines (down from ~5,900)

---

## Phase 1: Simplify Abstractions

### 1.1 Promised Class Simplification

**File:** `primitives.ts` (merged from `promises.ts` + `ssch.ts`)

**Remove methods (~150 lines saved):**
- `switch()`
- `switchError()`
- `fulfilled()`
- `rejected()`
- `firstFulfilled()`
- `firstRejected()`
- `findFulfilled()`
- `mapFulfilled()`
- `assertAllFulfilled()`

**Keep methods:**
```typescript
class Promised<T> implements PromiseLike<T> {
  // Core Promise compatibility
  then<R1, R2>(onFulfilled?, onRejected?): Promised<R1 | R2>
  catch<R>(onRejected?): Promised<T | R>
  finally(onFinally?): Promised<T>

  // Transform
  map<U>(fn: (value: T) => U | Promise<U>): Promised<U>
  mapError(fn: (error: unknown) => unknown): Promised<T>

  // Settled results (single useful method)
  partition(): Promised<{ fulfilled: T[]; rejected: unknown[] }>  // only for PromiseSettledResult[]

  // Utilities
  toPromise(): Promise<T>
  ctx(): Promise<ExecutionData | undefined>
  inDetails(): Promise<ExecutionDetails<T>>

  // Static
  static create<T>(promise, ctxPromise?): Promised<T>
  static all<T>(values): Promised<T[]>
  static race<T>(values): Promised<T>
  static allSettled<T>(values): Promised<PromiseSettledResult<T>[]>
  static try<T>(fn): Promised<T>
}
```

### 1.2 Tag API Cleanup

**File:** `tag.ts` (merged from `tag.ts` + `tag-types.ts` + `tag-executors.ts` + `tags/merge.ts`)

**Remove:**
- `injectTo()` - legacy alias for `writeToStore()`
- `partial()` - unused method
- Internal `get()`/`find()`/`some()` naming (keep only public names)

**Final Tag interface:**
```typescript
interface Tag<T, HasDefault extends boolean = false> {
  readonly key: symbol
  readonly schema: StandardSchemaV1<T>
  readonly label?: string
  readonly default: HasDefault extends true ? T : never

  (value: T): Tagged<T>

  // Read operations (single naming convention)
  extractFrom(source: Source): T                    // throws if missing
  readFrom(source: Source): T | undefined           // returns undefined if missing
  collectFrom(source: Source): T[]                  // all values

  // Write operations
  writeToStore(target: Store, value: T): void
  writeToContainer(target: Container, value: T): Tagged<T>
  writeToTags(target: Tagged[], value: T): Tagged<T>

  // Utility
  entry(value: T): [symbol, T]
  toString(): string
}
```

### 1.3 TagExecutor Simplification

**Remove redundant `extractionMode` field.** Keep only `[tagSymbol]` for both guarding and mode:

```typescript
interface TagExecutor<TOutput, TTag = TOutput> {
  readonly [tagSymbol]: "required" | "optional" | "all"  // used for guard AND mode
  readonly tag: Tag<TTag, boolean>
}

// Derive extraction behavior from symbol value:
// "required" → extract (throw if missing)
// "optional" → read (undefined if missing)
// "all" → collect (array)
```

### 1.4 Error System Simplification

**File:** `errors.ts`

**Remove:**
- `errorCatalog` object
- `formatMessage()` template function
- `codes` export object
- `messages` lookup

**Inline codes in classes:**
```typescript
export class SchemaError extends Error {
  static readonly CODE = "V001"
  readonly code = SchemaError.CODE
  readonly issues: ReadonlyArray<StandardSchemaV1.Issue>

  constructor(issues: ReadonlyArray<StandardSchemaV1.Issue>) {
    super(`Schema validation failed: ${issues[0]?.message}`)
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

// Similar for: FactoryExecutionError, DependencyResolutionError,
// FlowError, FlowValidationError, ExecutionContextClosedError
```

**Simplified factory functions:**
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
```

### 1.5 Remove FlowDefinition Builder

**File:** `execution.ts`

**Remove:**
- `FlowDefinition` class
- `define()` function
- `attachDependencies()` function

**Keep only direct flow creation:**
```typescript
// Supported signatures:
flow(handler)                           // simple
flow(deps, handler)                     // with dependencies
flow(config, handler)                   // with config
flow(config, deps, handler)             // full

// NO builder pattern:
// flow(config).handler() - REMOVED
```

### 1.6 Simplify exec() to Single Config

**File:** `execution.ts` (ExecutionContextImpl)

**Remove overloads, keep single config:**
```typescript
interface ExecConfig<I, O> {
  flow?: Core.Executor<Flow.Handler<O, I>>
  fn?: (...args: unknown[]) => unknown
  input?: I extends void ? never : I      // absent for void input
  params?: unknown[]                      // for fn calls
  key?: string
  timeout?: number
  retry?: number
  tags?: Tag.Tagged[]
}

exec<I, O>(config: ExecConfig<I, O>): Promised<O>
```

**Type-level input handling:**
```typescript
type ExecConfig<I, O> = {
  flow: Core.Executor<Flow.Handler<O, I>>
  tags?: Tag.Tagged[]
  key?: string
  timeout?: number
} & (I extends void | undefined
  ? { input?: never }
  : { input: I })
```

### 1.7 Rename onChange to onResolve

**File:** `scope.ts`

```typescript
// Before
onChange(callback: ChangeCallback): Cleanup

// After
onResolve(callback: ResolveCallback): Cleanup
```

Update `ResolveCallback` type name for clarity.

### 1.8 Extension Operation for OTel

**File:** `types.ts`

**Simplified operation structure:**
```typescript
type ExecutionMode = "sequential" | "parallel" | "parallel-settled"

type ExecutionOperation = {
  kind: "execution"
  name: string                           // flow name, "fn", or "parallel"
  mode: ExecutionMode                    // critical for OTel span hierarchy
  input?: unknown
  key?: string
  context: Tag.Store
  flow?: Flow.UFlow                      // present for flow executions
  definition?: Flow.Definition<any, any> // present for flow executions
}

type ResolveOperation = {
  kind: "resolve"
  executor: Core.Executor<unknown>
  scope: Core.Scope
  operation: "resolve" | "update"
}

type ContextLifecycleOperation = {
  kind: "context-lifecycle"
  phase: "create" | "closing" | "closed"
  context: ExecutionContext.Context
  mode?: "graceful" | "abort"
}

type Operation = ResolveOperation | ExecutionOperation | ContextLifecycleOperation
```

---

## Phase 2: File Consolidation

### 2.1 Create `types.ts`

**Merge into single types file:**
- All type declarations from current `types.ts`
- `Escapable` type from `helpers.ts`
- Remove error classes (moved to `errors.ts`)

**Contents:**
```
- executorSymbol
- MaybePromised<T>
- StandardSchemaV1 interface + namespace
- ErrorContext interface (simplified)
- Core namespace
- Flow namespace
- Extension namespace (with simplified Operation)
- Multi namespace
- ExecutionContext namespace
- ResolvableItem type
- Escapable type
```

### 2.2 Create `errors.ts`

**Merge:**
- Error classes from `types.ts`
- Error factories from `errors.ts`
- `ExecutionContextClosedError`
- `getExecutorName()`, `buildDependencyChain()` helpers

### 2.3 Create `primitives.ts`

**Merge:**
- `Promised` class (simplified) from `promises.ts`
- `validate()` from `ssch.ts`
- `custom<T>()` from `ssch.ts`

### 2.4 Create `tag.ts`

**Merge:**
- `tagSymbol` from `tag-types.ts`
- `Tag` namespace from `tag-types.ts`
- `TagImpl` class from `tag.ts`
- `tag()` function from `tag.ts`
- `required()`, `optional()`, `all()` from `tag-executors.ts`
- `tags` export from `tag-executors.ts`
- `isTag()`, `isTagExecutor()`, `isTagged()` from `tag-executors.ts`
- `mergeFlowTags()` from `tags/merge.ts`

### 2.5 Create `executor.ts`

**Merge:**
- `createExecutor()` from `executor.ts`
- `provide()`, `derive()`, `preset()` from `executor.ts`
- Type guards from `executor.ts`
- `resolveShape()` from `internal/dependency-utils.ts`
- `resolves()` from `helpers.ts`

### 2.6 Keep `multi.ts`

**Minor changes only:**
- Update imports to new file structure

### 2.7 Create `scope.ts`

**Merge:**
- `AccessorImpl` class
- `BaseScope` class
- `createScope()` function
- `applyExtensions()` from `internal/extension-utils.ts` (inline)
- Rename `onChange` to `onResolve`

### 2.8 Create `execution.ts`

**Merge:**
- `flowDefinitionMeta` tag
- `flowMeta` tags
- `flowImpl()` function (without builder pattern)
- `ExecutionContextImpl` class
- `FlowExecutionImpl` from `flow-execution.ts`
- `flow.execute()` from `flow.ts`
- `createAbortWithTimeout()` from `internal/abort-utils.ts` (inline)
- `createJournalKey()`, `checkJournalReplay()` from `internal/journal-utils.ts` (inline)
- Simplified `exec()` with single config overload

### 2.9 Update `index.ts`

**Simplify exports:**
- Re-export from consolidated modules
- `name` tag definition
- Namespace exports

---

## Phase 3: Cleanup

### 3.1 Delete Files

After consolidation, remove:
```
- tag-types.ts
- tag-executors.ts
- tags/merge.ts
- tags/ directory
- promises.ts
- ssch.ts
- helpers.ts
- flow.ts
- flow-execution.ts
- internal/dependency-utils.ts
- internal/extension-utils.ts
- internal/abort-utils.ts
- internal/journal-utils.ts
- internal/ directory
```

### 3.2 Update Tests

Update test imports to use new file structure.

### 3.3 Verify

```bash
pnpm -F @pumped-fn/core-next typecheck
pnpm -F @pumped-fn/core-next typecheck:full
pnpm -F @pumped-fn/core-next test
pnpm -F @pumped-fn/examples typecheck
```

---

## Summary

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Files | 21 | 9 | -57% |
| Lines (est.) | ~5,900 | ~5,050 | -14% |
| Promised methods | 18 | 10 | -44% |
| Tag methods | 12 | 8 | -33% |
| exec() overloads | 5 | 1 | -80% |
| Error catalog entries | 25 | 0 | -100% |

**Key simplifications:**
1. Promised: Remove 8 settled-result methods + switch variants
2. Tag: Single naming convention, remove aliases
3. TagExecutor: Remove redundant `extractionMode`
4. FlowDefinition: Remove builder pattern
5. exec(): Single config-based overload
6. Errors: Inline codes, remove catalog/templates
7. Extensions: Add `mode` for OTel span support
8. Scope: Rename `onChange` → `onResolve`

---

## Execution Order

1. **Phase 1.4** - Error system (no dependencies)
2. **Phase 1.1** - Promised simplification
3. **Phase 1.2, 1.3** - Tag system cleanup
4. **Phase 1.5** - Remove FlowDefinition builder
5. **Phase 1.6** - Simplify exec()
6. **Phase 1.7** - Rename onChange
7. **Phase 1.8** - Extension operation update
8. **Phase 2** - File consolidation (all at once)
9. **Phase 3** - Cleanup and verification

---

## Migration Guide

### Breaking Changes

This release contains breaking changes. Follow this guide to update your code.

#### 1. Promised Methods Removed

**Removed methods:**
- `switch()` → Use `map()` instead (returns `Promised<U>` for both sync and async)
- `switchError()` → Use `catch()` instead
- `fulfilled()` → Use `partition().map(p => p.fulfilled)`
- `rejected()` → Use `partition().map(p => p.rejected)`
- `firstFulfilled()` → Use `partition().map(p => p.fulfilled[0])`
- `firstRejected()` → Use `partition().map(p => p.rejected[0])`
- `findFulfilled(predicate)` → Use `partition().map(p => p.fulfilled.find(predicate))`
- `mapFulfilled(fn)` → Use `partition().map(p => p.fulfilled.map(fn))`
- `assertAllFulfilled()` → Use `partition().map(p => { if (p.rejected.length) throw ...; return p.fulfilled })`

**Before:**
```typescript
const results = await ctx.parallelSettled([...]).fulfilled()
```

**After:**
```typescript
const { fulfilled } = await ctx.parallelSettled([...]).partition()
// or
const results = await ctx.parallelSettled([...])
const fulfilled = results.results.filter(r => r.status === "fulfilled").map(r => r.value)
```

#### 2. Tag API Changes

**Removed methods:**
- `injectTo()` → Use `writeToStore()` instead

**Before:**
```typescript
myTag.injectTo(store, value)
```

**After:**
```typescript
myTag.writeToStore(store, value)
```

#### 3. FlowDefinition Builder Removed

**Before:**
```typescript
const myFlow = flow({
  name: "myFlow",
  input: inputSchema,
  output: outputSchema
}).handler((ctx, input) => {
  return result
})

// Or with dependencies:
const myFlow = flow({
  name: "myFlow",
  input: inputSchema,
  output: outputSchema
}).handler([depExecutor], (deps, ctx, input) => {
  return result
})
```

**After:**
```typescript
const myFlow = flow(
  { name: "myFlow", input: inputSchema, output: outputSchema },
  (ctx, input) => {
    return result
  }
)

// Or with dependencies:
const myFlow = flow(
  { name: "myFlow", input: inputSchema, output: outputSchema },
  [depExecutor],
  (deps, ctx, input) => {
    return result
  }
)
```

#### 4. ExecutionContext.exec() Simplified

**Before (multiple overloads):**
```typescript
// Positional
ctx.exec(myFlow, input)
ctx.exec("key", myFlow, input)

// Config
ctx.exec({ flow: myFlow, input, key: "key" })
```

**After (config only):**
```typescript
// Always use config object
ctx.exec({ flow: myFlow, input })
ctx.exec({ flow: myFlow, input, key: "key" })

// For void input flows, omit input field entirely:
ctx.exec({ flow: voidInputFlow })

// For function execution:
ctx.exec({ fn: myFn, params: [arg1, arg2] })
```

#### 5. Scope.onChange() Renamed

**Before:**
```typescript
scope.onChange((event, executor, value, scope) => {
  // Called on "resolve" or "update"
})
```

**After:**
```typescript
scope.onResolve((event, executor, value, scope) => {
  // Called on "resolve" or "update"
})
```

#### 6. Extension Operation Types Changed

**Before:**
```typescript
extension.wrap(scope, next, operation) {
  if (operation.kind === "execution") {
    if (operation.target.type === "flow") {
      // flow execution
    } else if (operation.target.type === "fn") {
      // function execution
    } else if (operation.target.type === "parallel") {
      // parallel execution
    }
  }
}
```

**After:**
```typescript
extension.wrap(scope, next, operation) {
  if (operation.kind === "execution") {
    // Use operation.mode to determine execution type
    switch (operation.mode) {
      case "sequential":
        // flow or fn execution
        break
      case "parallel":
        // parallel execution
        break
      case "parallel-settled":
        // parallelSettled execution
        break
    }
    // operation.name contains flow name or "fn" or "parallel"
    // operation.flow and operation.definition available for flows
  }
}
```

#### 7. Error Class Changes

**Before:**
```typescript
import { codes } from "@pumped-fn/core-next"

try {
  // ...
} catch (e) {
  if (e.code === codes.CIRCULAR_DEPENDENCY) {
    // handle
  }
}
```

**After:**
```typescript
import { DependencyResolutionError } from "@pumped-fn/core-next"

try {
  // ...
} catch (e) {
  if (e instanceof DependencyResolutionError) {
    // e.code is still available as static: DependencyResolutionError.CODE
  }
}
```

**Error code constants moved to static class properties:**
```typescript
SchemaError.CODE              // "V001"
ExecutorResolutionError.CODE  // "E001"
FactoryExecutionError.CODE    // "F001"
DependencyResolutionError.CODE // "D001"
FlowError.CODE                // "FL001"
FlowValidationError.CODE      // "FV001"
ExecutionContextClosedError.CODE // "EC001"
```

### Non-Breaking Changes

These changes are internal and don't affect public API:

1. **File structure changed** - Import paths remain the same (all via `index.ts`)
2. **TagExecutor internal field removed** - `extractionMode` removed, behavior unchanged
3. **Internal utilities inlined** - No public API impact

### Deprecation Warnings

The following will show deprecation warnings in this version and be removed in the next major:

- None - all breaking changes are immediate in this version

### Codemod (Optional)

Run the following to auto-fix common migrations:

```bash
# Rename injectTo to writeToStore
find ./src -name "*.ts" -exec sed -i 's/\.injectTo(/\.writeToStore(/g' {} \;

# Rename onChange to onResolve
find ./src -name "*.ts" -exec sed -i 's/\.onChange(/\.onResolve(/g' {} \;
```

For complex migrations (FlowDefinition builder, exec overloads), manual review is recommended.
