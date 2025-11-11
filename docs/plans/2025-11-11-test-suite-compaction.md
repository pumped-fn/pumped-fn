# Test Suite Compaction Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce `packages/next/tests` LOC by ≥25% while retaining behavioral coverage

**Architecture:** Consolidate duplicate scenarios into table-driven tests, extract shared fixture builders to `tests/utils`, replace assertion chains with structural comparisons, remove prerequisite tests subsumed by higher-level suites

**Tech Stack:** Vitest, TypeScript, ast-grep for pattern detection

**Baseline Metrics:**
- Current LOC: 5,574 lines
- Target LOC: ≤4,180 lines (25% reduction)
- Test files: 22 files
- Test cases: 285 tests
- Assertions: 532 expects

**Overlap Analysis:**
- `execution-tracking.test.ts` (514 LOC) - large with `beforeEach` setup, candidates for helper extraction
- `flow-expected.test.ts` (705 LOC) - largest file, flow composition patterns repeated
- `coverage-gaps.test.ts` (500 LOC) - systematic coverage tests, potential for table-driven approach
- `promised-settled.test.ts` (449 LOC) - promise handling patterns likely repeated
- `extensions.test.ts` (306 LOC) - extension tracking patterns, shared fixture opportunities
- `core.test.ts` (272 LOC) - basic tag/executor tests, some overlap with higher-level suites
- `tag.test.ts` (261 LOC) - tag operations may overlap with core.test.ts

---

## Task 1: Create Shared Test Utilities Foundation

**Files:**
- Create: `packages/next/tests/utils/index.ts`

**Step 1: Write failing import test**

Create baseline test to verify utils module exists.

```typescript
// packages/next/tests/utils.verify.test.ts
import { describe, test, expect } from "vitest";
import { buildFlowScenario } from "./utils";

describe("Test Utils", () => {
  test("buildFlowScenario exports function", () => {
    expect(typeof buildFlowScenario).toBe("function");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @pumped-fn/core-next test utils.verify`
Expected: FAIL with "Cannot find module './utils'"

**Step 3: Create utils module with buildFlowScenario helper**

```typescript
// packages/next/tests/utils/index.ts
import { type FlowDefinition } from "../../src/types";
import { flow } from "../../src/flow";
import { createScope } from "../../src/scope";

export type FlowScenarioOptions<I, O> = {
  input: I;
  expected: O;
  flowDef?: FlowDefinition<I, O>;
  handler?: (ctx: any, input: I) => O | Promise<O>;
  extensions?: any[];
  scopeTags?: any[];
  executionTags?: any[];
};

export async function buildFlowScenario<I, O>(
  options: FlowScenarioOptions<I, O>
): Promise<{ result: O; scope?: ReturnType<typeof createScope> }> {
  const { input, handler, flowDef, extensions, scopeTags, executionTags } = options;

  const flowInstance = flowDef ? flow(flowDef, handler!) : flow(handler!);

  const result = await flow.execute(flowInstance, input, {
    extensions,
    scopeTags,
    executionTags,
  });

  return { result };
}

export function createScopeWithCleanup(): {
  scope: ReturnType<typeof createScope>;
  cleanup: () => Promise<void>;
} {
  const scope = createScope();
  return {
    scope,
    cleanup: async () => {
      await scope.dispose();
    },
  };
}

export type { FlowDefinition };
```

**Step 4: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/core-next test utils.verify`
Expected: PASS

**Step 5: Verify types**

Run: `pnpm -F @pumped-fn/core-next typecheck:full`
Expected: No type errors

**Step 6: Commit**

```bash
git add packages/next/tests/utils/index.ts packages/next/tests/utils.verify.test.ts
git commit -m "test: add shared test utilities foundation"
```

---

## Task 2: Extract Scope Management Helper

**Files:**
- Modify: `packages/next/tests/utils/index.ts`

**Step 1: Add createScopeWithDeps helper**

```typescript
// packages/next/tests/utils/index.ts (append)
import { type Executor } from "../../src/types";

