import { describe, it, expect } from "vitest";
import { resolveShape, createScope } from "../../src/scope";
import { provide, derive } from "../../src/executor";

describe("resolveShape", () => {
  it("resolves single executor", async () => {
    const scope = createScope();
    const executor = provide(() => 42);

    const result = await resolveShape(scope, executor);

    expect(result).toBe(42);
  });

  it("resolves array of executors", async () => {
    const scope = createScope();
    const e1 = provide(() => 1);
    const e2 = provide(() => 2);

    const result = await resolveShape(scope, [e1, e2]);

    expect(result).toEqual([1, 2]);
  });

  it("resolves record of executors", async () => {
    const scope = createScope();
    const e1 = provide(() => "a");
    const e2 = provide(() => "b");

    const result = await resolveShape(scope, { x: e1, y: e2 });

    expect(result).toEqual({ x: "a", y: "b" });
  });

  it("unwraps escapable in single executor", async () => {
    const scope = createScope();
    const executor = provide(() => 42);
    const escapable = { escape: () => executor };

    const result = await resolveShape(scope, escapable as any);

    expect(result).toBe(42);
  });

  it("unwraps escapables in array", async () => {
    const scope = createScope();
    const e1 = provide(() => 1);
    const e2 = provide(() => 2);
    const escapable1 = { escape: () => e1 };

    const result = await resolveShape(scope, [escapable1, e2]);

    expect(result).toEqual([1, 2]);
  });

  it("unwraps escapables in record", async () => {
    const scope = createScope();
    const e1 = provide(() => "a");
    const e2 = provide(() => "b");
    const escapable2 = { escape: () => e2 };

    const result = await resolveShape(scope, { x: e1, y: escapable2 });

    expect(result).toEqual({ x: "a", y: "b" });
  });

  it("resolves lazy executor to main", async () => {
    const scope = createScope();
    const executor = provide(() => 99);

    const result = await resolveShape(scope, executor.lazy);

    expect(result).toBe(99);
  });

  it("resolves reactive executor to main", async () => {
    const scope = createScope();
    const executor = provide(() => 99);

    const result = await resolveShape(scope, executor.reactive);

    expect(result).toBe(99);
  });

  it("resolves static executor to main", async () => {
    const scope = createScope();
    const executor = provide(() => 99);

    const result = await resolveShape(scope, executor.static);

    expect(result).toBe(99);
  });

  it("handles undefined", async () => {
    const scope = createScope();

    const result = await resolveShape(scope, undefined);

    expect(result).toBeUndefined();
  });

  it("resolves array executors in parallel", async () => {
    const scope = createScope();
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    const e1 = provide(async () => {
      await delay(100);
      return 1;
    });
    const e2 = provide(async () => {
      await delay(100);
      return 2;
    });

    const start = Date.now();
    const result = await resolveShape(scope, [e1, e2]);
    const duration = Date.now() - start;

    expect(result).toEqual([1, 2]);
    expect(duration).toBeLessThan(150);
  });

  it("resolves record executors in parallel", async () => {
    const scope = createScope();
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    const e1 = provide(async () => {
      await delay(100);
      return "a";
    });
    const e2 = provide(async () => {
      await delay(100);
      return "b";
    });

    const start = Date.now();
    const result = await resolveShape(scope, { x: e1, y: e2 });
    const duration = Date.now() - start;

    expect(result).toEqual({ x: "a", y: "b" });
    expect(duration).toBeLessThan(150);
  });
});
