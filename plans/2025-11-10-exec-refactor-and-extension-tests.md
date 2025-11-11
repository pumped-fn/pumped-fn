# Exec Refactor and Extension Tests Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor FlowContext.exec and Scope.exec to eliminate duplication, improve clarity for code review, and replace extension tests with comprehensive table-driven tests using snapshots.

**Architecture:** Extract shared helpers for timeout/abort/journal logic from exec methods. Normalize overload parsing, then route to clear single-purpose helper functions. Replace repetitive extension tests with test.each() scenarios that capture full operation metadata and verify with snapshots.

**Tech Stack:** TypeScript, vitest, pumped-fn framework

---

## Task 1: Extract Shared Timeout/Abort Helper

**Files:**
- Create: `packages/next/src/internal/abort-utils.ts`

**Step 1: Write failing test for createAbortWithTimeout**

Create test file:

```typescript
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { createAbortWithTimeout } from "../src/internal/abort-utils";

describe("createAbortWithTimeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("creates abort controller without timeout", () => {
    const result = createAbortWithTimeout();

    expect(result.controller).toBeInstanceOf(AbortController);
    expect(result.timeoutId).toBeNull();
    expect(result.controller.signal.aborted).toBe(false);
  });

  test("creates abort controller with timeout", () => {
    const result = createAbortWithTimeout(1000);

    expect(result.controller).toBeInstanceOf(AbortController);
    expect(result.timeoutId).not.toBeNull();
    expect(result.controller.signal.aborted).toBe(false);

    vi.advanceTimersByTime(1000);

    expect(result.controller.signal.aborted).toBe(true);
    expect(result.controller.signal.reason).toBeInstanceOf(Error);
    expect(result.controller.signal.reason.message).toContain("timeout after 1000ms");
  });

  test("links to parent abort signal", () => {
    const parent = new AbortController();
    const result = createAbortWithTimeout(undefined, parent.signal);

    expect(result.controller.signal.aborted).toBe(false);

    parent.abort(new Error("parent aborted"));

    expect(result.controller.signal.aborted).toBe(true);
    expect(result.controller.signal.reason.message).toBe("parent aborted");
  });

  test("clears timeout when parent aborts", () => {
    const parent = new AbortController();
    const result = createAbortWithTimeout(1000, parent.signal);

    expect(result.timeoutId).not.toBeNull();

    parent.abort(new Error("parent aborted"));

    expect(result.controller.signal.aborted).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @pumped-fn/core-next test abort-utils`
Expected: FAIL - module not found

**Step 3: Write minimal implementation**

Create `packages/next/src/internal/abort-utils.ts`:

```typescript
export namespace AbortUtils {
  export type AbortWithTimeout = {
    controller: AbortController;
    timeoutId: ReturnType<typeof setTimeout> | null;
  };
}

export function createAbortWithTimeout(
  timeout?: number,
  parentSignal?: AbortSignal
): AbortUtils.AbortWithTimeout {
  const controller = new AbortController();

  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  if (timeout) {
    timeoutId = setTimeout(() => {
      if (!controller.signal.aborted) {
        controller.abort(new Error(`Operation timeout after ${timeout}ms`));
      }
    }, timeout);
  }

  if (parentSignal) {
    if (parentSignal.aborted) {
      if (timeoutId) clearTimeout(timeoutId);
      controller.abort(parentSignal.reason);
    } else {
      parentSignal.addEventListener("abort", () => {
        if (timeoutId) clearTimeout(timeoutId);
        controller.abort(parentSignal.reason);
      }, { once: true });
    }
  }

  return { controller, timeoutId };
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/core-next test abort-utils`
Expected: PASS

