import { describe, test, expect, vi } from "vitest";
import { flow } from "../src/flow";
import { custom } from "../src/ssch";
import { accessor } from "../src/accessor";
import { testFlows, MockExecutors, scenarios } from "./test-utils";

describe("FlowV2", () => {
  describe("flow definition and metadata", () => {
    test("creates flow with correct name and default version", () => {
      const testFlow = testFlows.basic("test.flow");

      expect(testFlow.name).toBe("test.flow");
      expect(testFlow.version).toBe("1.0.0");
    });

    test("creates executable implementation from flow definition", async () => {
      const greetFlow = testFlows.generic(
        "greet",
        custom<{ name: string }>(),
        custom<{ message: string }>(),
        custom<{ code: string }>()
      );

      const greetImpl = greetFlow.handler(async (ctx, input) => {
        return ctx.ok({ message: `Hello ${(input as any).name}` });
      });

      expect(greetImpl).toBeDefined();
      expect(typeof greetImpl).toBe("object");
    });

    test.each(scenarios.mathOperations.slice(0, 1))(
      "executes successful mathematical operation: $name yields $expected",
      async ({ input, expected }) => {
        const mathFlow = testFlows.math("math.add");
        const addImpl = mathFlow.handler(async (ctx, input) => {
          return ctx.ok({ result: input.a + input.b });
        });

        const result = await flow.execute(addImpl, input);

        expect(result.type).toBe("ok");
        expect((result.data as any).result).toBe(expected);
      }
    );

    test("handles business logic errors gracefully with ko result", async () => {
      const divideFlow = testFlows.math("math.divide");
      const divideImpl = divideFlow.handler(async (ctx, input) => {
        if (input.b === 0) {
          return ctx.ko({
            code: "DIVIDE_BY_ZERO",
            message: "Cannot divide by zero",
          });
        }
        return ctx.ok({ result: input.a / input.b });
      });

      const result = await flow.execute(divideImpl, { a: 10, b: 0 });

      expect(result.type).toBe("ko");
      expect((result.data as any).code).toBe("DIVIDE_BY_ZERO");
      expect((result.data as any).message).toBe("Cannot divide by zero");
    });
  });

  describe("dependency injection and composition", () => {
    test.each(scenarios.userIds.slice(0, 1))(
      "injects database and logger dependencies to retrieve user $userId",
      async ({ userId, expectedName }) => {
        const dbExecutor = MockExecutors.database();
        const loggerExecutor = MockExecutors.logger();
        const getUserFlow = testFlows.user("user.get");

        const getUserImpl = getUserFlow.handler(
          { db: dbExecutor, logger: loggerExecutor },
          async ({ db, logger }, ctx, input) => {
            logger.info("Getting user", { userId: input.userId });
            const user = db.users.findById(input.userId);

            if (!user) {
              return ctx.ko({
                code: "USER_NOT_FOUND",
                message: "User not found",
              });
            }

            return ctx.ok({ user });
          }
        );

        const result = await flow.execute(getUserImpl, { userId });

        expect(result.type).toBe("ok");
        expect((result.data as any).user.id).toBe(userId);
        expect((result.data as any).user.name).toBe(expectedName);
        expect((result.data as any).user.email).toBe(
          `user${userId}@example.com`
        );
      }
    );

    test("transforms dependency errors into business errors", async () => {
      const dbExecutor = MockExecutors.database();
      const getUserFlow = testFlows.user("user.get.failing");

      const getUserImpl = getUserFlow.handler(
        { db: dbExecutor },
        async ({ db }, ctx, input) => {
          try {
            const user = db.users.findById(input.userId);
            if (input.userId === "invalid") {
              throw new Error("Database connection failed");
            }
            return ctx.ok({ user });
          } catch (error) {
            return ctx.ko({
              code: "DATABASE_ERROR",
              message: error instanceof Error ? error.message : "Unknown error",
            });
          }
        }
      );

      const result = await flow.execute(getUserImpl, { userId: "invalid" });

      expect(result.type).toBe("ko");
      expect((result.data as any).code).toBe("DATABASE_ERROR");
      expect((result.data as any).message).toBe("Database connection failed");
    });
  });

  describe("nested flow execution and context sharing", () => {
    test("maintains context state across nested flow invocations", async () => {
      const events: string[] = [];
      const loggerExecutor = MockExecutors.logger(events);
      const validateEmailFlow = testFlows.validation("validate.email");

      const validateEmailImpl = validateEmailFlow.handler(
        { logger: loggerExecutor },
        async ({ logger }, ctx, input) => {
          logger.info("Validating email", { email: (input as any).email });
          logger.events.push(`validated:${(input as any).email}`);

          const isValid =
            (input as any).email.includes("@") &&
            (input as any).email.includes(".");
          return ctx.ok({ valid: isValid });
        }
      );

      const registerUserFlow = testFlows.generic(
        "user.register",
        custom<{ email: string; name: string }>(),
        custom<{ userId: string; message: string }>(),
        custom<{ code: string; message: string }>()
      );

      const registerUserImpl = registerUserFlow.handler(
        { logger: loggerExecutor },
        async ({ logger }, ctx, input) => {
          logger.info("Starting user registration", {
            email: (input as any).email,
          });
          logger.events.push(`register:start:${(input as any).email}`);

          const REQUEST_ID = Symbol("requestId");
          ctx.set(REQUEST_ID, "req-123");

          const emailValidation = await ctx.execute(validateEmailImpl, {
            email: (input as any).email,
          });

          if (emailValidation.type === "ko") {
            return ctx.ko({
              code: "INVALID_EMAIL",
              message: "Email validation failed",
            });
          }

          if (!emailValidation.data.valid) {
            return ctx.ko({
              code: "INVALID_EMAIL",
              message: "Email format is invalid",
            });
          }

          logger.events.push(`register:success:${(input as any).email}`);
          return ctx.ok({
            userId: "user-456",
            message: `User ${(input as any).name} registered successfully`,
          });
        }
      );

      const result = await flow.execute(registerUserImpl, {
        email: "test@example.com",
        name: "John Doe",
      });

      expect(result.type).toBe("ok");
      expect((result.data as any).userId).toBe("user-456");
      expect((result.data as any).message).toContain("John Doe");
      expect((result.data as any).message).toContain("registered successfully");
    });

    test("propagates validation errors from nested flows with context", async () => {
      const validateAddressFlow = testFlows.generic(
        "validate.address",
        custom<{ address: string }>(),
        custom<{ valid: boolean }>(),
        custom<{ code: string; message: string }>()
      );

      const validateAddressImpl = validateAddressFlow.handler(
        async (ctx, input) => {
          if (!(input as any).address || (input as any).address.length < 5) {
            return ctx.ko({
              code: "INVALID_ADDRESS",
              message: "Address too short",
            });
          }
          return ctx.ok({ valid: true });
        }
      );

      const createOrderFlow = testFlows.generic(
        "order.create",
        custom<{ address: string; items: string[] }>(),
        custom<{ orderId: string }>(),
        custom<{ code: string; message: string }>()
      );

      const loggerExecutor = MockExecutors.logger();
      const createOrderImpl = createOrderFlow.handler(
        { logger: loggerExecutor },
        async ({ logger }, ctx, input) => {
          logger.info("Creating order");

          const addressValidation = await ctx.execute(validateAddressImpl, {
            address: (input as any).address,
          });

          if (addressValidation.type === "ko") {
            return ctx.ko({
              code: "VALIDATION_FAILED",
              message: `Order creation failed: ${
                (addressValidation.data as any).message
              }`,
            });
          }

          return ctx.ok({ orderId: "order-789" });
        }
      );

      const result = await flow.execute(createOrderImpl, {
        address: "123",
        items: ["item1", "item2"],
      });

      expect(result.type).toBe("ko");
      expect((result.data as any).code).toBe("VALIDATION_FAILED");
      expect((result.data as any).message).toContain("Address too short");
      expect((result.data as any).message).toContain("Order creation failed");
    });
  });

  describe("flow execution options", () => {
    test("executes with custom version", () => {
      const customVersionFlow = flow.define({
        name: "custom.version",
        version: "2.1.0",
        input: custom<{ message: number }>(),
        success: custom<{ result: number }>(),
        error: custom<{ message: string }>(),
      });

      expect(customVersionFlow.version).toBe("2.1.0");
    });

    test("executes with custom meta", async () => {
      const metaFlow = flow.define({
        name: "meta.test",
        input: custom<{ message: number }>(),
        success: custom<{ result: number }>(),
        error: custom<{ message: string }>(),
      });

      const impl = metaFlow.handler(async (ctx, input) => {
        return ctx.ok({ result: input.message });
      });

      const result = await flow.execute(impl, { message: 42 });
      expect(result.type).toBe("ok");
      expect((result.data as any).result).toBe(42);
    });

    test("executes with initialContext as Array", async () => {
      const testAccessor = accessor("testKey", custom<string>());
      const testFlow = testFlows.basic("context.array");
      const impl = testFlow.handler(async (ctx, input) => {
        const contextValue = testAccessor.get(ctx);
        return ctx.ok({ result: contextValue });
      });

      const result = await flow.execute(impl, { message: "test" }, {
        initialContext: [[testAccessor, "test-value"]]
      });

      expect(result.type).toBe("ok");
      expect((result.data as any).result).toBe("test-value");
    });

    test("executes with initialContext as Map", async () => {
      const testFlow = testFlows.basic("context.map");
      const impl = testFlow.handler(async (ctx, input) => {
        const contextValue = ctx.get("testKey") as string;
        return ctx.ok({ result: contextValue });
      });

      const contextMap = new Map([["testKey", "map-value"]]);
      const result = await flow.execute(impl, { message: "test" }, {
        initialContext: contextMap
      });

      expect(result.type).toBe("ok");
      expect((result.data as any).result).toBe("map-value");
    });

    test("executes functions with error mapper", async () => {
      const testFlow = testFlows.basic("error.mapper");
      const impl = testFlow.handler(async (ctx, input) => {
        const result = await ctx.execute(
          (x: number) => {
            if (x < 0) throw new Error("Negative value");
            return x * 2;
          },
          -5,
          (error) => ({ code: "MAPPED_ERROR", message: error instanceof Error ? error.message : "Unknown" })
        );

        expect(result.type).toBe("ko");
        expect((result.data as any).code).toBe("MAPPED_ERROR");
        expect((result.data as any).message).toBe("Negative value");

        return ctx.ok({ result: input.message });
      });

      const result = await flow.execute(impl, { message: "test" });
      expect(result.type).toBe("ok");
    });
  });
});

