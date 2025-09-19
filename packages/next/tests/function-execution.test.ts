import { describe, test, expect } from "vitest";
import { flow } from "../src/flow";
import { custom } from "../src/ssch";

describe("Function Execution with ctx.execute and ctx.executeParallel", () => {
  const basicFlow = flow.define({
    name: "basic-test",
    input: custom<{ value: number }>(),
    success: custom<{ result: number }>(),
    error: custom<{ message: string }>(),
  });

  const handler = basicFlow.handler(async (ctx, input) => {
    // Test single parameter function
    const singleParamResult = await ctx.execute(
      (x: number) => x * 2,
      input.value
    );
    expect(singleParamResult.type).toBe("ok");
    expect(singleParamResult.data).toBe(input.value * 2);

    // Test multi-parameter function
    const multiParamResult = await ctx.execute(
      (a: number, b: number, c: string) => `${c}: ${a + b}`,
      [input.value, 10, "Sum"]
    );
    expect(multiParamResult.type).toBe("ok");
    expect(multiParamResult.data).toBe(`Sum: ${input.value + 10}`);

    // Test async function
    const asyncResult = await ctx.execute(
      async (x: number) => {
        await new Promise(resolve => setTimeout(resolve, 1));
        return x * 3;
      },
      input.value
    );
    expect(asyncResult.type).toBe("ok");
    expect(asyncResult.data).toBe(input.value * 3);

    // Test function that throws
    const errorResult = await ctx.execute(
      (x: number) => {
        if (x < 0) throw new Error("Negative not allowed");
        return x;
      },
      -1
    );
    expect(errorResult.type).toBe("ko");
    expect(errorResult.data).toBeInstanceOf(Error);

    // Test executeParallel with functions
    const parallelResults = await ctx.executeParallel([
      [(x: number) => x + 1, input.value],
      [(a: number, b: number) => a * b, [input.value, 2]],
      [async (x: number) => x - 1, input.value]
    ]);

    expect(parallelResults[0].type).toBe("ok");
    expect(parallelResults[0].data).toBe(input.value + 1);
    expect(parallelResults[1].type).toBe("ok");
    expect(parallelResults[1].data).toBe(input.value * 2);
    expect(parallelResults[2].type).toBe("ok");
    expect(parallelResults[2].data).toBe(input.value - 1);

    return ctx.ok({ result: input.value });
  });

  test("executes single parameter functions correctly", async () => {
    const result = await flow.execute(handler, { value: 5 });
    expect(result.type).toBe("ok");
  });

  test("handles function errors gracefully", async () => {
    const errorHandler = basicFlow.handler(async (ctx, input) => {
      const result = await ctx.execute(
        (x: number) => {
          throw new Error("Test error");
        },
        input.value
      );

      expect(result.type).toBe("ko");
      expect(result.data).toBeInstanceOf(Error);
      expect((result.data as Error).message).toBe("Test error");

      return ctx.ok({ result: input.value });
    });

    const result = await flow.execute(errorHandler, { value: 10 });
    expect(result.type).toBe("ok");
  });

  test("supports mixed flow and function execution in parallel", async () => {
    const testFlow = flow.define({
      name: "test-flow",
      input: custom<{ x: number }>(),
      success: custom<{ result: number }>(),
      error: custom<{ message: string }>(),
    });

    const testFlowHandler = testFlow.handler(async (ctx, input) => {
      return ctx.ok({ result: input.x * 10 });
    });

    const mixedHandler = basicFlow.handler(async (ctx, input) => {
      const results = await ctx.executeParallel([
        [testFlowHandler, { x: input.value }],
        [(n: number) => n + 100, input.value],
        [(a: number, b: number) => a - b, [input.value, 3]]
      ]);

      expect(results[0].type).toBe("ok");
      expect(results[0].data.result).toBe(input.value * 10);
      expect(results[1].type).toBe("ok");
      expect(results[1].data).toBe(input.value + 100);
      expect(results[2].type).toBe("ok");
      expect(results[2].data).toBe(input.value - 3);

      return ctx.ok({ result: input.value });
    });

    const result = await flow.execute(mixedHandler, { value: 7 });
    expect(result.type).toBe("ok");
  });

  test("handles parallel execution with some failures", async () => {
    const mixedErrorHandler = basicFlow.handler(async (ctx, input) => {
      const results = await ctx.executeParallel([
        [(x: number) => x * 2, input.value],
        [(x: number) => {
          if (x > 5) throw new Error("Too big");
          return x;
        }, input.value],
        [(a: number, b: number) => a + b, [input.value, 1]]
      ]);

      expect(results[0].type).toBe("ok");
      expect(results[0].data).toBe(input.value * 2);

      if (input.value > 5) {
        expect(results[1].type).toBe("ko");
        expect(results[1].data).toBeInstanceOf(Error);
      } else {
        expect(results[1].type).toBe("ok");
        expect(results[1].data).toBe(input.value);
      }

      expect(results[2].type).toBe("ok");
      expect(results[2].data).toBe(input.value + 1);

      return ctx.ok({ result: input.value });
    });

    const result1 = await flow.execute(mixedErrorHandler, { value: 3 });
    expect(result1.type).toBe("ok");

    const result2 = await flow.execute(mixedErrorHandler, { value: 8 });
    expect(result2.type).toBe("ok");
  });

  test("supports complex multi-parameter functions", async () => {
    const complexHandler = basicFlow.handler(async (ctx, input) => {
      const result = await ctx.execute(
        (name: string, age: number, active: boolean, scores: number[]) => {
          const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
          return {
            profile: `${name} (${age})`,
            status: active ? "active" : "inactive",
            average: avgScore
          };
        },
        ["John", 25, true, [85, 92, 78]]
      );

      expect(result.type).toBe("ok");
      expect(result.data).toEqual({
        profile: "John (25)",
        status: "active",
        average: 85
      });

      return ctx.ok({ result: input.value });
    });

    const result = await flow.execute(complexHandler, { value: 1 });
    expect(result.type).toBe("ok");
  });
});