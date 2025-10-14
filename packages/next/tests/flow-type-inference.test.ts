import { describe, expect, it } from "vitest";
import { flow, custom, type Flow } from "../src/index";

describe("Flow Type Inference", () => {
  it("should infer input type from flow() return", () => {
    const myFlow = flow({
      name: "testFlow",
      input: custom<{ id: number }>(),
      output: custom<{ id: number; name: string }>(),
      handler: async (ctx, input) => {
        return { id: input.id, name: "test" };
      },
    });

    type InputType = Flow.InferInput<typeof myFlow>;
    type OutputType = Flow.InferOutput<typeof myFlow>;

    const input: InputType = { id: 1 };
    const output: OutputType = { id: 1, name: "test" };

    expect(input.id).toBe(1);
    expect(output.name).toBe("test");
  });

  it("should infer input type from flow with dependencies", () => {
    const myFlow = flow(
      {},
      async (deps, ctx, input: { x: number }) => {
        return { y: input.x * 2 };
      }
    );

    type InputType = Flow.InferInput<typeof myFlow>;
    type OutputType = Flow.InferOutput<typeof myFlow>;

    const input: InputType = { x: 42 };
    const output: OutputType = { y: 84 };

    expect(input.x).toBe(42);
    expect(output.y).toBe(84);
  });

  it("should infer input type from anonymous flow", () => {
    const myFlow = flow(async (ctx, input: { value: string }) => {
      return { result: input.value.toUpperCase() };
    });

    type InputType = Flow.InferInput<typeof myFlow>;
    type OutputType = Flow.InferOutput<typeof myFlow>;

    const input: InputType = { value: "hello" };
    const output: OutputType = { result: "HELLO" };

    expect(input.value).toBe("hello");
    expect(output.result).toBe("HELLO");
  });

  it("should infer input type from flow.define().handler()", () => {
    const myFlow = flow
      .define({
        name: "defineTest",
        input: custom<{ a: number; b: number }>(),
        output: custom<{ sum: number }>(),
      })
      .handler(async (ctx, input) => {
        return { sum: input.a + input.b };
      });

    type InputType = Flow.InferInput<typeof myFlow>;
    type OutputType = Flow.InferOutput<typeof myFlow>;

    const input: InputType = { a: 5, b: 10 };
    const output: OutputType = { sum: 15 };

    expect(input.a).toBe(5);
    expect(output.sum).toBe(15);
  });

  it("should work with Flow.Flow type annotation", () => {
    const createFlow = (): Flow.Flow<{ id: string }, { id: string; data: string }> => {
      return flow({
        name: "annotated",
        input: custom<{ id: string }>(),
        output: custom<{ id: string; data: string }>(),
        handler: async (ctx, input) => {
          return { id: input.id, data: "processed" };
        },
      });
    };

    const myFlow = createFlow();

    type InputType = Flow.InferInput<typeof myFlow>;
    type OutputType = Flow.InferOutput<typeof myFlow>;

    const input: InputType = { id: "123" };
    const output: OutputType = { id: "123", data: "processed" };

    expect(input.id).toBe("123");
    expect(output.data).toBe("processed");
  });

  it("should access definition property on Flow.Flow", () => {
    const myFlow = flow
      .define({
        name: "withDefinition",
        version: "2.0.0",
        input: custom<{ count: number }>(),
        output: custom<{ doubled: number }>(),
      })
      .handler(async (ctx, input) => {
        return { doubled: input.count * 2 };
      });

    expect(myFlow.definition).toBeDefined();
    expect(myFlow.definition.name).toBe("withDefinition");
    expect(myFlow.definition.version).toBe("2.0.0");

    type InputType = Flow.InferInput<typeof myFlow>;
    const input: InputType = { count: 5 };
    expect(input.count).toBe(5);
  });
});
