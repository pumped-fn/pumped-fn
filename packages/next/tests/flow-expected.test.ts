import { describe, test, expect, vi } from "vitest";
import { flow, FlowError, provide, flowMeta } from "../src";
import { custom } from "../src/ssch";
import { accessor } from "../src/accessor";

describe("Flow API - New Patterns", () => {
  describe("Nameless flows", () => {
    test("shortest form - handler only", async () => {
      const double = flow((_ctx, input: number) => input * 2);

      const result = await flow.execute(double, 5);
      expect(result).toBe(10);
    });

    test("shortest form with dependencies, nested flow, and operations", async () => {
      const fetchMock = vi.fn((url: string) =>
        Promise.resolve({ data: `fetched from ${url}` })
      );
      const api = provide(() => ({ fetch: fetchMock }));

      const fetchUser = flow(api, async (api, ctx, id: number) => {
        const response = await ctx.run("fetch-user", () =>
          api.fetch(`/users/${id}`)
        );
        return { userId: id, username: `user${id}`, raw: response.data };
      });

      const fetchPosts = flow({ api }, async ({ api }, ctx, userId: number) => {
        const response = await ctx.run("fetch-posts", () =>
          api.fetch(`/posts?userId=${userId}`)
        );
        return { posts: [{ id: 1, title: "Post 1" }], raw: response.data };
      });

      type UserWithPosts = {
        userId: number;
        username: string;
        raw: string;
        postCount: number;
      };
      const getUserWithPosts = flow(
        { api },
        async ({ api: _api }, ctx, userId: number): Promise<UserWithPosts> => {
          const user = await ctx.exec(fetchUser, userId);
          const posts = await ctx.exec(fetchPosts, userId);
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

    test("handler only with explicit generics", async () => {
      const impl = flow<{ value: number }, { result: number }>(
        (_ctx, input) => {
          return { result: input.value * 2 };
        }
      );

      const result = await flow.execute(impl, { value: 5 });
      expect(result.result).toBe(10);
    });

    test("simple transformation", async () => {
      const stringToNumber = flow<string, number>((_ctx, input) => {
        return Number(input);
      });

      const result = await flow.execute(stringToNumber, "42");
      expect(result).toBe(42);
    });

    test("nameless with optional name for journaling", async () => {
      const impl = flow<{ val: number }, { result: number }>((_ctx, input) => {
        return { result: input.val + 1 };
      });

      const result = await flow.execute(impl, { val: 99 });
      expect(result.result).toBe(100);
    });
  });

  describe("Void input flows", () => {
    test("flow with void input - no parameter needed", async () => {
      const noInput = flow<void, number>(() => {
        return 42;
      });

      const result = await flow.execute(noInput, undefined);
      expect(result).toBe(42);
    });

    test("flow with void input - with extensions", async () => {
      const noInput = flow<void, string>(() => {
        return "hello";
      });

      const result = await flow.execute(noInput, undefined, {
        extensions: [],
      });
      expect(result).toBe("hello");
    });

    test("sub-flow with void input", async () => {
      const noInputSub = flow<void, number>(() => {
        return 100;
      });

      const main = flow<void, number>(async (ctx) => {
        const sub = await ctx.exec(noInputSub, undefined);
        return sub + 1;
      });

      const result = await flow.execute(main, undefined);
      expect(result).toBe(101);
    });
  });

  describe("Dependency injection", () => {
    test("nameless with dependencies", async () => {
      const config = provide(() => ({ multiplier: 10 }));

      const multiply = flow(
        { config },
        ({ config }, _ctx, input: number): number => {
          return input * config.multiplier;
        }
      );

      const result: number = await flow.execute(multiply, 5);
      expect(result).toBe(50);
    });

    test("dependencies with definition", async () => {
      const logger = provide(() => ({ log: vi.fn() }));

      const loggedFlow = flow(
        logger,
        {
          name: "logger-flow",
          input: custom<string>(),
          output: custom<string>(),
        },
        (deps, _ctx, input) => {
          deps.log(`Processing: ${input}`);
          return input.toUpperCase();
        }
      );

      const result = await flow.execute(loggedFlow, "hello");
      expect(result).toBe("HELLO");
    });
  });

  describe("Basic flow creation", () => {
    test("pattern 1: generic types with handler", async () => {
      const impl = flow<{ value: number }, { result: number }>(
        (_ctx, input) => {
          return { result: input.value * 2 };
        }
      );

      const result = await flow.execute(impl, { value: 5 });
      expect(result.result).toBe(10);
    });

    test("pattern 2: schema-based with inferred types", async () => {
      const impl = flow(
        {
          name: "triple",
          input: custom<{ value: number }>(),
          output: custom<{ result: number }>(),
        },
        (_ctx, input) => {
          return { result: input.value * 3 };
        }
      );

      const result = await flow.execute(impl, { value: 5 });
      expect(result.result).toBe(15);
    });

    test("pattern 3: definition then handler", async () => {
      const definition = flow({
        name: "square",
        input: custom<{ x: number }>(),
        output: custom<{ y: number }>(),
      });

      const impl = definition.handler((_ctx, input) => {
        return { y: input.x * input.x };
      });

      const result = await flow.execute(impl, { x: 4 });
      expect(result.y).toBe(16);
    });
  });

  describe("ctx.run() - journaling", () => {
    test("executes and journals operations", async () => {
      const fetchMock = vi.fn(() => Promise.resolve("data"));

      const impl = flow<{ url: string }, { data: string }>(
        async (ctx, _input) => {
          const data = await ctx.run("fetch", () => fetchMock());
          return { data };
        }
      );

      const result = await flow.execute(impl, { url: "http://test.com" });
      expect(result.data).toBe("data");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    test("replays from journal", async () => {
      let count = 0;
      const op = vi.fn(() => ++count);

      const impl = flow<Record<string, never>, { value: number }>(
        async (ctx, _input) => {
          const v1 = await ctx.run("op", () => op());
          await ctx.run("op", () => op());
          return { value: v1 };
        }
      );

      const result = await flow.execute(impl, {});
      expect(result.value).toBe(1);
      expect(op).toHaveBeenCalledTimes(1);
    });
  });

  describe("Error handling", () => {
    test("throws FlowError on failure", async () => {
      const impl = flow<{ shouldFail: boolean }, { success: boolean }>(
        (_ctx, input) => {
          if (input.shouldFail) {
            throw new FlowError("Operation failed", "FAILED");
          }
          return { success: true };
        }
      );

      await expect(flow.execute(impl, { shouldFail: true })).rejects.toThrow(
        FlowError
      );

      const result = await flow.execute(impl, { shouldFail: false });
      expect(result.success).toBe(true);
    });
  });

  describe("ctx.exec() - sub-flows", () => {
    test("executes sub-flow", async () => {
      const subFlow = flow<{ n: number }, { doubled: number }>(
        (_ctx, input) => {
          return { doubled: input.n * 2 };
        }
      );

      const mainFlow = flow<{ value: number }, { result: number }>(
        async (ctx, input) => {
          const sub = await ctx.exec(subFlow, { n: input.value });
          return { result: sub.doubled };
        }
      );

      const result = await flow.execute(mainFlow, { value: 10 });
      expect(result.result).toBe(20);
    });
  });

  describe("ctx.parallel()", () => {
    test("executes flows in parallel", async () => {
      const flow1 = flow<{ x: number }, { r: number }>(async (_ctx, input) => {
        await new Promise((r) => setTimeout(r, 10));
        return { r: input.x * 2 };
      });

      const flow2 = flow<{ x: number }, { r: number }>(async (_ctx, input) => {
        await new Promise((r) => setTimeout(r, 10));
        return { r: input.x * 3 };
      });

      const main = flow<{ val: number }, { sum: number }>(
        async (ctx, input) => {
          const p1 = ctx.exec(flow1, { x: input.val });
          const p2 = ctx.exec(flow2, { x: input.val });
          const result = await ctx.parallel([p1, p2]);

          const sum = result.results[0].r + result.results[1].r;
          return { sum };
        }
      );

      const result = await flow.execute(main, { val: 5 });
      expect(result.sum).toBe(25);
    });
  });

  describe("ctx.parallelSettled()", () => {
    test("handles partial failures", async () => {
      const success = flow<Record<string, never>, { ok: boolean }>(() => ({
        ok: true,
      }));

      const failure = flow(() => {
        throw new FlowError("Failed", "ERR");
      });

      const main = flow<
        Record<string, never>,
        { succeeded: number; failed: number }
      >(async (ctx, _input) => {
        const p1 = ctx.exec(success, {});
        const p2 = ctx.exec(failure, {});
        const p3 = ctx.exec(success, {});
        const result = await ctx.parallelSettled([p1, p2, p3]);

        return {
          succeeded: result.stats.succeeded,
          failed: result.stats.failed,
        };
      });

      const result = await flow.execute(main, {});
      expect(result.succeeded).toBe(2);
      expect(result.failed).toBe(1);
    });
  });

  describe("FlowPromise FP operations", () => {
    test("map - transform success value", async () => {
      const getNumber = flow<void, number>(() => 42);

      const result = await flow
        .execute(getNumber, undefined)
        .map((n) => n * 2)
        .map((n) => n.toString());

      expect(result).toBe("84");
    });

    test("switch - chain flows", async () => {
      const firstFlow = flow<void, number>(() => 5);
      const secondFlow = flow<number, string>((_, input) => {
        return `Number: ${input}`;
      });

      const result = await flow
        .execute(firstFlow, undefined)
        .switch((num) => flow.execute(secondFlow, num));

      expect(result).toBe("Number: 5");
    });

    test("mapError - transform error", async () => {
      const failingFlow = flow<void, number>(() => {
        throw new Error("Original error");
      });

      try {
        await flow.execute(failingFlow, undefined).mapError((err: unknown) => {
          return new Error(`Transformed: ${(err as Error).message}`);
        });
        throw new Error("Should have thrown");
      } catch (error: any) {
        expect(error.message).toBe("Transformed: Original error");
      }
    });

    test("switchError - recover from error", async () => {
      const failingFlow = flow<void, number>(() => {
        throw new FlowError("Failed", "ERR");
      });

      const fallbackFlow = flow<void, number>(() => 99);

      const result = await flow
        .execute(failingFlow, undefined)
        .switchError(() => flow.execute(fallbackFlow, undefined));

      expect(result).toBe(99);
    });

    test("chaining multiple FP operations", async () => {
      const getUser = flow<void, { id: number; name: string }>(() => ({
        id: 1,
        name: "Alice",
      }));

      const result = await flow
        .execute(getUser, undefined)
        .map((user) => user.name)
        .map((name) => name.toUpperCase())
        .map((name) => `Hello, ${name}!`);

      expect(result).toBe("Hello, ALICE!");
    });
  });

  describe("Execution context access", () => {
    test("ctx() returns execution data after flow completes", async () => {
      const testFlow = flow(async (ctx, input: { value: number }) => {
        await ctx.run("operation", () => input.value * 2);
        return { result: input.value };
      });

      const execution = flow.execute(testFlow, { value: 42 });
      const result = await execution;
      const executionData = await execution.ctx();

      expect(result.result).toBe(42);
      expect(executionData).toBeDefined();
      expect(executionData?.context.find(flowMeta.flowName)).toBe(
        "anonymous"
      );
      expect(executionData?.context.get(flowMeta.depth)).toBe(0);
      expect(executionData?.context.get(flowMeta.isParallel)).toBe(
        false
      );
    });

    test("inDetails() returns both result and context on success", async () => {
      const testFlow = flow(async (ctx, input: { x: number; y: number }) => {
        const sum = await ctx.run("sum", () => input.x + input.y);
        const product = await ctx.run("product", () => input.x * input.y);
        return { sum, product };
      });

      const details = await flow
        .execute(testFlow, { x: 5, y: 3 })
        .inDetails();

      expect(details.success).toBe(true);
      if (details.success) {
        expect(details.result.sum).toBe(8);
        expect(details.result.product).toBe(15);
      }
      expect(details.ctx).toBeDefined();
      const journal = details.ctx.context.find(flowMeta.journal);
      expect(journal?.size).toBeGreaterThan(0);
    });

    test("journal captures all operations", async () => {
      const testFlow = flow(async (ctx, input: number) => {
        const a = await ctx.run("double", () => input * 2);
        const b = await ctx.run("triple", () => input * 3);
        const c = await ctx.run("sum", () => a + b);
        return c;
      });

      const execution = flow.execute(testFlow, 10);
      await execution;
      const executionData = await execution.ctx();

      expect(executionData).toBeDefined();
      const journal = executionData?.context.find(flowMeta.journal);
      expect(journal?.size).toBe(3);

      const journalKeys = Array.from(journal?.keys() || []);
      expect(journalKeys.some((k) => k.includes("double"))).toBe(true);
      expect(journalKeys.some((k) => k.includes("triple"))).toBe(true);
      expect(journalKeys.some((k) => k.includes("sum"))).toBe(true);
    });

    test("contextData captures custom context values", async () => {
      const customAccessor = accessor("customKey", custom<string>());
      const testFlow = flow(async (ctx, input: string) => {
        ctx.set(customAccessor, `processed-${input}`);
        return input.toUpperCase();
      });

      const execution = flow.execute(testFlow, "hello");
      await execution;
      const executionData = await execution.ctx();

      expect(executionData).toBeDefined();
      expect(executionData?.context.find(customAccessor)).toBe(
        "processed-hello"
      );
    });

    test("inDetails() captures context even on error", async () => {
      const failingFlow = flow(async (ctx, input: number) => {
        await ctx.run("before-error", () => input * 2);
        throw new Error("test error");
      });

      const details = await flow.execute(failingFlow, 5).inDetails();

      expect(details.success).toBe(false);
      if (!details.success) {
        expect((details.error as Error).message).toBe("test error");
      }
      expect(details.ctx).toBeDefined();
      const journal = details.ctx.context.find(flowMeta.journal);
      expect(journal?.size).toBeGreaterThan(0);
    });

    test("flowMeta tracks flow execution hierarchy", async () => {
      const subFlow = flow(
        {
          name: "subFlow",
          input: custom<number>(),
          output: custom<number>(),
        },
        async (_ctx, input: number) => {
          return input + 1;
        }
      );

      const mainFlow = flow(
        {
          name: "mainFlow",
          input: custom<number>(),
          output: custom<number>(),
        },
        async (ctx, input: number) => {
          const result = await ctx.exec(subFlow, input);
          return result * 2;
        }
      );

      const execution = flow.execute(mainFlow, 5);
      await execution;
      const executionData = await execution.ctx();

      expect(executionData).toBeDefined();
      expect(executionData?.context.find(flowMeta.flowName)).toBe(
        "mainFlow"
      );
      expect(executionData?.context.get(flowMeta.depth)).toBe(0);
      expect(
        executionData?.context.find(flowMeta.parentFlowName)
      ).toBeUndefined();
    });

    test("inDetails() works with transformed promises", async () => {
      const testFlow = flow(async (ctx, input: number) => {
        await ctx.run("increment", () => input + 1);
        return input * 2;
      });

      const details = await flow
        .execute(testFlow, 10)
        .map((x) => x + 1)
        .inDetails();

      expect(details.success).toBe(true);
      if (details.success) {
        expect(details.result).toBe(21);
      }
      expect(details.ctx).toBeDefined();
    });

    test("inDetails() type discrimination", async () => {
      const conditionalFlow = flow(async (ctx, shouldFail: boolean) => {
        await ctx.run("check", () => shouldFail);
        if (shouldFail) {
          throw new Error("failed");
        }
        return "success";
      });

      const successDetails = await flow.execute(conditionalFlow, false).inDetails();
      expect(successDetails.success).toBe(true);
      if (successDetails.success) {
        expect(successDetails.result).toBe("success");
      }

      const errorDetails = await flow.execute(conditionalFlow, true).inDetails();
      expect(errorDetails.success).toBe(false);
      if (!errorDetails.success) {
        expect((errorDetails.error as Error).message).toBe("failed");
      }
      expect(errorDetails.ctx).toBeDefined();
    });
  });
});
