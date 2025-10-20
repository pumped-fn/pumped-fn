import { describe, test, expect } from "vitest";
import { custom, validate } from "../src/ssch";
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
import { tag } from "../src/tag";
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

  describe("tag.ts - uncovered lines", () => {
    test("tag.get throws when value not found", () => {
      const acc = tag(custom<number>(), { label: "test.key" });
      const store = new Map();

      expect(() => acc.get(store)).toThrow("Value not found for key:");
    });

    test("tag.entry returns symbol and value tuple", () => {
      const acc = tag(custom<string>(), { label: "test.preset" });

      const [symbol, value] = acc.entry("test-value");

      expect(typeof symbol).toBe("symbol");
      expect(value).toBe("test-value");
    });

    test("tag with default value entry returns symbol and value tuple", () => {
      const acc = tag(custom<number>(), { label: "test.preset.default", default: 42 });

      const [symbol, value] = acc.entry(100);

      expect(typeof symbol).toBe("symbol");
      expect(value).toBe(100);
    });

    test("tag created without label uses anonymous symbol key", () => {
      const acc = tag(custom<string>());
      const store = new Map();

      acc.set(store, "value");
      const result = acc.find(store);

      expect(result).toBe("value");
    });

    test("tag.find from tag array with different key", () => {
      const acc = tag(custom<string>(), { label: "test.meta" });
      const otherTag = tag(custom<string>(), { label: "test.other" });
      const tagArray = [otherTag("test-value")];

      const result = acc.find(tagArray);

      expect(result).toBeUndefined();
    });

    test("tag.find from executor with different tag", () => {
      const acc = tag(custom<number>(), { label: "test.exec" });
      const otherTag = tag(custom<number>(), { label: "test.other" });
      const exec = provide(() => 1, otherTag(42));

      const result = acc.find(exec);

      expect(result).toBeUndefined();
    });

    test("tag.set on executor returns tagged value", () => {
      const acc = tag(custom<string>(), { label: "test.set" });
      const exec = provide(() => 1);

      const tagged = acc.set(exec.metas ?? [], "value");

      expect(tagged.value).toBe("value");
    });

    test("tag.get retrieves value from datastore", () => {
      const acc = tag(custom<number>(), { label: "test.get" });
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

  describe("tag.ts - additional coverage", () => {
    test("tag.some with non-existing tag returns empty array", () => {
      const testTag = tag(custom<string>(), { label: "test" });
      const exec = provide(() => 1);

      const result = testTag.some(exec);

      expect(result).toEqual([]);
    });

    test("tag.find on executor without tag", () => {
      const testTag = tag(custom<string>(), { label: "test" });
      const exec = provide(() => 1);

      const result = testTag.find(exec);

      expect(result).toBeUndefined();
    });

    test("tag.get on executor without tag throws", () => {
      const testTag = tag(custom<string>(), { label: "test" });
      const exec = provide(() => 1);

      expect(() => testTag.get(exec)).toThrow();
    });

    test("tag.partial creates partial tags", () => {
      const testTag = tag(custom<{ a: string; b: number }>(), { label: "test" });

      const partial = (testTag as any).partial({ a: "test" });

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

  describe("ssch.ts - validation error paths", () => {
    test("validate throws error when schema validation returns promise", () => {
      const asyncSchema = {
        "~standard": {
          vendor: "test",
          version: 1 as const,
          validate: () => Promise.resolve({ value: "async" }),
        },
      };

      expect(() => {
        validate(asyncSchema, "test");
      }).toThrow("validating async is not supported");
    });

    test("validate throws SchemaError when validation returns issues", () => {
      const failingSchema = {
        "~standard": {
          vendor: "test",
          version: 1 as const,
          validate: () => ({
            issues: [{ message: "validation failed" }],
          }),
        },
      };

      expect(() => {
        validate(failingSchema, "test");
      }).toThrow("validation failed");
    });
  });
});
