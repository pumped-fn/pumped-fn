import { describe, expect, it } from "vitest";
import { flow, custom } from "../src/index";

describe("Flow definition property", () => {
  it("should expose definition property on flow executor", () => {
    const testFlow = flow.define({
      name: "testFlow",
      version: "1.0.0",
      input: custom<{ id: number }>(),
      output: custom<{ id: number; name: string }>(),
    }).handler(async (ctx, input) => {
      return { id: input.id, name: "test" };
    });

    expect(testFlow.definition).toBeDefined();
    expect(testFlow.definition.name).toBe("testFlow");
    expect(testFlow.definition.version).toBe("1.0.0");
    expect(testFlow.definition.input).toBeDefined();
    expect(testFlow.definition.output).toBeDefined();
  });

  it("should expose definition property on flow with dependencies", () => {
    const testFlow = flow.define({
      name: "flowWithDeps",
      version: "2.0.0",
      input: custom<string>(),
      output: custom<number>(),
    }).handler({ }, async (deps, ctx, input) => {
      return input.length;
    });

    expect(testFlow.definition).toBeDefined();
    expect(testFlow.definition.name).toBe("flowWithDeps");
    expect(testFlow.definition.version).toBe("2.0.0");
  });

  it("should expose definition property on anonymous flow", () => {
    const testFlow = flow(async (ctx, input: { x: number }) => {
      return { result: input.x * 2 };
    });

    expect(testFlow.definition).toBeDefined();
    expect(testFlow.definition.name).toBe("anonymous");
    expect(testFlow.definition.version).toBe("1.0.0");
  });
});
