import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createScope,
  effect,
  mutable,
  resource,
  provide,
  derive,
  resolve,
  safeResolve,
  safeRun,
  run,
  prepare,
  bundle,
} from "../src/index";
import { ScopeInner } from "../src/core";

describe("core", () => {
  it("syntax", async () => {
    const stringValue = provide(async () => "hello");
    const numberValue = provide(() => 1);
    const someEffect = provide(() => effect(() => {}));
    const someResource = provide(() => resource(1, () => {}));

    const combinedObject = derive({ stringValue, numberValue }, async ({ stringValue, numberValue }) => {
      return { stringValue: stringValue, numberValue: numberValue };
    });

    const combinedArray = derive([stringValue, numberValue], async ([stringValue, numberValue]) => {
      return [stringValue, numberValue];
    });

    const scope = createScope();

    const [combinedObj, combinedArr] = await Promise.all([scope.resolve(combinedObject), scope.resolve(combinedArray)]);

    const { strValue, numValue } = await resolve(scope, {
      strValue: stringValue,
      numValue: numberValue,
    });
    const svalue = await resolve(scope, stringValue);
    const [s, n] = await resolve(scope, [stringValue, numberValue]);

    expect(combinedObj.get()).toEqual({ stringValue: "hello", numberValue: 1 });
    expect(combinedArr.get()).toEqual(["hello", 1]);
    expect(strValue.get()).toBe("hello");
    expect(numValue.get()).toBe(1);
    expect(svalue.get()).toBe("hello");
    expect(s.get()).toBe("hello");
    expect(n.get()).toBe(1);
  });

  it("complex_scenario", async () => {
    const scope = createScope();
    const cleanup = vi.fn();

    const computedFn = vi.fn();

    // Setup a complex state graph with multiple dependencies
    const base = provide(async () => mutable({ count: 1, text: "hello" }));
    const computed = derive([base], async ([v]) => {
      return v.count * 2;
    });

    const resolvedComputed = await scope.resolve(computed);
    expect(resolvedComputed.get()).toBe(2);

    // Update the base value
    await scope.update(base, (v) => ({ ...v, count: 2 }));
    expect(resolvedComputed.get()).toBe(4);
  }, 10000); // Increase timeout

  it("errors_and_cleanup", async () => {
    const scope = createScope();
    const cleanups = {
      resource1: vi.fn(),
      resource2: vi.fn(),
      effect: vi.fn(),
    };

    // Create a chain of resources and effects that might fail
    const base = provide(() => mutable(1));
    const resource1 = derive([base], ([v]) => resource(v, cleanups.resource1));
    const resource2 = derive([resource1], ([v]) => resource(v * 2, cleanups.resource2));
    const effectVal = derive([base], ([v]) => effect(cleanups.effect));

    // Test successful initialization
    await Promise.all([scope.resolve(resource1), scope.resolve(resource2), scope.resolve(effectVal)]);

    // Force cleanup by disposing
    await scope.dispose();
    expect(cleanups.resource1).toHaveBeenCalled();
    expect(cleanups.resource2).toHaveBeenCalled();
    expect(cleanups.effect).toHaveBeenCalled();
  });

  it("should_release_nicely", async () => {
    const scope = createScope();
    const scopeInner = scope as unknown as ScopeInner;
    const tree = scopeInner.getDependencyMap();

    const a = provide(() => "a");
    const b = provide(() => 2);

    const ab = derive([a, b], ([a, b]) => a + b);
    const c = derive({ a }, ({ a }) => a + "c");
    const d = derive([ab, c], ([ab, c]) => ab + c);

    await resolve(scope, [d]);
    expect(scopeInner.getValues().size).toBe(5);
    expect(scopeInner.getDependencyMap().size).toBe(4);

    await scope.release(c);
    expect(tree.has(d)).toBe(false);
    expect(tree.has(c)).toBe(false);
    expect(tree.has(ab)).toBe(false);

    await scope.release(ab);
    expect(tree.size).toBe(0);
  });

  it("can use safeRun and safeResolve", async () => {
    const scope = createScope();

    const stringValue = provide<string>(() => "hello");
    const numberValue = provide<number>(() => 1);

    const calculate = await safeRun(scope, [stringValue, numberValue], ([stringValue, numberValue]) => {
      return stringValue.get() + numberValue.get();
    });

    const directValue = await run(scope, [stringValue, numberValue], ([stringValue, numberValue]) => {
      return stringValue.get() + numberValue.get();
    });

    expect(directValue).toBe("hello1");
    expect(calculate).toEqual({ status: "ok", value: "hello1" });
  });

  it("can use prepare", async () => {
    const scope = createScope();

    const stringValue = provide<string>(() => "hello");

    const helloworld = prepare(scope, stringValue, async (value, world: string) => {
      return value.get() + world;
    });

    const msg = await helloworld("world");
    expect(msg).toBe("helloworld");
  });
});

describe("it's all about errors", () => {
  it("error cannot be hidden", async () => {
    const scope = createScope();
    const inner = scope as unknown as ScopeInner;

    const base = provide<string>(() => {
      throw new Error();
    });
    const derived = derive([base], ([v]) => v);

    expect(() => scope.resolve(base)).rejects.toThrowError();
    expect(() => scope.resolve(derived)).rejects.toThrowError();
    let result: any = await safeResolve(scope, derived);

    expect(result).toEqual({ status: "error", error: expect.any(Error) });
    expect(inner.getValues().size).toBe(0);

    result = await safeRun(scope, derived, (v) => v);
    expect(result).toEqual({ status: "error", error: expect.any(Error) });
  });
});

describe("test the bundle", () => {
  it("bundle should work", async () => {
    const inResourceFn = vi.fn();
    const resourceCleanupFn = vi.fn();
    const effectCleanupFn = vi.fn();

    const value1 = provide(() => 1);
    const value2 = derive([value1], ([v]) => v + 1);
    const resourceValue = provide(() => {
      inResourceFn();
      resource(1, resourceCleanupFn);
    });
    const effectValue = derive([value2], ([value2]) => effect(effectCleanupFn));

    const bundled = bundle({ value1, value2, resourceValue, effectValue });

    const scope = createScope();
    const inner = scope as unknown as ScopeInner;
    const resolvedBundled = await scope.resolve(bundled);
    expect(inResourceFn).toHaveBeenCalled();

    await scope.release(bundled);

    expect(inner.getValues().size).toBe(0);
    expect(inner.getCleanups().size).toBe(0);
    expect(inner.getDependencyMap().size).toBe(0);
  });
});
