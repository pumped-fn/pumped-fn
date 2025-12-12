# ExecFnOptions Name Option Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `name?: string` to `ExecFnOptions` for API consistency with `ExecFlowOptions`.

**Architecture:** Add optional `name` property to `ExecFnOptions` interface, then wire it through to the child `ExecutionContext` as `execName` (existing field). This follows the same pattern already used for flow execution.

**Tech Stack:** TypeScript, Vitest

**ADR:** `.c3/adr/adr-024-exec-fn-name-option.md`

---

## Task 1: Add Failing Test for Explicit Name

**Files:**
- Modify: `packages/lite/tests/hierarchical-context.test.ts`

**Step 1: Write the failing test**

Add to the `describe("ctx.name resolution")` block (around line 511):

```typescript
it("returns exec name for function execution when provided", async () => {
  const scope = createScope()
  const ctx = scope.createContext()
  let capturedName: string | undefined

  await ctx.exec({
    fn: (innerCtx) => {
      capturedName = innerCtx.name
      return 42
    },
    params: [],
    name: "explicitFnName"
  })

  expect(capturedName).toBe("explicitFnName")
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @pumped-fn/lite test -- --run hierarchical-context.test.ts -t "returns exec name for function execution"`

Expected: FAIL - TypeScript error "name does not exist on type ExecFnOptions"

---

## Task 2: Add name to ExecFnOptions Type

**Files:**
- Modify: `packages/lite/src/types.ts:144-148`

**Step 1: Update the interface**

Change from:
```typescript
export interface ExecFnOptions<Output, Args extends unknown[] = unknown[]> {
  fn: (ctx: ExecutionContext, ...args: Args) => MaybePromise<Output>
  params: Args
  tags?: Tagged<unknown>[]
}
```

To:
```typescript
export interface ExecFnOptions<Output, Args extends unknown[] = unknown[]> {
  fn: (ctx: ExecutionContext, ...args: Args) => MaybePromise<Output>
  params: Args
  name?: string
  tags?: Tagged<unknown>[]
}
```

**Step 2: Run typecheck**

Run: `pnpm -F @pumped-fn/lite typecheck`

Expected: PASS (type added, but not wired through yet)

---

## Task 3: Wire execName for Function Execution

**Files:**
- Modify: `packages/lite/src/scope.ts:800-806`

**Step 1: Update function execution branch**

Change from:
```typescript
} else {
  const childCtx = new ExecutionContextImpl(this.scope, {
    parent: this,
    tags: this.baseTags,
    flowName: options.fn.name || undefined,
    input: options.params
  })
```

To:
```typescript
} else {
  const childCtx = new ExecutionContextImpl(this.scope, {
    parent: this,
    tags: this.baseTags,
    execName: options.name,
    flowName: options.fn.name || undefined,
    input: options.params
  })
```

**Step 2: Run the test from Task 1**

Run: `pnpm -F @pumped-fn/lite test -- --run hierarchical-context.test.ts -t "returns exec name for function execution"`

Expected: PASS

---

## Task 4: Add Test for Name Priority (exec > fn.name)

**Files:**
- Modify: `packages/lite/tests/hierarchical-context.test.ts`

**Step 1: Write test for priority**

Add after the previous test:

```typescript
it("exec name takes priority over fn.name for function execution", async () => {
  const scope = createScope()
  const ctx = scope.createContext()
  let capturedName: string | undefined

  async function namedFunction(innerCtx: Lite.ExecutionContext) {
    capturedName = innerCtx.name
    return 42
  }

  await ctx.exec({
    fn: namedFunction,
    params: [],
    name: "overrideName"
  })

  expect(capturedName).toBe("overrideName")
})
```

**Step 2: Run test**

Run: `pnpm -F @pumped-fn/lite test -- --run hierarchical-context.test.ts -t "exec name takes priority"`

Expected: PASS (implementation already handles priority correctly)

---

## Task 5: Add Test for Fallback to fn.name

**Files:**
- Modify: `packages/lite/tests/hierarchical-context.test.ts`

**Step 1: Write test for fallback**

Add after the previous test:

```typescript
it("falls back to fn.name when exec name not provided", async () => {
  const scope = createScope()
  const ctx = scope.createContext()
  let capturedName: string | undefined

  async function namedFunction(innerCtx: Lite.ExecutionContext) {
    capturedName = innerCtx.name
    return 42
  }

  await ctx.exec({
    fn: namedFunction,
    params: []
  })

  expect(capturedName).toBe("namedFunction")
})
```

**Step 2: Run test**

Run: `pnpm -F @pumped-fn/lite test -- --run hierarchical-context.test.ts -t "falls back to fn.name"`

Expected: PASS

---

## Task 6: Run Full Test Suite

**Step 1: Run all lite tests**

Run: `pnpm -F @pumped-fn/lite test -- --run`

Expected: All tests PASS

**Step 2: Run typecheck**

Run: `pnpm -F @pumped-fn/lite typecheck`

Expected: PASS

---

## Task 7: Update C3 Documentation

**Files:**
- Modify: `.c3/c3-2-lite/c3-203-flow.md`

**Step 1: Update ExecFnOptions in Types section**

Find the `ExecFnOptions` section (around line 643) and update to include `name`:

```typescript
interface ExecFnOptions<Output, Args extends unknown[]> {
  fn: (ctx: ExecutionContext, ...args: Args) => MaybePromise<Output>
  params: Args
  name?: string
  tags?: Tagged<unknown>[]
}
```

**Step 2: Update "Executing Functions" example**

Find the "Executing Functions" section (around line 325) and add a named example:

```typescript
// With explicit name for tracing/debugging
const result = await ctx.exec({
  fn: async (ctx, a: number, b: number) => a + b,
  params: [1, 2],
  name: "addNumbers"
})
```

---

## Task 8: Update ADR Status

**Files:**
- Modify: `.c3/adr/adr-024-exec-fn-name-option.md`

**Step 1: Change status to accepted**

Update the frontmatter and status section:

```markdown
status: accepted
```

And:

```markdown
## Status {#adr-024-status}
**Accepted** - 2025-12-12
```

**Step 2: Check verification items**

Mark all verification items as complete in the ADR.

---

## Task 9: Run C3 Audit

**Step 1: Run audit**

Run: `/c3-skill:c3-audit`

Expected: No issues related to c3-203 or ExecFnOptions

---

## Task 10: Commit Changes

**Step 1: Stage and commit**

```bash
git add packages/lite/src/types.ts packages/lite/src/scope.ts packages/lite/tests/hierarchical-context.test.ts .c3/
git commit -m "feat(lite): add name option to ExecFnOptions for API consistency

- Add name?: string to ExecFnOptions interface
- Wire execName through for function execution
- Add tests for name resolution priority
- Update c3-203 documentation

Implements ADR-024

Generated with Claude Code

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Verification Checklist

After all tasks complete:

- [ ] `ExecFnOptions` accepts `name?: string`
- [ ] `ctx.name` returns explicit name when provided
- [ ] `ctx.name` falls back to `fn.name` when explicit name not provided
- [ ] `ctx.name` returns `undefined` when neither available
- [ ] All tests pass
- [ ] TypeScript compiles
- [ ] C3 docs updated
- [ ] ADR marked accepted
