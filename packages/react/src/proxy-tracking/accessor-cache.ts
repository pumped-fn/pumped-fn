import { Core } from "@pumped-fn/core-next";
import type { AccessorCache } from './types';

/**
 * Creates a cache for storing accessors by their executors
 */
export function createAccessorCache(): AccessorCache {
  const cache = new WeakMap<Core.Executor<unknown>, Core.Accessor<unknown>>();
  
  return {
    get<T>(executor: Core.Executor<T>): Core.Accessor<T> | undefined {
      return cache.get(executor) as Core.Accessor<T> | undefined;
    },
    
    set<T>(executor: Core.Executor<T>, accessor: Core.Accessor<T>): void {
      cache.set(executor, accessor as Core.Accessor<unknown>);
    },
    
    has<T>(executor: Core.Executor<T>): boolean {
      return cache.has(executor);
    },
    
    delete<T>(executor: Core.Executor<T>): boolean {
      return cache.delete(executor);
    },
    
    clear(): void {
      // WeakMap doesn't have a clear method, so we can't actually clear it
      // This is a limitation of WeakMap
    }
  };
}

