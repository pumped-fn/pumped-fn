import { describe, test, expect } from "vitest";
import { accessor } from "../src/accessor";
import { custom } from "../src/ssch";
import { createScope } from "../src/scope";
import { createExecutor, derive, provide, preset } from "../src/executor";
import { flow } from "../src/flow";
import { Promised } from "../src/promises";

describe("Core Functionality", () => {
  describe("Accessor functionality", () => {
    test("accessor creates, sets, and retrieves values", () => {
      const numberAccessor = accessor("test.number", custom<number>(), 42);
      const stringAccessor = accessor("test.string", custom<string>());
      const optionalAccessor = accessor("test.optional", custom<string>());
      const store = new Map();

      expect(numberAccessor.find(store)).toBe(42);

      stringAccessor.set(store, "hello");
      expect(stringAccessor.find(store)).toBe("hello");

      expect(optionalAccessor.find(store)).toBeUndefined();

      expect(() => numberAccessor.set(store, 123)).not.toThrow();
    });
  });

  describe("Executor and Scope Integration", () => {
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

      expect(await scope.resolve(dependentExecutor)).toBe(2);
      expect(executionOrder).toEqual(["base", "dependent"]);
      await scope.dispose();
    });
  });

  describe("Sync/Async Resolution Compatibility", () => {
    test("handles mixed sync/async dependencies", async () => {
      const scope = createScope();

      const syncDep = provide(() => 1);
      const asyncDep = provide(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return 2;
      });

      const mixedExecutor = derive(
        { sync: syncDep, async: asyncDep },
        (deps: { sync: number; async: number }) => deps.sync + deps.async
      );

      expect(await scope.resolve(mixedExecutor)).toBe(3);
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

      expect(await scope.resolve(third)).toBe(3);
      expect(order).toEqual(["sync1", "async", "sync2"]);
      await scope.dispose();
    });
  });

  describe("Multi-value operations", () => {
    test("derive with object, array, and empty dependencies", () => {
      const depA = provide(() => "a");
      const depB = provide(() => "b");
      const depC = provide(() => "c");

      const objDeps = derive({ depA, depB, depC }, (deps) => deps);
      expect(objDeps.dependencies).toEqual({ depA, depB, depC });

      const emptyDeps = derive({}, () => ({}));
      expect(emptyDeps.dependencies).toEqual({});
    });
  });

  describe("Scope.exec", () => {
    test("scope.exec executes flow with provided scope", async () => {
      const scope = createScope();

      const config = provide(() => ({ multiplier: 3 }));
      const multiplyFlow = flow(config, (deps, _ctx, input: number) => {
        return input * deps.multiplier;
      });

      const result = await scope.exec(multiplyFlow, 5);
      expect(result).toBe(15);

      await scope.dispose();
    });

    test("scope.exec with presets", async () => {
      const scope = createScope();

      const configExecutor = provide(() => ({ value: 10 }));
      const flowWithConfig = flow(configExecutor, (deps, _ctx, input: number) => {
        return input + deps.value;
      });

      const result = await scope.exec(flowWithConfig, 5, {
        presets: [preset(configExecutor, { value: 20 })],
      });

      expect(result).toBe(25);

      await scope.dispose();
    });

    test("scope.exec with details returns execution details on success", async () => {
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

    test("scope.exec with details returns execution details on error", async () => {
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

    test("scope.exec(flow) without input parameter", async () => {
      const scope = createScope();

      const noInputFlow = flow((_ctx) => "no input needed");
      const result = await scope.exec(noInputFlow);
      expect(result).toBe("no input needed");

      await scope.dispose();
    });

    test("scope.exec(flow, param) with input parameter", async () => {
      const scope = createScope();

      const doubleFlow = flow((_ctx, input: number) => input * 2);
      const result = await scope.exec(doubleFlow, 5);
      expect(result).toBe(10);

      await scope.dispose();
    });

  });

  describe("Scope Cache Delegation", () => {
    test("scope.exec(flow) reuses scope-cached resources", async () => {
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
      expect(dbConnectionCount).toBe(1);
      expect(serviceResolveCount).toBe(1);

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
