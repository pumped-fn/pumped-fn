import { describe, it, expect, beforeEach } from 'vitest';
import { createScope, provide, derive } from '../src/index';

describe('Synchronous vs Asynchronous Resolution', () => {
  let scope: ReturnType<typeof createScope>;

  beforeEach(() => {
    scope = createScope();
  });

  describe('Synchronous Resolution', () => {
    it('should resolve synchronous dependencies efficiently on re-resolution', async () => {
      let callCount = 0;
      
      const syncExecutor = provide(() => {
        callCount++;
        return 'sync-value';
      });

      const derivedExecutor = derive(syncExecutor, (dep) => {
        return `derived-${dep}`;
      });

      // First resolution - should call the factory
      const result1 = await scope.resolve(derivedExecutor);
      expect(result1).toBe('derived-sync-value');
      expect(callCount).toBe(1);
      
      // Second resolution - should use cache efficiently
      const result2 = await scope.resolve(derivedExecutor);
      expect(result2).toBe('derived-sync-value');
      expect(callCount).toBe(1); // Should not call factory again
    });

    it('should handle mixed sync/async dependencies correctly', async () => {
      const syncExecutor = provide(() => 'sync');
      const asyncExecutor = provide(async () => {
        await new Promise(resolve => setTimeout(resolve, 1));
        return 'async';
      });

      const mixedExecutor = derive([syncExecutor, asyncExecutor], ([sync, async]) => {
        return `${sync}-${async}`;
      });

      const result = await scope.resolve(mixedExecutor);
      expect(result).toBe('sync-async');
    });

    it('should handle nested synchronous dependencies efficiently', async () => {
      const base = provide(() => 1);
      const level1 = derive(base, (dep) => dep + 1);
      const level2 = derive(level1, (dep) => dep + 1);
      const level3 = derive(level2, (dep) => dep + 1);

      const result = await scope.resolve(level3);
      expect(result).toBe(4);
    });

    it('should handle object dependencies with mixed sync/async', async () => {
      const syncExecutor = provide(() => 'sync');
      const asyncExecutor = provide(async () => 'async');

      const objectExecutor = derive({
        sync: syncExecutor,
        async: asyncExecutor
      }, (deps) => {
        return `${deps.sync}-${deps.async}`;
      });

      const result = await scope.resolve(objectExecutor);
      expect(result).toBe('sync-async');
    });

    it('should handle all synchronous object dependencies without promise overhead', async () => {
      let executionOrder: string[] = [];

      const sync1 = provide(() => {
        executionOrder.push('sync1');
        return 'value1';
      });
      
      const sync2 = provide(() => {
        executionOrder.push('sync2');
        return 'value2';
      });

      const objectExecutor = derive({
        a: sync1,
        b: sync2
      }, (deps) => {
        executionOrder.push('factory');
        return `${deps.a}-${deps.b}`;
      });

      const result = await scope.resolve(objectExecutor);
      
      expect(result).toBe('value1-value2');
      expect(executionOrder).toEqual(['sync1', 'sync2', 'factory']);
    });
  });

  describe('Performance Comparison', () => {
    it('should be faster for synchronous-only dependency chains', async () => {
      // Create a chain of sync dependencies
      let current = provide(() => 0);
      
      for (let i = 1; i <= 100; i++) {
        current = derive(current, (dep) => dep + 1);
      }

      const startTime = process.hrtime.bigint();
      
      for (let i = 0; i < 1000; i++) {
        await scope.resolve(current, true);
      }
      
      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1000000;
      
      console.log(`Sync chain resolution: ${durationMs.toFixed(2)}ms for 1000 iterations`);
      console.log(`Average: ${(durationMs / 1000).toFixed(4)}ms per resolution`);
      
      // Should be significantly faster than mixed async chains
      expect(durationMs).toBeLessThan(100); // Should complete in under 100ms
    });

    it('should handle large arrays of sync dependencies efficiently', async () => {
      const syncExecutors = Array.from({ length: 1000 }, (_, i) => 
        provide(() => i)
      );

      const arrayExecutor = derive(syncExecutors, (deps) => 
        deps.reduce((sum, val) => sum + val, 0)
      );

      const startTime = process.hrtime.bigint();
      const result = await scope.resolve(arrayExecutor);
      const endTime = process.hrtime.bigint();
      
      const durationMs = Number(endTime - startTime) / 1000000;
      
      console.log(`Large sync array resolution: ${durationMs.toFixed(2)}ms`);
      
      expect(result).toBe(499500); // Sum of 0 to 999
      expect(durationMs).toBeLessThan(50); // Should be very fast
    });
  });

  describe('Edge Cases', () => {
    it('should handle sync factory returning a promise', async () => {
      const syncDep = provide(() => 'sync');
      
      const asyncFactory = derive(syncDep, async (dep) => {
        await new Promise(resolve => setTimeout(resolve, 1));
        return `async-${dep}`;
      });

      const result = await scope.resolve(asyncFactory);
      expect(result).toBe('async-sync');
    });

    it('should handle empty dependency arrays synchronously', async () => {
      const emptyArrayExecutor = derive([], () => 'empty-array');
      
      const result = await scope.resolve(emptyArrayExecutor);
      expect(result).toBe('empty-array');
    });

    it('should handle empty dependency objects synchronously', async () => {
      const emptyObjectExecutor = derive({}, () => 'empty-object');
      
      const result = await scope.resolve(emptyObjectExecutor);
      expect(result).toBe('empty-object');
    });
  });
});