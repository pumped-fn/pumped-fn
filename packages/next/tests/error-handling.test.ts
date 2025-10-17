import { describe, test, expect, vi } from "vitest";
import { createScope, provide, derive } from "../src";
import { ExecutorResolutionError, FactoryExecutionError } from "../src/types";
import { errorTestHelpers, MockExecutors, testSetup, ExtensionFactory } from "./test-utils";

describe("Error Handling", () => {
  describe("Global Error Callbacks", () => {
    test("invokes global error callback when executor factory throws", async () => {
      const failingExecutor = MockExecutors.failing("Test error");

      await errorTestHelpers.expectExecutorError(
        failingExecutor,
        FactoryExecutionError
      );
    });

    test("propagates errors through dependency chain with callbacks", async () => {
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

    test("invokes all registered global callbacks on single error", async () => {
      const scope = createScope();
      const firstCallback = vi.fn();
      const secondCallback = vi.fn();

      scope.onError(firstCallback);
      scope.onError(secondCallback);

      const failingExecutor = MockExecutors.failing("Test error");

      await expect(scope.resolve(failingExecutor)).rejects.toThrow();

      expect(firstCallback).toHaveBeenCalledTimes(1);
      expect(secondCallback).toHaveBeenCalledTimes(1);
    });
  });

  describe("Per-Executor Error Callbacks", () => {
    test("invokes callback only for targeted executor failure", async () => {
      const scope = createScope();
      const executorCallback = vi.fn();
      const failingExecutor = MockExecutors.failing("Test error");

      scope.onError(failingExecutor, executorCallback);

      await expect(scope.resolve(failingExecutor)).rejects.toThrow();

      expect(executorCallback).toHaveBeenCalledTimes(1);
      expect(executorCallback).toHaveBeenCalledWith(
        expect.any(FactoryExecutionError),
        failingExecutor,
        scope
      );
    });

    test("isolates callbacks between different executors", async () => {
      const scope = createScope();
      const firstExecutorCallback = vi.fn();
      const secondExecutorCallback = vi.fn();

      const firstExecutor = MockExecutors.failing("Error 1");
      const secondExecutor = MockExecutors.failing("Error 2");

      scope.onError(firstExecutor, firstExecutorCallback);
      scope.onError(secondExecutor, secondExecutorCallback);

      await expect(scope.resolve(firstExecutor)).rejects.toThrow();

      expect(firstExecutorCallback).toHaveBeenCalledTimes(1);
      expect(secondExecutorCallback).not.toHaveBeenCalled();
    });

    test("invokes all callbacks registered for same executor", async () => {
      const scope = createScope();
      const firstCallback = vi.fn();
      const secondCallback = vi.fn();
      const failingExecutor = MockExecutors.failing("Test error");

      scope.onError(failingExecutor, firstCallback);
      scope.onError(failingExecutor, secondCallback);

      await expect(scope.resolve(failingExecutor)).rejects.toThrow();

      expect(firstCallback).toHaveBeenCalledTimes(1);
      expect(secondCallback).toHaveBeenCalledTimes(1);
    });
  });

  describe("Extension Error Handlers", () => {
    test("invokes extension error handler on executor failure", async () => {
      const extensionErrorHandler = vi.fn();
      const errorExtension = ExtensionFactory.errorHandler(extensionErrorHandler, "error-extension");
      const scope = testSetup.scopeWithExtensions([errorExtension]);
      const failingExecutor = MockExecutors.failing("Test error");

      await expect(scope.resolve(failingExecutor)).rejects.toThrow();

      expect(extensionErrorHandler).toHaveBeenCalledTimes(1);
      expect(extensionErrorHandler).toHaveBeenCalledWith(
        expect.any(FactoryExecutionError),
        scope
      );
    });

    test("invokes all extension error handlers in order", async () => {
      const firstExtensionHandler = vi.fn();
      const secondExtensionHandler = vi.fn();
      const firstExtension = ExtensionFactory.errorHandler(firstExtensionHandler, "extension1");
      const secondExtension = ExtensionFactory.errorHandler(secondExtensionHandler, "extension2");
      const scope = testSetup.scopeWithExtensions([firstExtension, secondExtension]);
      const failingExecutor = MockExecutors.failing("Test error");

      await expect(scope.resolve(failingExecutor)).rejects.toThrow();

      expect(firstExtensionHandler).toHaveBeenCalledTimes(1);
      expect(secondExtensionHandler).toHaveBeenCalledTimes(1);
    });

    test("preserves original error when extension handler throws", async () => {
      const throwingHandler = vi.fn().mockImplementation(() => {
        throw new Error("Extension error");
      });
      const errorExtension = ExtensionFactory.errorHandler(throwingHandler, "error-extension");
      const scope = testSetup.scopeWithExtensions([errorExtension]);
      const failingExecutor = MockExecutors.failing("Original error");

      await expect(scope.resolve(failingExecutor)).rejects.toThrow("Original error");

      expect(throwingHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe("Error Callback Cleanup", () => {
    test("stops invoking global callback after cleanup", async () => {
      const scope = createScope();
      const errorCallback = vi.fn();
      const cleanup = scope.onError(errorCallback);

      cleanup();

      const failingExecutor = MockExecutors.failing("Test error");

      await expect(scope.resolve(failingExecutor)).rejects.toThrow();

      expect(errorCallback).not.toHaveBeenCalled();
    });

    test("stops invoking per-executor callback after cleanup", async () => {
      const scope = createScope();
      const executorCallback = vi.fn();
      const failingExecutor = MockExecutors.failing("Test error");

      const cleanup = scope.onError(failingExecutor, executorCallback);
      cleanup();

      await expect(scope.resolve(failingExecutor)).rejects.toThrow();

      expect(executorCallback).not.toHaveBeenCalled();
    });

    test("prevents error callback registration on disposed scope", async () => {
      const scope = createScope();
      const globalCallback = vi.fn();
      const executorCallback = vi.fn();
      const failingExecutor = MockExecutors.failing("Test error");

      scope.onError(globalCallback);
      scope.onError(failingExecutor, executorCallback);

      await scope.dispose();

      expect(() => scope.onError(globalCallback)).toThrow("Scope is disposed");
      expect(() => scope.onError(failingExecutor, executorCallback)).toThrow("Scope is disposed");
    });
  });

  describe("Error Types and Context", () => {
    test("wraps factory exceptions with contextual metadata", async () => {
      const { scope, errorCallback } = testSetup.scopeWithErrorHandler();
      const failingExecutor = MockExecutors.failing("Factory error");

      await expect(scope.resolve(failingExecutor)).rejects.toThrow();

      const [capturedError] = errorCallback.mock.calls[0];

      expect(capturedError).toBeInstanceOf(FactoryExecutionError);
      expect(capturedError.category).toBe("USER_ERROR");
      expect(capturedError.context.resolutionStage).toBe("factory-execution");
      expect(capturedError.context.dependencyChain).toEqual(expect.any(Array));
      expect(capturedError.context.timestamp).toEqual(expect.any(Number));
    });
  });

  describe("Async Error Handling", () => {
    test("invokes async error callback functions", async () => {
      const scope = createScope();
      const asyncErrorCallback = vi.fn().mockResolvedValue(undefined);

      scope.onError(asyncErrorCallback);

      const failingExecutor = MockExecutors.failing("Test error");

      await expect(scope.resolve(failingExecutor)).rejects.toThrow();

      expect(asyncErrorCallback).toHaveBeenCalledTimes(1);
    });

    test("wraps errors from async factory functions", async () => {
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