describe("Flow KO Cause Tracking", () => {
  test("ko() accepts cause parameter", async () => {
    const testFlow = flow.define({
      name: "test.cause",
      input: custom<{ shouldFail: boolean }>(),
      success: custom<{ message: string }>(),
      error: custom<{ error: string }>()
    });

    const impl = testFlow.handler(async (ctx, input) => {
      if (input.shouldFail) {
        const originalError = new Error("Database connection failed");
        return ctx.ko({ error: "Business logic error" }, { cause: originalError });
      }
      return ctx.ok({ message: "success" });
    });

    const result = await flow.execute(impl, { shouldFail: true });

    expect(result.type).toBe("ko");
    if (result.type === "ko") {
      expect(result.data.error).toBe("Business logic error");
      expect(result.cause).toBeInstanceOf(Error);
      expect((result.cause as Error).message).toBe("Database connection failed");
    }
  });

  test("nested flow execution preserves cause chain", async () => {
    const innerFlow = flow.define({
      name: "inner.flow",
      input: custom<{ message: number }>(),
      success: custom<{ result: number }>(),
      error: custom<{ code: string }>()
    });

    const innerImpl = innerFlow.handler(async (ctx, input) => {
      if (input.message < 0) {
        const dbError = new Error("Database constraint violation");
        return ctx.ko({ code: "INVALID_VALUE" }, { cause: dbError });
      }
      return ctx.ok({ result: input.message * 2 });
    });

    const outerFlow = flow.define({
      name: "outer.flow",
      input: custom<{ data: number }>(),
      success: custom<{ final: number }>(),
      error: custom<{ message: string }>()
    });

    const outerImpl = outerFlow.handler(async (ctx, input) => {
      const innerResult = await ctx.execute(innerImpl, { message: input.data });

      if (innerResult.isKo()) {
        return ctx.ko({ message: "Outer flow failed" }, { cause: innerResult });
      }

      return ctx.ok({ final: innerResult.data.result });
    });

    const result = await flow.execute(outerImpl, { data: -1 });

    expect(result.type).toBe("ko");
    if (result.type === "ko") {
      expect(result.data.message).toBe("Outer flow failed");
      expect(result.cause).toBeDefined();

      const innerKoResult = result.cause as any;
      expect(innerKoResult.type).toBe("ko");
      expect(innerKoResult.data.code).toBe("INVALID_VALUE");
      expect(innerKoResult.cause).toBeInstanceOf(Error);
      expect((innerKoResult.cause as Error).message).toBe("Database constraint violation");
    }
  });

  test("function execution with error mapper includes cause", async () => {
    const testFlow = flow.define({
      name: "test.function",
      input: custom<{ message: number }>(),
      success: custom<{ result: number }>(),
      error: custom<{ error: string }>()
    });

    const impl = testFlow.handler(async (ctx, input) => {
      const result = await ctx.execute(
        (x: number) => {
          if (x > 10) throw new Error("Value too large");
          return x * 2;
        },
        input.message,
        (error) => ({ error: "Transformed error message" })
      );

      if (result.isKo()) {
        return ctx.ko(result.data, { cause: result.cause });
      }

      return ctx.ok({ result: result.data });
    });

    const result = await flow.execute(impl, { message: 15 });

    expect(result.type).toBe("ko");
    if (result.type === "ko") {
      expect(result.data.error).toBe("Transformed error message");
      expect(result.cause).toBeInstanceOf(Error);
      expect((result.cause as Error).message).toBe("Value too large");
    }
  });
});