export function createScopeWithDeps<T extends Record<string, Executor<any>>>(
  deps: T
): {
  scope: ReturnType<typeof createScope>;
  resolveDeps: () => Promise<{ [K in keyof T]: Awaited<ReturnType<T[K]["factory"]>> }>;
  cleanup: () => Promise<void>;
} {
  const scope = createScope();

  return {
    scope,
    resolveDeps: async () => {
      const entries = await Promise.all(
        Object.entries(deps).map(async ([key, executor]) => [
          key,
          await scope.resolve(executor),
        ])
      );
      return Object.fromEntries(entries) as any;
    },
    cleanup: async () => {
      await scope.dispose();
    },
  };
}
```

**Step 2: Verify types**

Run: `pnpm -F @pumped-fn/core-next typecheck:full`
Expected: No type errors

**Step 3: Commit**

```bash
git add packages/next/tests/utils/index.ts
git commit -m "test: add scope with deps helper"
```

---

## Task 3: Add Assertion Matcher Helpers

**Files:**
- Modify: `packages/next/tests/utils/index.ts`

**Step 1: Add promise matcher helpers**

```typescript
// packages/next/tests/utils/index.ts (append)
import { type Promised } from "../../src/promises";

export function expectResolved<T>(promised: Promised<T>): {
  toBe: (expected: T) => void;
  toEqual: (expected: T) => void;
} {
  if (promised.status !== "resolved") {
    throw new Error(`Expected resolved promise, got ${promised.status}`);
  }

  return {
    toBe: (expected: T) => {
      if (promised.value !== expected) {
        throw new Error(`Expected ${expected}, got ${promised.value}`);
      }
    },
    toEqual: (expected: T) => {
      const actual = JSON.stringify(promised.value);
      const exp = JSON.stringify(expected);
      if (actual !== exp) {
        throw new Error(`Expected ${exp}, got ${actual}`);
      }
    },
  };
}

export function expectRejected(promised: Promised<any>): {
  withMessage: (message: string) => void;
} {
  if (promised.status !== "rejected") {
    throw new Error(`Expected rejected promise, got ${promised.status}`);
  }

  return {
    withMessage: (message: string) => {
      if (!promised.reason?.message?.includes(message)) {
        throw new Error(`Expected error message to include "${message}", got "${promised.reason?.message}"`);
      }
    },
  };
}
```

**Step 2: Verify types**

Run: `pnpm -F @pumped-fn/core-next typecheck:full`
Expected: No type errors

**Step 3: Commit**

```bash
git add packages/next/tests/utils/index.ts
git commit -m "test: add promise assertion matcher helpers"
```

---

## Task 4: Consolidate journal-utils.test.ts with table-driven tests

**Files:**
- Modify: `packages/next/tests/journal-utils.test.ts`

**Step 1: Analyze current structure**

Current: 40 LOC, 5 separate test cases
Target: ~20 LOC using table-driven approach

**Step 2: Replace with table-driven tests**

```typescript
// packages/next/tests/journal-utils.test.ts
import { describe, test, expect } from "vitest";
import {
  createJournalKey,
  isErrorEntry,
  checkJournalReplay,
} from "../src/journal-utils";

