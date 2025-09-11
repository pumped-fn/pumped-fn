import { flow, accessor, custom } from "../src";
import { test, describe, expect } from "vitest";
import type { Flow } from "../src/types";

describe("flow map context and opts plugins", () => {
  test("data accessors provide type-safe context access", async () => {
    // Define typed accessors
    const countAccessor = accessor("count", custom<number>());
    const messageAccessor = accessor("message", custom<string>());

    const testFlow = flow.provide(
      {
        name: "testFlow",
        input: custom<{ value: number }>(),
        output: custom<{ count: number; message?: string }>(),
      },
      async (input, controller) => {
        // Set typed values
        countAccessor.set(controller.context.data, input.value);
        messageAccessor.set(controller.context.data, `Value is ${input.value}`);

        // Get typed values
        const count = countAccessor.get(controller.context.data);
        const message = messageAccessor.find(controller.context.data);

        return { count, message };
      }
    );

    const { result } = await flow.execute(testFlow, { value: 42 });

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.value.count).toBe(42);
      expect(result.value.message).toBe("Value is 42");
    }
  });

  test("opts.plugins are added to nested execution", async () => {
    const executionOrder: string[] = [];

    // Create plugin factories
    const createPlugin = (name: string): Flow.FlowPlugin => ({
      name,
      async wrap(context, execute) {
        executionOrder.push(`${name}:start`);
        try {
          return await execute();
        } finally {
          executionOrder.push(`${name}:end`);
        }
      },
    });

    const childFlow = flow.provide(
      {
        name: "childFlow",
        input: custom<{}>(),
        output: custom<{ done: boolean }>(),
      },
      async () => {
        executionOrder.push("child:execute");
        return { done: true };
      }
    );

    const parentFlow = flow.derive(
      {
        name: "parentFlow",
        dependencies: { childFlow },
        input: custom<{}>(),
        output: custom<{ done: boolean }>(),
      },
      async ({ childFlow }, input, controller) => {
        executionOrder.push("parent:execute");

        // Execute child with additional plugin
        await controller.execute(
          childFlow,
          {},
          {
            plugins: [createPlugin("nested")],
          }
        );

        return { done: true };
      }
    );

    await flow.execute(
      parentFlow,
      {},
      {
        plugins: [createPlugin("root")],
      }
    );

    // Verify plugin composition
    expect(executionOrder).toEqual([
      "root:start",
      "parent:execute",
      "root:start", // Root plugin applies to child too
      "nested:start", // Additional plugin from opts
      "child:execute",
      "nested:end",
      "root:end",
      "root:end",
    ]);
  });

  test("Symbol keys prevent collision between plugins", async () => {
    // Two plugins using same string key but different symbols
    const plugin1Accessor = accessor("shared", custom<string>());
    const plugin2Accessor = accessor("shared", custom<number>());

    const plugin1: Flow.FlowPlugin = {
      name: "plugin1",
      async wrap(context, execute) {
        plugin1Accessor.set(context.data, "from plugin1");
        return execute();
      },
    };

    const plugin2: Flow.FlowPlugin = {
      name: "plugin2",
      async wrap(context, execute) {
        plugin2Accessor.set(context.data, 42);
        return execute();
      },
    };

    const testFlow = flow.provide(
      {
        name: "testFlow",
        input: custom<{}>(),
        output: custom<{ value1?: string; value2?: number }>(),
      },
      async (input, controller) => {
        // Both accessors use different symbols despite same string key
        const value1 = plugin1Accessor.find(controller.context.data);
        const value2 = plugin2Accessor.find(controller.context.data);

        return { value1, value2 };
      }
    );

    const { result } = await flow.execute(
      testFlow,
      {},
      {
        plugins: [plugin1, plugin2],
      }
    );

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.value.value1).toBe("from plugin1");
      expect(result.value.value2).toBe(42);
    }
  });
});
