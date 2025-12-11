# Raw Input Execution Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `rawInput` option to `ctx.exec()` allowing unknown input when flow has parse.

**Architecture:** Extend `ExecFlowOptions` type with mutually exclusive `input | rawInput` union. Runtime extracts input from whichever property is present - both go through the same parse path.

**Tech Stack:** TypeScript, Vitest

**Reference:** [ADR-020](.c3/adr/adr-020-raw-input-execution.md)

---

## Task 1: Update ExecFlowOptions Type

**Files:**
- Modify: `packages/lite/src/types.ts:120-127`

**Step 1: Write failing type test**

Create file `packages/lite/tests/raw-input-types.test.ts`:

```typescript
import { describe, it, expectTypeOf } from "vitest";
import type { Lite } from "../src/types";
import { flow } from "../src/flow";
import { createScope } from "../src/scope";

describe("rawInput type safety", () => {
  it("accepts rawInput with unknown type", async () => {
    const myFlow = flow({
      parse: (raw: unknown): { name: string } => {
        const obj = raw as Record<string, unknown>;
        if (typeof obj.name !== "string") throw new Error("name required");
        return { name: obj.name };
      },
      factory: (ctx) => ctx.input.name,
    });

    const scope = createScope();
    const ctx = scope.createContext();

    // This should compile - rawInput accepts unknown
    const body: unknown = { name: "test" };
    await ctx.exec({ flow: myFlow, rawInput: body });
  });

  it("rejects both input and rawInput", async () => {
    const myFlow = flow({
      parse: (raw: unknown): string => String(raw),
      factory: (ctx) => ctx.input,
    });

    const scope = createScope();
    const ctx = scope.createContext();

    // @ts-expect-error - cannot have both input and rawInput
    await ctx.exec({ flow: myFlow, input: "test", rawInput: "test" });
  });
});
```

**Step 2: Run type test to verify it fails**

Run: `cd packages/lite && pnpm typecheck:full`

Expected: Error on `rawInput` - property doesn't exist on type

**Step 3: Update ExecFlowOptions type**

In `packages/lite/src/types.ts`, replace lines 120-127:

```typescript
  export type ExecFlowOptions<Output, Input> = {
    flow: Flow<Output, Input>
    name?: string
    tags?: Tagged<unknown>[]
  } & (
    | ([NoInfer<Input>] extends [void | undefined | null]
        ? { input?: undefined | null; rawInput?: never }
        : { input: NoInfer<Input>; rawInput?: never })
    | { rawInput: unknown; input?: never }
  )
```

**Step 4: Run type test to verify it passes**

Run: `cd packages/lite && pnpm typecheck:full`

Expected: PASS - no type errors

**Step 5: Commit**

```bash
git add packages/lite/src/types.ts packages/lite/tests/raw-input-types.test.ts
git commit -m "feat(lite): add rawInput to ExecFlowOptions type"
```

---

## Task 2: Update exec() Runtime Implementation

**Files:**
- Modify: `packages/lite/src/scope.ts:717-742`

**Step 1: Write failing runtime test**

Add to `packages/lite/tests/scope.test.ts` in the "Flow execution" describe block (around line 1140):

```typescript
    it("accepts rawInput and passes to parse", async () => {
      const scope = createScope();
      const ctx = scope.createContext();
      const parseOrder: string[] = [];

      const myFlow = flow({
        name: "parseFlow",
        parse: (raw: unknown): { name: string } => {
          parseOrder.push("parse");
          const obj = raw as Record<string, unknown>;
          if (typeof obj.name !== "string") throw new Error("name required");
          return { name: obj.name };
        },
        factory: (ctx) => {
          parseOrder.push("factory");
          return ctx.input.name.toUpperCase();
        },
      });

      const body: unknown = { name: "alice" };
      const result = await ctx.exec({
        flow: myFlow as unknown as Lite.Flow<string, unknown>,
        rawInput: body,
      });

      expect(result).toBe("ALICE");
      expect(parseOrder).toEqual(["parse", "factory"]);
      await ctx.close();
    });
```

**Step 2: Run test to verify it fails**

Run: `cd packages/lite && pnpm test -- --run -t "accepts rawInput"`

Expected: FAIL - `rawInput` property not recognized at runtime

**Step 3: Update exec() to handle rawInput**

In `packages/lite/src/scope.ts`, update the exec method (around line 717). Replace the flow branch:

```typescript
  async exec(options: {
    flow: Lite.Flow<unknown, unknown>
    input?: unknown
    rawInput?: unknown
    name?: string
    tags?: Lite.Tagged<unknown>[]
  } | Lite.ExecFnOptions<unknown>): Promise<unknown> {
    if (this.closed) {
      throw new Error("ExecutionContext is closed")
    }

    if ("flow" in options) {
      const { flow, input, rawInput, name: execName } = options
      // Use rawInput if provided, otherwise input
      const rawValue = rawInput !== undefined ? rawInput : input
      let parsedInput: unknown = rawValue
      if (flow.parse) {
        const label = execName ?? flow.name ?? "anonymous"
        try {
          parsedInput = await flow.parse(rawValue)
        } catch (err) {
          throw new ParseError(
            `Failed to parse flow input "${label}"`,
            "flow-input",
            label,
            err
          )
        }
      }

      const childCtx = new ExecutionContextImpl(this.scope, {
        parent: this,
        tags: this.baseTags,
        input: parsedInput
      })

      try {
        return await childCtx.execFlowInternal(options)
      } finally {
        await childCtx.close()
      }
    } else {
      // ... fn branch unchanged
```

