# Execution Context Parity Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `ExecutionContext` the single runtime context primitive whose API exactly matches `Flow.C`, allowing both flow and standalone executions to share the same surface.

**Architecture:** Collapse `Flow.Context` into a type alias of `ExecutionContext.Context`, move the current `FlowContext` implementation into `execution-context.ts`, and have `flow.execute` delegate to `scope.createExecution().exec(...)`. Shared helpers for execution descriptors, journaling, and extension application stay as utilities imported by both Flow and ExecutionContext. Documentation and skills emphasize ExecutionContext-first usage.

**Tech Stack:** TypeScript, pnpm, Vitest, ast-grep.

### Task 1: Add ExecutionContext behavior regression tests

**Files:**
- Create: `packages/next/tests/execution-context.behavior.test.ts`
- Modify: `packages/next/tests/harness.ts` (helper imports as needed)

**Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest"
import { createScope } from "../../src/scope"
import { flow } from "../../src/flow"
import { custom } from "../../src/ssch"

describe("ExecutionContext.exec parity", () => {
  it("runs flows and FNs with journaling + parallel helpers", async () => {
    const scope = createScope()
    const ctx = scope.createExecution({ name: "root" })
    const testFlow = flow({ name: "inner", input: custom<number>(), output: custom<number>() }).handler((ctx, value) => ctx.exec({ fn: async () => value * 2 }))
    const first = await ctx.exec({ key: "twice", flow: testFlow, input: 2 })
    const second = await ctx.exec({ key: "twice", flow: testFlow, input: 2 })
    expect(first).toBe(4)
    expect(second).toBe(4)
    const stats = await ctx.parallel([
      ctx.exec({ fn: async () => 1 }),
      ctx.exec({ fn: async () => 2 })
    ])
    expect(stats.stats).toEqual({ total: 2, succeeded: 2, failed: 0 })
  })
})
```

**Step 2: Run the targeted test file and observe failures**

Run: `pnpm -F @pumped-fn/core-next test -- execution-context.behavior.test.ts`  
Expected: FAIL because `ExecutionContext.Context` currently lacks Flow APIs.

**Step 3: Keep the failing test committed**

```bash
git add packages/next/tests/execution-context.behavior.test.ts
git commit -m "test(core-next): cover ExecutionContext parity"
```

### Task 2: Align TypeScript interfaces

**Files:**
- Modify: `packages/next/src/types.ts`

**Step 1: Update type definitions**

Use `ast-grep -U --pattern 'Flow\\.Context' packages/next/src/types.ts` to navigate the existing interface.

Replace the `Flow.C` interface with a re-export:

```ts
export type Context = ExecutionContext.Context
export namespace ExecutionContext {
  export interface Context {
    readonly scope: Core.Scope
    readonly parent: Context | undefined
    readonly id: string
    readonly signal: AbortSignal
    readonly details: Details
    readonly tags: Tag.Tagged[] | undefined
    exec<F extends Flow.UFlow>(flow: F, input: Flow.InferInput<F>): Promised<Flow.InferOutput<F>>
    exec<F extends Flow.UFlow>(config: { flow: F; input: Flow.InferInput<F>; key?: string; timeout?: number; retry?: number; tags?: Tag.Tagged[] }): Promised<Flow.InferOutput<F>>
    exec<T>(config: { fn: () => T | Promise<T>; key?: string; timeout?: number; retry?: number; tags?: Tag.Tagged[] }): Promised<T>
    exec<Fn extends (...args: any[]) => any>(config: { fn: Fn; params: Parameters<Fn>; key?: string; timeout?: number; retry?: number; tags?: Tag.Tagged[] }): Promised<ReturnType<Fn>>
    parallel<T extends readonly Promised<any>[]>(promises: [...T]): Promised<Flow.ParallelResult<{ [K in keyof T]: T[K] extends Promised<infer R> ? R : never }>>
    parallelSettled<T extends readonly Promised<any>[]>(promises: [...T]): Promised<Flow.ParallelSettledResult<{ [K in keyof T]: T[K] extends Promised<infer R> ? R : never }>>
    resetJournal(pattern?: string): void
    initializeExecutionContext(flowName: string, isParallel?: boolean): void
    createSnapshot(): Flow.ExecutionData
    throwIfAborted(): void
  }
}
```

**Step 2: Make Flow namespace reference the ExecutionContext type**

```ts
export type Context = ExecutionContext.Context
export type C = ExecutionContext.Context
```

**Step 3: Run typecheck to capture errors**

Run: `pnpm -F @pumped-fn/core-next typecheck`  
Expected: FAIL until implementation changes.

### Task 3: Move FlowContext implementation into ExecutionContextImpl

**Files:**
- Modify: `packages/next/src/execution-context.ts`
- Modify: `packages/next/src/flow.ts`
- Modify: `packages/next/src/scope.ts`
- Modify: `packages/next/src/internal/*` helpers if they become shared

**Step 1: Port FlowContext logic**

Open `packages/next/src/flow.ts` and use `ast-grep -U --pattern 'class FlowContext' packages/next/src/flow.ts` to copy methods into `ExecutionContextImpl`.

Implementation requirements:

```ts
export class ExecutionContextImpl implements ExecutionContext.Context {
  constructor(config) { /* existing scope + parent wiring */ }
  resetJournal(pattern?: string): void { /* move from FlowContext */ }
  exec(...) { /* reuse parseExecOverloads + createExecutionDescriptor helpers moved to new module */ }
  parallel(...) { /* reuse runParallelExecutor */ }
  createSnapshot(): Flow.ExecutionData { /* reuse FlowContext snapshot logic */ }
}
```

Ensure all Flow-only helpers (journal, tag hydration, initializeExecutionContext) remain methods on ExecutionContextImpl. Move shared functions like `createExecutionDescriptor`, `executeWithTimeout`, `executeAndWrap`, and `applyExtensions` to a new util file `packages/next/src/internal/execution-helpers.ts` so both Flow and ExecutionContext can import them without cycles.

**Step 2: Remove FlowContext class from `flow.ts`**

After moving methods, delete the class and replace usages with `ExecutionContextImpl`.

```ts
const context = new ExecutionContextImpl({
  scope: normalized.scope,
  extensions: normalized.scope["~extensions"],
  tags: executionTags,
})
```

Flow-specific metadata setup stays in Flow module by calling `context.initializeExecutionContext`.

**Step 3: Update Scope to pass extensions when creating ExecutionContexts**

Extend `ExecutionContextImpl` constructor config to accept extensions + tags. Update `createExecution` in `scope.ts` to pass `this.extensions` and `this.tags`.

**Step 4: Run focused tests**

Run: `pnpm -F @pumped-fn/core-next test -- execution-context.behavior.test.ts`  
Expected: PASS once implementation matches Flow parity.

### Task 4: Update Flow + docs to treat ExecutionContext as primary

**Files:**
- Modify: `packages/next/src/flow.ts`
- Modify: `packages/next/tests/flow/*.test.ts` (update imports where FlowContext referenced)
- Modify: `README.md`, `docs/index.md`
- Modify: `.claude/skills/pumped-design/references/*.md`

**Step 1: Simplify `flow.execute` and Flow namespace**

Ensure `flow.execute` simply calls `context.exec({ flow, input, ... })` on ExecutionContext instances built via Scope. Remove redundant wrappers.

**Step 2: Refresh docs**

Use `ast-grep -U --pattern 'Flow\\.Context' docs -g\"*.md\"` to find old phrasing. Update tables to state `ExecutionContext.Context (a.k.a Flow.Context)` and describe new API.

**Step 3: Update pumped-design skill references**

Edit `.claude/skills/pumped-design/references/execution-context.md` (and other affected files) so architecture diagrams and instructions reference ExecutionContext as the standalone primitive.

**Step 4: Add changelog entry**

Append to `packages/next/CHANGELOG.md` under Unreleased:

```md
- bd?????: BREAKING: ExecutionContext now exposes the Flow.Context API. Flow.Context is a type alias of ExecutionContext.Context.
```

### Task 5: Verification + cleanup

**Step 1: Run typechecks**

```bash
pnpm -F @pumped-fn/core-next typecheck
pnpm -F @pumped-fn/core-next typecheck:full
```

**Step 2: Run targeted and full tests**

```bash
pnpm -F @pumped-fn/core-next test -- execution-context.behavior.test.ts
pnpm -F @pumped-fn/core-next test
```

**Step 3: Verify examples**

```bash
pnpm -F @pumped-fn/examples typecheck
```

**Step 4: Final review**

Use `git status` to confirm only relevant files changed, then `git diff` for a final skim before handing off for code review.