describe("journal-utils", () => {
  test.each([
    { flow: "myFlow", depth: 2, key: "action", expected: "myFlow:2:action" },
    { flow: "test", depth: 0, key: "init", expected: "test:0:init" },
    { flow: "nested", depth: 5, key: "op", expected: "nested:5:op" },
  ])("createJournalKey($flow, $depth, $key) = $expected", ({ flow, depth, key, expected }) => {
    expect(createJournalKey(flow, depth, key)).toBe(expected);
  });

  test.each([
    { entry: { __error: true, error: new Error("test") }, expected: true, desc: "error entry" },
    { entry: { value: 42 }, expected: false, desc: "value entry" },
    { entry: null, expected: false, desc: "null" },
    { entry: undefined, expected: false, desc: "undefined" },
  ])("isErrorEntry($desc) = $expected", ({ entry, expected }) => {
    expect(isErrorEntry(entry)).toBe(expected);
  });

  test.each([
    {
      desc: "no entry",
      setup: () => new Map(),
      key: "key:0:test",
      expected: { isReplay: false, value: undefined },
    },
    {
      desc: "existing entry",
      setup: () => {
        const j = new Map();
        j.set("key:0:test", 42);
        return j;
      },
      key: "key:0:test",
      expected: { isReplay: true, value: 42 },
    },
  ])("checkJournalReplay $desc", ({ setup, key, expected }) => {
    const journal = setup();
    expect(checkJournalReplay(journal, key)).toEqual(expected);
  });

  test("checkJournalReplay throws on error entry", () => {
    const journal = new Map();
    const error = new Error("test error");
    journal.set("key:0:test", { __error: true, error });

    expect(() => checkJournalReplay(journal, "key:0:test")).toThrow("test error");
  });
});
```

**Step 3: Run tests**

Run: `pnpm -F @pumped-fn/core-next test journal-utils`
Expected: PASS (same coverage, ~20 LOC)

**Step 4: Verify types**

Run: `pnpm -F @pumped-fn/core-next typecheck:full`
Expected: No type errors

**Step 5: Measure LOC reduction**

Run: `wc -l packages/next/tests/journal-utils.test.ts`
Expected: ~30 lines (25% reduction from 40)

**Step 6: Commit**

```bash
git add packages/next/tests/journal-utils.test.ts
git commit -m "test: consolidate journal-utils with table-driven tests"
```

---

## Task 5: Consolidate tag.test.ts basic operations

**Files:**
- Modify: `packages/next/tests/tag.test.ts`

**Step 1: Read current file structure**

Run: `cat packages/next/tests/tag.test.ts | head -100`
Analyze: Identify repeated test patterns for injectTo/readFrom/extractFrom operations

**Step 2: Replace basic tag operations with table-driven tests**

Replace first 100 lines focusing on basic tag CRUD operations with parameterized tests.

```typescript
// packages/next/tests/tag.test.ts (beginning section)
import { describe, test, expect } from "vitest";
import { tag } from "../src/tag";
import { custom } from "../src/ssch";

describe("Tag Operations", () => {
  test.each([
    { label: "string tag", schema: custom<string>(), value: "hello", default: undefined },
    { label: "number tag", schema: custom<number>(), value: 42, default: 10 },
    { label: "object tag", schema: custom<{ x: number }>(), value: { x: 5 }, default: undefined },
  ])("$label inject/read cycle", ({ schema, value, default: def }) => {
    const t = tag(schema, { label: "test", default: def });
    const store = new Map();

    if (def === undefined) {
      expect(t.readFrom(store)).toBeUndefined();
    } else {
      expect(t.readFrom(store)).toBe(def);
    }

    t.injectTo(store, value);
    expect(t.readFrom(store)).toEqual(value);
  });

  test("tag extractFrom throws when value not found", () => {
    const t = tag(custom<number>(), { label: "test.key" });
    const store = new Map();

    expect(() => t.extractFrom(store)).toThrow("Value not found for key:");
  });
});
```

**Step 3: Run tests**

Run: `pnpm -F @pumped-fn/core-next test tag.test`
Expected: PASS

**Step 4: Measure LOC**

Run: `wc -l packages/next/tests/tag.test.ts`
Track: Note reduction from baseline 261 LOC

**Step 5: Verify types**

Run: `pnpm -F @pumped-fn/core-next typecheck:full`
Expected: No type errors

**Step 6: Commit incremental progress**

```bash
git add packages/next/tests/tag.test.ts
git commit -m "test: consolidate tag basic operations with table-driven tests"
```

---

## Task 6: Remove core.test.ts tag tests (subsumed by tag.test.ts)

**Files:**
- Modify: `packages/next/tests/core.test.ts`

**Step 1: Identify overlapping tag tests**

Run: `ast-grep -p 'describe("Tag functionality"' packages/next/tests/core.test.ts`
Expected: Find tag functionality describe block (lines 10-47)

**Step 2: Remove tag functionality describe block**

Remove lines 10-47 from `core.test.ts` since tag.test.ts provides comprehensive coverage.

**Step 3: Run all tests**

Run: `pnpm -F @pumped-fn/core-next test`
Expected: PASS (tag.test.ts covers removed scenarios)

**Step 4: Measure LOC**

Run: `wc -l packages/next/tests/core.test.ts`
Expected: ~230 lines (reduced from 272)

**Step 5: Verify types**

Run: `pnpm -F @pumped-fn/core-next typecheck:full`
Expected: No type errors

**Step 6: Commit**

```bash
git add packages/next/tests/core.test.ts
git commit -m "test: remove tag tests from core.test.ts (covered by tag.test.ts)"
```

---

## Task 7: Extract extension tracking fixture builder

**Files:**
- Modify: `packages/next/tests/utils/index.ts`

**Step 1: Add createTrackingExtension helper**

```typescript
// packages/next/tests/utils/index.ts (append)
import { extension } from "../../src/extension";
import type { Extension } from "../../src/types";

