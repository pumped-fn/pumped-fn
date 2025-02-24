import { describe, it, expect, vi, beforeEach } from "vitest";
import { createScope, provide, derive, mutable, resource, effect, ScopeInner, resolve } from "../src/core/core";

describe("core", () => {
  it("syntax", async () => {
    const stringValue = provide(async () => "hello");
    const numberValue = provide(() => 1);

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
});
