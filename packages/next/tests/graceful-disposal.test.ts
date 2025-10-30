import { describe, it, expect } from "vitest";
import { createScope, ScopeDisposingError, GracePeriodExceededError } from "../src/scope";
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