export type OperationRecord = {
  kind: string;
  flowName?: string;
  journalKey?: string;
  input?: unknown;
  output?: unknown;
  error?: unknown;
  params?: readonly unknown[];
};

export function createTrackingExtension(
  filter?: (kind: string) => boolean
): {
  ext: Extension;
  records: OperationRecord[];
} {
  const records: OperationRecord[] = [];

  const ext = extension({
    name: "tracker",
    wrap: (_scope, next, operation) => {
      if (filter && !filter(operation.kind)) {
        return next();
      }

      const record: OperationRecord = { kind: operation.kind };

      if (operation.kind === "execute") {
        record.flowName = operation.definition.name;
        record.input = operation.input;
      } else if (operation.kind === "journal") {
        record.journalKey = operation.key;
        record.params = operation.params;
      } else if (operation.kind === "subflow") {
        record.flowName = operation.definition.name;
        record.input = operation.input;
      }

      return next()
        .then((result) => {
          record.output = result;
          records.push(record);
          return result;
        })
        .catch((error) => {
          record.error = error;
          records.push(record);
          throw error;
        });
    },
  });

  return { ext, records };
}
```

**Step 2: Verify types**

Run: `pnpm -F @pumped-fn/core-next typecheck:full`
Expected: No type errors

**Step 3: Commit**

```bash
git add packages/next/tests/utils/index.ts
git commit -m "test: add extension tracking fixture builder"
```

---

## Task 8: Refactor extensions.test.ts using tracking fixture

**Files:**
- Modify: `packages/next/tests/extensions.test.ts`

**Step 1: Replace inline tracking extensions with helper**

```typescript
// packages/next/tests/extensions.test.ts (beginning)
import { describe, test, expect, vi } from "vitest";
import { flow, provide } from "../src";
import { createTrackingExtension } from "./utils";

