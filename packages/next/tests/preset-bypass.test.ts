import { describe, test, expect } from "vitest";
import { provide, derive, createScope, preset } from "../src";

describe("Pod preset bypass issue", () => {
  test("should use pod presets even when parent scope has cached value", async () => {
    const valueExecutor = provide(() => "parent-value");

    const scope = createScope();

    // First resolve in parent scope
    const parentValue = await scope.resolve(valueExecutor);
    expect(parentValue).toBe("parent-value");

    // Create pod with preset that should override parent value
    const pod = scope.pod(preset(valueExecutor, "pod-preset-value"));

    // This should return the preset value, not the cached parent value
    const podValue = await pod.resolve(valueExecutor);
    expect(podValue).toBe("pod-preset-value");
  });

  test("should use pod presets for dependencies even when parent has cached value", async () => {
    const baseValue = provide(() => "base-parent");
    const dependentValue = derive({ dep: baseValue }, ({ dep }) => `dependent-${dep}`);

    const scope = createScope();

    // First resolve in parent scope to cache both values
    const parentDependent = await scope.resolve(dependentValue);
    expect(parentDependent).toBe("dependent-base-parent");

    // Create pod with preset for dependency
    const pod = scope.pod(preset(baseValue, "base-pod"));

    // First check if pod can resolve the base dependency correctly
    const podBaseValue = await pod.resolve(baseValue);
    expect(podBaseValue).toBe("base-pod");

    // The dependent should use the pod's preset value for its dependency
    const podDependent = await pod.resolve(dependentValue);
    expect(podDependent).toBe("dependent-base-pod");
  });
});