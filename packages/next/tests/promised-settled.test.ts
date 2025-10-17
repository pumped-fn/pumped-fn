import { describe, test, expect } from "vitest";
import { flow, Promised } from "../src";

describe("Promised - Settled Result Utilities", () => {
  describe("fulfilled()", () => {
    test("extracts fulfilled values from parallel execution", async () => {
      const multiplyByTwo = flow((_ctx, x: number) => x * 2);
      const multiplyByThree = flow((_ctx, x: number) => x * 3);
      const multiplyByFour = flow((_ctx, x: number) => x * 4);

      const main = flow(async (ctx, input: number) => {
        return ctx
          .parallelSettled([
            ctx.exec(multiplyByTwo, input),
            ctx.exec(multiplyByThree, input),
            ctx.exec(multiplyByFour, input),
          ])
          .fulfilled();
      });

      const result = await flow.execute(main, 5);

      expect(result).toEqual([10, 15, 20]);
    });

    test("filters out rejected results and keeps only fulfilled", async () => {
      const successFlow = flow((_ctx, x: number) => x);
      const failureFlow = flow(() => {
        throw new Error("fail");
      });

      const main = flow(async (ctx, input: number) => {
        return ctx
          .parallelSettled([
            ctx.exec(successFlow, input),
            ctx.exec(failureFlow, undefined),
            ctx.exec(successFlow, input * 2),
            ctx.exec(failureFlow, undefined),
          ])
          .fulfilled();
      });

      const result = await flow.execute(main, 10);

      expect(result).toEqual([10, 20]);
    });
  });

  describe("rejected()", () => {
    test("extracts rejection reasons from parallel execution", async () => {
      const firstFailure = flow(() => {
        throw new Error("error1");
      });
      const secondFailure = flow(() => {
        throw new Error("error2");
      });

      const main = flow(async (ctx) => {
        return ctx
          .parallelSettled([ctx.exec(firstFailure, undefined), ctx.exec(secondFailure, undefined)])
          .rejected();
      });

      const result = await flow.execute(main, undefined);

      expect(result).toHaveLength(2);
      expect((result[0] as Error).message).toBe("error1");
      expect((result[1] as Error).message).toBe("error2");
    });

    test("filters out fulfilled results and keeps only rejected", async () => {
      const successFlow = flow((_ctx, x: number) => x * 2);
      const failureFlow = flow(() => {
        throw new Error("fail");
      });

      const main = flow(async (ctx, input: number) => {
        return ctx
          .parallelSettled([
            ctx.exec(successFlow, input),
            ctx.exec(failureFlow, undefined),
            ctx.exec(successFlow, input),
          ])
          .rejected();
      });

      const result = await flow.execute(main, 5);

      expect(result).toHaveLength(1);
      expect((result[0] as Error).message).toBe("fail");
    });
  });

  describe("partition()", () => {
    test("separates mixed results into fulfilled and rejected arrays", async () => {
      const successFlow = flow((_ctx, x: number) => x * 2);
      const failureFlow = flow(() => {
        throw new Error("fail");
      });

      const main = flow(async (ctx, input: number) => {
        return ctx
          .parallelSettled([
            ctx.exec(successFlow, input),
            ctx.exec(failureFlow, undefined),
            ctx.exec(successFlow, input * 2),
            ctx.exec(failureFlow, undefined),
          ])
          .partition();
      });

      const result = await flow.execute(main, 5);

      expect(result.fulfilled).toEqual([10, 20]);
      expect(result.rejected).toHaveLength(2);
      expect((result.rejected[0] as Error).message).toBe("fail");
    });
  });

  describe("firstFulfilled()", () => {
    test("returns first fulfilled value from parallel execution", async () => {
      const successFlow = flow((_ctx, x: number) => x);

      const main = flow(async (ctx, input: number) => {
        return ctx
          .parallelSettled([
            ctx.exec(successFlow, input),
            ctx.exec(successFlow, input * 2),
            ctx.exec(successFlow, input * 3),
          ])
          .firstFulfilled();
      });

      const result = await flow.execute(main, 5);

      expect(result).toBe(5);
    });

    test("skips rejected results and returns first fulfilled", async () => {
      const successFlow = flow((_ctx, x: number) => x);
      const failureFlow = flow(() => {
        throw new Error("fail");
      });

      const main = flow(async (ctx, input: number) => {
        return ctx
          .parallelSettled([
            ctx.exec(failureFlow, undefined),
            ctx.exec(successFlow, input),
            ctx.exec(failureFlow, undefined),
          ])
          .firstFulfilled();
      });

      const result = await flow.execute(main, 42);

      expect(result).toBe(42);
    });
  });

  describe("firstRejected()", () => {
    test("returns first rejection reason from parallel execution", async () => {
      const firstFailure = flow(() => {
        throw new Error("first");
      });
      const secondFailure = flow(() => {
        throw new Error("second");
      });

      const main = flow(async (ctx) => {
        return ctx
          .parallelSettled([ctx.exec(firstFailure, undefined), ctx.exec(secondFailure, undefined)])
          .firstRejected();
      });

      const result = await flow.execute(main, undefined);

      expect((result as Error).message).toBe("first");
    });

    test("skips fulfilled results and returns first rejection", async () => {
      const successFlow = flow((_ctx, x: number) => x);
      const failureFlow = flow(() => {
        throw new Error("error");
      });

      const main = flow(async (ctx, input: number) => {
        return ctx
          .parallelSettled([
            ctx.exec(successFlow, input),
            ctx.exec(failureFlow, undefined),
            ctx.exec(successFlow, input),
          ])
          .firstRejected();
      });

      const result = await flow.execute(main, 1);

      expect((result as Error).message).toBe("error");
    });
  });

  describe("findFulfilled()", () => {
    test("finds first fulfilled value matching predicate", async () => {
      const successFlow = flow((_ctx, x: number) => x);

      const main = flow<void, number | undefined>(async (ctx) => {
        return ctx
          .parallelSettled([
            ctx.exec(successFlow, 1),
            ctx.exec(successFlow, 5),
            ctx.exec(successFlow, 10),
          ])
          .findFulfilled((v: number) => v > 3);
      });

      const result = await flow.execute(main, undefined);

      expect(result).toBe(5);
    });

    test("skips rejected results when searching with predicate", async () => {
      const successFlow = flow((_ctx, x: number) => x);
      const failureFlow = flow(() => {
        throw new Error("fail");
      });

      const main = flow<void, number | undefined>(async (ctx) => {
        return ctx
          .parallelSettled([
            ctx.exec(failureFlow, undefined),
            ctx.exec(successFlow, 1),
            ctx.exec(failureFlow, undefined),
            ctx.exec(successFlow, 5),
          ])
          .findFulfilled((v: number) => v > 3);
      });

      const result = await flow.execute(main, undefined);

      expect(result).toBe(5);
    });

    test("provides correct index for fulfilled values in predicate", async () => {
      const successFlow = flow((_ctx, x: number) => x);
      const failureFlow = flow(() => {
        throw new Error("fail");
      });

      const capturedIndices: number[] = [];
      const main = flow(async (ctx) => {
        return ctx
          .parallelSettled([
            ctx.exec(successFlow, 10),
            ctx.exec(failureFlow, undefined),
            ctx.exec(successFlow, 20),
            ctx.exec(successFlow, 30),
          ])
          .findFulfilled((_v, idx) => {
            capturedIndices.push(idx);
            return false;
          });
      });

      await flow.execute(main, undefined);

      expect(capturedIndices).toEqual([0, 1, 2]);
    });
  });

  describe("mapFulfilled()", () => {
    test("transforms fulfilled values with mapper function", async () => {
      const successFlow = flow((_ctx, x: number) => x);

      const main = flow<void, number[]>(async (ctx) => {
        return ctx
          .parallelSettled([
            ctx.exec(successFlow, 1),
            ctx.exec(successFlow, 2),
            ctx.exec(successFlow, 3),
          ])
          .mapFulfilled((v: number) => v * 10);
      });

      const result = await flow.execute(main, undefined);

      expect(result).toEqual([10, 20, 30]);
    });

    test("skips rejected results and maps only fulfilled values", async () => {
      const successFlow = flow((_ctx, x: number) => x);
      const failureFlow = flow(() => {
        throw new Error("fail");
      });

      const main = flow<void, number[]>(async (ctx) => {
        return ctx
          .parallelSettled([
            ctx.exec(successFlow, 1),
            ctx.exec(failureFlow, undefined),
            ctx.exec(successFlow, 2),
            ctx.exec(failureFlow, undefined),
          ])
          .mapFulfilled((v: number) => v * 10);
      });

      const result = await flow.execute(main, undefined);

      expect(result).toEqual([10, 20]);
    });

    test("provides correct index for fulfilled values in mapper", async () => {
      const successFlow = flow((_ctx, x: number) => x);
      const failureFlow = flow(() => {
        throw new Error("fail");
      });

      const main = flow(async (ctx) => {
        return ctx
          .parallelSettled([
            ctx.exec(failureFlow, undefined),
            ctx.exec(successFlow, 100),
            ctx.exec(successFlow, 200),
          ])
          .mapFulfilled((v, idx) => ({ value: v, index: idx }));
      });

      const result = await flow.execute(main, undefined);

      expect(result).toEqual([
        { value: 100, index: 0 },
        { value: 200, index: 1 },
      ]);
    });
  });

  describe("assertAllFulfilled()", () => {
    test("returns fulfilled values when all operations succeed", async () => {
      const successFlow = flow((_ctx, x: number) => x * 2);

      const main = flow(async (ctx, input: number) => {
        return ctx
          .parallelSettled([ctx.exec(successFlow, input), ctx.exec(successFlow, input * 2)])
          .assertAllFulfilled();
      });

      const result = await flow.execute(main, 5);

      expect(result).toEqual([10, 20]);
    });

    test("throws with default error message when any operation fails", async () => {
      const successFlow = flow((_ctx, x: number) => x);
      const failureFlow = flow(() => {
        throw new Error("operation failed");
      });

      const main = flow(async (ctx, input: number) => {
        return ctx
          .parallelSettled([ctx.exec(successFlow, input), ctx.exec(failureFlow, undefined)])
          .assertAllFulfilled();
      });

      await expect(flow.execute(main, 5)).rejects.toThrow("1 of 2 operations failed");
    });

    test("throws with custom error message from error mapper", async () => {
      const successFlow = flow((_ctx, x: number) => x);
      const failureFlow = flow(() => {
        throw new Error("op failed");
      });

      const main = flow(async (ctx, input: number) => {
        return ctx
          .parallelSettled([
            ctx.exec(successFlow, input),
            ctx.exec(failureFlow, undefined),
            ctx.exec(failureFlow, undefined),
          ])
          .assertAllFulfilled((reasons, fulfilledCount, totalCount) => {
            return new Error(
              `Custom: ${reasons.length} failed, ${fulfilledCount} succeeded out of ${totalCount} total`
            );
          });
      });

      await expect(flow.execute(main, 5)).rejects.toThrow("Custom: 2 failed, 1 succeeded out of 3 total");
    });
  });

  describe("Integration with Promised.allSettled", () => {
    test("works with static promise array using Promised.allSettled", async () => {
      const multiplyByTwo = flow((_ctx, x: number) => x * 2);
      const multiplyByThree = flow((_ctx, x: number) => x * 3);
      const failureFlow = flow(() => {
        throw new Error("fail");
      });

      const main = flow(async (_ctx, input: number) => {
        const promise1 = flow.execute(multiplyByTwo, input);
        const promise2 = flow.execute(failureFlow, undefined);
        const promise3 = flow.execute(multiplyByThree, input);

        return Promised.allSettled([promise1, promise2, promise3]).partition();
      });

      const result = await flow.execute(main, 5);

      expect(result.fulfilled).toEqual([10, 15]);
      expect(result.rejected).toHaveLength(1);
    });
  });

  describe("Edge cases", () => {
    test("handles empty execution array", async () => {
      const main = flow(async (ctx) => {
        return ctx.parallelSettled([]).fulfilled();
      });

      const result = await flow.execute(main, undefined);

      expect(result).toEqual([]);
    });

    test("chains multiple transformations on settled results", async () => {
      const successFlow = flow((_ctx, x: number) => x);
      const failureFlow = flow(() => {
        throw new Error("fail");
      });

      const main = flow<void, number>(async (ctx) => {
        return ctx
          .parallelSettled([
            ctx.exec(successFlow, 1),
            ctx.exec(failureFlow, undefined),
            ctx.exec(successFlow, 5),
            ctx.exec(successFlow, 10),
          ])
          .fulfilled()
          .map((values: number[]) => values.filter((v: number) => v > 3))
          .map((values: number[]) => values.reduce((sum: number, v: number) => sum + v, 0));
      });

      const result = await flow.execute(main, undefined);

      expect(result).toBe(15);
    });
  });
});
