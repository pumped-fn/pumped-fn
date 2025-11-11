import { describe, test, expect } from "vitest";
import { buildFlowScenario } from "./utils";
import { type Flow } from "../src/types";
import { tag } from "../src/tag";
import { custom } from "../src/ssch";

describe("buildFlowScenario", () => {
  test("executes handler-only scenario", async () => {
    const result = await buildFlowScenario({
      input: 5,
      handler: (ctx, input: number) => input * 2,
    });

    expect(result).toBe(10);
  });

  test("executes with flowDef and handler", async () => {
    const testDef: Flow.Definition<number, number> = {
      name: "multiply",
      input: { "~standard": { version: 1, vendor: "test", validate: (v) => ({ value: v as number }) } },
      output: { "~standard": { version: 1, vendor: "test", validate: (v) => ({ value: v as number }) } },
    };

    const result = await buildFlowScenario({
      input: 3,
      flowDef: testDef,
      handler: (ctx, input: number) => input * 3,
    });

    expect(result).toBe(9);
  });

  test("passes extensions to flow execution", async () => {
    const executionOrder: string[] = [];

    const testExtension = {
      name: "test-extension",
      async wrap(scope: any, next: () => any, operation: any) {
        if (operation.kind === "execute") {
          executionOrder.push("before");
          const result = await next();
          executionOrder.push("after");
          return result;
        }
        return next();
      },
    };

    const result = await buildFlowScenario({
      input: 1,
      handler: (ctx, input: number) => {
        executionOrder.push("handler");
        return input + 1;
      },
      extensions: [testExtension],
    });

    expect(result).toBe(2);
    expect(executionOrder).toEqual(["before", "handler", "after"]);
  });

  test("passes scopeTags to flow execution", async () => {
    const testTag = tag(custom<string>(), { label: "test-tag" });
    const tagValue = testTag("test-value");

    const result = await buildFlowScenario({
      input: 0,
      handler: (ctx, input: number) => {
        const value = testTag.readFrom(ctx.scope);
        return value === "test-value" ? 42 : 0;
      },
      scopeTags: [tagValue],
    });

    expect(result).toBe(42);
  });

  test("passes executionTags to flow execution", async () => {
    const execTag = tag(custom<number>(), { label: "exec-tag" });
    const tagValue = execTag(100);

    const result = await buildFlowScenario({
      input: 1,
      handler: (ctx, input: number) => {
        const value = ctx.find(execTag);
        return (value ?? 0) + input;
      },
      executionTags: [tagValue],
    });

    expect(result).toBe(101);
  });

  test("handles async handler", async () => {
    const result = await buildFlowScenario({
      input: "hello",
      handler: async (ctx, input: string) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return input.toUpperCase();
      },
    });

    expect(result).toBe("HELLO");
  });

  test("throws error when neither handler nor flowDef provided", async () => {
    await expect(
      buildFlowScenario({ input: 1 })
    ).rejects.toThrow("Either handler or flowDef must be provided");
  });

  test("complex type inference with objects", async () => {
    type Input = { value: number };
    type Output = { result: string };

    const result = await buildFlowScenario<Input, Output>({
      input: { value: 42 },
      handler: (ctx, input) => ({ result: `Value: ${input.value}` }),
    });

    expect(result).toEqual({ result: "Value: 42" });
  });
});
