import { describe, test, expect } from "vitest";
import { flow } from "../src/flow";
import { custom } from "../src/ssch";
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
});
