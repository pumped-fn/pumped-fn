import { describe, test, expect } from "vitest";
import { flow, createScope, extension, tag, custom } from "../src";

describe("Flow Extension Wrapping Fix", () => {
  test("flow.execute with scope uses scope extensions", async () => {
    const operations: string[] = [];

    const trackingExtension = extension({
      name: "tracker",
      wrap: (_scope, next, operation) => {
        operations.push(operation.kind);
        return next();
      },
    });

    const scope = createScope({ extensions: [trackingExtension] });

    const simpleFlow = flow((_ctx, input: number) => input * 2);

    const result = await flow.execute(simpleFlow, 5, { scope });

    expect(result).toBe(10);
    expect(operations).toContain("execute");
  });

  test("flow.execute without scope creates temporary scope with extensions", async () => {
    const operations: string[] = [];

    const trackingExtension = extension({
      name: "tracker",
      wrap: (_scope, next, operation) => {
        operations.push(operation.kind);
        return next();
      },
    });

    const simpleFlow = flow((_ctx, input: number) => input * 2);

    const result = await flow.execute(simpleFlow, 5, { extensions: [trackingExtension] });

    expect(result).toBe(10);
    expect(operations).toContain("execute");
  });

  test("scope tags are accessible in extensions", async () => {
    let capturedTags: unknown;

    const tagCaptureExtension = extension({
      name: "tag-capture",
      wrap: (scope, next, _operation) => {
        capturedTags = scope.tags;
        return next();
      },
    });

    const testTag = tag(custom<{ value: string }>(), { label: "test.tag" });
    const executionTag = tag(custom<{ execution: string }>(), { label: "execution.tag" });
    const scope = createScope({
      extensions: [tagCaptureExtension],
      tags: [testTag({ value: "scope-value" })]
    });
    const simpleFlow = flow((_ctx, input: number) => input * 2);

    await flow.execute(simpleFlow, 5, {
      scope,
      executionTags: [executionTag({ execution: "exec-value" })]
    });

    expect(capturedTags).toBeDefined();
  });
});
