import { describe, test, expect, vi } from "vitest";
import { createScope, provide, derive, plugin } from "../src";
import { ExecutorResolutionError, FactoryExecutionError } from "../src/types";
import { errorTestHelpers, MockExecutors, testSetup } from "./test-utils";

describe("Error Handling", () => {
  describe("Global Error Callbacks", () => {
    test("triggers global error callback when executor factory throws", async () => {
      const failingExecutor = MockExecutors.failing("Test error");
      await errorTestHelpers.expectExecutorError(
        failingExecutor,
        FactoryExecutionError
      );
    });

    test("triggers error callbacks for both dependency and dependent executors", async () => {
      const { failingExecutor, chainedExecutor } =
        errorTestHelpers.createFailingChain("Dependency error");
      const { scope, errorCallback } = testSetup.scopeWithErrorHandler();

      await expect(scope.resolve(chainedExecutor)).rejects.toThrow();

      expect(errorCallback).toHaveBeenCalledTimes(2);
      expect(errorCallback).toHaveBeenNthCalledWith(
        1,
        expect.any(FactoryExecutionError),
        failingExecutor,
        scope
      );
      expect(errorCallback).toHaveBeenNthCalledWith(
        2,
        expect.any(ExecutorResolutionError),
        chainedExecutor,
        scope
      );
    });

    test("bypasses error callbacks when executor resolves successfully", async () => {
      const successExecutor = provide(() => "success");
      await errorTestHelpers.expectNoErrorCallback(successExecutor, "success");
    });

    test("invokes all registered global error callbacks for single error", async () => {
      const scope = createScope();
      const errorCallback1 = vi.fn();
      const errorCallback2 = vi.fn();

      scope.onError(errorCallback1);
      scope.onError(errorCallback2);

      const failingExecutor = MockExecutors.failing("Test error");

      await expect(scope.resolve(failingExecutor)).rejects.toThrow();

      expect(errorCallback1).toHaveBeenCalledTimes(1);
      expect(errorCallback2).toHaveBeenCalledTimes(1);
    });
  });

  describe("Per-Executor Error Callbacks", () => {
    test("invokes callback only for specific executor that fails", async () => {
      const scope = createScope();
      const errorCallback = vi.fn();
      const failingExecutor = MockExecutors.failing("Test error");

      scope.onError(failingExecutor, errorCallback);

      await expect(scope.resolve(failingExecutor)).rejects.toThrow();

      expect(errorCallback).toHaveBeenCalledTimes(1);
      expect(errorCallback).toHaveBeenCalledWith(
        expect.any(FactoryExecutionError),
        failingExecutor,
        scope
      );
    });

    test("isolates error callbacks to prevent cross-executor triggering", async () => {
      const scope = createScope();
      const errorCallback1 = vi.fn();
      const errorCallback2 = vi.fn();

      const executor1 = MockExecutors.failing("Error 1");
      const executor2 = MockExecutors.failing("Error 2");

      scope.onError(executor1, errorCallback1);
      scope.onError(executor2, errorCallback2);

      await expect(scope.resolve(executor1)).rejects.toThrow();

      expect(errorCallback1).toHaveBeenCalledTimes(1);
      expect(errorCallback2).not.toHaveBeenCalled();
    });

    test("executes multiple callbacks registered for same failing executor", async () => {
      const scope = createScope();
      const errorCallback1 = vi.fn();
      const errorCallback2 = vi.fn();
      const failingExecutor = MockExecutors.failing("Test error");

      scope.onError(failingExecutor, errorCallback1);
      scope.onError(failingExecutor, errorCallback2);

      await expect(scope.resolve(failingExecutor)).rejects.toThrow();

      expect(errorCallback1).toHaveBeenCalledTimes(1);
      expect(errorCallback2).toHaveBeenCalledTimes(1);
    });
  });

  describe("Plugin Error Handlers", () => {
    test("activates plugin error handlers during executor failure", async () => {
      const onError = vi.fn();
      const errorPlugin = { name: "error-plugin", ...plugin({ onError }) };
      const scope = testSetup.scopeWithPlugins([errorPlugin]);
      const failingExecutor = MockExecutors.failing("Test error");

      await expect(scope.resolve(failingExecutor)).rejects.toThrow();

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(
        expect.any(FactoryExecutionError),
        failingExecutor,
        scope
      );
    });

    test("coordinates error handling across multiple plugins", async () => {
      const onError1 = vi.fn();
      const onError2 = vi.fn();
      const plugin1 = { name: "plugin1", ...plugin({ onError: onError1 }) };
      const plugin2 = { name: "plugin2", ...plugin({ onError: onError2 }) };
      const scope = testSetup.scopeWithPlugins([plugin1, plugin2]);
      const failingExecutor = MockExecutors.failing("Test error");

      await expect(scope.resolve(failingExecutor)).rejects.toThrow();

      expect(onError1).toHaveBeenCalledTimes(1);
      expect(onError2).toHaveBeenCalledTimes(1);
    });

    test("preserves original error when plugin error handler throws", async () => {
      const onError = vi.fn().mockImplementation(() => {
        throw new Error("Plugin error");
      });
      const errorPlugin = { name: "error-plugin", ...plugin({ onError }) };
      const scope = testSetup.scopeWithPlugins([errorPlugin]);
      const failingExecutor = MockExecutors.failing("Original error");

      await expect(scope.resolve(failingExecutor)).rejects.toThrow(
        "Original error"
      );
      expect(onError).toHaveBeenCalledTimes(1);
    });
  });

  describe("Error Callback Cleanup", () => {
    test("removes global error callback when cleanup function is invoked", async () => {
      const scope = createScope();
      const errorCallback = vi.fn();
      const cleanup = scope.onError(errorCallback);
      cleanup();

      const failingExecutor = MockExecutors.failing("Test error");

      await expect(scope.resolve(failingExecutor)).rejects.toThrow();

      expect(errorCallback).not.toHaveBeenCalled();
    });

    test("removes per-executor error callback after cleanup invocation", async () => {
      const scope = createScope();
      const errorCallback = vi.fn();
      const failingExecutor = MockExecutors.failing("Test error");

      const cleanup = scope.onError(failingExecutor, errorCallback);
      cleanup();

      await expect(scope.resolve(failingExecutor)).rejects.toThrow();

      expect(errorCallback).not.toHaveBeenCalled();
    });

    test("prevents new error callback registration after scope disposal", async () => {
      const scope = createScope();
      const globalCallback = vi.fn();
      const perExecutorCallback = vi.fn();
      const failingExecutor = MockExecutors.failing("Test error");

      scope.onError(globalCallback);
      scope.onError(failingExecutor, perExecutorCallback);

      await scope.dispose();

      expect(() => scope.onError(globalCallback)).toThrow("Scope is disposed");
      expect(() => scope.onError(failingExecutor, perExecutorCallback)).toThrow(
        "Scope is disposed"
      );
    });
  });

  describe("Error Types and Context", () => {
    test("wraps factory exceptions in FactoryExecutionError with metadata", async () => {
      const { scope, errorCallback } = testSetup.scopeWithErrorHandler();
      const failingExecutor = MockExecutors.failing("Factory error");

      await expect(scope.resolve(failingExecutor)).rejects.toThrow();

      const [capturedError] = errorCallback.mock.calls[0];
      expect(capturedError).toBeInstanceOf(FactoryExecutionError);
      expect(capturedError.category).toBe("USER_ERROR");
      expect(capturedError.context.resolutionStage).toBe("factory-execution");
    });

    test("includes comprehensive context metadata in error objects", async () => {
      const { scope, errorCallback } = testSetup.scopeWithErrorHandler();
      const failingExecutor = MockExecutors.failing("Test error");

      await expect(scope.resolve(failingExecutor)).rejects.toThrow();

      const [capturedError] = errorCallback.mock.calls[0];
      expect(capturedError.context.resolutionStage).toBe("factory-execution");
      expect(capturedError.context.dependencyChain).toEqual(expect.any(Array));
      expect(capturedError.context.timestamp).toEqual(expect.any(Number));
    });
  });

  describe("Async Error Handling", () => {
    test("supports asynchronous error callback functions", async () => {
      const scope = createScope();
      const asyncErrorCallback = vi.fn().mockResolvedValue(undefined);
      scope.onError(asyncErrorCallback);
      const failingExecutor = MockExecutors.failing("Test error");

      await expect(scope.resolve(failingExecutor)).rejects.toThrow();

      expect(asyncErrorCallback).toHaveBeenCalledTimes(1);
    });

    test("catches and wraps errors from async factory functions", async () => {
      const { scope, errorCallback } = testSetup.scopeWithErrorHandler();
      const asyncFailingExecutor = provide(async () => {
        throw new Error("Async error");
      });

      await expect(scope.resolve(asyncFailingExecutor)).rejects.toThrow();

      expect(errorCallback).toHaveBeenCalledTimes(1);
      const [capturedError] = errorCallback.mock.calls[0];
      expect(capturedError).toBeInstanceOf(FactoryExecutionError);
    });
  });
});
