import { vi, test, expect, describe } from "vitest";
import { provide, derive } from "../src/executor";
import { createScope } from "../src/scope";
import { meta } from "../src/meta";
import { custom } from "../src/ssch";
import {
  FactoryExecutionError,
  DependencyResolutionError,
  ExecutorResolutionError,
} from "../src/types";
import { ErrorCodes } from "../src/error-codes";

const name = meta("name", custom<string>());

describe("Enhanced Error Handling", () => {
  describe("Factory Function Errors", () => {
    test("should wrap sync factory errors with enhanced context", async () => {
      const errorMessage = "Custom factory error";
      const faultyExecutor = provide(() => {
        throw new Error(errorMessage);
      }, name("faulty-executor"));

      const scope = createScope();

      await expect(scope.resolve(faultyExecutor)).rejects.toThrow(
        FactoryExecutionError
      );

      try {
        await scope.resolve(faultyExecutor);
      } catch (error) {
        expect(error).toBeInstanceOf(FactoryExecutionError);
        const factoryError = error as FactoryExecutionError;
        expect(factoryError.code).toBe(ErrorCodes.FACTORY_THREW_ERROR);
        expect(factoryError.context.executorName).toBe("faulty-executor");
        expect(factoryError.context.resolutionStage).toBe("factory-execution");
        expect(factoryError.context.dependencyChain).toContain(
          "faulty-executor"
        );
        expect(factoryError.context.timestamp).toBeDefined();
        expect((factoryError.cause as Error)?.message).toBe(errorMessage);
        expect(factoryError.category).toBe("USER_ERROR");
      }
    });

    test("should wrap async factory errors with enhanced context", async () => {
      const errorMessage = "Async factory error";
      const asyncFaultyExecutor = provide(async () => {
        throw new Error(errorMessage);
      }, name("async-faulty-executor"));

      const scope = createScope();

      await expect(scope.resolve(asyncFaultyExecutor)).rejects.toThrow(
        FactoryExecutionError
      );

      try {
        await scope.resolve(asyncFaultyExecutor);
      } catch (error) {
        expect(error).toBeInstanceOf(FactoryExecutionError);
        const factoryError = error as FactoryExecutionError;
        expect(factoryError.code).toBe(ErrorCodes.FACTORY_ASYNC_ERROR);
        expect(factoryError.context.executorName).toBe("async-faulty-executor");
        expect(factoryError.context.additionalInfo?.isAsyncFactory).toBe(true);
        expect((factoryError.cause as Error)?.message).toBe(errorMessage);
      }
    });

    test("should handle Promise rejection in factory", async () => {
      const errorMessage = "Promise rejection error";
      const promiseRejectionExecutor = provide(() => {
        return Promise.reject(new Error(errorMessage));
      }, name("promise-rejection-executor"));

      const scope = createScope();

      await expect(scope.resolve(promiseRejectionExecutor)).rejects.toThrow(
        FactoryExecutionError
      );

      try {
        await scope.resolve(promiseRejectionExecutor);
      } catch (error) {
        expect(error).toBeInstanceOf(FactoryExecutionError);
        const factoryError = error as FactoryExecutionError;
        expect(factoryError.code).toBe(ErrorCodes.FACTORY_ASYNC_ERROR);
        expect(factoryError.context.additionalInfo?.isAsyncFactory).toBe(true);
      }
    });

    test("should wrap generator factory errors with enhanced context", async () => {
      const errorMessage = "Generator factory error";
      const generatorFaultyExecutor = provide(function* () {
        yield 1;
        throw new Error(errorMessage);
      }, name("generator-faulty-executor"));

      const scope = createScope();

      await expect(scope.resolve(generatorFaultyExecutor)).rejects.toThrow(
        FactoryExecutionError
      );

      try {
        await scope.resolve(generatorFaultyExecutor);
      } catch (error) {
        expect(error).toBeInstanceOf(FactoryExecutionError);
        const factoryError = error as FactoryExecutionError;
        expect(factoryError.code).toBe(ErrorCodes.FACTORY_GENERATOR_ERROR);
        expect(factoryError.context.executorName).toBe(
          "generator-faulty-executor"
        );
        expect(factoryError.context.additionalInfo?.generatorType).toBe("sync");
      }
    });

    test("should wrap async generator factory errors with enhanced context", async () => {
      const errorMessage = "Async generator factory error";
      const asyncGeneratorFaultyExecutor = provide(async function* () {
        yield 1;
        throw new Error(errorMessage);
      }, name("async-generator-faulty-executor"));

      const scope = createScope();

      await expect(scope.resolve(asyncGeneratorFaultyExecutor)).rejects.toThrow(
        FactoryExecutionError
      );

      try {
        await scope.resolve(asyncGeneratorFaultyExecutor);
      } catch (error) {
        expect(error).toBeInstanceOf(FactoryExecutionError);
        const factoryError = error as FactoryExecutionError;
        expect(factoryError.code).toBe(ErrorCodes.FACTORY_GENERATOR_ERROR);
        expect(factoryError.context.executorName).toBe(
          "async-generator-faulty-executor"
        );
        expect(factoryError.context.additionalInfo?.generatorType).toBe(
          "async"
        );
      }
    });
  });

  describe("Dependency Resolution Errors", () => {
    test("should handle factory errors in derived executors with dependency context", async () => {
      const config = provide(() => ({ port: 3000 }), name("config"));
      const faultyService = derive(
        config,
        (cfg) => {
          throw new Error("Service initialization failed");
        },
        name("faulty-service")
      );

      const scope = createScope();

      await expect(scope.resolve(faultyService)).rejects.toThrow(
        FactoryExecutionError
      );

      try {
        await scope.resolve(faultyService);
      } catch (error) {
        expect(error).toBeInstanceOf(FactoryExecutionError);
        const factoryError = error as FactoryExecutionError;
        expect(factoryError.context.executorName).toBe("faulty-service");
        expect(factoryError.context.additionalInfo?.dependenciesResolved).toBe(
          true
        );
      }
    });
  });

  describe("Error Context and Information", () => {
    test("should include comprehensive error context information", async () => {
      const faultyExecutor = provide(() => {
        throw new Error("Test error");
      }, name("test-executor"));

      const scope = createScope();

      try {
        await scope.resolve(faultyExecutor);
      } catch (error) {
        const factoryError = error as FactoryExecutionError;
        expect(factoryError.context).toMatchObject({
          executorName: "test-executor",
          resolutionStage: "factory-execution",
          dependencyChain: ["test-executor"],
        });
        expect(factoryError.context.timestamp).toBeTypeOf("number");
        expect(factoryError.context.timestamp).toBeGreaterThan(0);
        expect(factoryError.context.additionalInfo).toBeTypeOf("object");
      }
    });

    test("should include factory type information in error context", async () => {
      const syncExecutor = provide(() => {
        throw new Error("Sync error");
      }, name("sync-executor"));

      const asyncExecutor = provide(async () => {
        throw new Error("Async error");
      }, name("async-executor"));

      const scope = createScope();

      try {
        await scope.resolve(syncExecutor);
      } catch (error) {
        const factoryError = error as FactoryExecutionError;
        expect(factoryError.context.additionalInfo?.factoryType).toBe(
          "function"
        );
        expect(factoryError.context.additionalInfo?.isAsyncFactory).toBe(false);
      }

      try {
        await scope.resolve(asyncExecutor);
      } catch (error) {
        const factoryError = error as FactoryExecutionError;
        expect(factoryError.context.additionalInfo?.factoryType).toBe(
          "function"
        );
        expect(factoryError.context.additionalInfo?.isAsyncFactory).toBe(true);
      }
    });
  });

  describe("Error Storage and Retrieval", () => {
    test("should store enhanced errors in cache and retrieve them on accessor.get()", async () => {
      const faultyExecutor = provide(() => {
        throw new Error("Cached error");
      }, name("cached-error-executor"));

      const scope = createScope();
      const accessor = scope.accessor(faultyExecutor);

      // Trigger resolution to store error in cache
      await expect(accessor.resolve()).rejects.toThrow(FactoryExecutionError);

      // Accessing via .get() should throw the enhanced error
      expect(() => accessor.get()).toThrow(FactoryExecutionError);

      try {
        accessor.get();
      } catch (error) {
        expect(error).toBeInstanceOf(FactoryExecutionError);
        const factoryError = error as FactoryExecutionError;
        expect(factoryError.code).toBe(ErrorCodes.FACTORY_THREW_ERROR);
        expect(factoryError.context.executorName).toBe("cached-error-executor");
      }
    });

    test("should preserve enhanced error context in cache lookup", async () => {
      const faultyExecutor = provide(() => {
        throw new Error("Lookup error");
      }, name("lookup-error-executor"));

      const scope = createScope();
      const accessor = scope.accessor(faultyExecutor);

      // Trigger resolution
      await expect(accessor.resolve()).rejects.toThrow();

      // Check cache state
      const lookup = accessor.lookup();
      expect(lookup?.kind).toBe("rejected");
      if (lookup?.kind === "rejected") {
        expect(lookup.enhancedError).toBeInstanceOf(FactoryExecutionError);
        expect(lookup.context).toBeDefined();
        expect(lookup.context?.executorName).toBe("lookup-error-executor");
      }
    });
  });

  describe("Backward Compatibility", () => {
    test("should maintain backward compatibility with existing error handling", async () => {
      const faultyExecutor = provide(() => {
        throw new Error("Original error");
      });

      const scope = createScope();

      // Even with enhanced errors, the original error should be accessible
      try {
        await scope.resolve(faultyExecutor);
      } catch (error) {
        expect(error).toBeInstanceOf(FactoryExecutionError);
        const factoryError = error as FactoryExecutionError;
        expect(factoryError.cause).toBeInstanceOf(Error);
        expect((factoryError.cause as Error)?.message).toBe("Original error");
      }
    });

    test("should handle non-Error objects thrown from factories", async () => {
      const weirdErrorExecutor = provide(() => {
        throw "String error";
      }, name("weird-error-executor"));

      const scope = createScope();

      await expect(scope.resolve(weirdErrorExecutor)).rejects.toThrow(
        FactoryExecutionError
      );

      try {
        await scope.resolve(weirdErrorExecutor);
      } catch (error) {
        expect(error).toBeInstanceOf(FactoryExecutionError);
        const factoryError = error as FactoryExecutionError;
        expect(factoryError.cause).toBe("String error");
      }
    });

    test("should handle undefined/null thrown from factories", async () => {
      const nullErrorExecutor = provide(() => {
        throw null;
      }, name("null-error-executor"));

      const scope = createScope();

      await expect(scope.resolve(nullErrorExecutor)).rejects.toThrow(
        FactoryExecutionError
      );

      try {
        await scope.resolve(nullErrorExecutor);
      } catch (error) {
        expect(error).toBeInstanceOf(FactoryExecutionError);
        const factoryError = error as FactoryExecutionError;
        // The cause should be the original thrown value (null)
        expect(factoryError.cause).toBe(null);
      }
    });
  });

  describe("Error Code Validation", () => {
    test("should use correct error codes for different error types", async () => {
      const syncError = provide(() => {
        throw new Error("sync");
      }, name("sync"));
      const asyncError = provide(async () => {
        throw new Error("async");
      }, name("async"));
      const generatorError = provide(function* () {
        throw new Error("gen");
      }, name("gen"));

      const scope = createScope();

      try {
        await scope.resolve(syncError);
      } catch (error) {
        const factoryError = error as FactoryExecutionError;
        expect(factoryError.code).toBe(ErrorCodes.FACTORY_THREW_ERROR);
      }

      try {
        await scope.resolve(asyncError);
      } catch (error) {
        const factoryError = error as FactoryExecutionError;
        expect(factoryError.code).toBe(ErrorCodes.FACTORY_ASYNC_ERROR);
      }

      try {
        await scope.resolve(generatorError);
      } catch (error) {
        const factoryError = error as FactoryExecutionError;
        expect(factoryError.code).toBe(ErrorCodes.FACTORY_GENERATOR_ERROR);
      }
    });
  });

  describe("Error Message Quality", () => {
    test("should generate informative error messages", async () => {
      const faultyExecutor = provide(() => {
        throw new Error("Original factory error");
      }, name("informative-executor"));

      const scope = createScope();

      try {
        await scope.resolve(faultyExecutor);
      } catch (error) {
        const factoryError = error as FactoryExecutionError;
        expect(factoryError.message).toContain("informative-executor");
        expect(factoryError.message).toContain("Original factory error");
        expect(factoryError.message).not.toBe("Original factory error"); // Should be enhanced
      }
    });
  });

  describe("System Error Handling", () => {
    test("should handle non-factory errors with system error wrapping", async () => {
      const scope = createScope();

      // Mock a non-enhanced error that might come from dependency resolution
      const mockExecutor = {
        [Symbol.for("@pumped-fn/core/executor")]: "main" as const,
        factory: () => "test",
        dependencies: undefined,
        metas: undefined,
      };

      // Simulate an internal error during resolution
      vi.spyOn(scope as any, "~resolveDependencies").mockRejectedValue(
        new Error("Internal error")
      );

      try {
        await scope.resolve(mockExecutor as any);
      } catch (error) {
        expect(error).toBeInstanceOf(ExecutorResolutionError);
        const resolutionError = error as ExecutorResolutionError;
        expect(resolutionError.code).toBe(ErrorCodes.INTERNAL_RESOLUTION_ERROR);
        expect(resolutionError.category).toBe("SYSTEM_ERROR");
      }
    });
  });
});
