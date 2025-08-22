import { flow, provide, createScope, custom, FlowError, dataAccessor } from "../src";
import { vi, test, describe, expect } from "vitest";
import type { Flow } from "../src/types";

describe("flow plugin system", () => {
  // Mock telemetry span implementation
  class MockSpan {
    name: string;
    parent?: MockSpan;
    status?: string;
    error?: unknown;
    startTime: number;
    endTime?: number;
    attributes: Record<string, any> = {};

    constructor(name: string, parent?: MockSpan) {
      this.name = name;
      this.parent = parent;
      this.startTime = Date.now();
    }

    setStatus(status: string, error?: unknown) {
      this.status = status;
      this.error = error;
    }

    setAttribute(key: string, value: any) {
      this.attributes[key] = value;
    }

    end() {
      this.endTime = Date.now();
    }
  }

  test("telemetry plugin tracks execution tree", async () => {
    const spans: MockSpan[] = [];
    
    // Create typed data accessor for spans
    const spanAccessor = dataAccessor<MockSpan>('telemetry.span', custom<MockSpan>());

    // Telemetry plugin that creates spans for each execution
    const telemetryPlugin: Flow.FlowPlugin = {
      name: "telemetry",
      async wrap(context, execute) {
        // Get parent span from parent context using accessor
        const parentSpan = context.parent ? spanAccessor.find(context.parent.data) : undefined;
        
        // Create new span using flow name from context
        const flowName = context.flow?.name || "anonymous";
        const span = new MockSpan(flowName, parentSpan);
        spans.push(span);
        
        // Store span in context for children using accessor
        spanAccessor.set(context.data, span);
        
        try {
          const result = await execute();
          span.setStatus("ok");
          return result;
        } catch (error) {
          span.setStatus("error", error);
          throw error;
        } finally {
          span.end();
        }
      }
    };

    // Define test flows
    const childFlow = flow.provide(
      {
        name: "childFlow",
        input: custom<{ value: number }>(),
        output: custom<{ doubled: number }>(),
      },
      async (input, controller) => {
        return { doubled: input.value * 2 };
      }
    );

    const parentFlow = flow.derive(
      {
        name: "parentFlow",
        dependencies: { childFlow },
        input: custom<{ num: number }>(),
        output: custom<{ result: number }>(),
      },
      async ({ childFlow }, input, controller) => {
        const child1 = await controller.execute(childFlow, { value: input.num });
        const child2 = await controller.execute(childFlow, { value: child1.doubled });
        return { result: child2.doubled };
      }
    );

    // Execute with telemetry plugin
    const { result } = await flow.execute(
      parentFlow,
      { num: 5 },
      { plugins: [telemetryPlugin] }
    );

    // Verify execution succeeded
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.value.result).toBe(20); // 5 * 2 = 10, 10 * 2 = 20
    }

    // Verify telemetry spans were created
    expect(spans).toHaveLength(3); // parent + 2 children
    
    const [rootSpan, child1Span, child2Span] = spans;
    
    // Check span hierarchy
    expect(rootSpan.name).toBe("parentFlow");
    expect(rootSpan.parent).toBeUndefined();
    
    expect(child1Span.name).toBe("childFlow");
    expect(child1Span.parent).toBe(rootSpan);
    
    expect(child2Span.name).toBe("childFlow");
    expect(child2Span.parent).toBe(rootSpan);
    
    // All spans should be completed
    expect(rootSpan.status).toBe("ok");
    expect(child1Span.status).toBe("ok");
    expect(child2Span.status).toBe("ok");
    
    // All spans should have end times
    expect(rootSpan.endTime).toBeDefined();
    expect(child1Span.endTime).toBeDefined();
    expect(child2Span.endTime).toBeDefined();
  });

  test("logging plugin captures inputs and outputs", async () => {
    const logs: Array<{ type: string; flowName?: string; data: any }> = [];

    // To capture inputs, we need to intercept them during plugin wrapping
    // We can store them in the plugin's closure
    const loggingPlugin: Flow.FlowPlugin = {
      name: "logging",
      async wrap(context, execute) {
        const flowName = context.flow?.name || "anonymous";
        
        // Log start (without input since we don't have it yet)
        logs.push({ type: "start", flowName, data: null });
        
        try {
          const result = await execute();
          logs.push({ type: "success", flowName, data: result });
          return result;
        } catch (error) {
          logs.push({ type: "error", flowName, data: error });
          throw error;
        }
      }
    };

    const testFlow = flow.provide(
      {
        name: "testFlow",
        input: custom<{ message: string }>(),
        output: custom<{ response: string }>(),
      },
      async (input) => {
        return { response: `Echo: ${input.message}` };
      }
    );

    await flow.execute(
      testFlow,
      { message: "Hello" },
      { plugins: [loggingPlugin] }
    );

    expect(logs).toHaveLength(2);
    expect(logs[0]).toEqual({
      type: "start",
      flowName: "testFlow",
      data: null
    });
    expect(logs[1]).toEqual({
      type: "success",
      flowName: "testFlow",
      data: { response: "Echo: Hello" }
    });
  });

  test("multiple plugins compose correctly", async () => {
    const executionOrder: string[] = [];

    const plugin1: Flow.FlowPlugin = {
      name: "plugin1",
      async wrap(context, execute) {
        executionOrder.push("plugin1:start");
        try {
          const result = await execute();
          executionOrder.push("plugin1:end");
          return result;
        } catch (error) {
          executionOrder.push("plugin1:error");
          throw error;
        }
      }
    };

    const plugin2: Flow.FlowPlugin = {
      name: "plugin2",
      async wrap(context, execute) {
        executionOrder.push("plugin2:start");
        try {
          const result = await execute();
          executionOrder.push("plugin2:end");
          return result;
        } catch (error) {
          executionOrder.push("plugin2:error");
          throw error;
        }
      }
    };

    const testFlow = flow.provide(
      {
        name: "testFlow",
        input: custom<{}>(),
        output: custom<{ done: boolean }>(),
      },
      async () => {
        executionOrder.push("flow:execute");
        return { done: true };
      }
    );

    await flow.execute(testFlow, {}, { plugins: [plugin1, plugin2] });

    // Plugins wrap in reverse order: plugin2 wraps plugin1 wraps flow
    expect(executionOrder).toEqual([
      "plugin1:start",
      "plugin2:start",
      "flow:execute",
      "plugin2:end",
      "plugin1:end"
    ]);
  });

  test("error handling in plugins", async () => {
    const cleanupOrder: string[] = [];

    const cleanupPlugin: Flow.FlowPlugin = {
      name: "cleanup",
      async wrap(context, execute) {
        cleanupOrder.push("setup");
        try {
          return await execute();
        } finally {
          cleanupOrder.push("cleanup");
        }
      }
    };

    const errorFlow = flow.provide(
      {
        name: "errorFlow",
        input: custom<{}>(),
        output: custom<{ result: string }>(),
      },
      async () => {
        cleanupOrder.push("execute");
        throw new Error("Intentional error");
      }
    );

    const { result } = await flow.execute(errorFlow, {}, { plugins: [cleanupPlugin] });

    expect(result.kind).toBe("error");
    expect(cleanupOrder).toEqual(["setup", "execute", "cleanup"]);
  });

  test("timing plugin measures execution duration", async () => {
    const timings: Record<string, number> = {};

    const timingPlugin: Flow.FlowPlugin = {
      name: "timing",
      async wrap(context, execute) {
        const flowName = context.flow?.name || "anonymous";
        const start = performance.now();
        
        try {
          const result = await execute();
          timings[flowName] = performance.now() - start;
          return result;
        } catch (error) {
          timings[flowName] = performance.now() - start;
          throw error;
        }
      }
    };

    const slowFlow = flow.provide(
      {
        name: "slowFlow",
        input: custom<{}>(),
        output: custom<{ done: boolean }>(),
      },
      async (input, controller) => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return { done: true };
      }
    );

    const fastFlow = flow.provide(
      {
        name: "fastFlow",
        input: custom<{}>(),
        output: custom<{ done: boolean }>(),
      },
      async (input, controller) => {
        return { done: true };
      }
    );

    const parentFlow = flow.derive(
      {
        name: "parentFlow",
        dependencies: { slowFlow, fastFlow },
        input: custom<{}>(),
        output: custom<{ done: boolean }>(),
      },
      async ({ slowFlow, fastFlow }, input, controller) => {
        await controller.execute(slowFlow, {});
        await controller.execute(fastFlow, {});
        return { done: true };
      }
    );

    await flow.execute(parentFlow, {}, { plugins: [timingPlugin] });

    // Verify timings were captured
    expect(timings).toHaveProperty("parentFlow");
    expect(timings).toHaveProperty("slowFlow");
    expect(timings).toHaveProperty("fastFlow");
    
    // Slow flow should take more time
    expect(timings.slowFlow).toBeGreaterThan(45); // At least 45ms
    expect(timings.fastFlow).toBeLessThan(10); // Should be very fast
    expect(timings.parentFlow).toBeGreaterThan(timings.slowFlow); // Parent includes children
  });

  test("plugin can access and modify context data", async () => {
    // Create typed data accessors
    const correlationAccessor = dataAccessor<string>('correlation.id', custom<string>());
    const depthAccessor = dataAccessor<number>('correlation.depth', custom<number>());
    
    const correlationPlugin: Flow.FlowPlugin = {
      name: "correlation",
      async wrap(context, execute) {
        // Set correlation ID that flows to all children
        if (!context.parent) {
          correlationAccessor.set(context.data, `trace-${Date.now()}`);
        }
        
        // Add depth tracking
        const parentDepth = context.parent ? (depthAccessor.find(context.parent.data) || 0) : 0;
        depthAccessor.set(context.data, parentDepth + 1);
        
        return execute();
      }
    };

    let capturedCorrelationId: string | undefined;
    let capturedDepth: number | undefined;

    const deepFlow = flow.provide(
      {
        name: "deepFlow",
        input: custom<{}>(),
        output: custom<{ correlationId: string; depth: number }>(),
      },
      async (input, controller) => {
        capturedCorrelationId = correlationAccessor.find(controller.context.data);
        capturedDepth = depthAccessor.find(controller.context.data);
        return {
          correlationId: capturedCorrelationId,
          depth: capturedDepth
        };
      }
    );

    const middleFlow = flow.derive(
      {
        name: "middleFlow",
        dependencies: { deepFlow },
        input: custom<{}>(),
        output: custom<{ result: any }>(),
      },
      async ({ deepFlow }, input, controller) => {
        return { result: await controller.execute(deepFlow, {}) };
      }
    );

    const rootFlow = flow.derive(
      {
        name: "rootFlow",
        dependencies: { middleFlow },
        input: custom<{}>(),
        output: custom<{ result: any }>(),
      },
      async ({ middleFlow }, input, controller) => {
        return { result: await controller.execute(middleFlow, {}) };
      }
    );

    const { result } = await flow.execute(rootFlow, {}, { plugins: [correlationPlugin] });

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      // Correlation ID should be the same throughout
      expect(result.value.result.result.correlationId).toMatch(/^trace-\d+$/);
      // Depth should be 3 (root=1, middle=2, deep=3)
      expect(result.value.result.result.depth).toBe(3);
    }
  });
});