describe("Flow Parallel Execution with Result Type", () => {
  test("executeParallel returns proper result structure for all successful executions", async () => {
    const testFlow = flow.define({
      name: "test.parallel",
      input: custom<{ message: number }>(),
      success: custom<{ result: number }>(),
      error: custom<{ error: string }>()
    });

    const impl = testFlow.handler(async (ctx, input) => {
      const parallelResult = await ctx.executeParallel([
        [(x: number) => x + 1, input.message],
        [(x: number) => x * 2, input.message],
        [(x: number) => x - 1, input.message]
      ]);

      expect(parallelResult.type).toBe("all-ok");
      expect(parallelResult.stats.total).toBe(3);
      expect(parallelResult.stats.succeeded).toBe(3);
      expect(parallelResult.stats.failed).toBe(0);

      expect(parallelResult.results[0].type).toBe("ok");
      expect(parallelResult.results[0].data).toBe(input.message + 1);
      expect(parallelResult.results[1].type).toBe("ok");
      expect(parallelResult.results[1].data).toBe(input.message * 2);
      expect(parallelResult.results[2].type).toBe("ok");
      expect(parallelResult.results[2].data).toBe(input.message - 1);

      return ctx.ok({ result: input.message });
    });

    await flow.execute(impl, { message: 5 });
  });

  test("executeParallel returns partial result when some executions fail", async () => {
    const testFlow = flow.define({
      name: "test.partial",
      input: custom<{ message: number }>(),
      success: custom<{ result: number }>(),
      error: custom<{ error: string }>()
    });

    const impl = testFlow.handler(async (ctx, input) => {
      const parallelResult = await ctx.executeParallel([
        [(x: number) => x + 1, input.message],
        [(x: number) => {
          if (x > 5) throw new Error("Too big");
          return x * 2;
        }, input.message],
        [(x: number) => x - 1, input.message]
      ]);

      expect(parallelResult.type).toBe("partial");
      expect(parallelResult.stats.total).toBe(3);
      expect(parallelResult.stats.succeeded).toBe(2);
      expect(parallelResult.stats.failed).toBe(1);

      expect(parallelResult.results[0].type).toBe("ok");
      expect(parallelResult.results[1].type).toBe("ko");
      if (parallelResult.results[1].type === "ko") {
        expect(parallelResult.results[1].cause).toBeInstanceOf(Error);
        expect((parallelResult.results[1].cause as Error).message).toBe("Too big");
      }
      expect(parallelResult.results[2].type).toBe("ok");

      return ctx.ok({ result: input.message });
    });

    await flow.execute(impl, { message: 10 });
  });

  test("executeParallel with fail-fast mode stops on first failure", async () => {
    const testFlow = flow.define({
      name: "test.fail.fast",
      input: custom<{ message: number }>(),
      success: custom<{ result: number }>(),
      error: custom<{ error: string }>()
    });

    const impl = testFlow.handler(async (ctx, input) => {
      const parallelResult = await ctx.executeParallel([
        [(x: number) => {
          if (x > 5) throw new Error("First error");
          return x + 1;
        }, input.message],
        [(x: number) => x * 2, input.message],
        [(x: number) => x - 1, input.message]
      ], { failureMode: "fail-fast" });

      expect(parallelResult.stats.total).toBe(1);
      expect(parallelResult.stats.succeeded).toBe(0);
      expect(parallelResult.stats.failed).toBe(1);
      expect(parallelResult.results).toHaveLength(1);
      expect(parallelResult.results[0].type).toBe("ko");

      return ctx.ok({ result: input.message });
    });

    await flow.execute(impl, { message: 10 });
  });

  test("executeParallel with fail-all mode throws aggregated error", async () => {
    const testFlow = flow.define({
      name: "test.fail.all",
      input: custom<{ message: number }>(),
      success: custom<{ result: number }>(),
      error: custom<{ error: string }>()
    });

    const impl = testFlow.handler(async (ctx, input) => {
      try {
        await ctx.executeParallel([
          [(x: number) => x + 1, input.message],
          [(x: number) => {
            throw new Error("Intentional error");
          }, input.message]
        ], { failureMode: "fail-all" });

        return ctx.ko({ error: "Should not reach here" });
      } catch (error: unknown) {
        expect(error).toBeDefined();
        const koError = error as any;
        expect(koError.type).toBe("ko");
        expect(koError.data.type).toBe("parallel-execution-failed");
        expect(koError.data.individualResults).toHaveLength(2);
        expect(koError.cause).toBeInstanceOf(Array);

        return ctx.ok({ result: input.message });
      }
    });

    await flow.execute(impl, { message: 10 });
  });

  test("executeParallel with error mapper transforms errors", async () => {
    const testFlow = flow.define({
      name: "test.error.mapper",
      input: custom<{ message: number }>(),
      success: custom<{ result: number }>(),
      error: custom<{ error: string }>()
    });

    const impl = testFlow.handler(async (ctx, input) => {
      const parallelResult = await ctx.executeParallel([
        [(x: number) => x + 1, input.message],
        [(x: number) => {
          throw new Error("Original error");
        }, input.message]
      ], {
        errorMapper: (error, index) => ({
          transformedError: `Error at index ${index}: ${(error as Error).message}`
        })
      });

      expect(parallelResult.results[1].type).toBe("ko");
      if (parallelResult.results[1].type === "ko") {
        expect((parallelResult.results[1].data as any).transformedError).toBe("Error at index 1: Original error");
        expect(parallelResult.results[1].cause).toBeInstanceOf(Error);
        expect((parallelResult.results[1].cause as Error).message).toBe("Original error");
      }

      return ctx.ok({ result: input.message });
    });

    await flow.execute(impl, { message: 5 });
  });

  test("executeParallel calls onItemComplete callback", async () => {
    const testFlow = flow.define({
      name: "test.callback",
      input: custom<{ message: number }>(),
      success: custom<{ result: number }>(),
      error: custom<{ error: string }>()
    });

    const onItemComplete = vi.fn();

    const impl = testFlow.handler(async (ctx, input) => {
      await ctx.executeParallel([
        [(x: number) => x + 1, input.message],
        [(x: number) => x * 2, input.message]
      ], { onItemComplete });

      expect(onItemComplete).toHaveBeenCalledTimes(2);
      expect(onItemComplete).toHaveBeenNthCalledWith(1, expect.objectContaining({ type: "ok" }), 0);
      expect(onItemComplete).toHaveBeenNthCalledWith(2, expect.objectContaining({ type: "ok" }), 1);

      return ctx.ok({ result: input.message });
    });

    await flow.execute(impl, { message: 5 });
  });

  test("executeParallel with flows maintains cause chain", async () => {
    const innerFlow = flow.define({
      name: "inner.flow",
      input: custom<{ x: number }>(),
      success: custom<{ result: number }>(),
      error: custom<{ code: string }>()
    });

    const innerImpl = innerFlow.handler(async (ctx, input) => {
      if (input.x < 0) {
        const dbError = new Error("Database error");
        return ctx.ko({ code: "NEGATIVE_VALUE" }, { cause: dbError });
      }
      return ctx.ok({ result: input.x * 10 });
    });

    const testFlow = flow.define({
      name: "test.flow.parallel",
      input: custom<{ values: number[] }>(),
      success: custom<{ results: number[] }>(),
      error: custom<{ error: string }>()
    });

    const impl = testFlow.handler(async (ctx, input) => {
      const parallelResult = await ctx.executeParallel([
        [innerImpl, { x: input.values[0] }],
        [innerImpl, { x: input.values[1] }]
      ]);

      if (parallelResult.type === "partial" || parallelResult.type === "all-ko") {
        const firstKo = parallelResult.results.find(r => r.type === "ko");
        expect(firstKo?.cause).toBeInstanceOf(Error);
        expect((firstKo?.cause as Error).message).toBe("Database error");
      }

      return ctx.ok({ results: input.values });
    });

    await flow.execute(impl, { values: [5, -3] });
  });
});

