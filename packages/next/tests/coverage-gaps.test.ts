import { describe, test, expect } from "vitest";
import { accessor } from "../src/accessor";
import { custom } from "../src/ssch";
import { createScope } from "../src/scope";
import { createExecutor, derive, provide } from "../src/executor";
import { flow } from "../src/flow";
import { resolves } from "../src/helpers";
import {
  getExecutorName,
  createFactoryError,
  createDependencyError,
  createSystemError,
} from "../src/errors";
import { meta } from "../src/meta";
import { Promised } from "../src/promises";

describe("Coverage Gaps", () => {
  describe("helpers.ts - resolves function", () => {
    test("resolves array of executors", async () => {
      const scope = createScope();
      const exec1 = provide(() => 1);
      const exec2 = provide(() => 2);
      const exec3 = provide(() => 3);

      const result = await resolves(scope, [exec1, exec2, exec3]);

      expect(result).toEqual([1, 2, 3]);
      await scope.dispose();
    });

    test("resolves object of executors", async () => {
      const scope = createScope();
      const exec1 = provide(() => 1);
      const exec2 = provide(() => "hello");

      const result = await resolves(scope, { a: exec1, b: exec2 });

      expect(result).toEqual({ a: 1, b: "hello" });
      await scope.dispose();
    });

    test("resolves array with escapable values", async () => {
      const scope = createScope();
      const exec1 = provide(() => 1);
      const escapable = { escape: () => provide(() => 2) };

      const result = await resolves(scope, [exec1, escapable]);

      expect(result).toEqual([1, 2]);
      await scope.dispose();
    });

    test("resolves object with escapable values", async () => {
      const scope = createScope();
      const escapable = { escape: () => provide(() => 42) };

      const result = await resolves(scope, { value: escapable });

      expect(result).toEqual({ value: 42 });
      await scope.dispose();
    });

    test("resolves lazy executor", async () => {
      const scope = createScope();
      const lazyExec = provide(() => 10).lazy;

      const result = await resolves(scope, [lazyExec] as any);

      expect(result).toEqual([10]);
      await scope.dispose();
    });

    test("resolves reactive executor", async () => {
      const scope = createScope();
      const reactiveExec = provide(() => 20).reactive;

      const result = await resolves(scope, [reactiveExec] as any);

      expect(result).toEqual([20]);
      await scope.dispose();
    });

    test("resolves static executor", async () => {
      const scope = createScope();
      const staticExec = provide(() => 30).static;

      const result = await resolves(scope, [staticExec] as any);

      expect(result).toEqual([30]);
      await scope.dispose();
    });
  });

  describe("accessor.ts - uncovered lines", () => {
    test("accessor.get throws when value not found", () => {
      const acc = accessor("test.key", custom<number>());
      const store = new Map();

      expect(() => acc.get(store)).toThrow("Value not found for key:");
    });

    test("accessor.preset returns symbol and value tuple", () => {
      const acc = accessor("test.preset", custom<string>());

      const [symbol, value] = acc.preset("test-value");

      expect(typeof symbol).toBe("symbol");
      expect(value).toBe("test-value");
    });

    test("accessor with default value preset returns symbol and value tuple", () => {
      const acc = accessor("test.preset.default", custom<number>(), 42);

      const [symbol, value] = acc.preset(100);

      expect(typeof symbol).toBe("symbol");
      expect(value).toBe(100);
    });

    test("accessor created with symbol key", () => {
      const symbolKey = Symbol("custom-key");
      const acc = accessor(symbolKey, custom<string>());
      const store = new Map();

      acc.set(store, "value");
      const result = acc.find(store);

      expect(result).toBe("value");
    });

    test("accessor.find from meta array", () => {
      const acc = accessor("test.meta", custom<string>());
      const metaMeta = meta("test.meta", custom<string>());
      const metaArray = [metaMeta("test-value")];

      const result = acc.find(metaArray);

      expect(result).toBeUndefined();
    });

    test("accessor.find from executor with metas", () => {
      const acc = accessor("test.exec", custom<number>());
      const accMeta = meta("test.exec", custom<number>());
      const exec = provide(() => 1, accMeta(42));

      const result = acc.find(exec);

      expect(result).toBeUndefined();
    });

    test("accessor.set throws on non-datastore", () => {
      const acc = accessor("test.invalid", custom<string>());
      const exec = provide(() => 1);

      expect(() => acc.set(exec as any, "value")).toThrow(
        "set() can only be used with DataStore"
      );
    });

    test("accessor.get retrieves value from datastore", () => {
      const acc = accessor("test.get", custom<number>());
      const store = new Map();
      acc.set(store, 999);

      const result = acc.get(store);

      expect(result).toBe(999);
    });
  });

  describe("errors.ts - getExecutorName edge cases", () => {
    test("getExecutorName returns factory name when available", () => {
      const executorWithName = {
        factory: function myFactory() {},
      };

      const name = getExecutorName(executorWithName);

      expect(name).toBe("myFactory");
    });

    test("getExecutorName handles factory with name 'factory'", () => {
      const executorWithFactoryName = {
        factory: function factory() {},
      };

      const name = getExecutorName(executorWithFactoryName);

      expect(name).toContain("executor-");
    });

    test("getExecutorName handles executor with symbol", () => {
      const executorWithSymbol = {
        [Symbol.for("@pumped-fn/core/executor")]: "custom",
      };

      const name = getExecutorName(executorWithSymbol);

      expect(name).toContain("custom-executor-");
    });

    test("getExecutorName returns unknown-executor for invalid input", () => {
      const name = getExecutorName(null);

      expect(name).toBe("unknown-executor");
    });

    test("createFactoryError with non-Error originalError", () => {
      const error = createFactoryError(
        "F001",
        "testExecutor",
        [],
        "string error"
      );

      expect(error.message).toContain("testExecutor");
      expect(error.cause).toBe("string error");
    });

    test("createDependencyError with non-Error originalError", () => {
      const error = createDependencyError(
        "D003",
        "testExecutor",
        [],
        "depName",
        123
      );

      expect(error.message).toContain("testExecutor");
      expect(error.cause).toBe(123);
    });

    test("createSystemError handles non-Error originalError", () => {
      const error = createSystemError(
        "SYS001",
        "testExecutor",
        [],
        { custom: "error" }
      );

      expect(error.message).toBeDefined();
      expect(error.cause).toEqual({ custom: "error" });
    });
  });

  describe("flow.ts - uncovered error paths", () => {
    test("flow execution handles result success path", async () => {
      const testFlow = flow((_ctx, input: number) => input * 2);

      const result = await flow.execute(testFlow, 21);

      expect(result).toBe(42);
    });

    test("flow execution handles error in handler", async () => {
      const testFlow = flow((_ctx, _input: number) => {
        throw new Error("Test error");
      });

      await expect(flow.execute(testFlow, 1)).rejects.toThrow("Test error");
    });

    test("flow with dependencies using object config", async () => {
      const dep = provide(() => 10);
      const testFlow = flow({ value: dep }, (deps) => deps.value * 2);

      const result = await flow.execute(testFlow, undefined);

      expect(result).toBe(20);
    });
  });

  describe("scope.ts - uncovered error paths", () => {
    test("scope.useExtension throws when scope is disposing", async () => {
      const scope = createScope();
      const extension = { name: "test", init: () => {} };

      const disposePromise = scope.dispose();

      expect(() => scope.useExtension(extension)).toThrow(
        "Cannot register extension on a disposing scope"
      );

      await disposePromise;
    });

    test("useExtension cleanup removes extension", () => {
      const scope = createScope();
      const extension = { name: "test", init: () => {} };

      const cleanup = scope.useExtension(extension);
      cleanup();

      expect(() => cleanup()).not.toThrow();
    });

    test("scope.onRelease throws when scope is disposing", async () => {
      const scope = createScope();
      const callback = () => {};

      const disposePromise = scope.dispose();

      expect(() => scope.onRelease(callback)).toThrow(
        "Cannot register update callback on a disposing scope"
      );

      await disposePromise;
    });

    test("scope.onError throws when scope is disposing", async () => {
      const scope = createScope();
      const callback = () => {};

      const disposePromise = scope.dispose();

      expect(() => scope.onError(callback)).toThrow(
        "Cannot register error callback on a disposing scope"
      );

      await disposePromise;
    });

    test("scope.onRelease cleanup removes callback", async () => {
      const scope = createScope();
      const exec = provide(() => 1);
      let called = false;

      const cleanup = scope.onRelease(() => {
        called = true;
      });

      await scope.resolve(exec);
      cleanup();
      await scope.release(exec);

      expect(called).toBe(false);
      await scope.dispose();
    });

    test("scope.onError cleanup removes callback", () => {
      const scope = createScope();
      const callback = () => {};

      const cleanup = scope.onError(callback);
      cleanup();

      expect(() => cleanup()).not.toThrow();
    });

    test("scope.onUpdate throws when scope is disposing", async () => {
      const scope = createScope();
      const exec = provide(() => 1);
      const callback = () => {};

      const disposePromise = scope.dispose();

      expect(() => scope.onUpdate(exec, callback)).toThrow(
        "Cannot register update callback on a disposing scope"
      );

      await disposePromise;
    });

    test("scope.onChange throws when scope is disposing", async () => {
      const scope = createScope();
      const callback = () => {};

      const disposePromise = scope.dispose();

      expect(() => scope.onChange(callback)).toThrow(
        "Cannot register update callback on a disposing scope"
      );

      await disposePromise;
    });

    test("scope.onUpdate cleanup removes callback", async () => {
      const scope = createScope();
      const exec = provide(() => 1);
      let called = false;

      const cleanup = scope.onUpdate(exec, () => {
        called = true;
      });

      await scope.resolve(exec);
      cleanup();
      await scope.update(exec, 2);

      expect(called).toBe(false);
      await scope.dispose();
    });

    test("scope.onChange cleanup removes callback", () => {
      const scope = createScope();
      const callback = () => {};

      const cleanup = scope.onChange(callback);
      cleanup();

      expect(() => cleanup()).not.toThrow();
    });
  });

  describe("meta.ts - uncovered lines", () => {
    test("meta.some with non-existing meta returns empty array", () => {
      const testMeta = meta("test", custom<string>());
      const exec = provide(() => 1);

      const result = testMeta.some(exec);

      expect(result).toEqual([]);
    });

    test("meta.find on executor without meta", () => {
      const testMeta = meta("test", custom<string>());
      const exec = provide(() => 1);

      const result = testMeta.find(exec);

      expect(result).toBeUndefined();
    });

    test("meta.get on executor without meta throws", () => {
      const testMeta = meta("test", custom<string>());
      const exec = provide(() => 1);

      expect(() => testMeta.get(exec)).toThrow();
    });

    test("meta.partial creates partial metadata", () => {
      const testMeta = meta("test", custom<{ a: string; b: number }>());

      const partial = testMeta.partial({ a: "test" });

      expect(partial).toBeDefined();
    });
  });

  describe("promises.ts - uncovered lines", () => {
    test("Promised.all with mixed Promised and regular values", async () => {
      const p1 = Promised.create(Promise.resolve(1));
      const p2 = 2;
      const p3 = Promised.create(Promise.resolve(3));

      const result = await Promised.all([p1, p2, p3]);

      expect(result).toEqual([1, 2, 3]);
    });

    test("Promised.race with Promised instances", async () => {
      const p1 = Promised.create(Promise.resolve(1));
      const p2 = Promised.create(
        new Promise((resolve) => setTimeout(() => resolve(2), 100))
      );

      const result = await Promised.race([p1, p2]);

      expect(result).toBe(1);
    });

    test("Promised.try with synchronous error", async () => {
      const promised = Promised.try(() => {
        throw new Error("sync error");
      });

      await expect(promised.toPromise()).rejects.toThrow("sync error");
    });
  });
});
