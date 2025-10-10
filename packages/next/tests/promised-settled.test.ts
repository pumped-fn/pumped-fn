import { describe, test, expect } from "vitest";
import { flow, Promised } from "../src";

describe("Promised - Settled Result Utilities", () => {
  describe("fulfilled()", () => {
    test("extracts all fulfilled values from parallelSettled", async () => {
      const flow1 = flow((_ctx, x: number) => x * 2);
      const flow2 = flow((_ctx, x: number) => x * 3);
      const flow3 = flow((_ctx, x: number) => x * 4);

      const main = flow(async (ctx, input: number) => {
        return ctx
          .parallelSettled([
            ctx.exec(flow1, input),
            ctx.exec(flow2, input),
            ctx.exec(flow3, input),
          ])
          .fulfilled();
      });

      const result = await flow.execute(main, 5);
      expect(result).toEqual([10, 15, 20]);
    });

    test("returns empty array when all rejected", async () => {
      const failFlow = flow(() => {
        throw new Error("failed");
      });

      const main = flow(async (ctx) => {
        return ctx
          .parallelSettled([ctx.exec(failFlow, undefined), ctx.exec(failFlow, undefined)])
          .fulfilled();
      });

      const result = await flow.execute(main, undefined);
      expect(result).toEqual([]);
    });

    test("filters out rejected and keeps fulfilled", async () => {
      const success = flow((_ctx, x: number) => x);
      const failure = flow(() => {
        throw new Error("fail");
      });

      const main = flow(async (ctx, input: number) => {
        return ctx
          .parallelSettled([
            ctx.exec(success, input),
            ctx.exec(failure, undefined),
            ctx.exec(success, input * 2),
          ])
          .fulfilled();
      });

      const result = await flow.execute(main, 10);
      expect(result).toEqual([10, 20]);
    });
  });

  describe("rejected()", () => {
    test("extracts all rejection reasons", async () => {
      const fail1 = flow(() => {
        throw new Error("error1");
      });
      const fail2 = flow(() => {
        throw new Error("error2");
      });

      const main = flow(async (ctx) => {
        return ctx
          .parallelSettled([ctx.exec(fail1, undefined), ctx.exec(fail2, undefined)])
          .rejected();
      });

      const result = await flow.execute(main, undefined);
      expect(result).toHaveLength(2);
      expect((result[0] as Error).message).toBe("error1");
      expect((result[1] as Error).message).toBe("error2");
    });

    test("returns empty array when all fulfilled", async () => {
      const success = flow((_ctx, x: number) => x * 2);

      const main = flow(async (ctx, input: number) => {
        return ctx.parallelSettled([ctx.exec(success, input), ctx.exec(success, input)]).rejected();
      });

      const result = await flow.execute(main, 5);
      expect(result).toEqual([]);
    });
  });

  describe("partition()", () => {
    test("splits results into fulfilled and rejected", async () => {
      const success = flow((_ctx, x: number) => x * 2);
      const failure = flow(() => {
        throw new Error("fail");
      });

      const main = flow(async (ctx, input: number) => {
        return ctx
          .parallelSettled([
            ctx.exec(success, input),
            ctx.exec(failure, undefined),
            ctx.exec(success, input * 2),
            ctx.exec(failure, undefined),
          ])
          .partition();
      });

      const result = await flow.execute(main, 5);
      expect(result.fulfilled).toEqual([10, 20]);
      expect(result.rejected).toHaveLength(2);
      expect((result.rejected[0] as Error).message).toBe("fail");
    });

    test("handles all fulfilled", async () => {
      const success = flow((_ctx, x: number) => x);

      const main = flow(async (ctx, input: number) => {
        return ctx.parallelSettled([ctx.exec(success, input), ctx.exec(success, input * 2)]).partition();
      });

      const result = await flow.execute(main, 3);
      expect(result.fulfilled).toEqual([3, 6]);
      expect(result.rejected).toEqual([]);
    });

    test("handles all rejected", async () => {
      const failure = flow(() => {
        throw new Error("fail");
      });

      const main = flow(async (ctx) => {
        return ctx.parallelSettled([ctx.exec(failure, undefined), ctx.exec(failure, undefined)]).partition();
      });

      const result = await flow.execute(main, undefined);
      expect(result.fulfilled).toEqual([]);
      expect(result.rejected).toHaveLength(2);
    });
  });

  describe("firstFulfilled()", () => {
    test("returns first fulfilled value", async () => {
      const success = flow((_ctx, x: number) => x);

      const main = flow(async (ctx, input: number) => {
        return ctx
          .parallelSettled([
            ctx.exec(success, input),
            ctx.exec(success, input * 2),
            ctx.exec(success, input * 3),
          ])
          .firstFulfilled();
      });

      const result = await flow.execute(main, 5);
      expect(result).toBe(5);
    });

    test("returns first fulfilled when mixed with rejections", async () => {
      const success = flow((_ctx, x: number) => x);
      const failure = flow(() => {
        throw new Error("fail");
      });

      const main = flow(async (ctx, input: number) => {
        return ctx
          .parallelSettled([ctx.exec(failure, undefined), ctx.exec(success, input), ctx.exec(failure, undefined)])
          .firstFulfilled();
      });

      const result = await flow.execute(main, 42);
      expect(result).toBe(42);
    });

    test("returns undefined when all rejected", async () => {
      const failure = flow(() => {
        throw new Error("fail");
      });

      const main = flow(async (ctx) => {
        return ctx.parallelSettled([ctx.exec(failure, undefined), ctx.exec(failure, undefined)]).firstFulfilled();
      });

      const result = await flow.execute(main, undefined);
      expect(result).toBeUndefined();
    });
  });

  describe("firstRejected()", () => {
    test("returns first rejection reason", async () => {
      const fail1 = flow(() => {
        throw new Error("first");
      });
      const fail2 = flow(() => {
        throw new Error("second");
      });

      const main = flow(async (ctx) => {
        return ctx.parallelSettled([ctx.exec(fail1, undefined), ctx.exec(fail2, undefined)]).firstRejected();
      });

      const result = await flow.execute(main, undefined);
      expect((result as Error).message).toBe("first");
    });

    test("returns first rejection when mixed with fulfilled", async () => {
      const success = flow((_ctx, x: number) => x);
      const failure = flow(() => {
        throw new Error("error");
      });

      const main = flow(async (ctx, input: number) => {
        return ctx
          .parallelSettled([ctx.exec(success, input), ctx.exec(failure, undefined), ctx.exec(success, input)])
          .firstRejected();
      });

      const result = await flow.execute(main, 1);
      expect((result as Error).message).toBe("error");
    });

    test("returns undefined when all fulfilled", async () => {
      const success = flow((_ctx, x: number) => x);

      const main = flow(async (ctx, input: number) => {
        return ctx.parallelSettled([ctx.exec(success, input), ctx.exec(success, input)]).firstRejected();
      });

      const result = await flow.execute(main, 1);
      expect(result).toBeUndefined();
    });
  });

  describe("findFulfilled()", () => {
    test("finds first fulfilled matching predicate", async () => {
      const success = flow((_ctx, x: number) => x);

      const main = flow<void, number | undefined>(async (ctx) => {
        return ctx
          .parallelSettled([ctx.exec(success, 1), ctx.exec(success, 5), ctx.exec(success, 10)])
          .findFulfilled((v: number) => v > 3);
      });

      const result = await flow.execute(main, undefined);
      expect(result).toBe(5);
    });

    test("returns undefined when no match", async () => {
      const success = flow((_ctx, x: number) => x);

      const main = flow<void, number | undefined>(async (ctx) => {
        return ctx
          .parallelSettled([ctx.exec(success, 1), ctx.exec(success, 2)])
          .findFulfilled((v: number) => v > 10);
      });

      const result = await flow.execute(main, undefined);
      expect(result).toBeUndefined();
    });

    test("skips rejected results", async () => {
      const success = flow((_ctx, x: number) => x);
      const failure = flow(() => {
        throw new Error("fail");
      });

      const main = flow<void, number | undefined>(async (ctx) => {
        return ctx
          .parallelSettled([
            ctx.exec(failure, undefined),
            ctx.exec(success, 1),
            ctx.exec(failure, undefined),
            ctx.exec(success, 5),
          ])
          .findFulfilled((v: number) => v > 3);
      });

      const result = await flow.execute(main, undefined);
      expect(result).toBe(5);
    });

    test("uses correct index for fulfilled values only", async () => {
      const success = flow((_ctx, x: number) => x);
      const failure = flow(() => {
        throw new Error("fail");
      });

      const indices: number[] = [];
      const main = flow(async (ctx) => {
        return ctx
          .parallelSettled([
            ctx.exec(success, 10),
            ctx.exec(failure, undefined),
            ctx.exec(success, 20),
            ctx.exec(success, 30),
          ])
          .findFulfilled((_v, idx) => {
            indices.push(idx);
            return false;
          });
      });

      await flow.execute(main, undefined);
      expect(indices).toEqual([0, 1, 2]);
    });
  });

  describe("mapFulfilled()", () => {
    test("maps over fulfilled values", async () => {
      const success = flow((_ctx, x: number) => x);

      const main = flow<void, number[]>(async (ctx) => {
        return ctx
          .parallelSettled([ctx.exec(success, 1), ctx.exec(success, 2), ctx.exec(success, 3)])
          .mapFulfilled((v: number) => v * 10);
      });

      const result = await flow.execute(main, undefined);
      expect(result).toEqual([10, 20, 30]);
    });

    test("skips rejected results", async () => {
      const success = flow((_ctx, x: number) => x);
      const failure = flow(() => {
        throw new Error("fail");
      });

      const main = flow<void, number[]>(async (ctx) => {
        return ctx
          .parallelSettled([
            ctx.exec(success, 1),
            ctx.exec(failure, undefined),
            ctx.exec(success, 2),
            ctx.exec(failure, undefined),
          ])
          .mapFulfilled((v: number) => v * 10);
      });

      const result = await flow.execute(main, undefined);
      expect(result).toEqual([10, 20]);
    });

    test("provides correct index for fulfilled values", async () => {
      const success = flow((_ctx, x: number) => x);
      const failure = flow(() => {
        throw new Error("fail");
      });

      const main = flow(async (ctx) => {
        return ctx
          .parallelSettled([ctx.exec(failure, undefined), ctx.exec(success, 100), ctx.exec(success, 200)])
          .mapFulfilled((v, idx) => ({ value: v, index: idx }));
      });

      const result = await flow.execute(main, undefined);
      expect(result).toEqual([
        { value: 100, index: 0 },
        { value: 200, index: 1 },
      ]);
    });

    test("returns empty array when all rejected", async () => {
      const failure = flow(() => {
        throw new Error("fail");
      });

      const main = flow(async (ctx) => {
        return ctx
          .parallelSettled([ctx.exec(failure, undefined), ctx.exec(failure, undefined)])
          .mapFulfilled((v) => v);
      });

      const result = await flow.execute(main, undefined);
      expect(result).toEqual([]);
    });
  });

  describe("assertAllFulfilled()", () => {
    test("returns fulfilled values when all succeed", async () => {
      const success = flow((_ctx, x: number) => x * 2);

      const main = flow(async (ctx, input: number) => {
        return ctx
          .parallelSettled([ctx.exec(success, input), ctx.exec(success, input * 2)])
          .assertAllFulfilled();
      });

      const result = await flow.execute(main, 5);
      expect(result).toEqual([10, 20]);
    });

    test("throws when any rejected with default error message", async () => {
      const success = flow((_ctx, x: number) => x);
      const failure = flow(() => {
        throw new Error("operation failed");
      });

      const main = flow(async (ctx, input: number) => {
        return ctx
          .parallelSettled([ctx.exec(success, input), ctx.exec(failure, undefined)])
          .assertAllFulfilled();
      });

      await expect(flow.execute(main, 5)).rejects.toThrow("1 of 2 operations failed");
    });

    test("throws with custom error mapper", async () => {
      const success = flow((_ctx, x: number) => x);
      const failure = flow(() => {
        throw new Error("op failed");
      });

      const main = flow(async (ctx, input: number) => {
        return ctx
          .parallelSettled([
            ctx.exec(success, input),
            ctx.exec(failure, undefined),
            ctx.exec(failure, undefined),
          ])
          .assertAllFulfilled((reasons, fulfilledCount, totalCount) => {
            return new Error(
              `Custom: ${reasons.length} failed, ${fulfilledCount} succeeded out of ${totalCount} total`
            );
          });
      });

      await expect(flow.execute(main, 5)).rejects.toThrow("Custom: 2 failed, 1 succeeded out of 3 total");
    });

    test("provides rejection reasons to error mapper", async () => {
      const failure1 = flow(() => {
        throw new Error("first error");
      });
      const failure2 = flow(() => {
        throw new Error("second error");
      });

      const main = flow(async (ctx) => {
        return ctx
          .parallelSettled([ctx.exec(failure1, undefined), ctx.exec(failure2, undefined)])
          .assertAllFulfilled((reasons) => {
            const messages = reasons.map((r) => (r as Error).message).join("; ");
            return new Error(`All failed: ${messages}`);
          });
      });

      await expect(flow.execute(main, undefined)).rejects.toThrow("All failed: first error; second error");
    });
  });

  describe("Works with Promised.allSettled()", () => {
    test("fulfilled() works with allSettled", async () => {
      const flow1 = flow((_ctx, x: number) => x * 2);
      const flow2 = flow((_ctx, x: number) => x * 3);

      const main = flow(async (ctx, input: number) => {
        const p1 = flow.execute(flow1, input);
        const p2 = flow.execute(flow2, input);
        return Promised.allSettled([p1, p2]).fulfilled();
      });

      const result = await flow.execute(main, 5);
      expect(result).toEqual([10, 15]);
    });

    test("rejected() works with allSettled", async () => {
      const success = flow((_ctx, x: number) => x);
      const failure = flow(() => {
        throw new Error("test error");
      });

      const main = flow(async (ctx, input: number) => {
        const p1 = flow.execute(success, input);
        const p2 = flow.execute(failure, undefined);
        return Promised.allSettled([p1, p2]).rejected();
      });

      const result = await flow.execute(main, 5);
      expect(result).toHaveLength(1);
      expect((result[0] as Error).message).toBe("test error");
    });

    test("partition() works with allSettled", async () => {
      const success = flow((_ctx, x: number) => x);
      const failure = flow(() => {
        throw new Error("fail");
      });

      const main = flow(async (ctx, input: number) => {
        const p1 = flow.execute(success, input);
        const p2 = flow.execute(failure, undefined);
        const p3 = flow.execute(success, input * 2);
        return Promised.allSettled([p1, p2, p3]).partition();
      });

      const result = await flow.execute(main, 5);
      expect(result.fulfilled).toEqual([5, 10]);
      expect(result.rejected).toHaveLength(1);
    });
  });

  describe("Edge cases", () => {
    test("handles empty array", async () => {
      const main = flow(async (ctx) => {
        return ctx.parallelSettled([]).fulfilled();
      });

      const result = await flow.execute(main, undefined);
      expect(result).toEqual([]);
    });

    test("chains multiple operations", async () => {
      const success = flow((_ctx, x: number) => x);
      const failure = flow(() => {
        throw new Error("fail");
      });

      const main = flow<void, number>(async (ctx) => {
        return ctx
          .parallelSettled([
            ctx.exec(success, 1),
            ctx.exec(failure, undefined),
            ctx.exec(success, 5),
            ctx.exec(success, 10),
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
