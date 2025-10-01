import { describe, test, expect, vi } from "vitest";
import { createScope } from "../src/scope";
import { provide, derive, preset } from "../src/executor";

describe("Pod Nesting", () => {
  test("pods can be nested", () => {
    const scope = createScope();
    const rootPod = scope.pod();
    const childPod = rootPod.pod();
    const grandchildPod = childPod.pod();

    expect(grandchildPod.getDepth()).toBe(2);
    expect(childPod.getDepth()).toBe(1);
    expect(rootPod.getDepth()).toBe(0);
  });

  test("getRootPod returns the root pod", () => {
    const scope = createScope();
    const rootPod = scope.pod();
    const childPod = rootPod.pod();
    const grandchildPod = childPod.pod();

    expect(grandchildPod.getRootPod()).toBe(rootPod);
    expect(childPod.getRootPod()).toBe(rootPod);
    expect(rootPod.getRootPod()).toBe(rootPod);
  });

  test("nested pods inherit values from parents", async () => {
    const scope = createScope();
    const value = provide((scope) => {
      return "parent-value";
    });

    const rootPod = scope.pod();
    await rootPod.resolve(value);

    const childPod = rootPod.pod();
    const childValue = await childPod.resolve(value);

    expect(childValue).toBe("parent-value");
  });

  test("nested pods can override parent values with presets", async () => {
    const scope = createScope();
    const counter = provide((scope) => 0);

    const rootPod = scope.pod();
    await rootPod.resolve(counter);

    const childPod = rootPod.pod(preset(counter, 10));
    const childValue = await childPod.resolve(counter);

    expect(childValue).toBe(10);
    expect(await rootPod.resolve(counter)).toBe(0);
  });

  test("deeply nested pods inherit through the hierarchy", async () => {
    const scope = createScope();
    const value1 = provide((scope) => "level-1");
    const value2 = provide((scope) => "level-2");
    const value3 = provide((scope) => "level-3");

    const rootPod = scope.pod();
    await rootPod.resolve(value1);

    const childPod = rootPod.pod();
    await childPod.resolve(value2);

    const grandchildPod = childPod.pod();
    await grandchildPod.resolve(value3);

    // Grandchild can access all values through hierarchy
    expect(await grandchildPod.resolve(value1)).toBe("level-1");
    expect(await grandchildPod.resolve(value2)).toBe("level-2");
    expect(await grandchildPod.resolve(value3)).toBe("level-3");

    // Child can access parent values and its own
    expect(await childPod.resolve(value1)).toBe("level-1");
    expect(await childPod.resolve(value2)).toBe("level-2");
    // Child can also resolve value3 (creates new instance)
    expect(await childPod.resolve(value3)).toBe("level-3");

    // Root can access its own and resolve new ones
    expect(await rootPod.resolve(value1)).toBe("level-1");
    expect(await rootPod.resolve(value2)).toBe("level-2");
    expect(await rootPod.resolve(value3)).toBe("level-3");
  });

  test("cascade disposal disposes all child pods", async () => {
    const scope = createScope();
    const rootPod = scope.pod();
    const childPod = rootPod.pod();
    const grandchildPod = childPod.pod();
    const greatGrandchildPod = grandchildPod.pod();

    const disposed = {
      root: false,
      child: false,
      grandchild: false,
      greatGrandchild: false,
    };

    const mockDispose = vi.fn();

    rootPod.useExtension({
      name: "track-disposal-root",
      disposePod() {
        disposed.root = true;
        mockDispose("root");
      },
    });

    childPod.useExtension({
      name: "track-disposal-child",
      disposePod() {
        disposed.child = true;
        mockDispose("child");
      },
    });

    grandchildPod.useExtension({
      name: "track-disposal-grandchild",
      disposePod() {
        disposed.grandchild = true;
        mockDispose("grandchild");
      },
    });

    greatGrandchildPod.useExtension({
      name: "track-disposal-greatgrandchild",
      disposePod() {
        disposed.greatGrandchild = true;
        mockDispose("greatgrandchild");
      },
    });

    await rootPod.dispose();

    expect(disposed.root).toBe(true);
    expect(disposed.child).toBe(true);
    expect(disposed.grandchild).toBe(true);
    expect(disposed.greatGrandchild).toBe(true);

    expect(mockDispose).toHaveBeenCalledTimes(4);
  });

  test("child pod removal from parent on dispose", async () => {
    const scope = createScope();
    const rootPod = scope.pod();
    const childPod1 = rootPod.pod();
    const childPod2 = rootPod.pod();
    const childPod3 = rootPod.pod();

    expect(rootPod["childPods"].size).toBe(3);

    await childPod2.dispose();

    expect(rootPod["childPods"].size).toBe(2);
    expect(rootPod["childPods"].has(childPod1)).toBe(true);
    expect(rootPod["childPods"].has(childPod2)).toBe(false);
    expect(rootPod["childPods"].has(childPod3)).toBe(true);
  });

  test("pods with dependencies that have presets resolve correctly", async () => {
    const scope = createScope();

    const baseValue = provide((scope) => "base");
    const dependentValue = derive(
      { base: baseValue },
      ({ base }, scope) => `dependent-${base}`
    );

    const rootPod = scope.pod();
    const childPod = rootPod.pod(preset(baseValue, "overridden"));

    const result = await childPod.resolve(dependentValue);
    expect(result).toBe("dependent-overridden");

    const rootResult = await rootPod.resolve(dependentValue);
    expect(rootResult).toBe("dependent-base");
  });
});