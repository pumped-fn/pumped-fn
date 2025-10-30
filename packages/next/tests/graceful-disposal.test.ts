import { describe, it, expect } from "vitest";
import { createScope, ScopeDisposingError, GracePeriodExceededError } from "../src/scope";
import { provide } from "../src/executor";
import { Promised } from "../src/promises";

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
      await expect(s.resolve(executor)).rejects.toThrow("Scope is disposing, operation canceled");
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
      const { flow } = await import("../src/flow");
      const flowExecutor = flow(() => "test");

      (s as any).scopeState = "disposing";

      await expect(s.exec(flowExecutor)).rejects.toThrow(ScopeDisposingError);
    });

    it("should throw error when scope is disposed", async () => {
      const s = createScope();
      const { flow } = await import("../src/flow");
      const flowExecutor = flow(() => "test");

      (s as any).scopeState = "disposed";

      await expect(s.exec(flowExecutor)).rejects.toThrow("Scope is disposed");
    });

    it("should work normally when scope is active", async () => {
      const s = createScope();
      const { flow } = await import("../src/flow");
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
      const { flow } = await import("../src/flow");

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
      const { flow } = await import("../src/flow");

      const flowExecutor = flow(() => "test");

      await s.exec(flowExecutor);

      const activeSize = (s as any).activeExecutions.size;
      const pendingSize = (s as any).pendingResolutions.size;

      expect(activeSize).toBe(0);
      expect(pendingSize).toBe(0);
    });

    it("should cleanup on error", async () => {
      const s = createScope();
      const { flow } = await import("../src/flow");

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
