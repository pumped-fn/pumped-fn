import { describe, test, expect } from "vitest";
import { flow } from "../src/flow";
import { custom } from "../src/ssch";

describe("Error Mapping in ctx.execute", () => {
  // ctx.execute now supports an optional error mapper as the 3rd parameter
  // This allows mapping thrown errors to properly typed error objects
  const processOrderFlow = flow.define({
    name: "test-error-mapping",
    input: custom<{ customerId: string }>(),
    success: custom<{ result: string }>(),
    error: custom<{ code: string; message: string }>()
  });

  test("maps thrown errors using error mapper", async () => {
    const handler = processOrderFlow.handler(async (ctx, input) => {
      const result = await ctx.execute(
        (customerId: string) => {
          if (customerId === "invalid") {
            throw new Error("Customer not found");
          }
          return `Customer ${customerId} processed`;
        },
        input.customerId,
        (error: unknown) => ({
          code: "CUSTOMER_ERROR",
          message: error instanceof Error ? error.message : "Unknown error"
        })
      );

      if (result.type === "ko") {
        return ctx.ko(result.data);
      }

      return ctx.ok({ result: result.data });
    });

    // Test successful case
    const successResult = await flow.execute(handler, { customerId: "valid123" });
    expect(successResult.type).toBe("ok");
    expect(successResult.data.result).toBe("Customer valid123 processed");

    // Test error mapping
    const errorResult = await flow.execute(handler, { customerId: "invalid" });
    expect(errorResult.type).toBe("ko");
    expect(errorResult.data.code).toBe("CUSTOMER_ERROR");
    expect(errorResult.data.message).toBe("Customer not found");
  });

  test("works without error mapper (original behavior)", async () => {
    const handler = processOrderFlow.handler(async (ctx, input) => {
      const result = await ctx.execute(
        (customerId: string) => {
          if (customerId === "invalid") {
            throw new Error("Customer not found");
          }
          return `Customer ${customerId} processed`;
        },
        input.customerId
      );

      if (result.type === "ko") {
        return ctx.ko({
          code: "GENERIC_ERROR",
          message: result.data instanceof Error ? result.data.message : "Unknown error"
        });
      }

      return ctx.ok({ result: result.data });
    });

    const errorResult = await flow.execute(handler, { customerId: "invalid" });
    expect(errorResult.type).toBe("ko");
    expect(errorResult.data.code).toBe("GENERIC_ERROR");
    expect(errorResult.data.message).toBe("Customer not found");
  });

  test("maps multi-parameter function errors", async () => {
    const handler = processOrderFlow.handler(async (ctx, input) => {
      const result = await ctx.execute(
        (a: string, b: number) => {
          if (b < 0) {
            throw new Error(`Invalid amount: ${b}`);
          }
          return `${a}: ${b}`;
        },
        [input.customerId, -100],
        (error: unknown) => ({
          code: "VALIDATION_ERROR",
          message: error instanceof Error ? error.message : "Validation failed"
        })
      );

      if (result.type === "ko") {
        return ctx.ko(result.data);
      }

      return ctx.ok({ result: result.data });
    });

    const errorResult = await flow.execute(handler, { customerId: "test" });
    expect(errorResult.type).toBe("ko");
    expect(errorResult.data.code).toBe("VALIDATION_ERROR");
    expect(errorResult.data.message).toBe("Invalid amount: -100");
  });
});