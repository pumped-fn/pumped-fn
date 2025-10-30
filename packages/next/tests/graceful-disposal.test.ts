import { describe, it, expect } from "vitest";
import {
  createScope,
  ScopeDisposingError,
  GracePeriodExceededError,
} from "../src/scope";
import { provide } from "../src/executor";
import { Promised } from "../src/promises";
import { flow } from "../src/flow";

describe("Graceful Disposal - Task 1: Types and Errors", () => {
  describe("ScopeState type", () => {
    it("should track scope state transitions", () => {
      const s = createScope();
      const stateField = (s as any).scopeState;
      expect(stateField).toBe("active");
    });
  });

  describe("State tracking fields", () => {
    it("should have activeExecutions Set", () => {
      const s = createScope();
      const activeExecutions = (s as any).activeExecutions;
      expect(activeExecutions).toBeInstanceOf(Set);
      expect(activeExecutions.size).toBe(0);
    });

    it("should have pendingResolutions Set", () => {
      const s = createScope();
      const pendingResolutions = (s as any).pendingResolutions;
      expect(pendingResolutions).toBeInstanceOf(Set);
      expect(pendingResolutions.size).toBe(0);
    });
  });

  describe("ScopeDisposingError", () => {
    it("should instantiate with correct message and name", () => {
      const error = new ScopeDisposingError();
      expect(error.message).toBe("Scope is disposing, operation canceled");
      expect(error.name).toBe("ScopeDisposingError");
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("GracePeriodExceededError", () => {
    it("should instantiate with correct message and name", () => {
      const error = new GracePeriodExceededError(5000);
      expect(error.message).toBe("Operation exceeded grace period of 5000ms");
      expect(error.name).toBe("GracePeriodExceededError");
      expect(error).toBeInstanceOf(Error);
    });
  });
});

describe("Graceful Disposal - Task 2: dispose() Signature", () => {
  it("should allow dispose() without options", async () => {
    const s = createScope();
    const result = s.dispose();
    expect(result).toBeInstanceOf(Promised);
    await result;
  });

  it("should allow dispose() with gracePeriod option", async () => {
    const s = createScope();
    const result = s.dispose({ gracePeriod: 1000 });
    expect(result).toBeInstanceOf(Promised);
    await result;
  });

  it("should return Promised<void>", async () => {
    const s = createScope();
    const result = s.dispose({ gracePeriod: 5000 });
    expect(result).toBeInstanceOf(Promised);
    const awaitedResult = await result;
    expect(awaitedResult).toBeUndefined();
  });
});

describe("Graceful Disposal - Task 3: State Checks", () => {
  describe("resolve() state validation", () => {
    it("should throw ScopeDisposingError when scope is disposing", async () => {
      const s = createScope();
      const executor = provide(() => "test");

      (s as any).scopeState = "disposing";

      await expect(s.resolve(executor)).rejects.toThrow(ScopeDisposingError);
      await expect(s.resolve(executor)).rejects.toThrow(
        "Scope is disposing, operation canceled"
      );
    });

    it("should throw error when scope is disposed", async () => {
      const s = createScope();
      const executor = provide(() => "test");

      (s as any).scopeState = "disposed";

      await expect(s.resolve(executor)).rejects.toThrow("Scope is disposed");
    });

    it("should work normally when scope is active", async () => {
      const s = createScope();
      const executor = provide(() => "test");

      const result = await s.resolve(executor);
      expect(result).toBe("test");
    });
  });

  describe("exec() state validation", () => {
    it("should throw ScopeDisposingError when scope is disposing", async () => {
      const s = createScope();
      const flowExecutor = flow(() => "test");

      (s as any).scopeState = "disposing";

      await expect(s.exec(flowExecutor)).rejects.toThrow(ScopeDisposingError);
    });

    it("should throw error when scope is disposed", async () => {
      const s = createScope();
      const flowExecutor = flow(() => "test");

      (s as any).scopeState = "disposed";

      await expect(s.exec(flowExecutor)).rejects.toThrow("Scope is disposed");
    });

    it("should work normally when scope is active", async () => {
      const s = createScope();
      const flowExecutor = flow(() => "test");

      const result = await s.exec(flowExecutor);
      expect(result).toBe("test");
    });
  });
});

describe("Graceful Disposal - Task 4: Operation Tracking", () => {
  describe("resolve() operation tracking", () => {
    it("should move operation to active during factory execution", async () => {
      const s = createScope();
      let capturedActiveSize = -1;

      const executor = provide(() => {
        capturedActiveSize = (s as any).activeExecutions.size;
        return "test";
      });

      await s.resolve(executor);

      expect(capturedActiveSize).toBeGreaterThan(0);
    });

    it("should remove operation after completion", async () => {
      const s = createScope();
      const executor = provide(() => "test");

      await s.resolve(executor);

      const activeSize = (s as any).activeExecutions.size;
      const pendingSize = (s as any).pendingResolutions.size;

      expect(activeSize).toBe(0);
      expect(pendingSize).toBe(0);
    });

    it("should cleanup on error", async () => {
      const s = createScope();
      const executor = provide(() => {
        throw new Error("test error");
      });

      await expect(s.resolve(executor)).rejects.toThrow("test error");

      const activeSize = (s as any).activeExecutions.size;
      const pendingSize = (s as any).pendingResolutions.size;

      expect(activeSize).toBe(0);
      expect(pendingSize).toBe(0);
    });
  });

  describe("exec() operation tracking", () => {
    it("should move operation to active during handler execution", async () => {
      const s = createScope();

      let capturedActiveSize = -1;
      const flowExecutor = flow(() => {
        capturedActiveSize = (s as any).activeExecutions.size;
        return "test";
      });

      await s.exec(flowExecutor);

      expect(capturedActiveSize).toBeGreaterThan(0);
    });

    it("should remove operation after completion", async () => {
      const s = createScope();

      const flowExecutor = flow(() => "test");

      await s.exec(flowExecutor);

      const activeSize = (s as any).activeExecutions.size;
      const pendingSize = (s as any).pendingResolutions.size;

      expect(activeSize).toBe(0);
      expect(pendingSize).toBe(0);
    });

    it("should cleanup on error", async () => {
      const s = createScope();

      const flowExecutor = flow(() => {
        throw new Error("test error");
      });

      await expect(s.exec(flowExecutor)).rejects.toThrow("test error");

      const activeSize = (s as any).activeExecutions.size;
      const pendingSize = (s as any).pendingResolutions.size;

      expect(activeSize).toBe(0);
      expect(pendingSize).toBe(0);
    });
  });
});

describe("Graceful Disposal - Task 5: Two-Phase Disposal", () => {
  describe("State transitions", () => {
    it("should transition active -> disposing -> disposed", async () => {
      const s = createScope();

      expect((s as any).scopeState).toBe("active");

      const disposePromise = s.dispose();

      await disposePromise;

      expect((s as any).scopeState).toBe("disposed");
    });
  });

  describe("Pending operations cancellation", () => {
    it("should reject new operations after disposal starts", async () => {
      const s = createScope();

      const executor1 = provide(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return "exec1";
      });

      s.resolve(executor1);

      await new Promise((resolve) => setTimeout(resolve, 10));

      const disposePromise = s.dispose({ gracePeriod: 200 });

      const executor2 = provide(() => "exec2");
      await expect(s.resolve(executor2)).rejects.toThrow(ScopeDisposingError);

      await disposePromise;
    });

    it("should clear pending resolutions set during disposal", async () => {
      const s = createScope();

      const executor = provide(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return "done";
      });

      s.resolve(executor);

      await s.dispose({ gracePeriod: 200 });

      expect((s as any).pendingResolutions.size).toBe(0);
    });
  });

  describe("Active operations grace period", () => {
    it("should wait for active operations within grace period", async () => {
      const s = createScope();
      let executionStarted = false;
      let executionCompleted = false;

      const executor = provide(async () => {
        executionStarted = true;
        await new Promise((resolve) => setTimeout(resolve, 50));
        executionCompleted = true;
        return "done";
      });

      const operationPromise = s.resolve(executor);

      while (!executionStarted) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }

      await s.dispose({ gracePeriod: 200 });

      expect(executionCompleted).toBe(true);
      expect((s as any).activeExecutions.size).toBe(0);

      await expect(operationPromise).resolves.toBe("done");
    });

    it("should timeout after grace period", async () => {
      const s = createScope();
      let executionStarted = false;
      let executionCompleted = false;

      const slowExecutor = provide(async () => {
        executionStarted = true;
        await new Promise((resolve) => setTimeout(resolve, 200));
        executionCompleted = true;
        return "slow";
      });

      s.resolve(slowExecutor);

      while (!executionStarted) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }

      await s.dispose({ gracePeriod: 50 });

      expect(executionCompleted).toBe(false);
      expect((s as any).scopeState).toBe("disposed");
    });

    it("should handle multiple active operations", async () => {
      const s = createScope();
      const started: string[] = [];
      const completed: string[] = [];

      const exec1 = provide(async () => {
        started.push("exec1");
        await new Promise((resolve) => setTimeout(resolve, 30));
        completed.push("exec1");
        return "exec1";
      });

      const exec2 = provide(async () => {
        started.push("exec2");
        await new Promise((resolve) => setTimeout(resolve, 40));
        completed.push("exec2");
        return "exec2";
      });

      const exec3 = provide(async () => {
        started.push("exec3");
        await new Promise((resolve) => setTimeout(resolve, 20));
        completed.push("exec3");
        return "exec3";
      });

      s.resolve(exec1);
      s.resolve(exec2);
      s.resolve(exec3);

      while (started.length < 3) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }

      await s.dispose({ gracePeriod: 100 });

      expect(completed).toContain("exec1");
      expect(completed).toContain("exec2");
      expect(completed).toContain("exec3");
    });
  });

  describe("Grace period values", () => {
    it("should use default grace period 5000ms", async () => {
      const s = createScope();
      let executionStarted = false;
      let executionCompleted = false;

      const executor = provide(async () => {
        executionStarted = true;
        await new Promise((resolve) => setTimeout(resolve, 20));
        executionCompleted = true;
        return "done";
      });

      s.resolve(executor);

      while (!executionStarted) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }

      await s.dispose();

      expect(executionCompleted).toBe(true);
    });

    it("should handle gracePeriod = 0", async () => {
      const s = createScope();
      let executionStarted = false;
      let executionCompleted = false;

      const executor = provide(async () => {
        executionStarted = true;
        await new Promise((resolve) => setTimeout(resolve, 50));
        executionCompleted = true;
        return "done";
      });

      s.resolve(executor);

      while (!executionStarted) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }

      await s.dispose({ gracePeriod: 0 });

      expect(executionCompleted).toBe(false);
      expect((s as any).scopeState).toBe("disposed");
    });

    it("should handle custom grace period 1000ms", async () => {
      const s = createScope();
      let executionStarted = false;
      let executionCompleted = false;

      const executor = provide(async () => {
        executionStarted = true;
        await new Promise((resolve) => setTimeout(resolve, 50));
        executionCompleted = true;
        return "done";
      });

      s.resolve(executor);

      while (!executionStarted) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }

      await s.dispose({ gracePeriod: 1000 });

      expect(executionCompleted).toBe(true);
    });
  });

  describe("Existing disposal logic", () => {
    it("should run extension disposal", async () => {
      let extensionDisposed = false;

      const extension = {
        name: "test-extension",
        init: () => {},
        dispose: async () => {
          extensionDisposed = true;
        },
      };

      const s = createScope({ extensions: [extension] });

      await s.dispose();

      expect(extensionDisposed).toBe(true);
    });

    it("should clear cache and release executors", async () => {
      const s = createScope();
      const executor = provide(() => "test");

      await s.resolve(executor);

      expect((s as any).cache.size).toBeGreaterThan(0);

      await s.dispose();

      expect((s as any).cache.size).toBe(0);
      expect((s as any).scopeState).toBe("disposed");
    });

    it("should clear event handlers", async () => {
      const s = createScope();

      s.onChange(() => {});
      s.onRelease(() => {});
      s.onError(() => {});

      expect((s as any).onEvents.change.size).toBeGreaterThan(0);
      expect((s as any).onEvents.release.size).toBeGreaterThan(0);
      expect((s as any).onEvents.error.size).toBeGreaterThan(0);

      await s.dispose();

      expect((s as any).onEvents.change.size).toBe(0);
      expect((s as any).onEvents.release.size).toBe(0);
      expect((s as any).onEvents.error.size).toBe(0);
    });
  });

  describe("Flow execution during disposal", () => {
    it("should wait for active flow executions", async () => {
      const s = createScope();
      let flowStarted = false;
      let flowCompleted = false;

      const flowExecutor = flow(async () => {
        flowStarted = true;
        await new Promise((resolve) => setTimeout(resolve, 50));
        flowCompleted = true;
        return "flow-done";
      });

      s.exec(flowExecutor);

      while (!flowStarted) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }

      await s.dispose({ gracePeriod: 200 });

      expect(flowCompleted).toBe(true);
    });

    it("should reject new flow executions after disposal starts", async () => {
      const s = createScope();

      const flowExecutor1 = flow(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return "flow1";
      });

      s.exec(flowExecutor1);

      await new Promise((resolve) => setTimeout(resolve, 10));

      const disposePromise = s.dispose({ gracePeriod: 200 });

      const flowExecutor2 = flow(() => "flow2");

      await expect(s.exec(flowExecutor2)).rejects.toThrow(ScopeDisposingError);

      await disposePromise;
    });
  });
});

