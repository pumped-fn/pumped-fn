import { describe, test, expect, vi } from "vitest";
import { flow, FlowError, provide, flowMeta, Promised, tag } from "../src";
import { custom } from "../src/ssch";

describe("Flow API - New Patterns", () => {
  describe("Nameless flows", () => {
    test("handler-only flow executes transformation", async () => {
      const double = flow((_ctx, input: number) => input * 2);

      const result = await flow.execute(double, 5);

      expect(result).toBe(10);
    });

    test("flow composes dependencies, nested flows, and operations", async () => {
      const fetchMock = vi.fn((url: string) =>
        Promise.resolve({ data: `fetched from ${url}` })
      );
      const apiService = provide(() => ({ fetch: fetchMock }));

      const fetchUserById = flow(apiService, async (api, ctx, userId: number) => {
        const response = await ctx.run("fetch-user", () =>
          api.fetch(`/users/${userId}`)
        );
        return { userId, username: `user${userId}`, raw: response.data };
      });

      const fetchPostsByUserId = flow(
        { api: apiService },
        async ({ api }, ctx, userId: number) => {
          const response = await ctx.run("fetch-posts", () =>
            api.fetch(`/posts?userId=${userId}`)
          );
          return { posts: [{ id: 1, title: "Post 1" }], raw: response.data };
        }
      );

      type UserWithPosts = {
        userId: number;
        username: string;
        raw: string;
        postCount: number;
      };
      const getUserWithPosts = flow(
        { api: apiService },
        async ({ api: _api }, ctx, userId: number): Promise<UserWithPosts> => {
          const user = await ctx.exec(fetchUserById, userId);
          const posts = await ctx.exec(fetchPostsByUserId, userId);
          const enriched = await ctx.run("enrich", () => ({
            ...user,
            postCount: posts.posts.length,
          }));
          return enriched;
        }
      );

      const result = await flow.execute(getUserWithPosts, 42);

      expect(result.userId).toBe(42);
      expect(result.username).toBe("user42");
      expect(result.postCount).toBe(1);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock).toHaveBeenCalledWith("/users/42");
      expect(fetchMock).toHaveBeenCalledWith("/posts?userId=42");
    });

    test("generic type parameters constrain input and output", async () => {
      const stringToNumber = flow<string, number>((_ctx, input) => {
        return Number(input);
      });

      const result = await flow.execute(stringToNumber, "42");

      expect(result).toBe(42);
    });
  });

  describe("Void input flows", () => {
    test("void input flow executes without parameters", async () => {
      const constant = flow<void, number>(() => {
        return 42;
      });

      const result = await flow.execute(constant, undefined);

      expect(result).toBe(42);
    });

    test("void input flow works with execution options", async () => {
      const greet = flow<void, string>(() => {
        return "hello";
      });

      const result = await flow.execute(greet, undefined, {
        extensions: [],
      });

      expect(result).toBe("hello");
    });

    test("void input sub-flow composes with parent flow", async () => {
      const getBaseValue = flow<void, number>(() => {
        return 100;
      });
      const incrementValue = flow<void, number>(async (ctx) => {
        const base = await ctx.exec(getBaseValue, undefined);
        return base + 1;
      });

      const result = await flow.execute(incrementValue, undefined);

      expect(result).toBe(101);
    });
  });

  describe("Dependency injection", () => {
    test("flow injects dependencies into handler", async () => {
      const appConfig = provide(() => ({ multiplier: 10 }));
      const multiplyByConfig = flow(
        { config: appConfig },
        ({ config }, _ctx, input: number): number => {
          return input * config.multiplier;
        }
      );

      const result: number = await flow.execute(multiplyByConfig, 5);

      expect(result).toBe(50);
    });

    test("flow combines dependencies with definition metadata", async () => {
      const loggerService = provide(() => ({ log: vi.fn() }));
      const upperCaseWithLogging = flow(
        loggerService,
        {
          name: "logger-flow",
          input: custom<string>(),
          output: custom<string>(),
        },
        (logger, _ctx, input) => {
          logger.log(`Processing: ${input}`);
          return input.toUpperCase();
        }
      );

      const result = await flow.execute(upperCaseWithLogging, "hello");

      expect(result).toBe("HELLO");
    });
  });

  describe("Basic flow creation", () => {
    test("generic type parameters define input and output", async () => {
      const doubleValue = flow<{ value: number }, { result: number }>(
        (_ctx, input) => {
          return { result: input.value * 2 };
        }
      );

      const result = await flow.execute(doubleValue, { value: 5 });

      expect(result.result).toBe(10);
    });

    test("definition with schemas provides type inference", async () => {
      const tripleValue = flow(
        {
          name: "triple",
          input: custom<{ value: number }>(),
          output: custom<{ result: number }>(),
        },
        (_ctx, input) => {
          return { result: input.value * 3 };
        }
      );

      const result = await flow.execute(tripleValue, { value: 5 });

      expect(result.result).toBe(15);
    });

    test("flow.define().handler() separates definition from implementation", async () => {
      const squareDefinition = flow({
        name: "square",
        input: custom<{ x: number }>(),
        output: custom<{ y: number }>(),
      });
      const squareFlow = squareDefinition.handler((_ctx, input) => {
        return { y: input.x * input.x };
      });

      const result = await flow.execute(squareFlow, { x: 4 });

      expect(result.y).toBe(16);
    });
  });

  describe("ctx.run() - journaling", () => {
    test("ctx.run journals and executes operations", async () => {
      const fetchData = vi.fn(() => Promise.resolve("data"));
      const loadData = flow<{ url: string }, { data: string }>(
        async (ctx, _input) => {
          const data = await ctx.run("fetch", () => fetchData());
          return { data };
        }
      );

      const result = await flow.execute(loadData, { url: "http://test.com" });

      expect(result.data).toBe("data");
      expect(fetchData).toHaveBeenCalledTimes(1);
    });

    test("ctx.run deduplicates operations with same key", async () => {
      let executionCount = 0;
      const incrementCounter = vi.fn(() => ++executionCount);
      const deduplicatedOps = flow<Record<string, never>, { value: number }>(
        async (ctx, _input) => {
          const firstCall = await ctx.run("op", () => incrementCounter());
          await ctx.run("op", () => incrementCounter());
          return { value: firstCall };
        }
      );

      const result = await flow.execute(deduplicatedOps, {});

      expect(result.value).toBe(1);
      expect(incrementCounter).toHaveBeenCalledTimes(1);
    });
  });

  describe("Error handling", () => {
    test("flow throws FlowError on handler failure", async () => {
      const conditionalFlow = flow<{ shouldFail: boolean }, { success: boolean }>(
        (_ctx, input) => {
          if (input.shouldFail) {
            throw new FlowError("Operation failed", "FAILED");
          }
          return { success: true };
        }
      );

      await expect(
        flow.execute(conditionalFlow, { shouldFail: true })
      ).rejects.toThrow(FlowError);

      const result = await flow.execute(conditionalFlow, { shouldFail: false });

      expect(result.success).toBe(true);
    });
  });

  describe("ctx.exec() - sub-flows", () => {
    test("ctx.exec executes nested sub-flow", async () => {
      const doubleNumber = flow<{ n: number }, { doubled: number }>(
        (_ctx, input) => {
          return { doubled: input.n * 2 };
        }
      );
      const processValue = flow<{ value: number }, { result: number }>(
        async (ctx, input) => {
          const doubled = await ctx.exec(doubleNumber, { n: input.value });
          return { result: doubled.doubled };
        }
      );

      const result = await flow.execute(processValue, { value: 10 });

      expect(result.result).toBe(20);
    });
  });

  describe("ctx.parallel()", () => {
    test("ctx.parallel executes multiple flows concurrently", async () => {
      const doubleAsync = flow<{ x: number }, { r: number }>(async (_ctx, input) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { r: input.x * 2 };
      });
      const tripleAsync = flow<{ x: number }, { r: number }>(async (_ctx, input) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { r: input.x * 3 };
      });
      const combineResults = flow<{ val: number }, { sum: number }>(
        async (ctx, input) => {
          const doublePromise = ctx.exec(doubleAsync, { x: input.val });
          const triplePromise = ctx.exec(tripleAsync, { x: input.val });
          const parallel = await ctx.parallel([doublePromise, triplePromise]);

          const sum = parallel.results[0].r + parallel.results[1].r;
          return { sum };
        }
      );

      const result = await flow.execute(combineResults, { val: 5 });

      expect(result.sum).toBe(25);
    });
  });

  describe("ctx.parallelSettled()", () => {
    test("ctx.parallelSettled collects successes and failures", async () => {
      const successFlow = flow<Record<string, never>, { ok: boolean }>(() => ({
        ok: true,
      }));
      const failureFlow = flow(() => {
        throw new FlowError("Failed", "ERR");
      });
      const gatherResults = flow<
        Record<string, never>,
        { succeeded: number; failed: number }
      >(async (ctx, _input) => {
        const first = ctx.exec(successFlow, {});
        const second = ctx.exec(failureFlow, {});
        const third = ctx.exec(successFlow, {});
        const settled = await ctx.parallelSettled([first, second, third]);

        return {
          succeeded: settled.stats.succeeded,
          failed: settled.stats.failed,
        };
      });

      const result = await flow.execute(gatherResults, {});

      expect(result.succeeded).toBe(2);
      expect(result.failed).toBe(1);
    });
  });

  describe("Promised FP operations", () => {
    test("map transforms successful execution result", async () => {
      const getNumber = flow<void, number>(() => 42);

      const result = await flow
        .execute(getNumber, undefined)
        .map((n) => n * 2)
        .map((n) => n.toString());

      expect(result).toBe("84");
    });

    test("switch chains flow execution with result", async () => {
      const getInitialValue = flow<void, number>(() => 5);
      const formatNumber = flow<number, string>((_, input) => {
        return `Number: ${input}`;
      });

      const result = await flow
        .execute(getInitialValue, undefined)
        .switch((value) => flow.execute(formatNumber, value));

      expect(result).toBe("Number: 5");
    });

    test("mapError transforms error before propagation", async () => {
      const throwError = flow<void, number>(() => {
        throw new Error("Original error");
      });

      try {
        await flow.execute(throwError, undefined).mapError((err: unknown) => {
          return new Error(`Transformed: ${(err as Error).message}`);
        });
        throw new Error("Should have thrown");
      } catch (error: any) {
        expect(error.message).toBe("Transformed: Original error");
      }
    });

    test("switchError recovers from failure with fallback flow", async () => {
      const failingOperation = flow<void, number>(() => {
        throw new FlowError("Failed", "ERR");
      });
      const fallbackValue = flow<void, number>(() => 99);

      const result = await flow
        .execute(failingOperation, undefined)
        .switchError(() => flow.execute(fallbackValue, undefined));

      expect(result).toBe(99);
    });

    test("FP operations chain sequentially", async () => {
      const getUserData = flow<void, { id: number; name: string }>(() => ({
        id: 1,
        name: "Alice",
      }));

      const result = await flow
        .execute(getUserData, undefined)
        .map((user) => user.name)
        .map((name) => name.toUpperCase())
        .map((name) => `Hello, ${name}!`);

      expect(result).toBe("Hello, ALICE!");
    });
  });

  describe("Execution context access", () => {
    test("execution.ctx() provides metadata after completion", async () => {
      const processValue = flow(async (ctx, input: { value: number }) => {
        await ctx.run("operation", () => input.value * 2);
        return { result: input.value };
      });

      const execution = flow.execute(processValue, { value: 42 });
      const result = await execution;
      const metadata = await execution.ctx();

      expect(result.result).toBe(42);
      expect(metadata).toBeDefined();
      expect(metadata?.context.find(flowMeta.flowName)).toBe("anonymous");
      expect(metadata?.context.get(flowMeta.depth)).toBe(0);
      expect(metadata?.context.get(flowMeta.isParallel)).toBe(false);
    });

    test("inDetails() returns result and context on success", async () => {
      const calculateBoth = flow(async (ctx, input: { x: number; y: number }) => {
        const sum = await ctx.run("sum", () => input.x + input.y);
        const product = await ctx.run("product", () => input.x * input.y);
        return { sum, product };
      });

      const details = await flow.execute(calculateBoth, { x: 5, y: 3 }).inDetails();

      expect(details.success).toBe(true);
      if (details.success) {
        expect(details.result.sum).toBe(8);
        expect(details.result.product).toBe(15);
      }
      expect(details.ctx).toBeDefined();

      const journal = details.ctx.context.find(flowMeta.journal);
      expect(journal?.size).toBeGreaterThan(0);
    });

    test("journal tracks all ctx.run operations", async () => {
      const multiStepCalculation = flow(async (ctx, input: number) => {
        const doubled = await ctx.run("double", () => input * 2);
        const tripled = await ctx.run("triple", () => input * 3);
        const combined = await ctx.run("sum", () => doubled + tripled);
        return combined;
      });

      const execution = flow.execute(multiStepCalculation, 10);
      await execution;
      const metadata = await execution.ctx();

      expect(metadata).toBeDefined();
      const journal = metadata?.context.find(flowMeta.journal);
      expect(journal?.size).toBe(3);

      const journalKeys = Array.from(journal?.keys() || []);
      expect(journalKeys.some((k) => k.includes("double"))).toBe(true);
      expect(journalKeys.some((k) => k.includes("triple"))).toBe(true);
      expect(journalKeys.some((k) => k.includes("sum"))).toBe(true);
    });

    test("context stores custom accessor values", async () => {
      const processingKey = tag(custom<string>(), { label: "customKey" });
      const storeCustomValue = flow(async (ctx, input: string) => {
        ctx.set(processingKey, `processed-${input}`);
        return input.toUpperCase();
      });

      const execution = flow.execute(storeCustomValue, "hello");
      await execution;
      const metadata = await execution.ctx();

      expect(metadata).toBeDefined();
      expect(metadata?.context.find(processingKey)).toBe("processed-hello");
    });

    test("inDetails() preserves context on error", async () => {
      const operationWithError = flow(async (ctx, input: number) => {
        await ctx.run("before-error", () => input * 2);
        throw new Error("test error");
      });

      const details = await flow.execute(operationWithError, 5).inDetails();

      expect(details.success).toBe(false);
      if (!details.success) {
        expect((details.error as Error).message).toBe("test error");
      }
      expect(details.ctx).toBeDefined();

      const journal = details.ctx.context.find(flowMeta.journal);
      expect(journal?.size).toBeGreaterThan(0);
    });

    test("flowMeta captures execution hierarchy metadata", async () => {
      const incrementFlow = flow(
        {
          name: "subFlow",
          input: custom<number>(),
          output: custom<number>(),
        },
        async (_ctx, input: number) => {
          return input + 1;
        }
      );
      const doubleAfterIncrement = flow(
        {
          name: "mainFlow",
          input: custom<number>(),
          output: custom<number>(),
        },
        async (ctx, input: number) => {
          const incremented = await ctx.exec(incrementFlow, input);
          return incremented * 2;
        }
      );

      const execution = flow.execute(doubleAfterIncrement, 5);
      await execution;
      const metadata = await execution.ctx();

      expect(metadata).toBeDefined();
      expect(metadata?.context.find(flowMeta.flowName)).toBe("mainFlow");
      expect(metadata?.context.get(flowMeta.depth)).toBe(0);
      expect(metadata?.context.find(flowMeta.parentFlowName)).toBeUndefined();
    });

    test("inDetails() works after promise transformations", async () => {
      const doubleValue = flow(async (ctx, input: number) => {
        await ctx.run("increment", () => input + 1);
        return input * 2;
      });

      const details = await flow
        .execute(doubleValue, 10)
        .map((x) => x + 1)
        .inDetails();

      expect(details.success).toBe(true);
      if (details.success) {
        expect(details.result).toBe(21);
      }
      expect(details.ctx).toBeDefined();
    });

    test("inDetails() discriminates success and failure types", async () => {
      const maybeFailFlow = flow(async (ctx, shouldFail: boolean) => {
        await ctx.run("check", () => shouldFail);
        if (shouldFail) {
          throw new Error("failed");
        }
        return "success";
      });

      const successDetails = await flow
        .execute(maybeFailFlow, false)
        .inDetails();

      expect(successDetails.success).toBe(true);
      if (successDetails.success) {
        expect(successDetails.result).toBe("success");
      }

      const errorDetails = await flow.execute(maybeFailFlow, true).inDetails();

      expect(errorDetails.success).toBe(false);
      if (!errorDetails.success) {
        expect((errorDetails.error as Error).message).toBe("failed");
      }
      expect(errorDetails.ctx).toBeDefined();
    });
  });

  describe("details option", () => {
    test("details:false returns unwrapped result", async () => {
      const doubleValue = flow((_ctx, input: number) => input * 2);

      const result = await flow.execute(doubleValue, 5, { details: false });

      expect(result).toBe(10);
    });

    test("details:true returns wrapped result with context", async () => {
      const incrementValue = flow((_ctx, input: number) => input + 1);
      const processNested = flow(async (ctx, input: number) => {
        const incremented = await ctx.exec(incrementValue, input);
        return incremented * 2;
      });

      const details = await flow.execute(processNested, 5, { details: true });

      expect(details.success).toBe(true);
      if (details.success) {
        expect(details.result).toBe(12);
        expect(details.ctx).toBeDefined();
        expect(details.ctx.context.get(flowMeta.depth)).toBe(0);
      }
    });
  });
});
