import { describe, test, expect } from "vitest";
import { flow, execute, type FlowPlugin } from "../src/flow";
import { custom } from "../src/ssch";
import { accessor } from "../src/accessor";
import { testFlows, PluginFactory, testSetup } from "./test-utils";

describe("FlowV2 Plugins", () => {
  describe("plugin execution orchestration", () => {
    test("executes plugins in nested onion-layer pattern around flow", async () => {
      const execOrder: string[] = [];
      const plugin1 = PluginFactory.executionOrder(execOrder, "plugin1");
      const plugin2 = PluginFactory.executionOrder(execOrder, "plugin2");
      const testFlow = testFlows.basic("test.flow");

      const testImpl = testFlow.provide(async (ctx, input) => {
        execOrder.push("flow-execution");
        return ctx.ok({ result: `Hello ${input.message}` });
      });

      await execute(
        testImpl,
        { message: "world" },
        {
          plugins: [plugin1, plugin2],
        }
      );

      expect(execOrder).toEqual([
        "plugin1-before",
        "plugin2-before",
        "flow-execution",
        "plugin2-after",
        "plugin1-after",
      ]);
    });

    test("manages plugin lifecycle through init-wrap-dispose sequence", async () => {
      const lifecycleCalls: string[] = [];
      const plugin = PluginFactory.lifecycle(
        lifecycleCalls,
        "lifecycle-plugin"
      );
      const testFlow = testFlows.basic("test.flow");

      const testImpl = testFlow.provide(async (ctx, input) => {
        return ctx.ok({ result: "test" });
      });

      await execute(
        testImpl,
        { message: "test" },
        {
          plugins: [plugin],
        }
      );

      expect(lifecycleCalls).toEqual([
        "lifecycle-plugin-init",
        "lifecycle-plugin-wrap",
        "lifecycle-plugin-dispose",
      ]);
    });
  });

  describe("data accessors and plugin communication", () => {
    test("enables data sharing between plugins through context accessors", async () => {
      const requestIdAccessor = accessor<string>(
        "request.id",
        custom<string>()
      );

      let capturedRequestId: string | undefined;

      const setupPlugin: FlowPlugin = {
        name: "setup",
        init(pod, context) {
          requestIdAccessor.set(context, "req-12345");
        },
      };

      const readPlugin: FlowPlugin = {
        name: "reader",
        async wrap(context, next) {
          capturedRequestId = requestIdAccessor.find(context);
          return next();
        },
      };

      const testFlow = testFlows.basic("test.flow");
      const testImpl = testFlow.provide(async (ctx, input) => {
        return ctx.ok({ result: "test" });
      });

      await execute(
        testImpl,
        { message: "test" },
        {
          plugins: [setupPlugin, readPlugin],
        }
      );

      expect(capturedRequestId).toBe("req-12345");
    });

    test("provides pre-populated context data through initialContext parameter", async () => {
      const userIdAccessor = accessor<string>("user.id", custom<string>());

      let capturedUserId: string | undefined;

      const plugin: FlowPlugin = {
        name: "reader",
        async wrap(context, next) {
          capturedUserId = userIdAccessor.find(context);
          return next();
        },
      };

      const testFlow = testFlows.basic("test.flow");
      const testImpl = testFlow.provide(async (ctx, input) => {
        return ctx.ok({ result: "test" });
      });

      await execute(
        testImpl,
        { message: "test" },
        {
          plugins: [plugin],
          initialContext: [[userIdAccessor, "user-789"]],
        }
      );

      expect(capturedUserId).toBe("user-789");
    });
  });
});
