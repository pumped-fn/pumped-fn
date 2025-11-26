# C3 Documentation Sync Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Update C3 architecture documentation to reflect the file consolidation changes (21 files → 11 files).

**Architecture:** Update source file references, API documentation, and file structure sections across 6 C3 component documents to match current codebase reality.

**Tech Stack:** Markdown documentation, no code changes required.

---

## Background

The codebase underwent significant consolidation:
- `tag-types.ts` + `tag-executors.ts` + `tags/merge.ts` → `tag.ts`
- `promises.ts` + `ssch.ts` → `primitives.ts`
- `flow-execution.ts` → merged into `flow.ts`
- `extension.ts` → merged into `helpers.ts`
- `internal/` directory → inlined into main modules

API changes:
- `Promised`: Removed `switch()`, `switchError()`, `fulfilled()`, `rejected()`, etc.
- `ExecutionOperation`: Changed from nested `target` to flat `mode`/`flow`/`definition`
- `ctx.exec()`: Changed from `exec(flow, input)` to `exec({ flow, input })`

---

### Task 1: Update c3-1-core/README.md Source Organization

**Files:**
- Modify: `.c3/c3-1-core/README.md`

**Step 1: Update the Public API table**

Find section around line 112-122 and update file references:

```markdown
| Function | Purpose | File |
|----------|---------|------|
| `provide(factory)` | Create executor without dependencies | executor.ts |
| `derive(deps, factory)` | Create executor with dependencies | executor.ts |
| `preset(executor, value)` | Override executor in scope | executor.ts |
| `createScope(options)` | Create execution scope | scope.ts |
| `resolves(...executors)` | Resolve multiple executors | helpers.ts |
| `flow(definition, handler)` | Create flow with execute helper | flow.ts |
| `flowMeta` | Access flow metadata tags | execution-context.ts |
| `tag(schema, options)` | Create metadata tag | tag.ts |
| `tags.required/optional/all` | Tag dependency helpers | tag.ts |
| `extension(ext)` | Type helper for extensions | helpers.ts |
| `custom(schema)` | Create custom schema validator | primitives.ts |
| `validate(schema, data)` | Validate data against schema | primitives.ts |
| `Promised` | Enhanced Promise with context | primitives.ts |
```

**Step 2: Update the Source Organization section**

Find section around line 175-195 and replace with:

```markdown
## Source Organization {#c3-1-source}

```
packages/next/src/
├── index.ts              # Public API exports
├── types.ts              # Core type definitions
├── scope.ts              # Scope implementation
├── executor.ts           # Executor factory functions
├── flow.ts               # Flow definition + FlowExecutionImpl
├── execution-context.ts  # ExecutionContext lifecycle
├── tag.ts                # Tag system (types, executors, merge)
├── primitives.ts         # Promised class + schema validation
├── helpers.ts            # resolves() + extension()
├── multi.ts              # Multi-executor pools
└── errors.ts             # Error classes
```
```

**Step 3: Verify changes**

Run: `cat .c3/c3-1-core/README.md | grep -A 20 "Source Organization"`
Expected: Shows updated 11-file structure

**Step 4: Commit**

```bash
git add .c3/c3-1-core/README.md
git commit -m "docs(c3): update README source organization for file consolidation"
```

---

### Task 2: Update c3-103-tag.md Source Files

**Files:**
- Modify: `.c3/c3-1-core/c3-103-tag.md`

**Step 1: Find and update Source Files section**

Find section `## Source Files {#c3-103-source}` and replace with:

```markdown
## Source Files {#c3-103-source}

| File | Contents |
|------|----------|
| `tag.ts` | Tag creation, type guards, tag executors (required/optional/all), merge utilities |
| `types.ts` | Tag namespace types (Store, Tagged, Container, Source) |
```

**Step 2: Verify changes**

Run: `grep -A 5 "Source Files" .c3/c3-1-core/c3-103-tag.md`
Expected: Shows single `tag.ts` file

**Step 3: Commit**

```bash
git add .c3/c3-1-core/c3-103-tag.md
git commit -m "docs(c3): update c3-103-tag source files for consolidation"
```

---

### Task 3: Update c3-104-extension.md ExecutionOperation Types

**Files:**
- Modify: `.c3/c3-1-core/c3-104-extension.md`

**Step 1: Find ExecutionOperation section (around line 53-82) and replace**

Old content shows nested `target` structure. Replace with:

```markdown
**ExecutionOperation:**
```typescript
{
  kind: "execution",
  name: string,
  mode: "sequential" | "parallel" | "parallel-settled",
  input?: unknown,
  key?: string,
  context: Tag.Store,
  flow?: Flow.UFlow,           // Present for flow executions
  definition?: Flow.Definition, // Present for flow executions
  params?: readonly unknown[], // Present for fn executions
  count?: number               // Present for parallel executions
}
```

**Mode field:**
- `"sequential"` - Single flow or function execution
- `"parallel"` - ctx.parallel() operations
- `"parallel-settled"` - ctx.parallelSettled() operations

Use `mode` to determine execution type:
- Sequential with `flow`/`definition` = flow execution
- Sequential with `params` = fn execution
- Parallel modes = check `count` for item count
```

**Step 2: Remove Target types table (around line 76-82)**

Delete the "Target types" table that references FlowTarget, FnTarget, ParallelTarget.

**Step 3: Update Source Files section**

Find `## Source Files {#c3-104-source}` and update:

```markdown
## Source Files {#c3-104-source}

| File | Contents |
|------|----------|
| `helpers.ts` | extension() type helper |
| `types.ts` | Extension namespace (Operation, ResolveOperation, ExecutionOperation, ContextLifecycleOperation) |
| `scope.ts` | Extension pipeline execution |
| `execution-context.ts` | applyExtensions() utility |
```

**Step 4: Verify changes**

Run: `grep -A 10 "ExecutionOperation" .c3/c3-1-core/c3-104-extension.md | head -15`
Expected: Shows flat structure with `mode` field

**Step 5: Commit**

```bash
git add .c3/c3-1-core/c3-104-extension.md
git commit -m "docs(c3): update c3-104-extension for flat ExecutionOperation structure"
```

---

### Task 4: Update c3-102-flow.md ctx.exec() API

**Files:**
- Modify: `.c3/c3-1-core/c3-102-flow.md`

**Step 1: Find Nested Execution section (around line 99-111) and update**

Replace the overload table with:

```markdown
### Nested Execution

Context provides `exec()` for nested operations with a single config object:

```typescript
// Flow execution
ctx.exec({ flow: myFlow, input: data })
ctx.exec({ flow: myFlow, input: data, key: "cache-key" })
ctx.exec({ flow: myFlow, input: data, timeout: 5000, tags: [...] })

// Function execution
ctx.exec({ fn: myFn, params: [arg1, arg2] })
ctx.exec({ fn: myFn, params: [arg1], key: "cache-key" })
```

**Config options:**

| Field | Purpose |
|-------|---------|
| `flow` | Flow to execute (mutually exclusive with `fn`) |
| `fn` | Function to execute (mutually exclusive with `flow`) |
| `input` | Input for flow execution |
| `params` | Parameters for function execution |
| `key` | Journal key for replay/caching |
| `timeout` | Execution timeout in milliseconds |
| `tags` | Additional tags for execution context |
```

**Step 2: Update Execution Flow diagram (around line 76-97)**

Update the diagram to show new API:

```markdown
### Execution Flow

```
scope.exec({ flow, input })
    │
    ├── Create ExecutionContext
    │
    ├── Resolve flow executor (get handler)
    │
    ├── Validate input against schema
    │
    ├── Call handler(context, validatedInput)
    │   │
    │   └── Handler can:
    │       ├── ctx.exec({ flow: otherFlow, input }) - nested flows
    │       ├── ctx.exec({ fn, params }) - arbitrary functions
    │       ├── ctx.parallel([...]) - concurrent execution
    │       ├── ctx.get(tag) - read tag values
    │       └── ctx.set(tag, value) - write tag values
    │
    ├── Validate output against schema
    │
    └── Return Promised<S> with execution snapshot
```
```

**Step 3: Update Source Files section**

Find `## Source Files {#c3-102-source}` and update:

```markdown
## Source Files {#c3-102-source}

| File | Contents |
|------|----------|
| `flow.ts` | flow() factory, FlowExecutionImpl, flow.execute() |
| `execution-context.ts` | ExecutionContextImpl, flowMeta, journaling utilities |
| `types.ts` | Flow namespace (Definition, Handler, Context, Execution) |
```

**Step 4: Verify changes**

Run: `grep -A 5 "ctx.exec" .c3/c3-1-core/c3-102-flow.md | head -10`
Expected: Shows new config object syntax

**Step 5: Commit**

```bash
git add .c3/c3-1-core/c3-102-flow.md
git commit -m "docs(c3): update c3-102-flow for single-config exec() API"
```

---

### Task 5: Update c3-106-schema.md Source Files

**Files:**
- Modify: `.c3/c3-1-core/c3-106-schema.md`

**Step 1: Find Source Files section and update**

Find `## Source Files {#c3-106-source}` and replace:

