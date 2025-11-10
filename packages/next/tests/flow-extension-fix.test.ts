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
      expectedOperations: ["execute", "resolve"],
      createFlow: () => flow((_ctx, input: number) => input * 2),
      input: 5,
      expectedResult: 10,
    },
    {
      name: "subflow execution",
      expectedOperations: ["execute", "resolve", "subflow", "resolve", "execute"],
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
      expectedOperations: ["execute", "resolve", "journal"],
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
      expectedOperations: ["execute", "resolve"],
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
      expectedOperations: ["execute", "resolve", "parallel"],
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
      "resolve-before",
      "resolve-after",
      "execute-after",
      "subflow-before",
      "resolve-before",
      "resolve-after",
      "subflow-after",
      "execute-before",
      "execute-after",
    ]);
  });
});
