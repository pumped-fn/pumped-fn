import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createScope, provide, derive, preset } from '../src/index';
import { meta } from '../src/meta';
import { Core } from '../src/types';

// Memory monitoring utilities
function getMemoryUsage() {
  if (typeof process !== 'undefined' && process.memoryUsage) {
    return process.memoryUsage();
  }
  return { heapUsed: 0, heapTotal: 0, external: 0, rss: 0 };
}

function forceGC() {
  if (typeof global !== 'undefined' && global.gc) {
    global.gc();
  }
}

// Test configuration
const ITERATIONS = {
  MEMORY_LEAK: 10000,
  OBJECT_CREATION: 50000,
  DEPENDENCY_RESOLUTION: 5000,
  MIDDLEWARE: 1000,
};

const MEMORY_THRESHOLD_MB = 50; // Alert if memory grows beyond this

describe('Performance Tests', () => {
  let initialMemory: NodeJS.MemoryUsage;

  beforeEach(() => {
    forceGC();
    initialMemory = getMemoryUsage();
  });

  afterEach(() => {
    forceGC();
  });

  describe('Memory Leak Detection', () => {
    it('should not leak memory in scope lifecycle', async () => {
      const memoryBefore = getMemoryUsage();
      
      // Create and dispose many scopes
      for (let i = 0; i < ITERATIONS.MEMORY_LEAK; i++) {
        const scope = createScope();
        
        // Add some executors
        const executor1 = provide(() => `value-${i}`);
        const executor2 = derive(executor1, (dep) => `derived-${dep}`);
        
        await scope.resolve(executor1);
        await scope.resolve(executor2);
        
        // Add cleanup and update handlers
        scope.onUpdate(executor1, () => {});
        scope.onChange(() => {});
        scope.onRelease(() => {});
        
        await scope.dispose();
        
        // Force GC every 1000 iterations
        if (i % 1000 === 0) {
          forceGC();
        }
      }
      
      forceGC();
      const memoryAfter = getMemoryUsage();
      
      const memoryGrowthMB = (memoryAfter.heapUsed - memoryBefore.heapUsed) / 1024 / 1024;
      
      console.log(`Memory growth: ${memoryGrowthMB.toFixed(2)} MB`);
      expect(memoryGrowthMB).toBeLessThan(MEMORY_THRESHOLD_MB);
    });

    it('should clean up cache entries properly', async () => {
      const scope = createScope();
      const executors: Core.Executor<string>[] = [];
      
      // Create many executors and resolve them
      for (let i = 0; i < ITERATIONS.MEMORY_LEAK; i++) {
        const executor = provide(() => `value-${i}`);
        executors.push(executor);
        await scope.resolve(executor);
      }
      
      const memoryBeforeCleanup = getMemoryUsage();
      
      // Release all executors
      for (const executor of executors) {
        await scope.release(executor);
      }
      
      forceGC();
      const memoryAfterCleanup = getMemoryUsage();
      
      // Memory should not grow significantly after cleanup
      const memoryDifferenceMB = (memoryAfterCleanup.heapUsed - memoryBeforeCleanup.heapUsed) / 1024 / 1024;
      expect(memoryDifferenceMB).toBeLessThan(10);
      
      await scope.dispose();
    });

    it('should handle reactive executor memory properly', async () => {
      const scope = createScope();
      const memoryBefore = getMemoryUsage();
      
      for (let i = 0; i < ITERATIONS.MEMORY_LEAK; i++) {
        const baseExecutor = provide(() => i);
        const reactiveExecutor = derive(baseExecutor.reactive, (dep) => dep * 2);
        
        await scope.resolve(reactiveExecutor);
        
        // Update to trigger reactive chain
        await scope.update(baseExecutor, i + 1);
        
        if (i % 1000 === 0) {
          forceGC();
        }
      }
      
      forceGC();
      const memoryAfter = getMemoryUsage();
      
      const memoryGrowthMB = (memoryAfter.heapUsed - memoryBefore.heapUsed) / 1024 / 1024;
      console.log(`Reactive executor memory growth: ${memoryGrowthMB.toFixed(2)} MB`);
      expect(memoryGrowthMB).toBeLessThan(MEMORY_THRESHOLD_MB);
      
      await scope.dispose();
    });
  });

  describe('Object Creation Overhead', () => {
    it('should measure executor creation performance', () => {
      const startTime = process.hrtime.bigint();
      
      for (let i = 0; i < ITERATIONS.OBJECT_CREATION; i++) {
        const executor = provide(() => `value-${i}`);
        
        // Access all properties to ensure they're created
        executor.lazy;
        executor.reactive;
        executor.static;
      }
      
      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1000000;
      
      console.log(`Created ${ITERATIONS.OBJECT_CREATION} executors in ${durationMs.toFixed(2)}ms`);
      console.log(`Average: ${(durationMs / ITERATIONS.OBJECT_CREATION).toFixed(4)}ms per executor`);
      
      // Should create executors reasonably fast
      expect(durationMs).toBeLessThan(5000); // 5 seconds max
    });

    it('should measure meta system performance', () => {
      const testMeta = meta('test', {
        '~standard': {
          version: 1,
          vendor: 'test',
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
      
      console.log(`Meta system test completed in ${durationMs.toFixed(2)}ms`);
      expect(durationMs).toBeLessThan(10000); // 10 seconds max
    });
  });

  describe('Dependency Resolution Performance', () => {
    it('should resolve dependencies efficiently', async () => {
      const scope = createScope();
      
      // Create a complex dependency tree
      const baseExecutors = Array.from({ length: 100 }, (_, i) => 
        provide(() => `base-${i}`)
      );
      
      const derivedExecutors = baseExecutors.map((base, i) => 
        derive(base, (dep) => `derived-${dep}-${i}`)
      );
      
      const complexExecutor = derive(
        derivedExecutors.slice(0, 50),
        (deps) => `complex-${deps.join('-')}`
      );
      
      const startTime = process.hrtime.bigint();
      
      for (let i = 0; i < ITERATIONS.DEPENDENCY_RESOLUTION; i++) {
        await scope.resolve(complexExecutor, true); // Force re-resolution
      }
      
      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1000000;
      
      console.log(`Resolved complex dependencies ${ITERATIONS.DEPENDENCY_RESOLUTION} times in ${durationMs.toFixed(2)}ms`);
      console.log(`Average: ${(durationMs / ITERATIONS.DEPENDENCY_RESOLUTION).toFixed(4)}ms per resolution`);
      
      await scope.dispose();
    });

    it('should handle parallel resolution efficiently', async () => {
      const scope = createScope();
      
      const executors = Array.from({ length: 1000 }, (_, i) => 
        provide(async () => {
          // Simulate some async work
          await new Promise(resolve => setTimeout(resolve, 1));
          return `value-${i}`;
        })
      );
      
      const startTime = process.hrtime.bigint();
      
      // Resolve all in parallel
      await Promise.all(executors.map(executor => scope.resolve(executor)));
      
      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1000000;
      
      console.log(`Parallel resolution of 1000 executors completed in ${durationMs.toFixed(2)}ms`);
      
      await scope.dispose();
    });
  });

  describe('Middleware and Cleanup Performance', () => {
    it('should handle many middleware efficiently', async () => {
      const scope = createScope();
      const cleanupFns: (() => void)[] = [];
      
      // Add many middleware
      for (let i = 0; i < ITERATIONS.MIDDLEWARE; i++) {
        const cleanup = scope.use({
          init: () => {},
          dispose: async () => {},
        });
        cleanupFns.push(cleanup);
      }
      
      const executor = provide(() => 'test');
      
      const startTime = process.hrtime.bigint();
      
      await scope.resolve(executor);
      
      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1000000;
      
      console.log(`Resolution with ${ITERATIONS.MIDDLEWARE} middleware took ${durationMs.toFixed(2)}ms`);
      
      // Clean up middleware
      const cleanupStartTime = process.hrtime.bigint();
      cleanupFns.forEach(cleanup => cleanup());
      const cleanupEndTime = process.hrtime.bigint();
      const cleanupDurationMs = Number(cleanupEndTime - cleanupStartTime) / 1000000;
      
      console.log(`Middleware cleanup took ${cleanupDurationMs.toFixed(2)}ms`);
      
      await scope.dispose();
    });

    it('should handle cleanup operations efficiently', async () => {
      const scope = createScope();
      const cleanupOperations: (() => void)[] = [];
      
      // Create executor with many cleanup operations
      const executor = provide((controller) => {
        for (let i = 0; i < 1000; i++) {
          controller.cleanup(() => {
            cleanupOperations.push(() => {});
          });
        }
        return 'test';
      });
      
      await scope.resolve(executor);
      
      const startTime = process.hrtime.bigint();
      
      await scope.release(executor);
      
      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1000000;
      
      console.log(`Cleanup with 1000 operations took ${durationMs.toFixed(2)}ms`);
      
      await scope.dispose();
    });
  });

  describe('Update Chain Performance', () => {
    it('should handle long reactive chains efficiently', async () => {
      const scope = createScope();
      
      // Create a chain of 100 reactive executors
      let current = provide(() => 0);
      
      for (let i = 1; i <= 100; i++) {
        current = derive(current.reactive, (dep) => dep + 1);
      }
      
      const finalExecutor = current;
      
      // Subscribe to updates
      const updateCounts: number[] = [];
      scope.onUpdate(finalExecutor, () => {
        updateCounts.push(Date.now());
      });
      
      await scope.resolve(finalExecutor);
      
      const startTime = process.hrtime.bigint();
      
      // Trigger updates
      for (let i = 0; i < 100; i++) {
        await scope.update(provide(() => 0), i);
      }
      
      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1000000;
      
      console.log(`Update chain performance: ${durationMs.toFixed(2)}ms for 100 updates`);
      
      await scope.dispose();
    });
  });

  describe('Memory Pressure Test', () => {
    it('should handle memory pressure gracefully', async () => {
      const scope = createScope();
      const memoryBefore = getMemoryUsage();
      
      // Create a scenario with high memory pressure
      const largeData = Array.from({ length: 10000 }, (_, i) => ({
        id: i,
        data: `large-data-${i}`.repeat(100),
        nested: { value: i * 2 }
      }));
      
      const executor = provide(() => largeData);
      
      // Resolve multiple times
      for (let i = 0; i < 100; i++) {
        await scope.resolve(executor, true);
        
        if (i % 10 === 0) {
          forceGC();
        }
      }
      
      forceGC();
      const memoryAfter = getMemoryUsage();
      
      const memoryGrowthMB = (memoryAfter.heapUsed - memoryBefore.heapUsed) / 1024 / 1024;
      console.log(`Memory pressure test growth: ${memoryGrowthMB.toFixed(2)} MB`);
      
      await scope.dispose();
    });
  });
});