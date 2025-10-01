import { describe, test, expect, vi } from "vitest";
import { flow } from "../src/flow";
import { custom } from "../src/ssch";
import { createJournalingExtension } from "../src/extensions/journaling";
import { assertOk, assertKo, assertError } from "./type-guards";

describe("Flow Improved API", () => {
  describe("ctx.run() - journaled operations", () => {
    test("executes and journals a side effect", async () => {
      const fetchMock = vi.fn(() => Promise.resolve("fetched-data"));

      const impl = flow<{ url: string }, { data: string }, { code: string }>({
        name: "test.run",
        handler: async (ctx, input) => {
          const data = await ctx.run("fetch-api", () => fetchMock());
          return ctx.ok({ data });
        }
      });

      const result = await flow.execute(impl, { url: "http://test.com" });

      assertOk(result);
      expect(result.data.data).toBe("fetched-data");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    test("replays from journal on subsequent calls", async () => {
      let callCount = 0;
      const expensiveOp = vi.fn(() => {
        callCount++;
        return Promise.resolve(callCount);
      });

      const impl = flow<Record<string, never>, { value: number }, { code: string }>({
        name: "test.replay",
        handler: async (ctx, input) => {
          const value1 = await ctx.run("expensive-op", () => expensiveOp());
          const value2 = await ctx.run("expensive-op", () => expensiveOp());

          return ctx.ok({ value: value1 });
        }
      });

      const result = await flow.execute(impl, {});

      assertOk(result);
      expect(result.data.value).toBe(1);
      expect(expensiveOp).toHaveBeenCalledTimes(1);
    });

    test("journals errors and replays them", async () => {
      const failingOp = vi.fn(() => Promise.reject(new Error("Operation failed")));

      const impl = flow<Record<string, never>, { value: string }, { code: string; message: string }>({
        name: "test.error-journal",
        handler: async (ctx, input) => {
          try {
            await ctx.run("failing-op", () => failingOp());
            return ctx.ok({ value: "success" });
          } catch (error) {
            assertError(error);
            return ctx.ko({
              code: "OP_FAILED",
              message: error.message,
            });
          }
        }
      });

      const result = await flow.execute(impl, {});

      assertKo(result);
      expect(result.data.code).toBe("OP_FAILED");
      expect(failingOp).toHaveBeenCalledTimes(1);
    });
  });

  describe("ctx.flow() - simplified flow execution", () => {
    test("executes sub-flow with nested pod", async () => {
      const subImpl = flow<{ value: number }, { doubled: number }, { code: string }>({
        name: "sub-flow",
        handler: async (ctx, input) => {
          return ctx.ok({ doubled: input.value * 2 });
        }
      });

      const mainImpl = flow<{ value: number }, { result: number }, { code: string }>({
        name: "main-flow",
        handler: async (ctx, input) => {
          const subResult = await ctx.flow(subImpl, { value: input.value });

          if (subResult.isKo()) {
            return ctx.ko(subResult.data);
          }

          return ctx.ok({ result: subResult.data.doubled });
        }
      });

      const result = await flow.execute(mainImpl, { value: 5 });

      assertOk(result);
      expect(result.data.result).toBe(10);
    });

    test("maintains isolation between nested flows", async () => {
      const setterImpl = flow<
        { key: string; value: string },
        { retrieved: string | undefined },
        { code: string }
      >({
        name: "context-key-flow",
        handler: async (ctx, input) => {
          ctx.set(input.key, input.value);
          return ctx.ok({ retrieved: ctx.get(input.key) as string });
        }
      });

      const mainImpl = flow<
        Record<string, never>,
        { parent: unknown; child1: string | undefined; child2: string | undefined },
        { code: string }
      >({
        name: "main-isolation-flow",
        handler: async (ctx, input) => {
          ctx.set("parent-key", "parent-value");

          const child1 = await ctx.flow(setterImpl, {
            key: "child-key",
            value: "child1-value",
          });

          const child2 = await ctx.flow(setterImpl, {
            key: "child-key",
            value: "child2-value",
          });

          return ctx.ok({
            parent: ctx.get("parent-key"),
            child1: child1.isOk() ? child1.data.retrieved : undefined,
            child2: child2.isOk() ? child2.data.retrieved : undefined,
          });
        }
      });

      const result = await flow.execute(mainImpl, {});

      assertOk(result);
      expect(result.data.parent).toBe("parent-value");
      expect(result.data.child1).toBe("child1-value");
      expect(result.data.child2).toBe("child2-value");
    });
  });

  describe("ctx.parallel() - parallel execution", () => {
    test("executes multiple flows in parallel", async () => {
      const impl1 = flow({
        name: "flow1",
        input: custom<{ value: number }>(),
        success: custom<{ result: number }>(),
        error: custom<{ code: string }>(),
        handler: async (ctx, input) => {
          await new Promise(resolve => setTimeout(resolve, 10));
          return ctx.ok({ result: input.value * 2 });
        }
      });

      const impl2 = flow({
        name: "flow2",
        input: custom<{ value: number }>(),
        success: custom<{ result: number }>(),
        error: custom<{ code: string }>(),
        handler: async (ctx, input) => {
          await new Promise(resolve => setTimeout(resolve, 10));
          return ctx.ok({ result: input.value * 3 });
        }
      });

      const mainImpl = flow<{ value: number }, { sum: number }, { code: string }>({
        name: "main-parallel",
        handler: async (ctx, input) => {
          const parallelResult = await ctx.parallel([
            [impl1, { value: input.value }],
            [impl2, { value: input.value }],
          ] as const);

          if (parallelResult.type === "all-ok") {
            const [r1, r2] = parallelResult.results;
            const sum = (r1.isOk() ? r1.data.result : 0) + (r2.isOk() ? r2.data.result : 0);
            return ctx.ok({ sum });
          }

          return ctx.ko({ code: "PARALLEL_FAILED" });
        }
      });

      const result = await flow.execute(mainImpl, { value: 5 });

      assertOk(result);
      expect(result.data.sum).toBe(25);
    });

    test("reports partial results when some flows fail", async () => {
      const successImpl = flow<Record<string, never>, { value: string }, { code: string }>({
        name: "success-flow",
        handler: async (ctx, input) => {
          return ctx.ok({ value: "success" });
        }
      });

      const failImpl = flow<Record<string, never>, { value: string }, { code: string }>({
        name: "fail-flow",
        handler: async (ctx, input) => {
          return ctx.ko({ code: "FAILURE" });
        }
      });

      const mainImpl = flow<
        Record<string, never>,
        { type: string; stats: { total: number; succeeded: number; failed: number } },
        { code: string }
      >({
        name: "main-partial",
        handler: async (ctx, input) => {
          const parallelResult = await ctx.parallel([
            [successImpl, {}],
            [failImpl, {}],
            [successImpl, {}],
          ] as const);

          return ctx.ok({
            type: parallelResult.type,
            stats: parallelResult.stats,
          });
        }
      });

      const result = await flow.execute(mainImpl, {});

      assertOk(result);
      expect(result.data.type).toBe("partial");
      expect(result.data.stats.total).toBe(3);
      expect(result.data.stats.succeeded).toBe(2);
      expect(result.data.stats.failed).toBe(1);
    });
  });

  describe("journaling extension", () => {
    test("extension journals flow executions", async () => {
      const journal = new Map();
      const journalingExt = createJournalingExtension(journal);

      const impl = flow({
        name: "test.journal-ext",
        input: custom<{ value: number }>(),
        success: custom<{ result: number }>(),
        error: custom<{ code: string }>(),
        handler: async (ctx, input) => {
          return ctx.ok({ result: input.value * 2 });
        }
      });

      await flow.execute(impl, { value: 5 }, {
        extensions: [journalingExt],
      });

      expect(journal.size).toBeGreaterThan(0);
    });
  });

  describe("nested pod isolation", () => {
    test("child flow creates nested pod", async () => {
      let parentPodDepth = -1;
      let childPodDepth = -1;

      const childImpl = flow<Record<string, never>, { depth: number }, { code: string }>({
        name: "child-pod-flow",
        handler: async (ctx, input) => {
          childPodDepth = ctx.pod.getDepth();
          return ctx.ok({ depth: childPodDepth });
        }
      });

      const parentImpl = flow<
        Record<string, never>,
        { parentDepth: number; childDepth: number },
        { code: string }
      >({
        name: "parent-pod-flow",
        handler: async (ctx, input) => {
          parentPodDepth = ctx.pod.getDepth();
          const childResult = await ctx.flow(childImpl, {});

          return ctx.ok({
            parentDepth: parentPodDepth,
            childDepth: childResult.isOk() ? childResult.data.depth : -1,
          });
        }
      });

      const result = await flow.execute(parentImpl, {});

      assertOk(result);
      expect(result.data.childDepth).toBe(result.data.parentDepth + 1);
    });
  });

  describe("type definition patterns", () => {
    test("pattern 1: generic type parameters only", async () => {
      const impl = flow<{ value: number }, { result: number }, { code: string }>({
        name: "generic-types-flow",
        handler: async (ctx, input) => {
          return ctx.ok({ result: input.value * 2 });
        }
      });

      const result = await flow.execute(impl, { value: 5 });

      assertOk(result);
      expect(result.data.result).toBe(10);
    });

    test("pattern 2: explicit schemas only", async () => {
      const impl = flow({
        name: "explicit-schemas-flow",
        input: custom<{ value: number }>(),
        success: custom<{ doubled: number }>(),
        error: custom<{ code: string }>(),
        handler: async (ctx, input) => {
          return ctx.ok({ doubled: input.value * 2 });
        }
      });

      const result = await flow.execute(impl, { value: 7 });

      assertOk(result);
      expect(result.data.doubled).toBe(14);
    });

    test("pattern 1 with complex error handling", async () => {
      const impl = flow<
        { shouldFail: boolean },
        { success: true },
        { code: string; message: string }
      >({
        name: "generic-error-flow",
        handler: async (ctx, input) => {
          if (input.shouldFail) {
            return ctx.ko({ code: "FAILED", message: "Operation failed" });
          }
          return ctx.ok({ success: true });
        }
      });

      const errorResult = await flow.execute(impl, { shouldFail: true });
      assertKo(errorResult);
      expect(errorResult.data.code).toBe("FAILED");

      const successResult = await flow.execute(impl, { shouldFail: false });
      assertOk(successResult);
      expect(successResult.data.success).toBe(true);
    });
  });
});
