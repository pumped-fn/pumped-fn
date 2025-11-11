import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { flow } from "../src";

describe("ctx.exec timer cleanup", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("cleans up timeout when flow execution completes successfully", async () => {
    const innerFlow = flow(async (_ctx, input: number) => {
      return input * 2;
    });

    const outerFlow = flow(async (ctx, input: number) => {
      const result = await ctx.exec({ flow: innerFlow, input, timeout: 5000 });
      return result;
    });

    const timerCountBefore = vi.getTimerCount();
    await flow.execute(outerFlow, 42);
    const timerCountAfter = vi.getTimerCount();

    expect(timerCountAfter).toBe(timerCountBefore);
  });

  test("cleans up timeout when flow execution fails", async () => {
    const innerFlow = flow(async (_ctx, _input: number) => {
      throw new Error("Flow failed");
    });

    const outerFlow = flow(async (ctx, input: number) => {
      try {
        await ctx.exec({ flow: innerFlow, input, timeout: 5000 });
      } catch {
        return -1;
      }
      return 0;
    });

    const timerCountBefore = vi.getTimerCount();
    await flow.execute(outerFlow, 42);
    const timerCountAfter = vi.getTimerCount();

    expect(timerCountAfter).toBe(timerCountBefore);
  });

  test("cleans up timeout when journaled flow execution completes", async () => {
    const innerFlow = flow(async (_ctx, input: number) => {
      return input * 2;
    });

    const outerFlow = flow(async (ctx, input: number) => {
      const result = await ctx.exec({ key: "test-key", flow: innerFlow, input, timeout: 5000 });
      return result;
    });

    const timerCountBefore = vi.getTimerCount();
    await flow.execute(outerFlow, 42);
    const timerCountAfter = vi.getTimerCount();

    expect(timerCountAfter).toBe(timerCountBefore);
  });

  test("cleans up timeout when journaled fn execution completes", async () => {
    const outerFlow = flow(async (ctx, input: number) => {
      const result = await ctx.exec({
        key: "fn-key",
        fn: (x: number) => x * 3,
        params: [input],
        timeout: 5000,
      });
      return result;
    });

    const timerCountBefore = vi.getTimerCount();
    await flow.execute(outerFlow, 42);
    const timerCountAfter = vi.getTimerCount();

    expect(timerCountAfter).toBe(timerCountBefore);
  });

  test("cleans up timeout when non-journaled fn execution completes", async () => {
    const outerFlow = flow(async (ctx, input: number) => {
      const result = await ctx.exec({
        fn: (x: number) => x * 3,
        params: [input],
        timeout: 5000,
      });
      return result;
    });

    const timerCountBefore = vi.getTimerCount();
    await flow.execute(outerFlow, 42);
    const timerCountAfter = vi.getTimerCount();

    expect(timerCountAfter).toBe(timerCountBefore);
  });
});
