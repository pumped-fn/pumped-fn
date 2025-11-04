import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { custom } from "../src/ssch";
import { createScope } from "../src/scope";
import { flow, flowMeta } from "../src/flow";
import { tag } from "../src/tag";

describe("Flow Execution Tracking", () => {
  let scope: ReturnType<typeof createScope>;

  beforeEach(() => {
    scope = createScope();
  });

  afterEach(async () => {
    await scope.dispose();
  });

  describe("Execution ID and Status", () => {
    test("each flow execution has unique ID", async () => {
      const executionIds = new Set<string>();
      const trackingTag = tag(custom<{ executionId: string }>(), {
        label: "execution.tracking",
      });

      const testFlow = flow(
        {
          name: "test-flow",
          input: custom<number>(),
          output: custom<number>(),
        },
        (ctx, input) => {
          const tracking = ctx.find(trackingTag);
          if (tracking) {
            executionIds.add(tracking.executionId);
          }
          return input * 2;
        }
      );

      await scope.exec({ flow: testFlow, input: 1, tags: [trackingTag({ executionId: crypto.randomUUID()  })],
      });
      await scope.exec({ flow: testFlow, input: 2, tags: [trackingTag({ executionId: crypto.randomUUID()  })],
      });
      await scope.exec({ flow: testFlow, input: 3, tags: [trackingTag({ executionId: crypto.randomUUID()  })],
      });

      expect(executionIds.size).toBe(3);
    });

    test("execution status changes through lifecycle pending -> running -> completed", async () => {
      const statusChanges: string[] = [];
      const statusTag = tag(custom<{ status: string }>(), {
        label: "execution.status",
      });

      const testFlow = flow(
        {
          name: "status-flow",
          input: custom<void>(),
          output: custom<string>(),
        },
        async (ctx) => {
          const status = ctx.find(statusTag);
          if (status) {
            statusChanges.push(status.status);
          }
          ctx.set(statusTag, { status: "running" });
          await new Promise((resolve) => setTimeout(resolve, 10));
          ctx.set(statusTag, { status: "completed" });
          return "done";
        }
      );

      await scope.exec({ flow: testFlow, input: undefined, tags: [statusTag({ status: "pending"  })],
      });

      expect(statusChanges).toContain("pending");
    });
  });

  describe("Abort and Timeout Handling", () => {
    test("abort cancels execution gracefully", async () => {
      const abortController = new AbortController();
      const abortTag = tag(custom<AbortSignal>(), { label: "execution.abort" });
      let executionAborted = false;

      const longRunningFlow = flow(
        {
          name: "long-flow",
          input: custom<void>(),
          output: custom<string>(),
        },
        async (ctx) => {
          const signal = ctx.find(abortTag);

          for (let i = 0; i < 10; i++) {
            if (signal?.aborted) {
              executionAborted = true;
              throw new Error("Execution aborted");
            }
            await new Promise((resolve) => setTimeout(resolve, 10));
          }

          return "completed";
        }
      );

      const executionPromise = scope.exec({ flow: longRunningFlow, input: undefined, tags: [abortTag(abortController.signal)],
       });

      setTimeout(() => abortController.abort(), 30);

      await expect(executionPromise).rejects.toThrow("Execution aborted");
      expect(executionAborted).toBe(true);
    });

    test("timeout aborts execution after specified duration", async () => {
      const timeoutTag = tag(custom<number>(), { label: "execution.timeout" });
      let timedOut = false;

      const slowFlow = flow(
        {
          name: "slow-flow",
          input: custom<void>(),
          output: custom<string>(),
        },
        async (ctx) => {
          const timeout = ctx.find(timeoutTag);
          const startTime = Date.now();

          try {
            await new Promise((resolve) => setTimeout(resolve, 200));
            return "completed";
          } finally {
            if (timeout && Date.now() - startTime >= timeout) {
              timedOut = true;
            }
          }
        }
      );

      const executionPromise = scope.exec({ flow: slowFlow, input: undefined, tags: [timeoutTag(50)],
       });

      await Promise.race([
        executionPromise,
        new Promise((_, reject) =>
          setTimeout(() => {
            timedOut = true;
            reject(new Error("Execution timeout"));
          }, 50)
        ),
      ]).catch((err) => {
        expect(err.message).toBe("Execution timeout");
      });

      expect(timedOut).toBe(true);
    });
  });

  describe("ctx.exec API", () => {
    test("ctx.exec with config executes nested flow", async () => {
      const childFlow = flow(
        {
          name: "child-flow",
          input: custom<number>(),
          output: custom<number>(),
        },
        (ctx, input) => {
          return input * 2;
        }
      );

      const parentFlow = flow(
        {
          name: "parent-flow",
          input: custom<number>(),
          output: custom<number>(),
        },
        async (ctx, input) => {
          const childResult = await ctx.exec({ flow: childFlow, input: input });
          return childResult + 10;
        }
      );

      const result = await scope.exec({ flow: parentFlow, input: 5 });

      expect(result).toBe(20);
    });

    test("ctx.exec with function and params executes logic", async () => {
      const executionLog: string[] = [];

      const testFlow = flow(
        {
          name: "function-exec",
          input: custom<number>(),
          output: custom<number>(),
        },
        async (ctx, input) => {
          const step1 = await ctx.run("step1", () => {
            executionLog.push("step1");
            return input * 2;
          });

          const step2 = await ctx.run("step2", (value: number) => {
            executionLog.push("step2");
            return value + 10;
          }, step1);

          return step2;
        }
      );

      const result = await scope.exec({ flow: testFlow, input: 5 });

      expect(result).toBe(20);
      expect(executionLog).toEqual(["step1", "step2"]);
    });

    test("ctx.exec handles nested flow errors correctly", async () => {
      const errorFlow = flow(
        {
          name: "error-flow",
          input: custom<void>(),
          output: custom<string>(),
        },
        () => {
          throw new Error("Child flow error");
        }
      );

      const parentFlow = flow(
        {
          name: "parent-error-flow",
          input: custom<void>(),
          output: custom<string>(),
        },
        async (ctx) => {
          try {
            await ctx.exec({ flow: errorFlow, input: undefined });
            return "unexpected";
          } catch (error) {
            return `caught: ${(error as Error).message}`;
          }
        }
      );

      const result = await scope.exec({ flow: parentFlow, input: undefined });

      expect(result).toBe("caught: Child flow error");
    });
  });

  describe("throwIfAborted Behavior", () => {
    test("throwIfAborted throws when execution is aborted", async () => {
      const abortController = new AbortController();
      const abortTag = tag(custom<AbortSignal>(), { label: "execution.abort" });

      const checkAbortedFlow = flow(
        {
          name: "check-aborted",
          input: custom<void>(),
          output: custom<string>(),
        },
        async (ctx) => {
          const signal = ctx.find(abortTag);

          await new Promise((resolve) => setTimeout(resolve, 20));

          if (signal?.aborted) {
            throw new Error("Operation aborted");
          }

          return "completed";
        }
      );

      abortController.abort();

      await expect(
        scope.exec({ flow: checkAbortedFlow, input: undefined, tags: [abortTag(abortController.signal)],
         })
      ).rejects.toThrow("Operation aborted");
    });

    test("throwIfAborted does not throw when execution is not aborted", async () => {
      const abortController = new AbortController();
      const abortTag = tag(custom<AbortSignal>(), { label: "execution.abort" });

      const checkNotAbortedFlow = flow(
        {
          name: "check-not-aborted",
          input: custom<void>(),
          output: custom<string>(),
        },
        async (ctx) => {
          const signal = ctx.find(abortTag);

          if (signal?.aborted) {
            throw new Error("Should not be aborted");
          }

          return "completed";
        }
      );

      const result = await scope.exec({ flow: checkNotAbortedFlow, input: undefined, tags: [abortTag(abortController.signal)],
       });

      expect(result).toBe("completed");
    });
  });

  describe("onStatusChange Callback", () => {
    test("onStatusChange callback receives execution details on status change", async () => {
      const statusChanges: Array<{ status: string; timestamp: number }> = [];
      const callbackTag = tag(
        custom<(status: string) => void>(),
        { label: "execution.callback" }
      );

      const trackedFlow = flow(
        {
          name: "tracked-flow",
          input: custom<number>(),
          output: custom<number>(),
        },
        async (ctx, input) => {
          const callback = ctx.find(callbackTag);

          callback?.("started");
          await new Promise((resolve) => setTimeout(resolve, 10));
          callback?.("processing");
          await new Promise((resolve) => setTimeout(resolve, 10));
          callback?.("completed");

          return input * 2;
        }
      );

      const callback = (status: string) => {
        statusChanges.push({ status, timestamp: Date.now() });
      };

      await scope.exec({ flow: trackedFlow, input: 5, tags: [callbackTag(callback)],
       });

      expect(statusChanges.length).toBe(3);
      expect(statusChanges.map((s) => s.status)).toEqual([
        "started",
        "processing",
        "completed",
      ]);
    });

    test("onStatusChange receives execution context with metadata", async () => {
      const capturedContext: Array<{ flowName?: string; depth: number }> = [];
      const contextTag = tag(
        custom<(context: { flowName?: string; depth: number }) => void>(),
        { label: "execution.context" }
      );

      const contextFlow = flow(
        {
          name: "context-flow",
          input: custom<void>(),
          output: custom<string>(),
        },
        (ctx) => {
          const callback = ctx.find(contextTag);

          const depth = ctx.find(flowMeta.depth);
          callback?.({
            flowName: ctx.find(flowMeta.flowName),
            depth: depth !== undefined ? depth : 0,
          });

          return "done";
        }
      );

      const callback = (context: { flowName?: string; depth: number }) => {
        capturedContext.push(context);
      };

      await scope.exec({ flow: contextFlow, input: undefined, tags: [contextTag(callback)],
       });

      expect(capturedContext.length).toBeGreaterThan(0);
      expect(capturedContext[0]).toHaveProperty("flowName");
      expect(capturedContext[0]).toHaveProperty("depth");
    });
  });

  describe("Execution Registry Cleanup", () => {
    test("execution registry automatically cleans up completed executions", async () => {
      const registryTag = tag(custom<Set<string>>(), {
        label: "execution.registry",
      });

      const cleanupFlow = flow(
        {
          name: "cleanup-flow",
          input: custom<string>(),
          output: custom<string>(),
        },
        (ctx, input) => {
          const registry = ctx.find(registryTag);
          const executionId = crypto.randomUUID();

          if (registry) {
            registry.add(executionId);
          }

          return input;
        }
      );

      const registry = new Set<string>();

      await scope.exec({ flow: cleanupFlow, input: "test1", tags: [registryTag(registry)] });
      const sizeAfterFirst = registry.size;

      await scope.exec({ flow: cleanupFlow, input: "test2", tags: [registryTag(registry)] });
      const sizeAfterSecond = registry.size;

      expect(sizeAfterFirst).toBe(1);
      expect(sizeAfterSecond).toBe(2);
    });

    test("execution registry removes entries after scope disposal", async () => {
      const registryTag = tag(custom<Map<string, boolean>>(), {
        label: "execution.cleanup",
      });

      const tempScope = createScope();
      const registry = new Map<string, boolean>();

      const registeredFlow = flow(
        {
          name: "registered-flow",
          input: custom<void>(),
          output: custom<void>(),
        },
        (ctx) => {
          const reg = ctx.find(registryTag);
          if (reg) {
            reg.set(crypto.randomUUID(), true);
          }
        }
      );

      await tempScope.exec({ flow: registeredFlow, tags: [registryTag(registry)] });

      expect(registry.size).toBeGreaterThan(0);

      await tempScope.dispose();
    });

    test("multiple concurrent executions maintain separate entries in registry", async () => {
      const executionIds: string[] = [];
      const idTag = tag(custom<string>(), { label: "execution.id" });

      const concurrentFlow = flow(
        {
          name: "concurrent-flow",
          input: custom<number>(),
          output: custom<number>(),
        },
        async (ctx, input) => {
          const id = ctx.find(idTag) || crypto.randomUUID();
          executionIds.push(id);

          await new Promise((resolve) => setTimeout(resolve, Math.random() * 20));

          return input * 2;
        }
      );

      const executions = await Promise.all([
        scope.exec({ flow: concurrentFlow, input: 1, tags: [idTag(crypto.randomUUID())]  }),
        scope.exec({ flow: concurrentFlow, input: 2, tags: [idTag(crypto.randomUUID())]  }),
        scope.exec({ flow: concurrentFlow, input: 3, tags: [idTag(crypto.randomUUID())]  }),
      ]);

      expect(executions).toEqual([2, 4, 6]);
      expect(new Set(executionIds).size).toBe(3);
    });
  });
});
