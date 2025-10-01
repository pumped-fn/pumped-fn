import { describe, test, expect, vi } from "vitest";
import { flow } from "../src/flow";
import { custom } from "../src/ssch";
import { createJournalingExtension } from "../src/extensions/journaling";

describe("Flow Improved API", () => {
  describe("ctx.run() - journaled operations", () => {
    test("executes and journals a side effect", async () => {
      const testFlow = flow.define({
        name: "test.run",
        input: custom<{ url: string }>(),
        success: custom<{ data: string }>(),
        error: custom<{ code: string }>(),
      });

      const fetchMock = vi.fn(() => Promise.resolve("fetched-data"));

      const impl = testFlow.handler(async (ctx, input) => {
        const data = await ctx.run("fetch-api", () => fetchMock());
        return ctx.ok({ data });
      });

      const result = await flow.execute(impl, { url: "http://test.com" });

      expect(result.type).toBe("ok");
      expect((result.data as any).data).toBe("fetched-data");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    test("replays from journal on subsequent calls", async () => {
      const testFlow = flow.define({
        name: "test.replay",
        input: custom<{}>(),
        success: custom<{ value: number }>(),
        error: custom<{ code: string }>(),
      });

      let callCount = 0;
      const expensiveOp = vi.fn(() => {
        callCount++;
        return Promise.resolve(callCount);
      });

      const impl = testFlow.handler(async (ctx, input) => {
        const value1 = await ctx.run("expensive-op", () => expensiveOp());
        const value2 = await ctx.run("expensive-op", () => expensiveOp());

        return ctx.ok({ value: value1 });
      });

      const result = await flow.execute(impl, {});

      expect(result.type).toBe("ok");
      expect((result.data as any).value).toBe(1);
      expect(expensiveOp).toHaveBeenCalledTimes(1);
    });

    test("journals errors and replays them", async () => {
      const testFlow = flow.define({
        name: "test.error-journal",
        input: custom<{}>(),
        success: custom<{ value: string }>(),
        error: custom<{ code: string; message: string }>(),
      });

      const failingOp = vi.fn(() => Promise.reject(new Error("Operation failed")));

      const impl = testFlow.handler(async (ctx, input) => {
        try {
          await ctx.run("failing-op", () => failingOp());
          return ctx.ok({ value: "success" });
        } catch (error) {
          return ctx.ko({
            code: "OP_FAILED",
            message: (error as Error).message,
          });
        }
      });

      const result = await flow.execute(impl, {});

      expect(result.type).toBe("ko");
      expect((result.data as any).code).toBe("OP_FAILED");
      expect(failingOp).toHaveBeenCalledTimes(1);
    });
  });

  describe("ctx.flow() - simplified flow execution", () => {
    test("executes sub-flow with nested pod", async () => {
      const subFlow = flow.define({
        name: "sub-flow",
        input: custom<{ value: number }>(),
        success: custom<{ doubled: number }>(),
        error: custom<{ code: string }>(),
      });

      const subImpl = subFlow.handler(async (ctx, input) => {
        return ctx.ok({ doubled: input.value * 2 });
      });

      const mainFlow = flow.define({
        name: "main-flow",
        input: custom<{ value: number }>(),
        success: custom<{ result: number }>(),
        error: custom<{ code: string }>(),
      });

      const mainImpl = mainFlow.handler(async (ctx, input) => {
        const subResult = await ctx.flow(subImpl, { value: input.value });

        if (subResult.isKo()) {
          return ctx.ko(subResult.data);
        }

        return ctx.ok({ result: subResult.data.doubled });
      });

      const result = await flow.execute(mainImpl, { value: 5 });

      expect(result.type).toBe("ok");
      expect((result.data as any).result).toBe(10);
    });

    test("maintains isolation between nested flows", async () => {
      const contextKeyFlow = flow.define({
        name: "context-key-flow",
        input: custom<{ key: string; value: string }>(),
        success: custom<{ retrieved: string | undefined }>(),
        error: custom<{ code: string }>(),
      });

      const setterImpl = contextKeyFlow.handler(async (ctx, input) => {
        ctx.set(input.key, input.value);
        return ctx.ok({ retrieved: ctx.get(input.key) as string });
      });

      const mainFlow = flow.define({
        name: "main-isolation-flow",
        input: custom<{}>(),
        success: custom<{ parent: any; child1: any; child2: any }>(),
        error: custom<{ code: string }>(),
      });

      const mainImpl = mainFlow.handler(async (ctx, input) => {
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
      });

      const result = await flow.execute(mainImpl, {});

      expect(result.type).toBe("ok");
      const data = result.data as any;
      expect(data.parent).toBe("parent-value");
      expect(data.child1).toBe("child1-value");
      expect(data.child2).toBe("child2-value");
    });
  });

  describe("ctx.parallel() - parallel execution", () => {
    test("executes multiple flows in parallel", async () => {
      const flow1 = flow.define({
        name: "flow1",
        input: custom<{ value: number }>(),
        success: custom<{ result: number }>(),
        error: custom<{ code: string }>(),
      });

      const impl1 = flow1.handler(async (ctx, input) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return ctx.ok({ result: input.value * 2 });
      });

      const flow2 = flow.define({
        name: "flow2",
        input: custom<{ value: number }>(),
        success: custom<{ result: number }>(),
        error: custom<{ code: string }>(),
      });

      const impl2 = flow2.handler(async (ctx, input) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return ctx.ok({ result: input.value * 3 });
      });

      const mainFlow = flow.define({
        name: "main-parallel",
        input: custom<{ value: number }>(),
        success: custom<{ sum: number }>(),
        error: custom<{ code: string }>(),
      });

      const mainImpl = mainFlow.handler(async (ctx, input) => {
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
      });

      const result = await flow.execute(mainImpl, { value: 5 });

      expect(result.type).toBe("ok");
      expect((result.data as any).sum).toBe(25);
    });

    test("reports partial results when some flows fail", async () => {
      const successFlow = flow.define({
        name: "success-flow",
        input: custom<{}>(),
        success: custom<{ value: string }>(),
        error: custom<{ code: string }>(),
      });

      const successImpl = successFlow.handler(async (ctx, input) => {
        return ctx.ok({ value: "success" });
      });

      const failFlow = flow.define({
        name: "fail-flow",
        input: custom<{}>(),
        success: custom<{ value: string }>(),
        error: custom<{ code: string }>(),
      });

      const failImpl = failFlow.handler(async (ctx, input) => {
        return ctx.ko({ code: "FAILURE" });
      });

      const mainFlow = flow.define({
        name: "main-partial",
        input: custom<{}>(),
        success: custom<{ type: string; stats: any }>(),
        error: custom<{ code: string }>(),
      });

      const mainImpl = mainFlow.handler(async (ctx, input) => {
        const parallelResult = await ctx.parallel([
          [successImpl, {}],
          [failImpl, {}],
          [successImpl, {}],
        ] as const);

        return ctx.ok({
          type: parallelResult.type,
          stats: parallelResult.stats,
        });
      });

      const result = await flow.execute(mainImpl, {});

      expect(result.type).toBe("ok");
      const data = result.data as any;
      expect(data.type).toBe("partial");
      expect(data.stats.total).toBe(3);
      expect(data.stats.succeeded).toBe(2);
      expect(data.stats.failed).toBe(1);
    });
  });

  describe("journaling extension", () => {
    test("extension journals flow executions", async () => {
      const journal = new Map();
      const journalingExt = createJournalingExtension(journal);

      const testFlow = flow.define({
        name: "test.journal-ext",
        input: custom<{ value: number }>(),
        success: custom<{ result: number }>(),
        error: custom<{ code: string }>(),
      });

      const impl = testFlow.handler(async (ctx, input) => {
        return ctx.ok({ result: input.value * 2 });
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

      const childFlow = flow.define({
        name: "child-pod-flow",
        input: custom<{}>(),
        success: custom<{ depth: number }>(),
        error: custom<{ code: string }>(),
      });

      const childImpl = childFlow.handler(async (ctx, input) => {
        childPodDepth = (ctx as any).pod.getDepth();
        return ctx.ok({ depth: childPodDepth });
      });

      const parentFlow = flow.define({
        name: "parent-pod-flow",
        input: custom<{}>(),
        success: custom<{ parentDepth: number; childDepth: number }>(),
        error: custom<{ code: string }>(),
      });

      const parentImpl = parentFlow.handler(async (ctx, input) => {
        parentPodDepth = (ctx as any).pod.getDepth();
        const childResult = await ctx.flow(childImpl, {});

        return ctx.ok({
          parentDepth: parentPodDepth,
          childDepth: childResult.isOk() ? childResult.data.depth : -1,
        });
      });

      const result = await flow.execute(parentImpl, {});

      expect(result.type).toBe("ok");
      const data = result.data as any;
      expect(data.childDepth).toBe(data.parentDepth + 1);
    });
  });
});
