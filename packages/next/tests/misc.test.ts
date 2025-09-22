import { describe, test, expect, vi } from "vitest";
import { derive, provide, createScope, preset } from "../src";

describe("Miscellaneous Features", () => {
  describe("Multi-value operations", () => {
    test("derive correctly creates dependency executor", () => {
      const depA = provide(() => "a");
      const depB = provide(() => "b");
      const depC = provide(() => "c");

      const dependencies = derive({ depA, depB, depC }, (deps) => deps);

      expect(dependencies.dependencies).toEqual({
        depA,
        depB,
        depC,
      });
    });

    test("derive creates executor with empty dependencies", () => {
      const dependencies = derive({}, () => ({}));
      expect(dependencies.dependencies).toEqual({});
    });
  });

  describe("Preset functionality", () => {
    test("preset overrides executor value", async () => {
      const scope = createScope();
      const executor = provide(() => "original");

      const pod = scope.pod(preset(executor, "overridden"));
      const result = await pod.resolve(executor);

      expect(result).toBe("overridden");
      await scope.dispose();
    });

    test("preset works with complex values", async () => {
      const scope = createScope();
      const executor = provide(() => ({ value: 1 }));

      const pod = scope.pod(preset(executor, { value: 42 }));
      const result = await pod.resolve(executor);

      expect(result).toEqual({ value: 42 });
      await scope.dispose();
    });

    test("multiple presets can be applied", async () => {
      const scope = createScope();
      const exec1 = provide(() => "original1");
      const exec2 = provide(() => "original2");

      const pod = scope.pod(
        preset(exec1, "override1"),
        preset(exec2, "override2")
      );

      const result1 = await pod.resolve(exec1);
      const result2 = await pod.resolve(exec2);

      expect(result1).toBe("override1");
      expect(result2).toBe("override2");
      await scope.dispose();
    });
  });
});