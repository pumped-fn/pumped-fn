import { describe, it, expect } from "vitest";
import * as flow from "../src/flow";
import { accessor } from "../src/accessor";
import { custom } from "../src/ssch";

describe("Flow Initial Context", () => {
  it("should initialize context with direct Map", async () => {
    const contextKey = Symbol("test-key");
    const testFlow = flow.provide(
      {
        input: custom<void>(),
        output: custom<string>(),
      },
      (_, controller) => {
        const value = controller.context.get(contextKey);
        return `Value: ${value}`;
      }
    );

    const initialContext = new Map([[contextKey, "test-value"]]);

    const result = await flow.execute(testFlow, undefined, {
      initialContext,
    });

    expect(result.result.kind).toBe("success");
    if (result.result.kind === "success") {
      expect(result.result.value).toBe("Value: test-value");
    }
  });

  it("should initialize context with Map entries", async () => {
    const key1 = Symbol("key1");
    const key2 = Symbol("key2");

    const testFlow = flow.provide(
      {
        input: custom<void>(),
        output: custom<{ a: string; b: number }>(),
      },
      (_, controller) => {
        return {
          a: controller.context.get(key1) as string,
          b: controller.context.get(key2) as number,
        };
      }
    );

    const initialContext = new Map<unknown, unknown>([
      [key1, "hello"],
      [key2, 42],
    ]);

    const result = await flow.execute(testFlow, undefined, {
      initialContext,
    });

    expect(result.result.kind).toBe("success");
    if (result.result.kind === "success") {
      expect(result.result.value).toEqual({ a: "hello", b: 42 });
    }
  });

  it("should initialize context with string keys in Map", async () => {
    const testFlow = flow.provide(
      {
        input: custom<void>(),
        output: custom<{ foo: string; bar: string }>(),
      },
      (_, controller) => {
        return {
          foo: controller.context.get("foo") as string,
          bar: controller.context.get("bar") as string,
        };
      }
    );

    const initialContext = new Map<unknown, unknown>([
      ["foo", "foo-value"],
      ["bar", "bar-value"],
    ]);

    const result = await flow.execute(testFlow, undefined, {
      initialContext,
    });

    expect(result.result.kind).toBe("success");
    if (result.result.kind === "success") {
      expect(result.result.value).toEqual({
        foo: "foo-value",
        bar: "bar-value",
      });
    }
  });

  it("should initialize context using data accessors", async () => {
    const spanData = accessor(
      "rootSpan",
      custom<{
        traceId: string;
        spanId: string;
      }>()
    );

    const userData = accessor(
      "user",
      custom<{
        id: number;
        name: string;
      }>()
    );

    const testFlow = flow.provide(
      {
        input: custom<void>(),
        output: custom<{
          span: { traceId: string; spanId: string };
          user: { id: number; name: string };
        }>(),
      },
      (_, controller) => {
        const span = spanData.get(controller.context);
        const user = userData.get(controller.context);
        return { span, user };
      }
    );

    const initialContext = flow.createInitialContext({
      span: {
        accessor: spanData,
        value: { traceId: "trace-123", spanId: "span-456" },
      },
      user: {
        accessor: userData,
        value: { id: 1, name: "John Doe" },
      },
    });

    const result = await flow.execute(testFlow, undefined, {
      initialContext,
    });

    expect(result.result.kind).toBe("success");
    if (result.result.kind === "success") {
      expect(result.result.value).toEqual({
        span: { traceId: "trace-123", spanId: "span-456" },
        user: { id: 1, name: "John Doe" },
      });
    }
  });

  it("should work with data accessor preset", async () => {
    const tracingAccessor = accessor(
      "tracing",
      custom<{
        enabled: boolean;
        level: string;
      }>()
    );

    const testFlow = flow.provide(
      {
        input: custom<void>(),
        output: custom<{ enabled: boolean; level: string }>(),
      },
      (_, controller) => {
        const tracing = tracingAccessor.get(controller.context);
        return tracing;
      }
    );

    // Use preset to create initial context
    const initialContext = new Map([
      tracingAccessor.preset({ enabled: true, level: "debug" }),
    ]);

    const result = await flow.execute(testFlow, undefined, {
      initialContext,
    });

    expect(result.result.kind).toBe("success");
    if (result.result.kind === "success") {
      expect(result.result.value).toEqual({ enabled: true, level: "debug" });
    }
  });

  it("should merge initial context in nested executions", async () => {
    const parentKey = Symbol("parent");
    const childKey = Symbol("child");

    const childFlow = flow.provide(
      {
        input: custom<void>(),
        output: custom<{ parent: string; child: string }>(),
      },
      (_, controller) => {
        return {
          parent: controller.context.get(parentKey) as string,
          child: controller.context.get(childKey) as string,
        };
      }
    );

    const parentFlow = flow.derive(
      {
        dependencies: childFlow,
        input: custom<void>(),
        output: custom<{ parent: string; child: string }>(),
      },
      async (childFlow, input, controller) => {
        controller.context.set(parentKey, "parent-value");

        const result = await controller.execute(childFlow, undefined, {
          initialContext: new Map([[childKey, "child-value"]]),
        });

        return result;
      }
    );

    const result = await flow.execute(parentFlow, undefined);

    if (result.result.kind === "error") {
      console.error("Error:", result.result.error);
    }
    expect(result.result.kind).toBe("success");
    if (result.result.kind === "success") {
      expect(result.result.value).toEqual({
        parent: "parent-value",
        child: "child-value",
      });
    }
  });
});
