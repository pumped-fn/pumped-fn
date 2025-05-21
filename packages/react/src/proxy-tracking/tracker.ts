import { createProxy, isChanged, getUntracked, markToTrack, affectedToPathList } from 'proxy-compare';
import type { TrackerOptions, Tracker, TrackingResult } from './types';

/**
 * Determines if a value should be tracked with proxy-compare
 * Primitives and certain non-trackable objects will return false
 */
function shouldTrackWithProxy(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  
  const type = typeof value;
  if (
    type === 'string' || 
    type === 'number' || 
    type === 'boolean' || 
    type === 'bigint' || 
    type === 'symbol' || 
    type === 'function'
  ) {
    return false;
  }
  
  // Special case for Date, RegExp, etc. which are objects but shouldn't be proxied
  if (
    value instanceof Date || 
    value instanceof RegExp || 
    value instanceof Error || 
    value instanceof WeakMap || 
    value instanceof WeakSet
  ) {
    return false;
  }
  
  return true;
}

/**
 * Creates a tracker that uses proxy-compare to track property access
 * and determine if values have changed
 */
export function createTracker(options: TrackerOptions = {}): Tracker {
  // WeakMap to store affected properties for each tracked object
  const affectedMap = new WeakMap<object, unknown>();
  
  // Cache for proxies to maintain referential identity
  const proxyCache = new WeakMap<object, unknown>();
  
  // Map to store tracking data by ID
  const trackingMap = new Map<string, WeakMap<object, unknown>>();
  
  // Custom equality function
  const isEqual = options.isEqual || Object.is;
  
  return {
    track<T>(value: T, id: string): T {
      // For primitives or non-trackable objects, just return the value
      if (!shouldTrackWithProxy(value)) {
        return value;
      }
      
      // Create a new affected map for this ID if it doesn't exist
      if (!trackingMap.has(id)) {
        trackingMap.set(id, new WeakMap<object, unknown>());
      }
      
      const affected = trackingMap.get(id)!;
      
      // Create a proxy for the object
      return createProxy(value as object, affected, proxyCache) as T;
    },
    
    isChanged<T>(prevValue: T, nextValue: T, id: string): TrackingResult {
      // For primitives, just do a direct comparison
      if (!shouldTrackWithProxy(prevValue) || !shouldTrackWithProxy(nextValue)) {
        return {
          isChanged: !isEqual(prevValue, nextValue),
          dependencies: new Set()
        };
      }
      
      // Get the affected map for this ID
      const affected = trackingMap.get(id);
      if (!affected) {
        // If no tracking data exists, do a reference equality check
        return {
          isChanged: !isEqual(prevValue, nextValue),
          dependencies: new Set()
        };
      }
      
      // Use proxy-compare to check if tracked properties have changed
      const changed = isChanged(
        prevValue as object, 
        nextValue as object, 
        affected,
        new WeakMap(), // Cache for this comparison
        isEqual
      );
      
      // Extract the dependencies (accessed paths) for debugging and propagation
      const dependencies = new Set<string | symbol>();
      if (prevValue && typeof prevValue === 'object') {
        const paths = affectedToPathList(prevValue as object, affected);
        for (const path of paths) {
          if (typeof path === 'string') {
            dependencies.add(path);
          } else if (Array.isArray(path)) {
            // For nested paths, we add the top-level property
            if (path.length > 0) {
              dependencies.add(path[0] as string | symbol);
            }
          }
        }
      }
      
      return {
        isChanged: changed,
        dependencies
      };
    },
    
    getOriginal<T>(trackedValue: T): T {
      if (!shouldTrackWithProxy(trackedValue)) {
        return trackedValue;
      }
      
      const original = getUntracked(trackedValue as object);
      return (original || trackedValue) as T;
    },
    
    clearTracking(id: string): void {
      trackingMap.delete(id);
    }
  };
}

/**
 * Mark an object to be tracked or not tracked by proxy-compare
 */
export function markObjectToTrack(obj: object, shouldTrack: boolean = true): void {
  markToTrack(obj, shouldTrack);
}

/**
 * Utility to check if a value is a proxy created by our tracker
 */
export function isTrackedProxy(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false;
  }
  
  try {
    // If getUntracked returns a value, it's a proxy
    return getUntracked(value as object) !== null;
  } catch (e) {
    return false;
  }
}

