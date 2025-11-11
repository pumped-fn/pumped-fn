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
      expectedOperations: ["execution", "resolve"],
      createFlow: () => flow((_ctx, input: number) => input * 2),
      input: 5,
      expectedResult: 10,
    },
    {
      name: "subflow execution",
      expectedOperations: ["execution", "resolve", "execution", "resolve", "execution"],
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
      expectedOperations: ["execution", "resolve", "execution"],
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
      expectedOperations: ["execution", "resolve"],
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
      expectedOperations: ["execution", "resolve", "execution"],
      createFlow: () =>
        flow(async (ctx, _input: number) => {
          const { results } = await ctx.parallel([
            ctx.exec({ fn: () => Promise.resolve(1) }),
            ctx.exec({ fn: () => Promise.resolve(2) }),
          ]);
          return (results[0] as number) + (results[1] as number);
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

    const executeTraces = trace.filter((t) => t.kind === "execution");

    expect(executeTraces).toEqual([
      { name: "outer", phase: "before", kind: "execution" },
      { name: "inner", phase: "before", kind: "execution" },
      { name: "inner", phase: "after", kind: "execution" },
      { name: "outer", phase: "after", kind: "execution" },
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
      "execution-before",
      "resolve-before",
      "resolve-after",
      "execution-after",
      "execution-before",
      "resolve-before",
      "resolve-after",
      "execution-after",
      "execution-before",
      "execution-after",
    ]);
  });
});

describe("Extension Operation Metadata", () => {
  test("execute operation contains required metadata", async () => {
    const { extension: tracker, operations } = createOperationTracker();
    const scope = createScope({ extensions: [tracker] });
    const testFlow = flow((_ctx, input: number) => input * 2);

    await flow.execute(testFlow, 5, { scope });

    const executeOp = operations.find((op) => op.kind === "execution" && op.kind === "execution" && op.target.type === "flow");
    expect(executeOp).toBeDefined();
    expect(executeOp).toMatchObject({
      kind: "execution",
      input: 5,
    });
    if (executeOp && executeOp.kind === "execution" && executeOp.target.type === "flow") {
      expect(executeOp.target.flow).toBeDefined();
      expect(executeOp.target.definition).toBeDefined();
      expect(executeOp.context).toBeDefined();
    }
  });

  test("subflow operation contains required metadata", async () => {
    const { extension: tracker, operations } = createOperationTracker();
    const scope = createScope({ extensions: [tracker] });

    const child = flow((_ctx, x: number) => x + 1);
    const parent = flow(async (ctx, input: number) => {
      return await ctx.exec(child, input);
    });

    await flow.execute(parent, 5, { scope });

    const subflowOp = operations.find((op) => op.kind === "execution" && op.kind === "execution" && op.target.type === "flow");
    expect(subflowOp).toBeDefined();
    expect(subflowOp).toMatchObject({
      kind: "execution",
      input: 5,
    });
    if (subflowOp && subflowOp.kind === "execution" && subflowOp.target.type === "flow") {
      expect(subflowOp.target.flow).toBeDefined();
      expect(subflowOp.target.definition).toBeDefined();
      expect(subflowOp.context).toBeDefined();
    }
  });

  test("journal operation contains required metadata", async () => {
    const { extension: tracker, operations } = createOperationTracker();
    const scope = createScope({ extensions: [tracker] });

    const testFlow = flow(async (ctx, input: number) => {
      return await ctx.exec({ fn: () => input * 2, key: "double" });
    });

    await flow.execute(testFlow, 5, { scope });

    const journalOp = operations.find((op) => op.kind === "execution" && op.kind === "execution" && op.target.type === "fn" && op.key);
    expect(journalOp).toBeDefined();
    expect(journalOp).toMatchObject({
      kind: "execution",
      key: "double",
    });
    if (journalOp && journalOp.kind === "execution" && journalOp.target.type === "fn") {
      expect(journalOp.context).toBeDefined();
    }
  });

  test("parallel operation contains required metadata", async () => {
    const { extension: tracker, operations } = createOperationTracker();
    const scope = createScope({ extensions: [tracker] });

    const testFlow = flow(async (ctx, _input: number) => {
      const { results } = await ctx.parallel([
        ctx.exec({ fn: () => Promise.resolve(1) }),
        ctx.exec({ fn: () => Promise.resolve(2) }),
      ]);
      return (results[0] as number) + (results[1] as number);
    });

    await flow.execute(testFlow, 5, { scope });

    const parallelOp = operations.find((op) => op.kind === "execution" && op.kind === "execution" && op.target.type === "parallel");
    expect(parallelOp).toBeDefined();
    if (parallelOp && parallelOp.kind === "execution" && parallelOp.target.type === "parallel") {
      expect(parallelOp.target.mode).toBe("parallel");
      expect(parallelOp.target.count).toBe(2);
      expect(parallelOp.context).toBeDefined();
    }
    expect(parallelOp).toHaveProperty("context");
  });
});