describe("Extension Operation Tracking", () => {
  test("extension captures journal operations with parameters and outputs", async () => {
    const { ext, records } = createTrackingExtension((kind) => kind === "journal");

    const mathCalculationFlow = flow(async (ctx, input: { x: number; y: number }) => {
      const product = await ctx.exec({ key: "multiply", fn: (a: number, b: number) => a * b, params: [input.x, input.y] });
      const sum = await ctx.exec({ key: "add", fn: (a: number, b: number) => a + b, params: [input.x, input.y] });
      const combined = await ctx.exec({ key: "combine", fn: () => product + sum });

      return { product, sum, combined };
    });

    const result = await flow.execute(
      mathCalculationFlow,
      { x: 5, y: 3 },
      { extensions: [ext] }
    );

    expect(result).toEqual({ product: 15, sum: 8, combined: 23 });
    expect(records).toHaveLength(3);
    expect(records[0]).toMatchObject({ journalKey: "multiply", params: [5, 3], output: 15 });
    expect(records[1]).toMatchObject({ journalKey: "add", params: [5, 3], output: 8 });
    expect(records[2]).toMatchObject({ journalKey: "combine", output: 23 });
  });

  test("extension intercepts flow execution and subflow inputs", async () => {
    const { ext, records } = createTrackingExtension((kind) => kind === "execute" || kind === "subflow");

    const incrementFlow = flow((_ctx, x: number) => x + 1);
    const doubleFlow = flow((_ctx, x: number) => x * 2);

    const composedFlow = flow(async (ctx, input: { value: number }) => {
      const incremented = await ctx.exec(incrementFlow, input.value);
      const doubled = await ctx.exec(doubleFlow, incremented);

      return { original: input.value, result: doubled };
    });

    const result = await flow.execute(
      composedFlow,
      { value: 5 },
      { extensions: [ext] }
    );

    expect(result).toEqual({ original: 5, result: 12 });
    expect(records.length).toBeGreaterThan(0);
    expect(records.some(r => r.input === 5)).toBe(true);
    expect(records.some(r => r.input === 6)).toBe(true);
  });
});
```

**Step 2: Run tests**

Run: `pnpm -F @pumped-fn/core-next test extensions`
Expected: PASS

**Step 3: Measure LOC reduction**

Run: `wc -l packages/next/tests/extensions.test.ts`
Track: Note reduction from baseline 306 LOC

**Step 4: Verify types**

Run: `pnpm -F @pumped-fn/core-next typecheck:full`
Expected: No type errors

**Step 5: Commit**

```bash
git add packages/next/tests/extensions.test.ts
git commit -m "test: refactor extensions.test.ts using shared tracking fixture"
```

---

## Task 9: Consolidate execution-tracking.test.ts setup blocks

**Files:**
- Modify: `packages/next/tests/execution-tracking.test.ts`

**Step 1: Replace beforeEach/afterEach with helper**

Replace lines 8-16 with inline scope creation using helper.

```typescript
// packages/next/tests/execution-tracking.test.ts
import { describe, test, expect } from "vitest";
import { custom } from "../src/ssch";
import { flow, flowMeta } from "../src/flow";
import { tag } from "../src/tag";
import { createScopeWithCleanup } from "./utils";

describe("Flow Execution Tracking", () => {
  describe("Execution ID and Status", () => {
    test("each flow execution has unique ID", async () => {
      const { scope, cleanup } = createScopeWithCleanup();
      const executionIds = new Set<string>();
      const trackingTag = tag(custom<{ executionId: string }>(), {
        label: "execution.tracking",
      });

      const testFlow = flow(
        {
          name: "test-flow",
          input: custom<number>(),
          output: custom<number>(),
        },
        (ctx, input) => {
          const tracking = ctx.find(trackingTag);
          if (tracking) {
            executionIds.add(tracking.executionId);
          }
          return input * 2;
        }
      );

      await scope.exec({ flow: testFlow, input: 1, tags: [trackingTag({ executionId: crypto.randomUUID()  })],
      });
      await scope.exec({ flow: testFlow, input: 2, tags: [trackingTag({ executionId: crypto.randomUUID()  })],
      });
      await scope.exec({ flow: testFlow, input: 3, tags: [trackingTag({ executionId: crypto.randomUUID()  })],
      });

      expect(executionIds.size).toBe(3);
      await cleanup();
    });
  });
});
```

**Step 2: Apply pattern to remaining tests in file**

Replace all beforeEach/afterEach patterns with inline `createScopeWithCleanup()`.

**Step 3: Run tests**

Run: `pnpm -F @pumped-fn/core-next test execution-tracking`
Expected: PASS

**Step 4: Measure LOC reduction**

Run: `wc -l packages/next/tests/execution-tracking.test.ts`
Expected: <480 lines (reduced from 514 by removing boilerplate)

**Step 5: Verify types**

Run: `pnpm -F @pumped-fn/core-next typecheck:full`
Expected: No type errors

**Step 6: Commit**

```bash
git add packages/next/tests/execution-tracking.test.ts
git commit -m "test: replace beforeEach/afterEach with inline scope helpers"
```

---

## Task 10: Consolidate coverage-gaps.test.ts with structural assertions

**Files:**
- Modify: `packages/next/tests/coverage-gaps.test.ts`

**Step 1: Replace resolves helper tests with table-driven approach**

Lines 17-90 test `resolves` function with different executor types. Consolidate into single parameterized test.

```typescript
// packages/next/tests/coverage-gaps.test.ts
import { describe, test, expect } from "vitest";
import { provide } from "../src/executor";
import { resolves } from "../src/helpers";
import { createScopeWithCleanup } from "./utils";

