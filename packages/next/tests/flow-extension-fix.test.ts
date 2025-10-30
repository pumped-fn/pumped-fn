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

  test("scope extensions wrap ctx.exec subflow operations", async () => {
    const operations: string[] = [];

    const trackingExtension = extension({
      name: "tracker",
      wrap: (_scope, next, operation) => {
        operations.push(operation.kind);
        return next();
      },
    });

    const scope = createScope({ extensions: [trackingExtension] });

    const childFlow = flow((_ctx, input: number) => input + 1);
    const parentFlow = flow(async (ctx, input: number) => {
      const result = await ctx.exec(childFlow, input);
      return result * 2;
    });

    const result = await flow.execute(parentFlow, 5, { scope });

    expect(result).toBe(12);
    expect(operations).toContain("execute");
    expect(operations).toContain("subflow");
  });

  test("scope extensions wrap ctx.run journal operations", async () => {
    const operations: string[] = [];

    const trackingExtension = extension({
      name: "tracker",
      wrap: (_scope, next, operation) => {
        operations.push(operation.kind);
        return next();
      },
    });

    const scope = createScope({ extensions: [trackingExtension] });

    const journaledFlow = flow(async (ctx, input: number) => {
      const doubled = await ctx.run("double", () => input * 2);
      return doubled + 1;
    });

    const result = await flow.execute(journaledFlow, 5, { scope });

    expect(result).toBe(11);
    expect(operations).toContain("execute");
    expect(operations).toContain("journal");
  });

  test("scopeTags attach to scope, executionTags to execution", async () => {
    let capturedScopeTags: unknown;
    let capturedExecutionTags: unknown;

    const scopeTag = tag(custom<{ value: string }>(), { label: "scope.tag" });
    const executionTag = tag(custom<{ value: string }>(), { label: "execution.tag" });

    const tagCaptureExtension = extension({
      name: "tag-capture",
      wrap: (scope, next, _operation) => {
        capturedScopeTags = scope.tags;
        return next();
      },
    });

    const simpleFlow = flow((ctx, input: number) => {
      capturedExecutionTags = ctx.tags;
      return input * 2;
    });

    await flow.execute(simpleFlow, 5, {
      extensions: [tagCaptureExtension],
      scopeTags: [scopeTag({ value: "scope-value" })],
      executionTags: [executionTag({ value: "execution-value" })],
    });

    expect(capturedScopeTags).toBeDefined();
    expect(capturedExecutionTags).toBeDefined();
  });

  test("temporary scope is disposed after execution", async () => {
    const disposeEvents: string[] = [];

    const lifecycleExtension = extension({
      name: "lifecycle",
      init: () => {
        disposeEvents.push("init");
      },
      dispose: async () => {
        disposeEvents.push("dispose");
      },
    });

    const simpleFlow = flow((_ctx, input: number) => input * 2);

    await flow.execute(simpleFlow, 5, { extensions: [lifecycleExtension] });

    expect(disposeEvents).toEqual(["init", "dispose"]);
  });
});