```markdown
## Source Files {#c3-106-source}

| File | Contents |
|------|----------|
| `primitives.ts` | validate(), custom() functions, Promised class |
| `types.ts` | StandardSchemaV1 interface and namespace |
```

**Step 2: Verify changes**

Run: `grep -A 5 "Source Files" .c3/c3-1-core/c3-106-schema.md`
Expected: Shows `primitives.ts` instead of `ssch.ts`

**Step 3: Commit**

```bash
git add .c3/c3-1-core/c3-106-schema.md
git commit -m "docs(c3): update c3-106-schema source files for primitives.ts"
```

---

### Task 6: Update c3-108-promised.md Removed Methods

**Files:**
- Modify: `.c3/c3-1-core/c3-108-promised.md`

**Step 1: Update Overview section (lines 14-19)**

Replace with:

```markdown
Promised is an enhanced Promise that:

- **Carries execution context** - Access to ExecutionData after completion
- **Provides transformation methods** - `map()`, `mapError()`
- **Includes static helpers** - `all()`, `race()`, `allSettled()`, `try()`
- **Supports settled result partitioning** - `partition()`

Promised implements `PromiseLike<T>` so it works anywhere a Promise is expected.
```

**Step 2: Update Instance Methods Transformation table (lines 27-32)**

Replace with:

```markdown
### Transformation

| Method | Signature | Description |
|--------|-----------|-------------|
| `map(fn)` | `(T => U) => Promised<U>` | Transform success value |
| `mapError(fn)` | `(err => err) => Promised<T>` | Transform error (rethrow) |

**Example:**
```typescript
const result = flow.execute(myFlow, input)
  .map(user => user.name)
  .mapError(err => new AppError('User fetch failed', { cause: err }))
```
```

**Step 3: Update Settled Result Operations section (lines 84-108)**

Replace with:

```markdown
### Settled Result Operations

For `Promised<PromiseSettledResult[]>` or parallel results:

| Method | Returns | Description |
|--------|---------|-------------|
| `partition()` | `Promised<{ fulfilled, rejected }>` | Split into fulfilled values and rejection reasons |

**Example:**
```typescript
const results = await Promised.allSettled([
  fetchUser(1),
  fetchUser(2),
  fetchUser(3)
]).partition()

console.log(`${results.fulfilled.length} succeeded, ${results.rejected.length} failed`)
```

**Note:** Previous methods like `fulfilled()`, `rejected()`, `firstFulfilled()`, `findFulfilled()`, `mapFulfilled()`, and `assertAllFulfilled()` were removed in favor of the simpler `partition()` approach.
```

**Step 4: Update Source Files section**

Find `## Source Files {#c3-108-source}` and replace:

```markdown
## Source Files {#c3-108-source}

| File | Contents |
|------|----------|
| `primitives.ts` | Promised class implementation |
| `types.ts` | MaybePromised type |
```

**Step 5: Verify changes**

Run: `grep -E "switch|switchError|fulfilled\(\)|rejected\(\)" .c3/c3-1-core/c3-108-promised.md`
Expected: No matches (removed methods no longer documented)

**Step 6: Commit**

```bash
git add .c3/c3-1-core/c3-108-promised.md
git commit -m "docs(c3): update c3-108-promised for simplified API"
```

---

### Task 7: Regenerate TOC and Final Verification

**Files:**
- Verify: `.c3/TOC.md`

**Step 1: Check if TOC needs updates**

The TOC is auto-generated. Check the generation script exists:

Run: `ls -la .c3/scripts/`
Expected: Should show build-toc.sh or similar

**Step 2: If script exists, regenerate TOC**

Run: `.c3/scripts/build-toc.sh` (if exists)
Or manually verify TOC matches current structure.

**Step 3: Run final verification**

Run: `grep -r "tag-types\|tag-executors\|ssch\.ts\|promises\.ts\|extension\.ts\|flow-execution\.ts" .c3/`
Expected: No matches (all old file references removed)

**Step 4: Commit settings.yaml and any TOC changes**

```bash
git add .c3/settings.yaml .c3/TOC.md
git commit -m "docs(c3): add settings.yaml and finalize documentation sync"
```

---

## Summary

| Task | Component | Changes |
|------|-----------|---------|
| 1 | README.md | Update Public API table, Source Organization |
| 2 | c3-103-tag.md | Update source files (single tag.ts) |
| 3 | c3-104-extension.md | Update ExecutionOperation to flat structure |
| 4 | c3-102-flow.md | Update ctx.exec() to config object API |
| 5 | c3-106-schema.md | Update source files (primitives.ts) |
| 6 | c3-108-promised.md | Remove deprecated methods, update source |
| 7 | TOC + Verify | Regenerate TOC, final verification |

**Total estimated commits:** 7
