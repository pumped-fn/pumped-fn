import { describe, it, expect, vi } from "vitest";
import { derive, provide, createScope } from "../src";

describe("Generator Support", () => {
  it("should support sync generator functions", async () => {
    const yields: number[] = [];
    
    const generatorExecutor = provide(function* () {
      yield 1;
      yield 2;
      yield 3;
      return "done";
    });

    const scope = createScope();
    const result = await scope.resolve(generatorExecutor);
    
    expect(result).toBe("done");
  });

  it("should support async generator functions", async () => {
    const yields: number[] = [];
    
    const asyncGeneratorExecutor = provide(async function* () {
      yield 1;
      yield await Promise.resolve(2);
      yield 3;
      return "async done";
    });

    const scope = createScope();
    const result = await scope.resolve(asyncGeneratorExecutor);
    
    expect(result).toBe("async done");
  });

  it("should support generators with dependencies", async () => {
    const inputExecutor = provide(() => "input");
    
    const generatorWithDeps = derive([inputExecutor], function* (input) {
      yield `processing ${input}`;
      yield `transforming ${input}`;
      return `result: ${input}`;
    });

    const scope = createScope();
    const result = await scope.resolve(generatorWithDeps);
    
    expect(result).toBe("result: input");
  });

  it("should handle generator errors properly", async () => {
    const errorGenerator = provide(function* () {
      yield 1;
      throw new Error("Generator error");
      yield 2; // This should never be reached
    });

    const scope = createScope();
    
    await expect(scope.resolve(errorGenerator)).rejects.toThrow("Generator error");
  });

  it("should cleanup generators on error", async () => {
    const cleanupSpy = vi.fn();
    
    const generatorWithCleanup = provide(async function* (controller) {
      controller.cleanup(cleanupSpy);
      
      yield 1;
      throw new Error("Forced error");
    });

    const scope = createScope();
    
    try {
      await scope.resolve(generatorWithCleanup);
    } catch {}
    
    await scope.dispose();
    expect(cleanupSpy).toHaveBeenCalled();
  });

  it("should work with reactive executors", async () => {
    let generatorRunCount = 0;
    
    const source = provide(() => 1);
    
    const reactiveGenerator = derive([source.reactive], function* ([value]) {
      generatorRunCount++;
      yield `step 1 with ${value}`;
      yield `step 2 with ${value}`;
      return value * 2;
    });

    const scope = createScope();
    const result1 = await scope.resolve(reactiveGenerator);
    
    expect(result1).toBe(2);
    expect(generatorRunCount).toBe(1);
    
    await scope.update(source, 2);
    const result2 = await scope.resolve(reactiveGenerator);
    
    expect(result2).toBe(4);
    expect(generatorRunCount).toBe(2);
  });

  it("should handle nested generators", async () => {
    const innerGenerator = provide(function* () {
      yield "inner 1";
      yield "inner 2";
      return "inner done";
    });

    const outerGenerator = derive([innerGenerator], async function* (inner) {
      yield "outer 1";
      yield `got: ${inner}`;
      return `outer done with ${inner}`;
    });

    const scope = createScope();
    const result = await scope.resolve(outerGenerator);
    
    expect(result).toBe("outer done with inner done");
  });

  it("should work with lazy executors", async () => {
    const generator = provide(function* () {
      yield 1;
      yield 2;
      return "lazy result";
    });

    const scope = createScope();
    
    // Test with lazy directly
    const lazyAccessor = scope.accessor(generator);
    
    // Should be unresolved initially
    expect(lazyAccessor.lookup()).toBeUndefined();
    
    // Resolve and check result
    const result = await lazyAccessor.resolve();
    expect(result).toBe("lazy result");
    
    // After resolution, lookup should return the resolved state
    const state = lazyAccessor.lookup();
    expect(state?.kind).toBe("resolved");
    expect(state?.kind === "resolved" && state.value).toBe("lazy result");
    
    // get() should return the value
    expect(lazyAccessor.get()).toBe("lazy result");
  });
});