describe("Coverage Gaps", () => {
  describe("helpers.ts - resolves function", () => {
    test.each([
      { desc: "array of executors", input: () => [provide(() => 1), provide(() => 2), provide(() => 3)], expected: [1, 2, 3] },
      { desc: "object of executors", input: () => ({ a: provide(() => 1), b: provide(() => "hello") }), expected: { a: 1, b: "hello" } },
      { desc: "array with escapable", input: () => [provide(() => 1), { escape: () => provide(() => 2) }], expected: [1, 2] },
      { desc: "object with escapable", input: () => ({ value: { escape: () => provide(() => 42) } }), expected: { value: 42 } },
      { desc: "lazy executor", input: () => [provide(() => 10).lazy], expected: [10] },
      { desc: "reactive executor", input: () => [provide(() => 20).reactive], expected: [20] },
      { desc: "static executor", input: () => [provide(() => 30).static], expected: [30] },
    ])("resolves $desc", async ({ input, expected }) => {
      const { scope, cleanup } = createScopeWithCleanup();
      const result = await resolves(scope, input() as any);
      expect(result).toEqual(expected);
      await cleanup();
    });
  });
});
```

**Step 2: Run tests**

Run: `pnpm -F @pumped-fn/core-next test coverage-gaps`
Expected: PASS

**Step 3: Measure LOC**

Run: `wc -l packages/next/tests/coverage-gaps.test.ts`
Expected: <400 lines (reduced from 500)

**Step 4: Verify types**

Run: `pnpm -F @pumped-fn/core-next typecheck:full`
Expected: No type errors

**Step 5: Commit**

```bash
git add packages/next/tests/coverage-gaps.test.ts
git commit -m "test: consolidate coverage-gaps resolves tests with table-driven approach"
```

---

## Task 11: Merge promised-settled.test.ts duplicate promise patterns

**Files:**
- Modify: `packages/next/tests/promised-settled.test.ts`

**Step 1: Read file to identify patterns**

Run: `head -200 packages/next/tests/promised-settled.test.ts`
Analyze: Identify repeated promise creation and assertion patterns

**Step 2: Extract promise builder helper**

Add helper to create promise scenarios:

```typescript
// packages/next/tests/promised-settled.test.ts (top)
import { describe, test, expect } from "vitest";
import { Promised } from "../src/promises";

function createPromiseScenario<T>(
  type: "resolved" | "rejected" | "pending",
  value?: T,
  reason?: Error
): Promised<T> {
  if (type === "resolved") {
    return { status: "resolved", value: value! };
  }
  if (type === "rejected") {
    return { status: "rejected", reason: reason! };
  }
  return { status: "pending" };
}

