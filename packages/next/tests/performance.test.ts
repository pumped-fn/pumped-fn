import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createScope, provide, derive, preset } from "../src/index";
import { meta } from "../src/meta";
import { Core } from "../src/types";

function getMemoryUsage() {
  if (typeof process !== "undefined" && process.memoryUsage) {
    return process.memoryUsage();
  }
  return { heapUsed: 0, heapTotal: 0, external: 0, rss: 0 };
}

function forceGC() {
  if (typeof global !== "undefined" && global.gc) {
    global.gc();
  }
}

const ITERATIONS = {
  MEMORY_LEAK: 10000,
  OBJECT_CREATION: 50000,
  DEPENDENCY_RESOLUTION: 5000,
  MIDDLEWARE: 1000,
};

const MEMORY_THRESHOLD_MB = 50;

describe.skip("Performance Tests", () => {
  let initialMemory: ReturnType<typeof getMemoryUsage>;

  beforeEach(() => {
    forceGC();
    initialMemory = getMemoryUsage();
  });

  afterEach(() => {
    forceGC();
  });

  describe("Memory Leak Detection", () => {
    it("should not leak memory in scope lifecycle", async () => {
      const memoryBefore = getMemoryUsage();

      for (let i = 0; i < ITERATIONS.MEMORY_LEAK; i++) {
        const scope = createScope();

        const executor1 = provide(() => `value-${i}`);
        const executor2 = derive(executor1, (dep) => `derived-${dep}`);

        await scope.resolve(executor1);
        await scope.resolve(executor2);

        scope.onUpdate(executor1, () => {});
        scope.onChange(() => {});
        scope.onRelease(() => {});

        await scope.dispose();

        if (i % 1000 === 0) {
          forceGC();
        }
      }

      forceGC();
      const memoryAfter = getMemoryUsage();

      const memoryGrowthMB =
        (memoryAfter.heapUsed - memoryBefore.heapUsed) / 1024 / 1024;

      expect(memoryGrowthMB).toBeLessThan(MEMORY_THRESHOLD_MB);
    });

    it("should clean up cache entries properly", async () => {
      const scope = createScope();
      const executors: Core.Executor<string>[] = [];

      for (let i = 0; i < ITERATIONS.MEMORY_LEAK; i++) {
        const executor = provide(() => `value-${i}`);
        executors.push(executor);
        await scope.resolve(executor);
      }

      const memoryBeforeCleanup = getMemoryUsage();

      for (const executor of executors) {
        await scope.release(executor);
      }

      forceGC();
      const memoryAfterCleanup = getMemoryUsage();

      const memoryDifferenceMB =
        (memoryAfterCleanup.heapUsed - memoryBeforeCleanup.heapUsed) /
        1024 /
        1024;
      expect(memoryDifferenceMB).toBeLessThan(12);

      await scope.dispose();
    });

    it("should handle reactive executor memory properly", async () => {
      const scope = createScope();
      const memoryBefore = getMemoryUsage();

      for (let i = 0; i < ITERATIONS.MEMORY_LEAK; i++) {
        const baseExecutor = provide(() => i);
        const reactiveExecutor = derive(
          baseExecutor.reactive,
          (dep) => dep * 2
        );

        await scope.resolve(reactiveExecutor);

        await scope.update(baseExecutor, i + 1);

        if (i % 1000 === 0) {
          forceGC();
        }
      }

      forceGC();
      const memoryAfter = getMemoryUsage();

      const memoryGrowthMB =
        (memoryAfter.heapUsed - memoryBefore.heapUsed) / 1024 / 1024;
      expect(memoryGrowthMB).toBeLessThan(MEMORY_THRESHOLD_MB);

      await scope.dispose();
    });
  });

  describe("Object Creation Overhead", () => {
    it("should measure executor creation performance", () => {
      const startTime = process.hrtime.bigint();

      for (let i = 0; i < ITERATIONS.OBJECT_CREATION; i++) {
        const executor = provide(() => `value-${i}`);

        executor.lazy;
        executor.reactive;
        executor.static;
      }

      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1000000;

      expect(durationMs).toBeLessThan(5000); // 5 seconds max
    });

    it("should measure meta system performance", () => {
      const testMeta = meta("test", {
        "~standard": {
          version: 1,
          vendor: "test",
          validate: (value) => ({ value }),
        },
      });

      const startTime = process.hrtime.bigint();

      for (let i = 0; i < ITERATIONS.OBJECT_CREATION; i++) {
        const executor = provide(() => `value-${i}`, testMeta(`meta-${i}`));
        testMeta.find(executor);
      }

      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1000000;

      expect(durationMs).toBeLessThan(10000); // 10 seconds max
    });
  });

  describe("Dependency Resolution Performance", () => {
    it("should resolve dependencies efficiently", async () => {
      const scope = createScope();

      const baseExecutors = Array.from({ length: 100 }, (_, i) =>
        provide(() => `base-${i}`)
      );

      const derivedExecutors = baseExecutors.map((base, i) =>
        derive(base, (dep) => `derived-${dep}-${i}`)
      );

      const complexExecutor = derive(
        derivedExecutors.slice(0, 50),
        (deps) => `complex-${deps.join("-")}`
      );

      const startTime = process.hrtime.bigint();

      for (let i = 0; i < ITERATIONS.DEPENDENCY_RESOLUTION; i++) {
        await scope.resolve(complexExecutor, true); // Force re-resolution
      }

      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1000000;

      await scope.dispose();
    });

    it("should handle parallel resolution efficiently", async () => {
      const scope = createScope();

      const executors = Array.from({ length: 1000 }, (_, i) =>
        provide(async () => {
          await new Promise((resolve) => setTimeout(resolve, 1));
          return `value-${i}`;
        })
      );

      const startTime = process.hrtime.bigint();

      await Promise.all(executors.map((executor) => scope.resolve(executor)));

      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1000000;

      await scope.dispose();
    });
  });

  describe("Middleware and Cleanup Performance", () => {
    it("should handle many middleware efficiently", async () => {
      const scope = createScope();
      const cleanupFns: (() => void)[] = [];

      for (let i = 0; i < ITERATIONS.MIDDLEWARE; i++) {
        const cleanup = scope.useExtension({
          name: `middleware-${i}`,
          init: () => {},
        });
        cleanupFns.push(cleanup);
      }

      const executor = provide(() => "test");

      const startTime = process.hrtime.bigint();

      await scope.resolve(executor);

      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1000000;

      cleanupFns.forEach((cleanup) => cleanup());

      await scope.dispose();
    });

    it("should handle cleanup operations efficiently", async () => {
      const scope = createScope();
      const cleanupOperations: (() => void)[] = [];

      const executor = provide((controller) => {
        for (let i = 0; i < 1000; i++) {
          controller.cleanup(() => {
            cleanupOperations.push(() => {});
          });
        }
        return "test";
      });

      await scope.resolve(executor);

      const startTime = process.hrtime.bigint();

      await scope.release(executor);

      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1000000;

      await scope.dispose();
    });
  });

  describe("Update Chain Performance", () => {
    it("should handle long reactive chains efficiently", async () => {
      const scope = createScope();

      let current = provide(() => 0);

      for (let i = 1; i <= 100; i++) {
        current = derive(current.reactive, (dep) => dep + 1);
      }

      const finalExecutor = current;

      const updateCounts: number[] = [];
      scope.onUpdate(finalExecutor, () => {
        updateCounts.push(Date.now());
      });

      await scope.resolve(finalExecutor);

      const startTime = process.hrtime.bigint();

      for (let i = 0; i < 100; i++) {
        await scope.update(
          provide(() => 0),
          i
        );
      }

      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1000000;

      await scope.dispose();
    });
  });

  describe("Memory Pressure Test", () => {
    it("should handle memory pressure gracefully", async () => {
      const scope = createScope();
      const memoryBefore = getMemoryUsage();

      const largeData = Array.from({ length: 10000 }, (_, i) => ({
        id: i,
        data: `large-data-${i}`.repeat(100),
        nested: { value: i * 2 },
      }));

      const executor = provide(() => largeData);

      for (let i = 0; i < 100; i++) {
        await scope.resolve(executor, true);

        if (i % 10 === 0) {
          forceGC();
        }
      }

      forceGC();
      const memoryAfter = getMemoryUsage();

      const memoryGrowthMB =
        (memoryAfter.heapUsed - memoryBefore.heapUsed) / 1024 / 1024;

      await scope.dispose();
    });
  });
});
