import { describe, test, expect } from "vitest";
import { flow, custom, type Flow } from "../src/index";

describe("Flow Type Inference", () => {
  test("InferInput and InferOutput extract types from defined flow", () => {
    const userFlow = flow({
      name: "testFlow",
      input: custom<{ id: number }>(),
      output: custom<{ id: number; name: string }>(),
      handler: async (ctx, input) => {
        return { id: input.id, name: "test" };
      },
    });

    type InputType = Flow.InferInput<typeof userFlow>;
    type OutputType = Flow.InferOutput<typeof userFlow>;

    const validInput: InputType = { id: 1 };
    const validOutput: OutputType = { id: 1, name: "test" };

    expect(validInput.id).toBe(1);
    expect(validOutput.name).toBe("test");
  });

  test("InferInput extracts types from flow with dependencies", () => {
    const doubleFlow = flow(
      {},
      async (deps, ctx, input: { x: number }) => {
        return { y: input.x * 2 };
      }
    );

    type InputType = Flow.InferInput<typeof doubleFlow>;
    type OutputType = Flow.InferOutput<typeof doubleFlow>;

    const validInput: InputType = { x: 42 };
    const validOutput: OutputType = { y: 84 };

    expect(validInput.x).toBe(42);
    expect(validOutput.y).toBe(84);
  });

  test("InferInput extracts types from anonymous flow handler", () => {
    const upperCaseFlow = flow(async (ctx, input: { value: string }) => {
      return { result: input.value.toUpperCase() };
    });

    type InputType = Flow.InferInput<typeof upperCaseFlow>;
    type OutputType = Flow.InferOutput<typeof upperCaseFlow>;

    const validInput: InputType = { value: "hello" };
    const validOutput: OutputType = { result: "HELLO" };

    expect(validInput.value).toBe("hello");
    expect(validOutput.result).toBe("HELLO");
  });

  test("InferInput works with flow.define().handler() pattern", () => {
    const sumFlow = flow
      .define({
        name: "defineTest",
        input: custom<{ a: number; b: number }>(),
        output: custom<{ sum: number }>(),
      })
      .handler(async (ctx, input) => {
        return { sum: input.a + input.b };
      });

    type InputType = Flow.InferInput<typeof sumFlow>;
    type OutputType = Flow.InferOutput<typeof sumFlow>;

    const validInput: InputType = { a: 5, b: 10 };
    const validOutput: OutputType = { sum: 15 };

    expect(validInput.a).toBe(5);
    expect(validOutput.sum).toBe(15);
  });

  test("Flow.Flow type annotation constrains input and output types", () => {
    const createProcessingFlow = (): Flow.Flow<
      { id: string },
      { id: string; data: string }
    > => {
      return flow({
        name: "annotated",
        input: custom<{ id: string }>(),
        output: custom<{ id: string; data: string }>(),
        handler: async (ctx, input) => {
          return { id: input.id, data: "processed" };
        },
      });
    };

    const processingFlow = createProcessingFlow();
    type InputType = Flow.InferInput<typeof processingFlow>;
    type OutputType = Flow.InferOutput<typeof processingFlow>;

    const validInput: InputType = { id: "123" };
    const validOutput: OutputType = { id: "123", data: "processed" };

    expect(validInput.id).toBe("123");
    expect(validOutput.data).toBe("processed");
  });

  test("flow exposes definition property with metadata", () => {
    const versionedFlow = flow
      .define({
        name: "withDefinition",
        version: "2.0.0",
        input: custom<{ count: number }>(),
        output: custom<{ doubled: number }>(),
      })
      .handler(async (ctx, input) => {
        return { doubled: input.count * 2 };
      });

    expect(versionedFlow.definition).toBeDefined();
    expect(versionedFlow.definition.name).toBe("withDefinition");
    expect(versionedFlow.definition.version).toBe("2.0.0");

    type InputType = Flow.InferInput<typeof versionedFlow>;
    const validInput: InputType = { count: 5 };

    expect(validInput.count).toBe(5);
  });
});