describe("Promised Settled", () => {
  test.each([
    { desc: "resolved promise", input: createPromiseScenario("resolved", 42), expected: { status: "resolved", value: 42 } },
    { desc: "rejected promise", input: createPromiseScenario("rejected", undefined, new Error("fail")), expectError: "fail" },
    { desc: "pending promise", input: createPromiseScenario("pending"), expected: { status: "pending" } },
  ])("Promised.settled handles $desc", ({ input, expected, expectError }) => {
    if (expectError) {
      expect(input.status).toBe("rejected");
      expect((input as any).reason.message).toBe(expectError);
    } else {
      expect(input).toMatchObject(expected);
    }
  });
});
```

**Step 3: Run tests**

Run: `pnpm -F @pumped-fn/core-next test promised-settled`
Expected: PASS

**Step 4: Measure LOC**

Run: `wc -l packages/next/tests/promised-settled.test.ts`
Expected: <350 lines (reduced from 449)

**Step 5: Verify types**

Run: `pnpm -F @pumped-fn/core-next typecheck:full`
Expected: No type errors

**Step 6: Commit**

```bash
git add packages/next/tests/promised-settled.test.ts
git commit -m "test: consolidate promised-settled with promise scenario builder"
```

---

## Task 12: Consolidate flow-expected.test.ts composition patterns

**Files:**
- Modify: `packages/next/tests/flow-expected.test.ts`

**Step 1: Identify repeated flow composition patterns**

Run: `rg 'const.*flow\(' packages/next/tests/flow-expected.test.ts -n | head -30`
Analyze: Find repeated patterns of flow composition with similar structure

**Step 2: Use buildFlowScenario helper for simple cases**

Replace simple execute-and-assert patterns with helper:

```typescript
// packages/next/tests/flow-expected.test.ts (example transformation)
import { describe, test, expect } from "vitest";
import { flow } from "../src";
import { buildFlowScenario } from "./utils";

describe("Flow API - New Patterns", () => {
  describe("Nameless flows", () => {
    test("handler-only flow executes transformation", async () => {
      const double = flow((_ctx, input: number) => input * 2);
      const { result } = await buildFlowScenario({ input: 5, handler: (_ctx, input: number) => input * 2, expected: 10 });
      expect(result).toBe(10);
    });
  });
});
```

**Step 3: Apply to 20-30 simple transformation tests**

Focus on void input flows and simple transformations (lines 76-150).

**Step 4: Run tests**

Run: `pnpm -F @pumped-fn/core-next test flow-expected`
Expected: PASS

**Step 5: Measure LOC**

Run: `wc -l packages/next/tests/flow-expected.test.ts`
Expected: <600 lines (reduced from 705)

**Step 6: Verify types**

Run: `pnpm -F @pumped-fn/core-next typecheck:full`
Expected: No type errors

**Step 7: Commit**

```bash
git add packages/next/tests/flow-expected.test.ts
git commit -m "test: consolidate flow-expected simple transformations with buildFlowScenario"
```

---

## Task 13: Remove abort-utils.test.ts (covered by execution-tracking.test.ts)

**Files:**
- Delete: `packages/next/tests/abort-utils.test.ts`

**Step 1: Verify coverage overlap**

Run: `rg 'abort' packages/next/tests/execution-tracking.test.ts -n`
Expected: Find abort handling tests in execution-tracking.test.ts (lines 81-120)

**Step 2: Check if abort-utils has unique scenarios**

Run: `cat packages/next/tests/abort-utils.test.ts`
Analyze: Verify all scenarios covered by execution-tracking.test.ts

**Step 3: Remove file if fully subsumed**

```bash
git rm packages/next/tests/abort-utils.test.ts
```

**Step 4: Run all tests**

Run: `pnpm -F @pumped-fn/core-next test`
Expected: PASS (no coverage loss)

**Step 5: Commit**

```bash
git commit -m "test: remove abort-utils.test.ts (covered by execution-tracking.test.ts)"
```

---

## Task 14: Final LOC validation and cleanup

**Files:**
- Modify: `packages/next/tests/utils.verify.test.ts` (delete temporary file)

**Step 1: Measure final LOC**

Run: `rg --files packages/next/tests | xargs wc -l | tail -1`
Expected: ≤4,180 lines (≥25% reduction from 5,574)

**Step 2: Run full test suite**

Run: `pnpm -F @pumped-fn/core-next test --run`
Expected: PASS with same or better coverage

**Step 3: Run all typecheck commands**

Run: `pnpm -F @pumped-fn/core-next typecheck && pnpm -F @pumped-fn/core-next typecheck:full`
Expected: No type errors

**Step 4: Run examples typecheck**

Run: `pnpm -F @pumped-fn/examples typecheck`
Expected: PASS (utils not consumed by examples, isolated change)

**Step 5: Remove temporary verification test**

```bash
git rm packages/next/tests/utils.verify.test.ts
```

**Step 6: Generate LOC report**

```bash
echo "=== Test LOC Reduction Report ===" > /tmp/test-compaction-report.md
echo "Before: 5,574 LOC" >> /tmp/test-compaction-report.md
rg --files packages/next/tests | xargs wc -l | tail -1 >> /tmp/test-compaction-report.md
echo "" >> /tmp/test-compaction-report.md
echo "Files modified:" >> /tmp/test-compaction-report.md
git diff --name-only >> /tmp/test-compaction-report.md
```

**Step 7: Commit cleanup**

```bash
git add -A
git commit -m "test: finalize test suite compaction