describe("Function Execution with ctx.execute and ctx.executeParallel", () => {
  const basicFlow = testFlows.math("function.test");

  const handler = basicFlow.handler(async (ctx, input) => {
    const singleResult = await ctx.execute((x: number) => x + 1, input.a);
    expect(singleResult.type).toBe("ok");
    expect(singleResult.data).toBe(input.a + 1);

    const multiArgResult = await ctx.execute(
      (a: number, b: number) => a + b,
      [input.a, 10]
    );
    expect(multiArgResult.type).toBe("ok");
    expect(multiArgResult.data).toBe(input.a + 10);

    const errorResult = await ctx.execute(
      (x: number) => {
        throw new Error("Test error");
      },
      input.a
    );
    expect(errorResult.type).toBe("ko");
    expect(errorResult.data).toBeInstanceOf(Error);

    const parallelResults = await ctx.executeParallel([
      [(x: number) => x + 1, input.a],
      [(a: number, b: number) => a * b, [input.a, 2]],
      [async (x: number) => x - 1, input.a]
    ]);

    expect(parallelResults.results[0].type).toBe("ok");
    expect(parallelResults.results[0].data).toBe(input.a + 1);
    expect(parallelResults.results[1].type).toBe("ok");
    expect(parallelResults.results[1].data).toBe(input.a * 2);
    expect(parallelResults.results[2].type).toBe("ok");
    expect(parallelResults.results[2].data).toBe(input.a - 1);

    return ctx.ok({ result: input.a });
  });

  test("executes single parameter functions correctly", async () => {
    const result = await flow.execute(handler, { a: 5, b: 0 });
    expect(result.type).toBe("ok");
  });

  test("handles function errors gracefully", async () => {
    const errorHandler = basicFlow.handler(async (ctx, input) => {
      const result = await ctx.execute(
        (x: number) => {
          throw new Error("Test error");
        },
        input.a
      );

      expect(result.type).toBe("ko");
      expect(result.data).toBeInstanceOf(Error);

      return ctx.ok({ result: 0 });
    });

    const result = await flow.execute(errorHandler, { a: 5, b: 0 });
    expect(result.type).toBe("ok");
  });

  test("supports mixed flow and function execution in parallel", async () => {
    const customFlow = flow.define({
      name: "mixed.test",
      input: custom<{ x: number }>(),
      success: custom<{ result: number }>(),
      error: custom<{ error: string }>()
    });

    const testFlowHandler = customFlow.handler(async (ctx, input) => {
      return ctx.ok({ result: input.x * 10 });
    });

    const mixedHandler = basicFlow.handler(async (ctx, input) => {
      const results = await ctx.executeParallel([
        [testFlowHandler, { x: input.a }],
        [(n: number) => n + 100, input.a],
        [(a: number, b: number) => a - b, [input.a, 3]]
      ]);

      expect(results.results[0].type).toBe("ok");
      expect((results.results[0].data as any).result).toBe(input.a * 10);
      expect(results.results[1].type).toBe("ok");
      expect(results.results[1].data).toBe(input.a + 100);
      expect(results.results[2].type).toBe("ok");
      expect(results.results[2].data).toBe(input.a - 3);

      return ctx.ok({ result: input.a });
    });

    const result = await flow.execute(mixedHandler, { a: 7, b: 0 });
    expect(result.type).toBe("ok");
  });

  test("handles parallel execution with some failures", async () => {
    const errorHandler = basicFlow.handler(async (ctx, input) => {
      const results = await ctx.executeParallel([
        [(x: number) => x * 2, input.a],
        [(x: number) => {
          if (x > 5) throw new Error("Too big");
          return x;
        }, input.a],
        [(a: number, b: number) => a + b, [input.a, 1]]
      ]);

      expect(results.results[0].type).toBe("ok");
      expect(results.results[0].data).toBe(input.a * 2);

      if (input.a > 5) {
        expect(results.results[1].type).toBe("ko");
        expect(results.results[1].data).toBeInstanceOf(Error);
      } else {
        expect(results.results[1].type).toBe("ok");
        expect(results.results[1].data).toBe(input.a);
      }

      expect(results.results[2].type).toBe("ok");
      expect(results.results[2].data).toBe(input.a + 1);

      return ctx.ok({ result: input.a });
    });

    await flow.execute(errorHandler, { a: 10, b: 0 });
    await flow.execute(errorHandler, { a: 3, b: 0 });
  });

  test("executes complex nested parallel operations", async () => {
    const complexHandler = basicFlow.handler(async (ctx, input) => {
      const nestedResults = await ctx.executeParallel([
        [async (x: number) => {
          const innerParallel = await ctx.executeParallel([
            [(n: number) => n + 1, x],
            [(n: number) => n * 2, x]
          ]);
          return {
            sum: (innerParallel.results[0].data as number) + (innerParallel.results[1].data as number),
            average: ((innerParallel.results[0].data as number) + (innerParallel.results[1].data as number)) / 2
          };
        }, input.a]
      ]);

      expect(nestedResults.results[0].type).toBe("ok");
      expect((nestedResults.results[0].data as any).sum).toBe((input.a + 1) + (input.a * 2));
      expect((nestedResults.results[0].data as any).average).toBe(((input.a + 1) + (input.a * 2)) / 2);

      return ctx.ok({ result: input.a });
    });

    const result = await flow.execute(complexHandler, { a: 1, b: 0 });
    expect(result.type).toBe("ok");
  });
});
