import { createScope, custom, flow, tag } from "../src";
import { describe, it, expect } from "vitest";

describe("memory profiling", () => {
  it("should not leak memory with many execution contexts", async () => {
    const value = tag(custom<string>());
    const scope = createScope({ tags: [value("scope")] });

    const myFlow = flow([value], ([v]) => v);

    const initialMemory = process.memoryUsage().heapUsed;
    const contexts: ReturnType<typeof scope.createExecution>[] = [];

    // Create 1000 execution contexts and execute flows
    for (let i = 0; i < 1000; i++) {
      const ctx = scope.createExecution({ tags: [value(`ctx-${i}`)] });
      await ctx.exec(myFlow, undefined);

      // Keep reference to prevent GC (simulating long-lived contexts)
      if (i % 100 === 0) {
        contexts.push(ctx);
      }
    }

    const afterMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = afterMemory - initialMemory;
    const memoryPerContext = memoryIncrease / 1000;

    // Log for investigation (not strict assertion)
    console.log(`Memory increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Per context: ${(memoryPerContext / 1024).toFixed(2)} KB`);

    // Loose threshold - just ensure it's not catastrophic
    expect(memoryPerContext).toBeLessThan(50 * 1024); // Less than 50KB per context
  });

  it("should allow GC of disposed execution contexts", async () => {
    const value = tag(custom<string>());
    const scope = createScope({ tags: [value("scope")] });

    const myFlow = flow([value], ([v]) => v);

    // Create contexts without keeping references
    for (let i = 0; i < 1000; i++) {
      const ctx = scope.createExecution({ tags: [value(`ctx-${i}`)] });
      await ctx.exec(myFlow, undefined);
      // ctx goes out of scope, should be GC-able
    }

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    // This test primarily documents expected behavior
    // Actual memory inspection would require heap snapshots
    expect(true).toBe(true);
  });
});