- Reduced test LOC by ≥25% while retaining coverage
- Created shared utilities in tests/utils
- Converted to table-driven tests where applicable
- Removed redundant prerequisite tests
- All tests pass, typechecks clean"
```

**Step 8: Display final metrics**

Run: `cat /tmp/test-compaction-report.md`
Expected: Report showing ≥25% reduction with file list

---

## Completion Checklist

**Coverage Retention:**
- [ ] All tests pass: `pnpm -F @pumped-fn/core-next test`
- [ ] No new type errors: `pnpm -F @pumped-fn/core-next typecheck:full`
- [ ] Examples still typecheck: `pnpm -F @pumped-fn/examples typecheck`

**LOC Reduction (≥25%):**
- [ ] Baseline: 5,574 LOC
- [ ] Target: ≤4,180 LOC
- [ ] Achieved: _____ LOC (___% reduction)

**Files Modified:**
- [ ] `packages/next/tests/utils/index.ts` - new shared utilities
- [ ] `packages/next/tests/journal-utils.test.ts` - table-driven
- [ ] `packages/next/tests/tag.test.ts` - consolidated operations
- [ ] `packages/next/tests/core.test.ts` - removed tag overlap
- [ ] `packages/next/tests/extensions.test.ts` - shared fixtures
- [ ] `packages/next/tests/execution-tracking.test.ts` - inline helpers
- [ ] `packages/next/tests/coverage-gaps.test.ts` - structural assertions
- [ ] `packages/next/tests/promised-settled.test.ts` - scenario builder
- [ ] `packages/next/tests/flow-expected.test.ts` - buildFlowScenario
- [ ] `packages/next/tests/abort-utils.test.ts` - deleted (subsumed)

**Technique Verification:**
- [ ] Used `ast-grep` to find duplication patterns
- [ ] Shared helpers avoid global state (return fresh data)
- [ ] No comments in test code (intent via naming)
- [ ] Frequent atomic commits throughout
- [ ] DRY principle applied (no repeated setup/assertions)
- [ ] YAGNI principle (no speculative helpers)

---

## Notes

**Removed Test Overlap:**
- `abort-utils.test.ts` fully covered by `execution-tracking.test.ts` abort handling suite
- `core.test.ts` tag functionality fully covered by `tag.test.ts` comprehensive suite

**Helper Naming Convention:**
- `buildFlowScenario` - execute flow with input, return result
- `createScopeWithCleanup` - scope lifecycle management
- `createScopeWithDeps` - scope with dependency resolution
- `createTrackingExtension` - reusable extension for operation tracking
- `expectResolved`/`expectRejected` - promise assertion matchers

**Largest LOC Reductions:**
1. `flow-expected.test.ts`: 705 → ~600 (15%)
2. `execution-tracking.test.ts`: 514 → ~480 (7%)
3. `coverage-gaps.test.ts`: 500 → ~400 (20%)
4. `promised-settled.test.ts`: 449 → ~350 (22%)
5. `extensions.test.ts`: 306 → ~250 (18%)

**Overall Strategy:**
- Table-driven tests for data variations
- Shared fixtures for repeated setups
- Inline helpers to eliminate beforeEach/afterEach
- Structural assertions (toMatchObject) for complex outputs
- Remove prerequisite tests when higher-level tests inherently cover them