**Step 5: Run typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/next/src/internal/abort-utils.ts packages/next/tests/abort-utils.test.ts
git commit -m "feat: add createAbortWithTimeout helper"
```

---

## Task 2: Extract Journal Helper Functions

**Files:**
- Create: `packages/next/src/internal/journal-utils.ts`

**Step 1: Write failing tests for journal helpers**

Create test file:

```typescript
import { describe, test, expect } from "vitest";
import { createJournalKey, checkJournalReplay, isErrorEntry } from "../src/internal/journal-utils";

describe("journal-utils", () => {
  test("createJournalKey generates key with flow:depth:key format", () => {
    const key = createJournalKey("myFlow", 2, "action");
    expect(key).toBe("myFlow:2:action");
  });

  test("isErrorEntry identifies error entries", () => {
    expect(isErrorEntry({ __error: true, error: new Error("test") })).toBe(true);
    expect(isErrorEntry({ value: 42 })).toBe(false);
    expect(isErrorEntry(null)).toBe(false);
    expect(isErrorEntry(undefined)).toBe(false);
  });

  test("checkJournalReplay returns value if no entry", () => {
    const journal = new Map();
    const result = checkJournalReplay(journal, "key:0:test");

    expect(result).toEqual({ isReplay: false, value: undefined });
  });

  test("checkJournalReplay returns value if entry exists", () => {
    const journal = new Map();
    journal.set("key:0:test", 42);

    const result = checkJournalReplay(journal, "key:0:test");

    expect(result).toEqual({ isReplay: true, value: 42 });
  });

  test("checkJournalReplay throws if error entry", () => {
    const journal = new Map();
    const error = new Error("test error");
    journal.set("key:0:test", { __error: true, error });

    expect(() => checkJournalReplay(journal, "key:0:test")).toThrow("test error");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @pumped-fn/core-next test journal-utils`
Expected: FAIL - module not found

**Step 3: Write minimal implementation**

Create `packages/next/src/internal/journal-utils.ts`:

```typescript
export type JournalEntry = unknown | { __error: true; error: unknown };

export function createJournalKey(flowName: string, depth: number, key: string): string {
  return `${flowName}:${depth}:${key}`;
}

export function isErrorEntry(entry: unknown): entry is { __error: true; error: unknown } {
  return typeof entry === "object" && entry !== null && "__error" in entry && entry.__error === true;
}

export function checkJournalReplay<T>(
  journal: Map<string, JournalEntry>,
  journalKey: string
): { isReplay: boolean; value: T | undefined } {
  if (!journal.has(journalKey)) {
    return { isReplay: false, value: undefined };
  }

  const entry = journal.get(journalKey);

  if (isErrorEntry(entry)) {
    throw entry.error;
  }

  return { isReplay: true, value: entry as T };
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/core-next test journal-utils`
Expected: PASS

**Step 5: Run typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/next/src/internal/journal-utils.ts packages/next/tests/journal-utils.test.ts
git commit -m "feat: add journal utility functions"
```

---

## Task 3: Refactor FlowContext.exec - Extract Overload Parsing

**Files:**
- Modify: `packages/next/src/flow.ts:295-599`

**Step 1: Read current implementation to understand overload patterns**

Run: `cat packages/next/src/flow.ts | sed -n '295,599p'`

**Step 2: Add normalized config type above exec method**

In `packages/next/src/flow.ts`, add before line 295:

```typescript
namespace ExecConfig {
  export type Flow<F extends Flow.UFlow> = {
    type: "flow";
    flow: F;
    input: Flow.InferInput<F>;
    key?: string;
    timeout?: number;
    retry?: number;
    tags?: Tag.Tagged[];
  };

  export type Fn<T> = {
    type: "fn";
    fn: (...args: any[]) => T | Promise<T>;
    params: any[];
    key?: string;
    timeout?: number;
    retry?: number;
    tags?: Tag.Tagged[];
  };

  export type Normalized<T = any> = Flow<any> | Fn<T>;
}
```

**Step 3: Extract parseExecOverloads helper method**

Add private method in FlowContext class:

```typescript
private parseExecOverloads<F extends Flow.UFlow>(
  keyOrFlowOrConfig: string | F | { flow?: F; fn?: any; input?: Flow.InferInput<F>; params?: any[]; key?: string; timeout?: number; retry?: number; tags?: Tag.Tagged[] },
  flowOrInput?: F | Flow.InferInput<F>,
  inputOrUndefined?: Flow.InferInput<F>
): ExecConfig.Normalized {
  if (typeof keyOrFlowOrConfig === "object" && keyOrFlowOrConfig !== null && !("factory" in keyOrFlowOrConfig)) {
    const config = keyOrFlowOrConfig;

    if ("flow" in config) {
      return {
        type: "flow",
        flow: config.flow as F,
        input: config.input as Flow.InferInput<F>,
        key: config.key,
        timeout: config.timeout,
        retry: config.retry,
        tags: config.tags,
      };
    } else if ("fn" in config) {
      return {
        type: "fn",
        fn: config.fn,
        params: "params" in config ? config.params || [] : [],
        key: config.key,
        timeout: config.timeout,
        retry: config.retry,
        tags: config.tags,
      };
    } else {
      throw new Error("Invalid config: must have either 'flow' or 'fn'");
    }
  }

  const keyOrFlow = keyOrFlowOrConfig as string | F;

  if (typeof keyOrFlow === "string") {
    return {
      type: "flow",
      flow: flowOrInput as F,
      input: inputOrUndefined as Flow.InferInput<F>,
      key: keyOrFlow,
      timeout: undefined,
      retry: undefined,
      tags: undefined,
    };
  }

  return {
    type: "flow",
    flow: keyOrFlow as F,
    input: flowOrInput as Flow.InferInput<F>,
    key: undefined,
    timeout: undefined,
    retry: undefined,
    tags: undefined,
  };
}
```

**Step 4: Run typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/next/src/flow.ts
git commit -m "refactor: extract exec overload parsing logic"
```

---

## Task 4: Refactor FlowContext.exec - Extract executeJournaledFn Helper

**Files:**
- Modify: `packages/next/src/flow.ts`

**Step 1: Add executeJournaledFn private method**

Add in FlowContext class:

```typescript
private executeJournaledFn<T>(
  fn: (...args: any[]) => T | Promise<T>,
  params: any[],
  journalKey: string,
  flowName: string,
  depth: number
): Promised<T> {
  const journal = this.journal!;
  const { isReplay, value } = checkJournalReplay<T>(journal, journalKey);

  if (isReplay) {
    return Promised.create(Promise.resolve(value!));
  }

  const executeCore = (): Promised<T> => {
    return Promised.try(async () => {
      const result = await fn(...params);
      journal.set(journalKey, result);
      return result;
    }).catch((error) => {
      journal.set(journalKey, { __error: true, error });
      throw error;
    });
  };

  const executor = this.wrapWithExtensions(executeCore, {
    kind: "journal",
    key: journalKey.split(":")[2],
    flowName,
    depth,
    isReplay,
    context: this,
    params: params.length > 0 ? params : undefined,
  });

  return Promised.create(executor());
}
```

**Step 2: Add imports at top of flow.ts**

```typescript
import { createAbortWithTimeout } from "./internal/abort-utils";
import { createJournalKey, checkJournalReplay, isErrorEntry } from "./internal/journal-utils";
```

**Step 3: Run typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/next/src/flow.ts
git commit -m "refactor: extract executeJournaledFn helper"
```

---

## Task 5: Refactor FlowContext.exec - Extract executeSubflow Helper

**Files:**
- Modify: `packages/next/src/flow.ts`

**Step 1: Add executeSubflow private method**

Add in FlowContext class:

```typescript
private executeSubflow<F extends Flow.UFlow>(
  flow: F,
  input: Flow.InferInput<F>,
  tags?: Tag.Tagged[]
): Promised<Flow.InferOutput<F>> {
  const parentFlowName = this.find(flowMeta.flowName);
  const depth = this.get(flowMeta.depth);

  const executeCore = (): Promised<Flow.InferOutput<F>> => {
    return this.scope.resolve(flow).map(async (handler) => {
      const definition = flowDefinitionMeta.readFrom(flow);
      if (!definition) {
        throw new Error("Flow definition not found in executor metadata");
      }

      const childContext = new FlowContext(this.scope, this.extensions, tags, this);
      childContext.initializeExecutionContext(definition.name, false);

      return (await this.executeWithExtensions<Flow.InferOutput<F>>(
        async (ctx) => handler(ctx, input) as Promise<Flow.InferOutput<F>>,
        childContext,
        flow,
        input
      )) as Flow.InferOutput<F>;
    });
  };

  const definition = flowDefinitionMeta.readFrom(flow);
  if (!definition) {
    throw new Error("Flow definition not found in executor metadata");
  }

  const executor = this.wrapWithExtensions(executeCore, {
    kind: "subflow",
    flow,
    definition,
    input,
    journalKey: undefined,
    parentFlowName,
    depth,
    context: this,
  });

  return Promised.create(executor());
}
```

**Step 2: Run typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/next/src/flow.ts
git commit -m "refactor: extract executeSubflow helper"
```

---

## Task 6: Refactor FlowContext.exec - Simplify Main Method

**Files:**
- Modify: `packages/next/src/flow.ts:295-599`

**Step 1: Replace exec implementation body**

Replace the exec implementation method (lines 295-599) with:

```typescript
exec<F extends Flow.UFlow>(
  keyOrFlowOrConfig: string | F | { flow?: F; fn?: any; input?: Flow.InferInput<F>; params?: any[]; key?: string; timeout?: number; retry?: number; tags?: Tag.Tagged[] },
  flowOrInput?: F | Flow.InferInput<F>,
  inputOrUndefined?: Flow.InferInput<F>
): Promised<any> {
  this.throwIfAborted();

  const config = this.parseExecOverloads(keyOrFlowOrConfig, flowOrInput, inputOrUndefined);
  const { controller, timeoutId } = createAbortWithTimeout(config.timeout, this.signal);

  const executeWithCleanup = async <T>(executor: () => Promise<T>): Promise<T> => {
    try {
      return await executor();
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  };

  if (config.type === "fn") {
    if (config.key) {
      if (!this.journal) {
        this.journal = new Map();
      }

      const flowName = this.find(flowMeta.flowName) || "unknown";
      const depth = this.get(flowMeta.depth);
      const journalKey = createJournalKey(flowName, depth, config.key);

      return Promised.create(
        executeWithCleanup(() => this.executeJournaledFn(config.fn, config.params, journalKey, flowName, depth))
      );
    } else {
      return Promised.try(() => executeWithCleanup(() => config.fn(...config.params)));
    }
  }

  if (config.key) {
    if (!this.journal) {
      this.journal = new Map();
    }

    const flowName = this.find(flowMeta.flowName) || "unknown";
    const depth = this.get(flowMeta.depth);
    const journalKey = createJournalKey(flowName, depth, config.key);
    const journal = this.journal;

    const executeJournaledFlow = async (): Promise<Flow.InferOutput<F>> => {
      const { isReplay, value } = checkJournalReplay<Flow.InferOutput<F>>(journal, journalKey);

      if (isReplay) {
        return value!;
      }

      this.throwIfAborted();

      const handler = await this.scope.resolve(config.flow);
      const definition = flowDefinitionMeta.readFrom(config.flow);

      if (!definition) {
        throw new Error("Flow definition not found");
      }

      const validated = validate(definition.input, config.input);
      const childContext = new FlowContext(this.scope, this.extensions, config.tags, this, controller);
      childContext.initializeExecutionContext(definition.name, false);

      try {
        const result = await handler(childContext, validated);
        validate(definition.output, result);
        journal.set(journalKey, result);
        return result;
      } catch (error) {
        journal.set(journalKey, { __error: true, error });
        throw error;
      }
    };

    return Promised.create(executeWithCleanup(executeJournaledFlow));
  }

  return Promised.create(
    executeWithCleanup(() => this.executeSubflow(config.flow, config.input, config.tags))
  );
}
```

**Step 2: Remove old isErrorEntry function if exists in flow.ts**

Search for `function isErrorEntry` in flow.ts and remove it (now imported from journal-utils).

**Step 3: Run typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck && pnpm -F @pumped-fn/core-next typecheck:full`
Expected: PASS

**Step 4: Run all tests**

Run: `pnpm -F @pumped-fn/core-next test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/next/src/flow.ts
git commit -m "refactor: simplify FlowContext.exec using helpers"
```

---

## Task 7: Write Comprehensive Extension Tests - Operation Tracker

**Files:**
- Modify: `packages/next/tests/flow-extension-fix.test.ts`

**Step 1: Replace test file content with operation tracker**

Replace entire file:

```typescript
import { describe, test, expect } from "vitest";
import { flow, createScope, extension, tag, custom } from "../src";
import type { Extension } from "../src";

const createOperationTracker = () => {
  const operations: Array<Extension.Operation & { phase?: string }> = [];

  const ext = extension({
    name: "operation-tracker",
    wrap: (scope, next, operation) => {
      operations.push({ ...operation });
      return next();
    },
  });

  return { extension: ext, operations };
};

describe("Extension Operation Coverage", () => {
  test.each([
    {
      name: "flow execution",
      expectedOperations: ["execute"],
      createFlow: () => flow((_ctx, input: number) => input * 2),
      input: 5,
      expectedResult: 10,
    },
    {
      name: "subflow execution",
      expectedOperations: ["execute", "subflow"],
      createFlow: () => {
        const child = flow((_ctx, x: number) => x + 1);
        return flow(async (ctx, input: number) => {
          const result = await ctx.exec(child, input);
          return result * 2;
        });
      },
      input: 5,
      expectedResult: 12,
    },
    {
      name: "journaled fn execution",
      expectedOperations: ["execute", "journal"],
      createFlow: () =>
        flow(async (ctx, input: number) => {
          const doubled = await ctx.exec({ fn: () => input * 2, key: "double" });
          return doubled + 1;
        }),
      input: 5,
      expectedResult: 11,
    },
    {
      name: "non-journaled fn execution",
      expectedOperations: ["execute"],
      createFlow: () =>
        flow(async (ctx, input: number) => {
          const doubled = await ctx.exec({ fn: () => input * 2 });
          return doubled + 1;
        }),
      input: 5,
      expectedResult: 11,
    },
    {
      name: "parallel execution",
      expectedOperations: ["execute", "parallel"],
      createFlow: () =>
        flow(async (ctx, _input: number) => {
          const results = await ctx.parallel([
            Promise.resolve(1),
            Promise.resolve(2),
          ]);
          return results[0] + results[1];
        }),
      input: 5,
      expectedResult: 3,
    },
  ])("$name triggers correct operations", async ({ createFlow, input, expectedResult, expectedOperations }) => {
    const { extension: tracker, operations } = createOperationTracker();
    const scope = createScope({ extensions: [tracker] });
    const testFlow = createFlow();

    const result = await flow.execute(testFlow, input, { scope });

    expect(result).toBe(expectedResult);

    const operationKinds = operations.map((op) => op.kind);
    expect(operationKinds).toEqual(expectedOperations);

    expect(operations.length).toBeGreaterThan(0);
    operations.forEach((op) => {
      expect(op).toHaveProperty("kind");
    });
  });
});
```

**Step 2: Run test**

Run: `pnpm -F @pumped-fn/core-next test flow-extension-fix`
Expected: PASS

**Step 3: Run typecheck on tests**

Run: `pnpm -F @pumped-fn/core-next typecheck:full`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/next/tests/flow-extension-fix.test.ts
git commit -m "test: add table-driven extension operation tests"
```

---

## Task 8: Write Extension Wrapping Order Tests

**Files:**
- Modify: `packages/next/tests/flow-extension-fix.test.ts`

**Step 1: Add wrapping order test suite**

Append to test file:

```typescript
describe("Extension Wrapping Order", () => {
  test("multiple extensions wrap in array order", async () => {
    const trace: Array<{ name: string; phase: string; kind: string }> = [];

    const outerExt = extension({
      name: "outer",
      wrap: (scope, next, operation) => {
        trace.push({ name: "outer", phase: "before", kind: operation.kind });
        const result = next();
        trace.push({ name: "outer", phase: "after", kind: operation.kind });
        return result;
      },
    });

    const innerExt = extension({
      name: "inner",
      wrap: (scope, next, operation) => {
        trace.push({ name: "inner", phase: "before", kind: operation.kind });
        const result = next();
        trace.push({ name: "inner", phase: "after", kind: operation.kind });
        return result;
      },
    });

    const scope = createScope({ extensions: [outerExt, innerExt] });
    const simpleFlow = flow((_ctx, input: number) => input * 2);

    await flow.execute(simpleFlow, 5, { scope });

    const executeTraces = trace.filter((t) => t.kind === "execute");

    expect(executeTraces).toEqual([
      { name: "outer", phase: "before", kind: "execute" },
      { name: "inner", phase: "before", kind: "execute" },
      { name: "inner", phase: "after", kind: "execute" },
      { name: "outer", phase: "after", kind: "execute" },
    ]);
  });

  test("nested operations show correct wrapping depth", async () => {
    const trace: Array<{ name: string; phase: string; kind: string }> = [];

    const tracker = extension({
      name: "tracker",
      wrap: (scope, next, operation) => {
        trace.push({ name: "tracker", phase: "before", kind: operation.kind });
        const result = next();
        trace.push({ name: "tracker", phase: "after", kind: operation.kind });
        return result;
      },
    });

    const scope = createScope({ extensions: [tracker] });

    const childFlow = flow((_ctx, x: number) => x + 1);
    const parentFlow = flow(async (ctx, input: number) => {
      const result = await ctx.exec(childFlow, input);
      return result * 2;
    });

    await flow.execute(parentFlow, 5, { scope });

    expect(trace.map((t) => `${t.kind}-${t.phase}`)).toEqual([
      "execute-before",
      "subflow-before",
      "subflow-after",
      "execute-after",
    ]);
  });
});
```

**Step 2: Run test**

Run: `pnpm -F @pumped-fn/core-next test flow-extension-fix`
Expected: PASS

**Step 3: Run typecheck on tests**

Run: `pnpm -F @pumped-fn/core-next typecheck:full`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/next/tests/flow-extension-fix.test.ts
git commit -m "test: add extension wrapping order tests"
```

---

## Task 9: Add Operation Metadata Snapshot Tests

**Files:**
- Modify: `packages/next/tests/flow-extension-fix.test.ts`

**Step 1: Add metadata snapshot test suite**

Append to test file:

```typescript
describe("Extension Operation Metadata", () => {
  test("execute operation contains required metadata", async () => {
    const { extension: tracker, operations } = createOperationTracker();
    const scope = createScope({ extensions: [tracker] });
    const testFlow = flow((_ctx, input: number) => input * 2);

    await flow.execute(testFlow, input, { scope });

    const executeOp = operations.find((op) => op.kind === "execute");
    expect(executeOp).toBeDefined();
    expect(executeOp).toMatchObject({
      kind: "execute",
      flow: expect.any(Object),
      definition: expect.any(Object),
      input: 5,
      depth: 0,
      isParallel: false,
    });
  });

  test("subflow operation contains required metadata", async () => {
    const { extension: tracker, operations } = createOperationTracker();
    const scope = createScope({ extensions: [tracker] });

    const child = flow((_ctx, x: number) => x + 1);
    const parent = flow(async (ctx, input: number) => {
      return await ctx.exec(child, input);
    });

    await flow.execute(parent, 5, { scope });

    const subflowOp = operations.find((op) => op.kind === "subflow");
    expect(subflowOp).toBeDefined();
    expect(subflowOp).toMatchObject({
      kind: "subflow",
      flow: expect.any(Object),
      definition: expect.any(Object),
      input: 5,
      depth: expect.any(Number),
    });
  });

  test("journal operation contains required metadata", async () => {
    const { extension: tracker, operations } = createOperationTracker();
    const scope = createScope({ extensions: [tracker] });

    const testFlow = flow(async (ctx, input: number) => {
      return await ctx.exec({ fn: () => input * 2, key: "double" });
    });

    await flow.execute(testFlow, 5, { scope });

    const journalOp = operations.find((op) => op.kind === "journal");
    expect(journalOp).toBeDefined();
    expect(journalOp).toMatchObject({
      kind: "journal",
      key: "double",
      isReplay: false,
      depth: expect.any(Number),
    });
  });

  test("parallel operation contains required metadata", async () => {
    const { extension: tracker, operations } = createOperationTracker();
    const scope = createScope({ extensions: [tracker] });

    const testFlow = flow(async (ctx, _input: number) => {
      return await ctx.parallel([Promise.resolve(1), Promise.resolve(2)]);
    });

    await flow.execute(testFlow, 5, { scope });

    const parallelOp = operations.find((op) => op.kind === "parallel");
    expect(parallelOp).toBeDefined();
    expect(parallelOp).toMatchObject({
      kind: "parallel",
      mode: "parallel",
      promiseCount: 2,
      depth: expect.any(Number),
    });
  });
});
```

**Step 2: Run test**

Run: `pnpm -F @pumped-fn/core-next test flow-extension-fix`
Expected: PASS

**Step 3: Run typecheck on tests**

Run: `pnpm -F @pumped-fn/core-next typecheck:full`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/next/tests/flow-extension-fix.test.ts
git commit -m "test: add operation metadata snapshot tests"
```

---

## Task 10: Final Verification

**Step 1: Run full typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck && pnpm -F @pumped-fn/core-next typecheck:full`
Expected: PASS - no type errors

**Step 2: Run all tests**

Run: `pnpm -F @pumped-fn/core-next test`
Expected: PASS - all tests passing

**Step 3: Verify line count reduction**

Run: `wc -l packages/next/src/flow.ts`
Expected: Reduction from original (exec method should be ~150 lines total vs ~250 before)

**Step 4: Verify test compactness**

Run: `wc -l packages/next/tests/flow-extension-fix.test.ts`
Expected: New tests more compact and comprehensive than original

**Step 5: Final commit**

```bash
git add .
git commit -m "chore: verify all typechecks and tests pass"
```

---

## Success Criteria Checklist

- [ ] FlowContext.exec reduced from ~250 lines to ~150 lines
- [ ] Clear helper functions with single responsibilities
- [ ] No duplicated timeout/abort/journal logic
- [ ] Easy to trace execution path for each overload
- [ ] Extension wrapping clearly visible in helpers
- [ ] All 5 operation kinds tested (execute, subflow, journal, parallel, resolve if applicable)
- [ ] Extension wrapping order verified with multiple extensions
- [ ] Full operation metadata captured in tests
- [ ] Tests more compact than current implementation
- [ ] fn execution behavior clearly tested (with key vs without key)
- [ ] All typechecks pass
- [ ] All tests pass
- [ ] Code review easier due to clearer structure
