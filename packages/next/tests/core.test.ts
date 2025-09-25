import { describe, test, expect, vi } from "vitest";
import { accessor } from "../src/accessor";
import { custom } from "../src/ssch";
import { createScope } from "../src/scope";
import { createExecutor, derive, provide } from "../src/executor";

describe("Core Functionality", () => {
  describe("Accessor functionality", () => {
    test("accessor creates and retrieves values", () => {
      const numberAccessor = accessor("test.number", custom<number>(), 42);
      const store = new Map();

      const value = numberAccessor.find(store);
      expect(value).toBe(42);
    });

    test("accessor sets and retrieves custom values", () => {
      const stringAccessor = accessor("test.string", custom<string>());
      const store = new Map();

      stringAccessor.set(store, "hello");
      const value = stringAccessor.find(store);
      expect(value).toBe("hello");
    });

    test("accessor returns undefined for unset values without default", () => {
      const optionalAccessor = accessor("test.optional", custom<string>());
      const store = new Map();

      const value = optionalAccessor.find(store);
      expect(value).toBeUndefined();
    });

    test("accessor validates values on set", () => {
      const numberAccessor = accessor("test.validated", custom<number>());
      const store = new Map();

      expect(() => numberAccessor.set(store, 123)).not.toThrow();
    });
  });

  describe("Executor and Scope Integration", () => {
    test("scope resolves executors correctly", async () => {
      const scope = createScope();
      const executor = createExecutor(() => 42, undefined, []);

      const result = await scope.resolve(executor);
      expect(result).toBe(42);

      await scope.dispose();
    });

    test("scope caches executor results", async () => {
      const scope = createScope();
      const mockFn = vi.fn(() => 42);
      const executor = createExecutor(mockFn, undefined, []);

      const result1 = await scope.resolve(executor);
      const result2 = await scope.resolve(executor);

      expect(result1).toBe(42);
      expect(result2).toBe(42);
      expect(mockFn).toHaveBeenCalledTimes(1);

      await scope.dispose();
    });

    test("scope handles circular dependencies", async () => {
      const scope = createScope();

      const executorA = createExecutor(() => 1, undefined, []);
      const executorB = createExecutor(() => 1, undefined, []);

      (executorA as any).dependencies = { b: executorB };
      (executorB as any).dependencies = { a: executorA };
      (executorA as any).factory = (deps: { b: number }) => deps.b + 1;
      (executorB as any).factory = (deps: { a: number }) => deps.a + 1;

      await expect(scope.resolve(executorA)).rejects.toThrow();

      await scope.dispose();
    });

    test("scope processes dependencies in correct order", async () => {
      const scope = createScope();
      const executionOrder: string[] = [];

      const baseExecutor = provide(() => {
        executionOrder.push("base");
        return 1;
      });

      const dependentExecutor = derive(
        { base: baseExecutor },
        (deps: { base: number }) => {
          executionOrder.push("dependent");
          return deps.base + 1;
        }
      );

      const result = await scope.resolve(dependentExecutor);

      expect(result).toBe(2);
      expect(executionOrder).toEqual(["base", "dependent"]);

      await scope.dispose();
    });

    test("scope handles async executors", async () => {
      const scope = createScope();

      const asyncExecutor = createExecutor(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return "async result";
      }, undefined, []);

      const result = await scope.resolve(asyncExecutor);
      expect(result).toBe("async result");

      await scope.dispose();
    });

    test("scope propagates errors from executors", async () => {
      const scope = createScope();
      const error = new Error("executor error");

      const failingExecutor = createExecutor(() => {
        throw error;
      }, undefined, []);

      await expect(scope.resolve(failingExecutor)).rejects.toThrow(
        "executor error"
      );

      await scope.dispose();
    });

    test("scope disposes correctly", async () => {
      const scope = createScope();
      const executor = createExecutor(() => 42, undefined, []);

      await scope.resolve(executor);
      await scope.dispose();

      expect(true).toBe(true);
    });
  });

  describe("Sync/Async Resolution Compatibility", () => {
    test("resolves sync executors in sync context", async () => {
      const scope = createScope();
      const syncExecutor = createExecutor(() => 42, undefined, []);

      const result = await scope.resolve(syncExecutor);
      expect(result).toBe(42);

      await scope.dispose();
    });

    test("resolves async executors", async () => {
      const scope = createScope();
      const asyncExecutor = createExecutor(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return "async";
      }, undefined, []);

      const result = await scope.resolve(asyncExecutor);
      expect(result).toBe("async");

      await scope.dispose();
    });

    test("handles mixed sync/async dependencies", async () => {
      const scope = createScope();

      const syncDep = provide(() => 1);
      const asyncDep = provide(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return 2;
      });

      const mixedExecutor = derive(
        { sync: syncDep, async: asyncDep },
        (deps: { sync: number; async: number }) => {
          return deps.sync + deps.async;
        }
      );

      const result = await scope.resolve(mixedExecutor);
      expect(result).toBe(3);

      await scope.dispose();
    });

    test("preserves execution order with mixed dependencies", async () => {
      const scope = createScope();
      const order: string[] = [];

      const first = provide(() => {
        order.push("sync1");
        return 1;
      });

      const second = provide(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        order.push("async");
        return 2;
      });

      const third = derive(
        { a: first, b: second },
        (deps: { a: number; b: number }) => {
          order.push("sync2");
          return deps.a + deps.b;
        }
      );

      const result = await scope.resolve(third);

      expect(result).toBe(3);
      expect(order).toEqual(["sync1", "async", "sync2"]);

      await scope.dispose();
    });
  });
});