describe("Graceful Disposal - Edge Cases", () => {
  describe("Dispose with no in-flight operations", () => {
    it("should dispose immediately when no operations are running", async () => {
      const s = createScope();

      expect((s as any).activeExecutions.size).toBe(0);
      expect((s as any).pendingResolutions.size).toBe(0);

      const startTime = Date.now();
      await s.dispose({ gracePeriod: 5000 });
      const elapsed = Date.now() - startTime;

      expect((s as any).scopeState).toBe("disposed");
      expect(elapsed).toBeLessThan(100);
    });

    it("should dispose scope that only had completed operations", async () => {
      const s = createScope();
      const executor = provide(() => "test");

      await s.resolve(executor);

      expect((s as any).activeExecutions.size).toBe(0);
      expect((s as any).pendingResolutions.size).toBe(0);

      await s.dispose();

      expect((s as any).scopeState).toBe("disposed");
    });
  });

  describe("Multiple dispose calls", () => {
    it("should throw error when calling dispose on already disposed scope", async () => {
      const s = createScope();

      await s.dispose({ gracePeriod: 100 });

      expect((s as any).scopeState).toBe("disposed");

      expect(() => s.dispose({ gracePeriod: 100 })).toThrow(
        "Scope is disposed"
      );
    });

    it("should handle concurrent dispose calls", async () => {
      const s = createScope();

      const dispose1 = s.dispose({ gracePeriod: 100 });
      const dispose2 = s.dispose({ gracePeriod: 100 });

      await Promise.all([dispose1, dispose2]);

      expect((s as any).scopeState).toBe("disposed");
    });

    it("should not restart disposal if already disposing", async () => {
      const s = createScope();
      let executionStarted = false;
      let executionCompleted = false;

      const slowExecutor = provide(async () => {
        executionStarted = true;
        await new Promise((resolve) => setTimeout(resolve, 100));
        executionCompleted = true;
        return "slow";
      });

      s.resolve(slowExecutor);

      while (!executionStarted) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }

      const dispose1 = s.dispose({ gracePeriod: 200 });

      await new Promise((resolve) => setTimeout(resolve, 10));

      const dispose2 = s.dispose({ gracePeriod: 200 });

      await Promise.all([dispose1, dispose2]);

      expect((s as any).scopeState).toBe("disposed");
      expect(executionCompleted).toBe(true);
    });
  });

  describe("Reject exec during disposal", () => {
    it("should reject exec calls when scope is disposing", async () => {
      const s = createScope();

      const slowFlow = flow(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return "slow";
      });

      s.exec(slowFlow);

      await new Promise((resolve) => setTimeout(resolve, 10));

      const disposePromise = s.dispose({ gracePeriod: 200 });

      const newFlow = flow(() => "new");

      await expect(s.exec(newFlow)).rejects.toThrow(ScopeDisposingError);
      await expect(s.exec(newFlow)).rejects.toThrow(
        "Scope is disposing, operation canceled"
      );

      await disposePromise;
    });

    it("should reject exec calls when scope is disposed", async () => {
      const s = createScope();

      await s.dispose();

      const flowExecutor = flow(() => "test");

      expect(() => s.exec(flowExecutor)).toThrow("Scope is disposed");
    });
  });

  describe("Zero grace period edge cases", () => {
    it("should immediately timeout active operations with gracePeriod=0", async () => {
      const s = createScope();
      let executionStarted = false;
      let executionCompleted = false;

      const executor = provide(async () => {
        executionStarted = true;
        await new Promise((resolve) => setTimeout(resolve, 100));
        executionCompleted = true;
        return "done";
      });

      s.resolve(executor);

      while (!executionStarted) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }

      const startTime = Date.now();
      await s.dispose({ gracePeriod: 0 });
      const elapsed = Date.now() - startTime;

      expect(executionCompleted).toBe(false);
      expect((s as any).scopeState).toBe("disposed");
      expect(elapsed).toBeLessThan(50);
    });

    it("should dispose immediately with gracePeriod=0 and no operations", async () => {
      const s = createScope();

      const startTime = Date.now();
      await s.dispose({ gracePeriod: 0 });
      const elapsed = Date.now() - startTime;

      expect((s as any).scopeState).toBe("disposed");
      expect(elapsed).toBeLessThan(50);
    });
  });

  describe("Mixed resolve and exec operations", () => {
    it("should handle disposal with both resolve and exec operations active", async () => {
      const s = createScope();
      const started: string[] = [];
      const completed: string[] = [];

      const resolveOp = provide(async () => {
        started.push("resolve");
        await new Promise((resolve) => setTimeout(resolve, 50));
        completed.push("resolve");
        return "resolved";
      });

      const flowOp = flow(async () => {
        started.push("flow");
        await new Promise((resolve) => setTimeout(resolve, 60));
        completed.push("flow");
        return "flowed";
      });

      s.resolve(resolveOp);
      s.exec(flowOp);

      while (started.length < 2) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }

      await s.dispose({ gracePeriod: 150 });

      expect(completed).toContain("resolve");
      expect(completed).toContain("flow");
      expect((s as any).scopeState).toBe("disposed");
    });

    it("should reject both resolve and exec after disposal starts", async () => {
      const s = createScope();

      const slowResolve = provide(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return "slow-resolve";
      });

      s.resolve(slowResolve);

      await new Promise((resolve) => setTimeout(resolve, 10));

      const disposePromise = s.dispose({ gracePeriod: 200 });

      const newResolve = provide(() => "new-resolve");
      const newFlow = flow(() => "new-flow");

      await expect(s.resolve(newResolve)).rejects.toThrow(ScopeDisposingError);
      await expect(s.exec(newFlow)).rejects.toThrow(ScopeDisposingError);

      await disposePromise;
    });
  });
});
