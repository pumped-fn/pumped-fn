import { describe, it, expect, vi } from "vitest";
import { createScope, provide, derive, plugin } from "../src";
import { 
  ExecutorResolutionError, 
  FactoryExecutionError, 
  DependencyResolutionError 
} from "../src/types";

describe("Error Handling", () => {
  describe("Global Error Callbacks", () => {
    it("should trigger global error callback on factory error", async () => {
      const scope = createScope();
      const errorCallback = vi.fn();
      
      scope.onError(errorCallback);
      
      const failingExecutor = provide(() => {
        throw new Error("Test error");
      });
      
      try {
        await scope.resolve(failingExecutor);
      } catch (error) {
        // Expected to throw
      }
      
      expect(errorCallback).toHaveBeenCalledTimes(1);
      expect(errorCallback).toHaveBeenCalledWith(
        expect.any(FactoryExecutionError),
        failingExecutor,
        scope
      );
    });

    it("should trigger global error callback on dependency resolution error", async () => {
      const scope = createScope();
      const errorCallback = vi.fn();
      
      scope.onError(errorCallback);
      
      const dependencyExecutor = provide(() => {
        throw new Error("Dependency error");
      });
      
      const mainExecutor = derive(dependencyExecutor, (dep) => {
        return `Using ${dep}`;
      });
      
      try {
        await scope.resolve(mainExecutor);
      } catch (error) {
        // Expected to throw
      }
      
      // Should be called twice - once for dependency error, once for main executor error
      expect(errorCallback).toHaveBeenCalledTimes(2);
      
      // First call should be for the dependency executor
      expect(errorCallback).toHaveBeenNthCalledWith(1,
        expect.any(FactoryExecutionError),
        dependencyExecutor,
        scope
      );
      
      // Second call should be for the main executor with a system error
      expect(errorCallback).toHaveBeenNthCalledWith(2,
        expect.any(ExecutorResolutionError),
        mainExecutor,
        scope
      );
    });

    it("should not trigger error callback on successful resolution", async () => {
      const scope = createScope();
      const errorCallback = vi.fn();
      
      scope.onError(errorCallback);
      
      const successExecutor = provide(() => "success");
      
      const result = await scope.resolve(successExecutor);
      
      expect(result).toBe("success");
      expect(errorCallback).not.toHaveBeenCalled();
    });

    it("should handle multiple global error callbacks", async () => {
      const scope = createScope();
      const errorCallback1 = vi.fn();
      const errorCallback2 = vi.fn();
      
      scope.onError(errorCallback1);
      scope.onError(errorCallback2);
      
      const failingExecutor = provide(() => {
        throw new Error("Test error");
      });
      
      try {
        await scope.resolve(failingExecutor);
      } catch (error) {
        // Expected to throw
      }
      
      expect(errorCallback1).toHaveBeenCalledTimes(1);
      expect(errorCallback2).toHaveBeenCalledTimes(1);
    });
  });

  describe("Per-Executor Error Callbacks", () => {
    it("should trigger per-executor error callback", async () => {
      const scope = createScope();
      const errorCallback = vi.fn();
      
      const failingExecutor = provide(() => {
        throw new Error("Test error");
      });
      
      scope.onError(failingExecutor, errorCallback);
      
      try {
        await scope.resolve(failingExecutor);
      } catch (error) {
        // Expected to throw
      }
      
      expect(errorCallback).toHaveBeenCalledTimes(1);
      expect(errorCallback).toHaveBeenCalledWith(
        expect.any(FactoryExecutionError),
        failingExecutor,
        scope
      );
    });

    it("should only trigger callback for specific executor", async () => {
      const scope = createScope();
      const errorCallback1 = vi.fn();
      const errorCallback2 = vi.fn();
      
      const executor1 = provide(() => {
        throw new Error("Error 1");
      });
      
      const executor2 = provide(() => {
        throw new Error("Error 2");
      });
      
      scope.onError(executor1, errorCallback1);
      scope.onError(executor2, errorCallback2);
      
      try {
        await scope.resolve(executor1);
      } catch (error) {
        // Expected to throw
      }
      
      expect(errorCallback1).toHaveBeenCalledTimes(1);
      expect(errorCallback2).not.toHaveBeenCalled();
    });

    it("should handle multiple callbacks for same executor", async () => {
      const scope = createScope();
      const errorCallback1 = vi.fn();
      const errorCallback2 = vi.fn();
      
      const failingExecutor = provide(() => {
        throw new Error("Test error");
      });
      
      scope.onError(failingExecutor, errorCallback1);
      scope.onError(failingExecutor, errorCallback2);
      
      try {
        await scope.resolve(failingExecutor);
      } catch (error) {
        // Expected to throw
      }
      
      expect(errorCallback1).toHaveBeenCalledTimes(1);
      expect(errorCallback2).toHaveBeenCalledTimes(1);
    });
  });

  describe("Plugin Error Handlers", () => {
    it("should trigger plugin error handler", async () => {
      const onError = vi.fn();
      const errorPlugin = plugin({
        onError
      });
      
      const scope = createScope({
        plugins: [errorPlugin]
      });
      
      const failingExecutor = provide(() => {
        throw new Error("Test error");
      });
      
      try {
        await scope.resolve(failingExecutor);
      } catch (error) {
        // Expected to throw
      }
      
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(
        expect.any(FactoryExecutionError),
        failingExecutor,
        scope
      );
    });

    it("should trigger multiple plugin error handlers", async () => {
      const onError1 = vi.fn();
      const onError2 = vi.fn();
      
      const plugin1 = plugin({ onError: onError1 });
      const plugin2 = plugin({ onError: onError2 });
      
      const scope = createScope({
        plugins: [plugin1, plugin2]
      });
      
      const failingExecutor = provide(() => {
        throw new Error("Test error");
      });
      
      try {
        await scope.resolve(failingExecutor);
      } catch (error) {
        // Expected to throw
      }
      
      expect(onError1).toHaveBeenCalledTimes(1);
      expect(onError2).toHaveBeenCalledTimes(1);
    });

    it("should not break error flow if plugin error handler throws", async () => {
      const onError = vi.fn().mockImplementation(() => {
        throw new Error("Plugin error");
      });
      
      const errorPlugin = plugin({ onError });
      const scope = createScope({
        plugins: [errorPlugin]
      });
      
      const failingExecutor = provide(() => {
        throw new Error("Original error");
      });
      
      // Should still throw the original error, not the plugin error
      await expect(scope.resolve(failingExecutor)).rejects.toThrow("Original error");
      
      expect(onError).toHaveBeenCalledTimes(1);
    });
  });

  describe("Error Callback Cleanup", () => {
    it("should remove global error callback when cleanup function is called", async () => {
      const scope = createScope();
      const errorCallback = vi.fn();
      
      const cleanup = scope.onError(errorCallback);
      cleanup(); // Remove the callback
      
      const failingExecutor = provide(() => {
        throw new Error("Test error");
      });
      
      try {
        await scope.resolve(failingExecutor);
      } catch (error) {
        // Expected to throw
      }
      
      expect(errorCallback).not.toHaveBeenCalled();
    });

    it("should remove per-executor error callback when cleanup function is called", async () => {
      const scope = createScope();
      const errorCallback = vi.fn();
      
      const failingExecutor = provide(() => {
        throw new Error("Test error");
      });
      
      const cleanup = scope.onError(failingExecutor, errorCallback);
      cleanup(); // Remove the callback
      
      try {
        await scope.resolve(failingExecutor);
      } catch (error) {
        // Expected to throw
      }
      
      expect(errorCallback).not.toHaveBeenCalled();
    });

    it("should clear all error callbacks on scope dispose", async () => {
      const scope = createScope();
      const globalCallback = vi.fn();
      const perExecutorCallback = vi.fn();
      
      const failingExecutor = provide(() => {
        throw new Error("Test error");
      });
      
      scope.onError(globalCallback);
      scope.onError(failingExecutor, perExecutorCallback);
      
      await scope.dispose();
      
      // Should not be able to add callbacks after dispose
      expect(() => scope.onError(globalCallback)).toThrow("Scope is disposed");
      expect(() => scope.onError(failingExecutor, perExecutorCallback)).toThrow("Scope is disposed");
    });
  });

  describe("Error Types", () => {
    it("should provide FactoryExecutionError for factory errors", async () => {
      const scope = createScope();
      const errorCallback = vi.fn();
      
      scope.onError(errorCallback);
      
      const failingExecutor = provide(() => {
        throw new Error("Factory error");
      });
      
      try {
        await scope.resolve(failingExecutor);
      } catch (error) {
        // Expected to throw
      }
      
      const [capturedError] = errorCallback.mock.calls[0];
      expect(capturedError).toBeInstanceOf(FactoryExecutionError);
      expect(capturedError.category).toBe("USER_ERROR");
      expect(capturedError.context.resolutionStage).toBe("factory-execution");
    });

    it("should provide error context information", async () => {
      const scope = createScope();
      const errorCallback = vi.fn();
      
      scope.onError(errorCallback);
      
      const failingExecutor = provide(() => {
        throw new Error("Test error");
      });
      
      try {
        await scope.resolve(failingExecutor);
      } catch (error) {
        // Expected to throw
      }
      
      const [capturedError] = errorCallback.mock.calls[0];
      expect(capturedError.context).toMatchObject({
        resolutionStage: "factory-execution",
        dependencyChain: expect.any(Array),
        timestamp: expect.any(Number)
      });
    });
  });

  describe("Async Error Handling", () => {
    it("should handle async error callbacks", async () => {
      const scope = createScope();
      const asyncErrorCallback = vi.fn().mockResolvedValue(undefined);
      
      scope.onError(asyncErrorCallback);
      
      const failingExecutor = provide(() => {
        throw new Error("Test error");
      });
      
      try {
        await scope.resolve(failingExecutor);
      } catch (error) {
        // Expected to throw
      }
      
      expect(asyncErrorCallback).toHaveBeenCalledTimes(1);
    });

    it("should handle async factory errors", async () => {
      const scope = createScope();
      const errorCallback = vi.fn();
      
      scope.onError(errorCallback);
      
      const asyncFailingExecutor = provide(async () => {
        throw new Error("Async error");
      });
      
      try {
        await scope.resolve(asyncFailingExecutor);
      } catch (error) {
        // Expected to throw
      }
      
      expect(errorCallback).toHaveBeenCalledTimes(1);
      const [capturedError] = errorCallback.mock.calls[0];
      expect(capturedError).toBeInstanceOf(FactoryExecutionError);
    });
  });
});