**Step 4: Run test to verify it passes**

Run: `cd packages/lite && pnpm test -- --run -t "accepts rawInput"`

Expected: PASS

**Step 5: Commit**

```bash
git add packages/lite/src/scope.ts packages/lite/tests/scope.test.ts
git commit -m "feat(lite): handle rawInput in exec() runtime"
```

---

## Task 3: Add Edge Case Tests

**Files:**
- Modify: `packages/lite/tests/scope.test.ts`

**Step 1: Write test for rawInput without parse**

Add to scope.test.ts:

```typescript
    it("rawInput works without parse (passes through as-is)", async () => {
      const scope = createScope();
      const ctx = scope.createContext();

      const myFlow = flow({
        factory: (ctx) => ctx.input,
      });

      const body: unknown = { data: 123 };
      const result = await ctx.exec({
        flow: myFlow as unknown as Lite.Flow<unknown, unknown>,
        rawInput: body,
      });

      expect(result).toEqual({ data: 123 });
      await ctx.close();
    });
```

**Step 2: Run test**

Run: `cd packages/lite && pnpm test -- --run -t "rawInput works without parse"`

Expected: PASS

**Step 3: Write test for rawInput with parse failure**

Add to scope.test.ts:

```typescript
    it("throws ParseError when rawInput fails parse", async () => {
      const scope = createScope();
      const ctx = scope.createContext();
      const { ParseError } = await import("../src/errors");

      const myFlow = flow({
        name: "strictFlow",
        parse: (raw: unknown): string => {
          if (typeof raw !== "string") throw new Error("Must be string");
          return raw;
        },
        factory: (ctx) => ctx.input,
      });

      try {
        await ctx.exec({
          flow: myFlow as unknown as Lite.Flow<string, unknown>,
          rawInput: 123,
        });
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(ParseError);
        const parseErr = err as InstanceType<typeof ParseError>;
        expect(parseErr.phase).toBe("flow-input");
        expect(parseErr.label).toBe("strictFlow");
      }

      await ctx.close();
    });
```

**Step 4: Run test**

Run: `cd packages/lite && pnpm test -- --run -t "throws ParseError when rawInput"`

Expected: PASS

**Step 5: Commit**

```bash
git add packages/lite/tests/scope.test.ts
git commit -m "test(lite): add rawInput edge case tests"
```

---

## Task 4: Run Full Test Suite

**Files:**
- None (verification only)

**Step 1: Run all tests**

Run: `cd packages/lite && pnpm test`

Expected: All tests pass (existing + new)

**Step 2: Run typecheck**

Run: `cd packages/lite && pnpm typecheck`

Expected: No errors

**Step 3: Commit if any fixes needed**

If fixes were needed, commit them.

---

## Task 5: Update Documentation

**Files:**
- Modify: `.c3/c3-2-lite/c3-203-flow.md`

**Step 1: Update Executing Flows section**

In `.c3/c3-2-lite/c3-203-flow.md`, find the "Executing Flows" section and add after "Basic Execution":

```markdown
### Raw Input Execution

When the caller has unknown/untyped data and the flow has a `parse` function:

```typescript
const createUser = flow({
  parse: (raw) => userSchema.parse(raw),
  factory: (ctx) => db.create(ctx.input)
})

// Typed execution - caller provides correct type
await ctx.exec({ flow: createUser, input: { name: 'Alice', email: 'a@b.com' } })

// Raw execution - flow's parse validates unknown data
const body: unknown = JSON.parse(request.body)
await ctx.exec({ flow: createUser, rawInput: body })
```

`input` and `rawInput` are mutually exclusive - TypeScript prevents using both.
```

**Step 2: Update Type Safety section**

Find the "Type Safety" section and add:

```markdown
### ExecFlowOptions

```typescript
type ExecFlowOptions<Output, Input> = {
  flow: Flow<Output, Input>
  name?: string
  tags?: Tagged<unknown>[]
} & (
  | { input: Input; rawInput?: never }   // Typed execution
  | { rawInput: unknown; input?: never } // Raw execution
)
```
```

**Step 3: Commit**

```bash
git add .c3/c3-2-lite/c3-203-flow.md
git commit -m "docs(c3): add rawInput execution documentation"
```

---

## Task 6: Update ADR Status and Audit

**Files:**
- Modify: `.c3/adr/adr-020-raw-input-execution.md`

**Step 1: Update ADR status to Accepted**

Change status from `proposed` to `accepted` and update verification checkboxes.

**Step 2: Run c3-audit**

Run: `/c3-skill:c3-audit`

**Step 3: Commit**

```bash
git add .c3/
git commit -m "docs(adr): accept ADR-020 raw input execution"
```

---

## Summary

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| 1 | Update ExecFlowOptions type | Low |
| 2 | Update exec() runtime | Low |
| 3 | Add edge case tests | Low |
| 4 | Run full test suite | Verification |
| 5 | Update C3 documentation | Low |
| 6 | Update ADR and audit | Low |

**Total: ~6 small tasks, all parallelizable except Task 4 (depends on 1-3)**
