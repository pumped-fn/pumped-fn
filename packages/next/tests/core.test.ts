import { describe, test, expect } from "vitest";
import { accessor } from "../src/accessor";
import { custom } from "../src/ssch";
import { createScope } from "../src/scope";
import { createExecutor, derive, provide, preset } from "../src/executor";
import { flow } from "../src/flow";
import { Promised } from "../src/promises";

describe("Core Functionality", () => {
  describe("Accessor functionality", () => {
    test("accessor provides default value when created with initial value", () => {
      const numberAccessor = accessor("test.number", custom<number>(), 42);
      const store = new Map();

      const result = numberAccessor.find(store);

      expect(result).toBe(42);
    });

    test("accessor stores and retrieves values from store", () => {
      const stringAccessor = accessor("test.string", custom<string>());
      const store = new Map();

      stringAccessor.set(store, "hello");
      const result = stringAccessor.find(store);

      expect(result).toBe("hello");
    });

    test("accessor returns undefined when no value set and no default provided", () => {
      const optionalAccessor = accessor("test.optional", custom<string>());
      const store = new Map();

      const result = optionalAccessor.find(store);

      expect(result).toBeUndefined();
    });

    test("accessor allows updating existing values without error", () => {
      const numberAccessor = accessor("test.number", custom<number>(), 42);
      const store = new Map();

      const updateOperation = () => numberAccessor.set(store, 123);

      expect(updateOperation).not.toThrow();
    });
  });

  describe("Executor and Scope Integration", () => {
    test("scope detects and rejects circular dependency between executors", async () => {
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

    test("scope resolves dependencies before dependent executors", async () => {
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
  });

  describe("Sync/Async Resolution Compatibility", () => {
    test("executor combining synchronous and asynchronous dependencies produces correct result", async () => {
      const scope = createScope();
      const syncDependency = provide(() => 1);
      const asyncDependency = provide(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return 2;
      });

      const combinedExecutor = derive(
        { sync: syncDependency, async: asyncDependency },
        (deps: { sync: number; async: number }) => deps.sync + deps.async
      );

      const result = await scope.resolve(combinedExecutor);

      expect(result).toBe(3);

      await scope.dispose();
    });

    test("executor resolves mixed dependencies in dependency graph order", async () => {
      const scope = createScope();
      const executionOrder: string[] = [];

      const firstExecutor = provide(() => {
        executionOrder.push("sync1");
        return 1;
      });
      const secondExecutor = provide(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        executionOrder.push("async");
        return 2;
      });
      const thirdExecutor = derive(
        { a: firstExecutor, b: secondExecutor },
        (deps: { a: number; b: number }) => {
          executionOrder.push("sync2");
          return deps.a + deps.b;
        }
      );

      const result = await scope.resolve(thirdExecutor);

      expect(result).toBe(3);
      expect(executionOrder).toEqual(["sync1", "async", "sync2"]);

      await scope.dispose();
    });
  });

  describe("Multi-value operations", () => {
    test("derive creates executor with multiple named dependencies", () => {
      const dependencyA = provide(() => "a");
      const dependencyB = provide(() => "b");
      const dependencyC = provide(() => "c");

      const executorWithDependencies = derive({ depA: dependencyA, depB: dependencyB, depC: dependencyC }, (deps) => deps);

      expect(executorWithDependencies.dependencies).toEqual({ depA: dependencyA, depB: dependencyB, depC: dependencyC });
    });

    test("derive creates executor with no dependencies when empty object provided", () => {
      const executorWithoutDependencies = derive({}, () => ({}));

      expect(executorWithoutDependencies.dependencies).toEqual({});
    });
  });

  describe("Scope.exec", () => {
    test("scope executes flow using resolved dependencies from scope", async () => {
      const scope = createScope();
      const config = provide(() => ({ multiplier: 3 }));
      const multiplyFlow = flow(config, (deps, _ctx, input: number) => {
        return input * deps.multiplier;
      });

      const result = await scope.exec(multiplyFlow, 5);

      expect(result).toBe(15);

      await scope.dispose();
    });

    test("scope executes flow with preset overriding default dependency value", async () => {
      const configExecutor = provide(() => ({ value: 10 }));
      const flowWithConfig = flow(configExecutor, (deps, _ctx, input: number) => {
        return input + deps.value;
      });

      const scope = createScope({
        initialValues: [preset(configExecutor, { value: 20 })],
      });

      const result = await scope.exec(flowWithConfig, 5);

      expect(result).toBe(25);

      await scope.dispose();
    });

    test("scope execution with details flag returns success result and context", async () => {
      const scope = createScope();
      const simpleFlow = flow((_ctx, input: number) => input * 2);

      const details = await scope.exec(simpleFlow, 5, { details: true });

      expect(details.success).toBe(true);
      if (details.success) {
        expect(details.result).toBe(10);
        expect(details.ctx).toBeDefined();
      }

      await scope.dispose();
    });

    test("scope execution with details flag returns error and context when flow throws", async () => {
      const scope = createScope();
      const failingFlow = flow((_ctx, _input: number): number => {
        throw new Error("Test error");
      });

      const details = await scope.exec(failingFlow, 5, { details: true });

      expect(details.success).toBe(false);
      if (!details.success) {
        expect(details.error).toBeInstanceOf(Error);
        expect((details.error as Error).message).toBe("Test error");
        expect(details.ctx).toBeDefined();
      }

      await scope.dispose();
    });

    test("scope executes flow without input parameter when flow expects none", async () => {
      const scope = createScope();
      const noInputFlow = flow((_ctx) => "no input needed");

      const result = await scope.exec(noInputFlow);

      expect(result).toBe("no input needed");

      await scope.dispose();
    });

    test("scope executes flow with input parameter provided as second argument", async () => {
      const scope = createScope();
      const doubleFlow = flow((_ctx, input: number) => input * 2);

      const result = await scope.exec(doubleFlow, 5);

      expect(result).toBe(10);

      await scope.dispose();
    });
  });

  describe("Scope Cache Delegation", () => {
    test("flow execution reuses already resolved scope dependencies without re-resolving", async () => {
      let dbConnectionCount = 0;
      let serviceResolveCount = 0;

      const dbConnection = provide(() => {
        dbConnectionCount++;
        return { connected: true, id: dbConnectionCount };
      });
      const service = derive({ db: dbConnection }, ({ db }) => {
        serviceResolveCount++;
        return { db, count: serviceResolveCount };
      });

      const scope = createScope();

      await scope.resolve(service);
      const testFlow = flow(service, (_deps, _ctx, input: number) => {
        return input * 2;
      });

      const result = await scope.exec(testFlow, 5);

      expect(result).toBe(10);
      expect(dbConnectionCount).toBe(1);
      expect(serviceResolveCount).toBe(1);

      await scope.dispose();
    });
  });
});
